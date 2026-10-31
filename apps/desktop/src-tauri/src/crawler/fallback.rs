use crate::core::error::AppError;
use crate::crawler::browser::{RawPage, RawResource};
use crate::session::cookie_header_for;
use regex::Regex;
use std::path::PathBuf;
use tauri::AppHandle;
use url::Url;

fn temp_path() -> PathBuf {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("digbear-{}-{stamp}.html", std::process::id()))
}

async fn fetch_html(app: &AppHandle, url: &str) -> Result<(String, u16, String), AppError> {
    let path = temp_path();
    let path_for_task = path.clone();
    let cookie = cookie_header_for(app, url);
    let url_owned = url.to_string();
    let output = tokio::task::spawn_blocking(move || {
        let mut command = std::process::Command::new("curl");
        command
            .arg("-sS")
            .arg("-L")
            .arg("--connect-timeout")
            .arg("20")
            .arg("--max-time")
            .arg("35")
            .arg("-A")
            .arg(crate::core::webview::BROWSER_USER_AGENT)
            .arg("-H")
            .arg("Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .arg("-H")
            .arg("Accept-Language: zh-CN,zh;q=0.9,en;q=0.6")
            .arg("-o")
            .arg(&path_for_task)
            .arg("-w")
            .arg("%{http_code}\\n%{url_effective}")
            .arg(&url_owned);
        if !cookie.is_empty() {
            command.arg("-H").arg(format!("Cookie: {cookie}"));
        }
        command.output()
    })
    .await
    .map_err(|e| AppError::internal(format!("curl 任务失败: {e}")))?
    .map_err(|e| AppError::new("crawl_failed", format!("无法启动 curl: {e}")))?;

    let meta = String::from_utf8_lossy(&output.stdout).to_string();
    let bytes = std::fs::read(&path).unwrap_or_default();
    let _ = std::fs::remove_file(&path);
    if !output.status.success() {
        return Err(AppError::new(
            "crawl_failed",
            format!("页面请求失败: {}", String::from_utf8_lossy(&output.stderr).trim()),
        ));
    }
    let mut lines = meta.lines();
    let status = lines.next().and_then(|v| v.trim().parse().ok()).unwrap_or(0);
    let final_url = lines.next().unwrap_or(url).trim().to_string();
    Ok((String::from_utf8_lossy(&bytes).to_string(), status, final_url))
}

fn media_regex() -> Regex {
    Regex::new(r#"(?i)https?://[^\s"'<>]+\.(?:png|jpe?g|webp|gif|avif|bmp|svg|ico|mp4|webm|mov|m4v|m3u8|mpd|mp3|m4a|wav|ogg|oga|flac|aac|opus|woff2?|ttf|otf|eot)(?:\?[^\s"'<>]*)?"#).unwrap()
}

pub async fn fetch_and_extract(app: &AppHandle, url: &Url) -> Result<RawPage, AppError> {
    let (html, status, final_url) = fetch_html(app, url.as_str()).await?;
    if status == 0 || status >= 400 {
        return Err(AppError::new("crawl_failed", format!("页面返回 HTTP {status}。")));
    }
    let final_url = Url::parse(&final_url).unwrap_or_else(|_| url.clone());
    let base = final_url.to_string();
    let mut resources = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let re = media_regex();

    for matched in re.find_iter(&html) {
        if let Ok(abs) = Url::parse(matched.as_str()) {
            let key = abs.to_string();
            if seen.insert(key.clone()) {
                resources.push(RawResource {
                    url: key,
                    kind: String::new(),
                    source: "fallback".to_string(),
                    filename_hint: None,
                    width: None,
                    height: None,
                    duration: None,
                    poster: None,
                    alt: None,
                });
            }
        }
    }

    let attr_re = Regex::new(r#"(?i)(?:src|href|poster|data-src|data-original|data-lazy-src|content)\s*=\s*["']([^"']+)["']"#).unwrap();
    for capture in attr_re.captures_iter(&html) {
        let raw = capture.get(1).map(|m| m.as_str()).unwrap_or("");
        if let Ok(abs) = final_url.join(raw) {
            let key = abs.to_string();
            if crate::core::classify::kind_from_url(&abs).is_some() && seen.insert(key.clone()) {
                resources.push(RawResource {
                    url: key,
                    kind: String::new(),
                    source: "fallback".to_string(),
                    filename_hint: None,
                    width: None,
                    height: None,
                    duration: None,
                    poster: None,
                    alt: None,
                });
            }
        }
    }

    let title_re = Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap();
    let title = title_re
        .captures(&html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
        .unwrap_or_default();
    let has_password = html.to_lowercase().contains("type=\"password\"");
    Ok(RawPage {
        title,
        final_url: base,
        resources,
        warnings: vec!["使用 HTML 兜底解析，部分懒加载资源可能缺失。".to_string()],
        has_password,
        body_text_len: html.len(),
    })
}
