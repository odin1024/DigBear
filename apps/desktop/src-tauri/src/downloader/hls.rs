//! HLS / DASH downloads through `ffmpeg`.
//!
//! `ffmpeg -c copy` remuxes the stream into a local MP4 while forwarding the
//! page `Referer` and the webview cookies, which is required by most CDNs.

use crate::session::cookie_header_for;
use regex::Regex;
use std::path::{Path, PathBuf};
use std::time::Duration;
use url::Url;
use std::process::Stdio;
use tauri::AppHandle;

pub fn ffmpeg_binary(app: &AppHandle) -> Option<PathBuf> {
    crate::extensions::ffmpeg_binary(app)
}

/// Remux `url` into `target` (a `.part.mp4` path).  `target` must end in `.mp4`
/// so ffmpeg can select the MP4 muxer from the extension.
pub async fn fetch_hls(
    app: &AppHandle,
    url: &str,
    page_url: &str,
    target: &Path,
) -> Result<(), String> {
    let ffmpeg = ffmpeg_binary(app).ok_or_else(|| {
        "请先在「设置 → 扩展管理」安装 FFmpeg，再下载 HLS/DASH 视频。".to_string()
    })?;

    // A page often exposes a specific (low) HLS variant.  If a master playlist
    // is reachable, pick its highest resolution/bandwidth variant explicitly.
    let input_url = resolve_best_hls(app, url, page_url).await;
    let url = input_url.as_str();

    let mut cookie = cookie_header_for(app, url);
    if cookie.is_empty() {
        // Some signed CDN URLs still need the page's session cookie.
        cookie = cookie_header_for(app, page_url);
    }
    let mut headers = format!("Referer: {page_url}\r\n");
    if !cookie.is_empty() {
        headers.push_str(&format!("Cookie: {cookie}\r\n"));
    }

    let mut command = tokio::process::Command::new(ffmpeg);
    command
        .arg("-nostdin")
        .arg("-y")
        .arg("-loglevel")
        .arg("error")
        .arg("-user_agent")
        .arg(crate::core::webview::BROWSER_USER_AGENT)
        .arg("-reconnect")
        .arg("1")
        .arg("-reconnect_streamed")
        .arg("1")
        .arg("-reconnect_delay_max")
        .arg("5");
    if let Some(proxy) = crate::core::net::system_proxy() {
        command.arg("-http_proxy").arg(proxy);
    }
    let output = command
        .arg("-headers")
        .arg(headers)
        .arg("-i")
        .arg(url)
        .arg("-c")
        .arg("copy")
        .arg(target)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|error| format!("无法启动 ffmpeg: {error}"))?;

    if output.status.success() {
        return Ok(());
    }
    Err(describe_ffmpeg_error(&output.stderr, output.status.code()))
}

/// Try the original playlist and, for X/Twitter-style variant URLs, the
/// corresponding master playlist.  Returns the highest quality variant URL,
/// or the original URL when no master is found.
async fn resolve_best_hls(app: &AppHandle, url: &str, page_url: &str) -> String {
    let client = match crate::core::net::client_with_user_agent(
        crate::core::webview::BROWSER_USER_AGENT,
        Duration::from_secs(30),
    ) {
        Ok(client) => client,
        Err(_) => return url.to_string(),
    };
    let cookie = {
        let cookie = cookie_header_for(app, url);
        if cookie.is_empty() {
            cookie_header_for(app, page_url)
        } else {
            cookie
        }
    };

    let mut candidates = vec![url.to_string()];
    if let Some(master) = twitter_master_candidate(url) {
        candidates.insert(0, master);
    }
    if let Some(video_id) = twitter_video_id(url) {
        if let Some(master) = find_twitter_master(app, page_url, &video_id).await {
            candidates.insert(0, master);
        }
    }

    for candidate in candidates {
        let mut request = client
            .get(&candidate)
            .header("Referer", page_url)
            .header("Accept", "*/*");
        if !cookie.is_empty() {
            request = request.header("Cookie", &cookie);
        }
        let Ok(response) = request.send().await else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let Ok(text) = response.text().await else {
            continue;
        };
        if !text.contains("#EXT-X-STREAM-INF") {
            continue;
        }
        if let Some(best) = pick_best_variant(&candidate, &text) {
            return best;
        }
        return candidate;
    }
    url.to_string()
}

fn twitter_video_id(raw: &str) -> Option<String> {
    let pattern = Regex::new(r"/amplify_video/(\d+)/").ok()?;
    pattern.captures(raw)?.get(1).map(|m| m.as_str().to_string())
}

/// X/Twitter renders its player from inline JSON; the raw HTML (which still
/// contains the HLS master) is often gone from the DOM after React hydrates.
/// Fetch the page again and recover the master for the same video id.
async fn find_twitter_master(app: &AppHandle, page_url: &str, video_id: &str) -> Option<String> {
    let client = crate::core::net::client_with_user_agent(
        crate::core::webview::BROWSER_USER_AGENT,
        Duration::from_secs(20),
    )
    .ok()?;
    let page_url = canonical_twitter_status_url(page_url);
    let cookie = cookie_header_for(app, &page_url);
    let mut request = client
        .get(&page_url)
        .header("Referer", &page_url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.9");
    if !cookie.is_empty() {
        request = request.header("Cookie", cookie);
    }
    let text = request.send().await.ok()?.text().await.ok()?;
    let candidates = extract_twitter_masters(&text, video_id);
    for candidate in candidates {
        let Ok(response) = client.get(&candidate).header("Referer", &page_url).send().await else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let Ok(playlist) = response.text().await else {
            continue;
        };
        if !playlist.contains("#EXT-X-STREAM-INF") {
            continue;
        }
        if let Some(best) = pick_best_variant(&candidate, &playlist) {
            return Some(best);
        }
        return Some(candidate);
    }
    None
}

/// Turn `/user/status/<id>/video/1` into `/user/status/<id>`; the `/video/1`
/// SPA route often serves a shell without the embedded media payload.
pub(crate) fn canonical_twitter_status_url(raw: &str) -> String {
    let Ok(mut url) = Url::parse(raw) else { return raw.to_string() };
    let segments: Vec<&str> = url.path_segments().map(|items| items.collect()).unwrap_or_default();
    let Some(status_index) = segments.iter().position(|segment| *segment == "status") else {
        return raw.to_string();
    };
    if segments.get(status_index + 1).is_none() {
        return raw.to_string();
    }
    let prefix = &segments[..status_index + 2];
    let path = format!("/{}", prefix.join("/"));
    url.set_path(&path);
    url.set_query(None);
    url.set_fragment(None);
    url.to_string()
}

/// All master playlist URLs found in the raw page, keyed by video id.
pub(crate) async fn twitter_masters_for_page(
    app: &AppHandle,
    page_url: &str,
) -> Vec<(String, String)> {
    let Ok(client) = crate::core::net::client_with_user_agent(
        crate::core::webview::BROWSER_USER_AGENT,
        Duration::from_secs(20),
    ) else {
        return Vec::new();
    };
    let page_url = canonical_twitter_status_url(page_url);
    let cookie = cookie_header_for(app, &page_url);
    let mut request = client
        .get(&page_url)
        .header("Referer", &page_url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.9");
    if !cookie.is_empty() {
        request = request.header("Cookie", cookie);
    }
    let Ok(response) = request.send().await else { return Vec::new() };
    if !response.status().is_success() {
        return Vec::new();
    }
    let Ok(text) = response.text().await else { return Vec::new() };
    extract_all_twitter_masters(&text)
}

fn extract_all_twitter_masters(html: &str) -> Vec<(String, String)> {
    let normalized = html.replace("\\/", "/").replace("&amp;", "&");
    let Ok(pattern) = Regex::new(
        r#"https://video\.twimg\.com/amplify_video/(\d+)/pl/([A-Za-z0-9_-]+)\.m3u8(?:\?[^\s"'<>\\]*)?"#,
    ) else {
        return Vec::new();
    };
    let mut found: Vec<(String, String)> = Vec::new();
    for capture in pattern.captures_iter(&normalized) {
        let (Some(video_id), Some(url)) = (capture.get(1), capture.get(0)) else {
            continue;
        };
        let entry = (video_id.as_str().to_string(), url.as_str().to_string());
        if !found.iter().any(|(id, existing)| id == &entry.0 && existing == &entry.1) {
            found.push(entry);
        }
    }
    found
}

fn extract_twitter_masters(html: &str, video_id: &str) -> Vec<String> {
    let normalized = html.replace("\\/", "/").replace("&amp;", "&");
    let pattern = Regex::new(
        r#"https://video\.twimg\.com/amplify_video/(\d+)/pl/([A-Za-z0-9_-]+)\.m3u8(?:\?[^\s"'<>\\]*)?"#,
    )
    .ok();
    let Some(pattern) = pattern else { return Vec::new() };
    let mut found = Vec::new();
    for capture in pattern.captures_iter(&normalized) {
        if capture.get(1).map(|m| m.as_str()) != Some(video_id) {
            continue;
        }
        if let Some(url) = capture.get(0) {
            let url = url.as_str().to_string();
            if !found.contains(&url) {
                found.push(url);
            }
        }
    }
    found
}

fn twitter_master_candidate(raw: &str) -> Option<String> {
    let mut parsed = Url::parse(raw).ok()?;
    if !parsed.host_str()?.ends_with("twimg.com") {
        return None;
    }
    let path = parsed.path().to_string();
    let pattern = Regex::new(r"/avc1/\d+x\d+/").ok()?;
    if !pattern.is_match(&path) {
        return None;
    }
    let master = pattern.replace(&path, "/").to_string();
    if master == path {
        return None;
    }
    parsed.set_path(&master);
    Some(parsed.to_string())
}

fn pick_best_variant(base: &str, text: &str) -> Option<String> {
    let mut best: Option<(u64, u64, String)> = None;
    let mut pending: Option<(u64, u64)> = None;
    for line in text.lines().map(str::trim) {
        if let Some(attrs) = line.strip_prefix("#EXT-X-STREAM-INF:") {
            let bandwidth = parse_attr(attrs, "BANDWIDTH").unwrap_or(0);
            let height = parse_resolution(attrs).map(|(_, h)| h).unwrap_or(0);
            pending = Some((bandwidth, height));
            continue;
        }
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((bandwidth, height)) = pending.take() {
            let absolute = Url::parse(base).ok()?.join(line).ok()?.to_string();
            let replace = best
                .as_ref()
                .map(|(bw, h, _)| (height, bandwidth) > (*h, *bw))
                .unwrap_or(true);
            if replace {
                best = Some((bandwidth, height, absolute));
            }
        }
    }
    best.map(|(_, _, url)| url)
}

fn parse_attr(attrs: &str, key: &str) -> Option<u64> {
    attrs
        .split(',')
        .find_map(|part| part.trim().strip_prefix(&format!("{key}=")))
        .and_then(|value| value.parse().ok())
}

fn parse_resolution(attrs: &str) -> Option<(u64, u64)> {
    let value = attrs
        .split(',')
        .find_map(|part| part.trim().strip_prefix("RESOLUTION="))?;
    let (width, height) = value.split_once('x')?;
    Some((width.parse().ok()?, height.parse().ok()?))
}

fn describe_ffmpeg_error(stderr: &[u8], exit_code: Option<i32>) -> String {
    let text = String::from_utf8_lossy(stderr);
    let details = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .last()
        .map(str::to_string)
        .unwrap_or_default();
    if details.is_empty() {
        match exit_code {
            Some(code) => format!("ffmpeg 下载失败（退出码 {code}）。"),
            None => "ffmpeg 下载失败（未返回具体原因）。".to_string(),
        }
    } else {
        let hint = if details.contains("404") || details.contains("410") {
            "视频分片地址可能已过期，请重新翻找后再下载。"
        } else if details.contains("Input/output error")
            || details.contains("Connection refused")
            || details.contains("timed out")
        {
            "无法连接视频 CDN，请检查系统代理或网络后重试。"
        } else if details.contains("403") {
            "视频 CDN 拒绝访问，可能需要登录或代理，请重新翻找后重试。"
        } else {
            ""
        };
        let suffix = if hint.is_empty() { String::new() } else { format!("（{hint}）") };
        match exit_code {
            Some(code) => format!("ffmpeg 下载失败（退出码 {code}）：{details}{suffix}"),
            None => format!("ffmpeg 下载失败：{details}{suffix}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_twitter_master_playlist() {
        let variant = "https://video.twimg.com/amplify_video/1/pl/avc1/960x720/abc.m3u8";
        assert_eq!(
            twitter_master_candidate(variant).as_deref(),
            Some("https://video.twimg.com/amplify_video/1/pl/abc.m3u8")
        );
    }

    #[test]
    fn canonicalizes_twitter_video_urls() {
        assert_eq!(
            canonical_twitter_status_url("https://x.com/vuefes/status/123/video/1"),
            "https://x.com/vuefes/status/123"
        );
        assert_eq!(
            canonical_twitter_status_url("https://x.com/i/status/123"),
            "https://x.com/i/status/123"
        );
    }

    #[test]
    fn extracts_twitter_masters_from_page() {
        let html = r#"{"url":"https:\/\/video.twimg.com\/amplify_video\/123\/pl\/MASTER.m3u8?tag=14"}"#;
        let masters = extract_all_twitter_masters(html);
        assert_eq!(masters.len(), 1);
        assert_eq!(masters[0].0, "123");
        assert!(masters[0].1.ends_with("MASTER.m3u8?tag=14"));
    }

    #[test]
    fn picks_highest_hls_variant() {
        let master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\n360.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n720.m3u8\n";
        assert_eq!(
            pick_best_variant("https://video.twimg.com/pl/abc.m3u8", master).as_deref(),
            Some("https://video.twimg.com/pl/720.m3u8")
        );
    }
}
