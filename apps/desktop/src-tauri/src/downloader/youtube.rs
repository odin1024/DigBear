//! Self-contained YouTube extraction and download.
//!
//! YouTube's web player no longer returns direct media URLs (it uses SABR +
//! PO tokens), so we query the innertube player API with the visionOS client.
//! That client still returns ordinary adaptive URLs. We download the best
//! H.264 video and AAC audio tracks and mux them with ffmpeg.
//!
//! No yt-dlp (or any other external extractor) is involved. Requests honor the
//! macOS system HTTP proxy, since YouTube is often unreachable directly.

use crate::downloader::resolvers::{
    PageVideoResolver, ResolvedMedia, StreamAsset,
};
use async_trait::async_trait;
use regex::Regex;
use serde_json::Value;
use std::time::Duration;

const WATCH_BASE: &str = "https://www.youtube.com/watch?v=";
const VISIONOS_UA: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const ANDROID_UA: &str =
    "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip";
const IOS_UA: &str =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/// 一个 innertube 客户端身份。
///
/// 只用 VISIONOS 的话，遇到「Sign in to confirm you're not a bot」这种
/// IP 级风控就没辙了 —— 换一个 client 身份通常就能拿到直链。
struct ClientSpec {
    name: &'static str,
    version: &'static str,
    user_agent: &'static str,
    /// 设备形态：决定要补哪些客户端字段。
    form: ClientForm,
}

#[derive(Clone, Copy, PartialEq)]
enum ClientForm {
    /// 桌面 / 嵌入播放器。
    Desktop,
    Android,
    Ios,
}

/// 按顺序尝试的客户端列表。
fn clients() -> Vec<ClientSpec> {
    vec![
        ClientSpec { name: "VISIONOS", version: "1.02", user_agent: VISIONOS_UA, form: ClientForm::Desktop },
        ClientSpec { name: "ANDROID", version: "19.09.37", user_agent: ANDROID_UA, form: ClientForm::Android },
        ClientSpec { name: "IOS", version: "19.29.1", user_agent: IOS_UA, form: ClientForm::Ios },
    ]
}

fn youtube_id(raw: &str) -> Option<String> {
    let url = url::Url::parse(raw).ok()?;
    let host = url.host_str()?.trim_start_matches("www.").to_ascii_lowercase();
    if host == "youtu.be" {
        return url.path_segments()?.next().filter(|s| !s.is_empty()).map(str::to_string);
    }
    if host != "youtube.com" && !host.ends_with(".youtube.com") && host != "youtube-nocookie.com" {
        return None;
    }
    if let Some(id) = url
        .query_pairs()
        .find(|(key, _)| key == "v")
        .map(|(_, value)| value.to_string())
    {
        return Some(id);
    }
    let mut segments = url.path_segments()?;
    let first = segments.next()?;
    if matches!(first, "embed" | "shorts" | "v") {
        return segments.next().filter(|s| !s.is_empty()).map(str::to_string);
    }
    None
}

fn http_client() -> Result<reqwest::Client, String> {
    crate::core::net::client_with_user_agent(VISIONOS_UA, Duration::from_secs(1800))
}

/// 有登录 Cookie 时才加 Cookie 头。
fn with_cookie(request: reqwest::RequestBuilder, cookie: &str) -> reqwest::RequestBuilder {
    if cookie.trim().is_empty() {
        return request;
    }
    request.header(reqwest::header::COOKIE, cookie)
}

pub struct YoutubeResolver;

#[async_trait]
impl PageVideoResolver for YoutubeResolver {
    fn id(&self) -> &'static str {
        "youtube-visionos"
    }

    fn supports(&self, url: &str) -> bool {
        youtube_id(url).is_some()
    }

    async fn resolve(&self, app: &tauri::AppHandle, url: &str) -> Result<ResolvedMedia, String> {
        let video_id = youtube_id(url)
            .ok_or_else(|| "无法识别这个 YouTube 链接。".to_string())?;
        // Reuse the cookie from an in-app YouTube sign-in when there is one:
        // it is what gets us past the "confirm you're not a bot" check.
        let cookie = crate::session::cookie_header_for(app, url);
        let client = http_client()?;
        let formats = fetch_formats(&client, &video_id, &cookie).await?;
        Ok(ResolvedMedia {
            page_url: format!("{WATCH_BASE}{video_id}"),
            video: StreamAsset {
                url: formats.video_url,
                size: formats.video_size,
            },
            audio: formats.audio_url.map(|url| StreamAsset {
                url,
                size: formats.audio_size,
            }),
            container: "mp4".to_string(),
        })
    }
}

fn capture<'a>(pattern: &str, text: &'a str) -> Option<&'a str> {
    Regex::new(pattern).ok()?.captures(text)?.get(1).map(|m| m.as_str())
}

struct Formats {
    video_url: String,
    video_size: Option<u64>,
    audio_url: Option<String>,
    audio_size: Option<u64>,
}

/// 这个页面是不是一个 YouTube 观看页。
pub fn is_youtube_page(page_url: &str) -> bool {
    youtube_id(page_url).is_some()
}

/// 页面里的视频 id（用于文件名与去重）。
pub fn page_video_id(page_url: &str) -> Option<String> {
    youtube_id(page_url)
}

/// 组装 innertube 播放器请求体。
fn player_body(spec: &ClientSpec, video_id: &str, visitor: &str) -> Value {
    let mut client = serde_json::json!({
        "clientName": spec.name,
        "clientVersion": spec.version,
        "userAgent": spec.user_agent,
        "hl": "en",
        "visitorData": visitor,
    });
    match spec.form {
        ClientForm::Android => {
            client["deviceMake"] = serde_json::json!("Xiaomi");
            client["deviceModel"] = serde_json::json!("Redmi Note 3");
            client["osName"] = serde_json::json!("Android");
            client["osVersion"] = serde_json::json!("11");
            client["androidSdkVersion"] = serde_json::json!(30);
        }
        ClientForm::Ios => {
            client["deviceMake"] = serde_json::json!("Apple");
            client["deviceModel"] = serde_json::json!("iPhone16,2");
            client["osName"] = serde_json::json!("iPhone");
            client["osVersion"] = serde_json::json!("17.5.1.21F90");
        }
        ClientForm::Desktop => {}
    }
    serde_json::json!({
        "context": { "client": client },
        "videoId": video_id,
        "contentCheckOk": true,
        "racyCheckOk": true,
    })
}

/// 向 innertube 要视频流。
///
/// 单个客户端身份会被 IP 级风控挡掉（"Sign in to confirm you're not a bot"），
/// 所以这里准备了几种客户端身份依次尝试 —— 任意一种成功就收工。
async fn fetch_formats(
    client: &reqwest::Client,
    video_id: &str,
    cookie: &str,
) -> Result<Formats, String> {
    let page = with_cookie(
        client
            .get(format!("{WATCH_BASE}{video_id}&hl=en"))
            .timeout(Duration::from_secs(60))
            .header("Accept-Language", "en-US,en;q=0.9"),
        cookie,
    )
        .send()
        .await
        .map_err(|error| format!("无法访问 YouTube: {error}"))?
        .text()
        .await
        .map_err(|error| format!("读取 YouTube 页面失败: {error}"))?;

    let api_key = capture(r#""INNERTUBE_API_KEY":"([^"]+)""#, &page)
        .ok_or_else(|| "YouTube 页面结构变化：没有找到 API key。".to_string())?;
    let visitor = capture(r#""VISITOR_DATA":"([^"]+)""#, &page)
        .ok_or_else(|| "YouTube 页面结构变化：没有找到访客标识。".to_string())?;

    let mut last_reason = String::from("YouTube 没有返回可下载的视频流。");
    for spec in clients() {
        let body = player_body(&spec, video_id, visitor);
        let response = match with_cookie(
            client
                .post(format!(
                    "https://www.youtube.com/youtubei/v1/player?key={api_key}&prettyPrint=false"
                ))
                .timeout(Duration::from_secs(60))
                .header("Content-Type", "application/json")
                .header("X-Goog-Visitor-Id", visitor)
                .header("Origin", "https://www.youtube.com")
                .header("Referer", format!("{WATCH_BASE}{video_id}"))
                .header("Accept-Language", "en-US,en;q=0.9"),
            cookie,
        )
            .json(&body)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_reason = format!("请求 YouTube 播放器失败: {error}");
                continue;
            }
        };
        if !response.status().is_success() {
            last_reason = format!("YouTube 播放器返回 HTTP {}。", response.status());
            continue;
        }
        let data: Value = match response.json().await {
            Ok(data) => data,
            Err(error) => {
                last_reason = format!("YouTube 播放器数据无法解析: {error}");
                continue;
            }
        };

        let status = data["playabilityStatus"]["status"].as_str().unwrap_or("");
        if status != "OK" {
            let reason = data["playabilityStatus"]["reason"]
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| format!("YouTube 拒绝播放（{status}）。"));
            eprintln!("[digbear] youtube client {} rejected: {reason}", spec.name);
            last_reason = reason;
            continue;
        }

        let adaptive = data["streamingData"]["adaptiveFormats"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let progressive = data["streamingData"]["formats"]
            .as_array()
            .cloned()
            .unwrap_or_default();

        if let Some(format) = pick_progressive(&progressive) {
            return Ok(Formats {
                video_url: format.0,
                video_size: format.1,
                audio_url: None,
                audio_size: None,
            });
        }
        let Some(video) = pick_video(&adaptive) else {
            last_reason = "没有找到可下载的视频轨（可能是付费或地区限制内容）。".to_string();
            continue;
        };
        let audio = pick_audio(&adaptive);
        return Ok(Formats {
            video_url: video.0,
            video_size: video.1,
            audio_url: audio.as_ref().map(|value| value.0.clone()),
            audio_size: audio.and_then(|value| value.1),
        });
    }
    Err(last_reason)
}

fn content_size(format: &Value) -> Option<u64> {
    format["contentLength"]
        .as_str()
        .and_then(|value| value.parse().ok())
}

fn pick_progressive(formats: &[Value]) -> Option<(String, Option<u64>)> {
    formats
        .iter()
        .filter(|format| {
            format["url"].is_string()
                && format["mimeType"]
                    .as_str()
                    .map(|mime| mime.starts_with("video/mp4"))
                    .unwrap_or(false)
                && format["height"].as_u64().is_some()
                && format["audioQuality"].is_string()
        })
        .max_by_key(|format| format["height"].as_u64().unwrap_or(0))
        .and_then(|format| {
            Some((format["url"].as_str()?.to_string(), content_size(format)))
        })
}

fn pick_video(formats: &[Value]) -> Option<(String, Option<u64>)> {
    let mut candidates: Vec<&Value> = formats
        .iter()
        .filter(|format| {
            format["url"].is_string()
                && format["mimeType"]
                    .as_str()
                    .map(|mime| mime.starts_with("video/mp4"))
                    .unwrap_or(false)
                && format["height"].as_u64().is_some()
        })
        .collect();
    if candidates.is_empty() {
        return None;
    }
    // Prefer H.264 (plays everywhere), cap at 1080p to keep downloads sane.
    candidates.sort_by_key(|format| {
        let codec = format["mimeType"].as_str().unwrap_or("");
        let h264 = codec.contains("avc1");
        let height = format["height"].as_u64().unwrap_or(0).min(1080);
        (h264, height, format["bitrate"].as_u64().unwrap_or(0))
    });
    candidates.last().and_then(|format| {
        Some((format["url"].as_str()?.to_string(), content_size(format)))
    })
}

fn pick_audio(formats: &[Value]) -> Option<(String, Option<u64>)> {
    formats
        .iter()
        .filter(|format| {
            format["url"].is_string()
                && format["mimeType"]
                    .as_str()
                    .map(|mime| mime.starts_with("audio/mp4"))
                    .unwrap_or(false)
        })
        .max_by_key(|format| format["bitrate"].as_u64().unwrap_or(0))
        .and_then(|format| {
            Some((format["url"].as_str()?.to_string(), content_size(format)))
        })
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_youtube_ids() {
        assert_eq!(youtube_id("https://www.youtube.com/watch?v=abc123"), Some("abc123".into()));
        assert_eq!(youtube_id("https://youtu.be/abc123"), Some("abc123".into()));
        assert_eq!(youtube_id("https://www.youtube.com/shorts/abc123"), Some("abc123".into()));
        assert_eq!(youtube_id("https://vimeo.com/123"), None);
    }

    #[tokio::test]
    #[ignore = "network integration test"]
    async fn extracts_the_reported_video() {
        let resolver = YoutubeResolver;
        let media = resolver
            .resolve("https://www.youtube.com/watch?v=ihy4w9UJFu0")
            .await
            .expect("resolve");
        assert!(media.video.url.starts_with("https://"));
        assert!(media.audio.is_some());
        assert_eq!(media.container, "mp4");
    }
}
