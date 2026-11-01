//! Direct HTTP(S) file downloads through the system `curl`.
//!
//! `curl` is used instead of a Rust HTTP client so that proxies, system trust
//! store and the user's HTTP/2 quirks behave exactly like a browser.  Cookies
//! are read from the Tauri main webview through `session::cookie_header_for`.

use crate::downloader::paths::find_binary;
use crate::session::cookie_header_for;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::AppHandle;

const CONNECT_TIMEOUT_SECS: &str = "20";
const MAX_TIME_SECS: &str = "1800";
/// 低于这个速度（字节/秒）持续这么久就判定连接卡死。
const SPEED_LIMIT_BYTES: &str = "1024";
const SPEED_LIMIT_SECS: &str = "30";

pub struct FetchInfo {
    pub content_type: String,
    /// URL after redirects, from curl's `%{url_effective}`.
    pub effective_url: String,
}

pub fn curl_binary() -> Option<PathBuf> {
    // Windows 10 1803 and newer ship curl.exe in System32, so the same
    // "use the system curl" trick works there too.
    #[cfg(windows)]
    {
        find_binary(
            "curl.exe",
            &[r"C:\Windows\System32\curl.exe", r"C:\Windows\SysWOW64\curl.exe"],
        )
    }
    #[cfg(not(windows))]
    {
        find_binary("curl", &["/usr/bin/curl", "/bin/curl"])
    }
}

/// Download `url` into `target` (a `.part` path).  Returns the response metadata
/// printed by `curl -w`; any non-zero exit is mapped to a user facing error.
pub async fn fetch_direct(
    app: &AppHandle,
    url: &str,
    page_url: &str,
    target: &Path,
) -> Result<FetchInfo, String> {
    let curl = curl_binary().ok_or_else(|| "系统中未找到 curl，无法下载媒体文件。".to_string())?;
    let cookie = cookie_header_for(app, url);

    // 已经有半成品时接着下 —— 大文件在慢速网络下不至于每次重试都从头再来。
    let can_resume = std::fs::metadata(target).map(|m| m.len() > 0).unwrap_or(false);

    let output = run_curl(&curl, url, page_url, target, &cookie, can_resume).await?;
    if output.status.success() {
        return Ok(parse_info(&output.stdout));
    }

    // 33 = 服务器不支持 Range：删掉半成品，从头再下一次。
    if output.status.code() == Some(33) {
        let _ = std::fs::remove_file(target);
        let retry = run_curl(&curl, url, page_url, target, &cookie, false).await?;
        if retry.status.success() {
            return Ok(parse_info(&retry.stdout));
        }
        return Err(describe_failure(&retry.stderr, retry.status.code()));
    }

    Err(describe_failure(&output.stderr, output.status.code()))
}

/// 拼出 curl 命令并执行。`resume` 为真时带上 `-C -`，接着已有的半成品下。
async fn run_curl(
    curl: &Path,
    url: &str,
    page_url: &str,
    target: &Path,
    cookie: &str,
    resume: bool,
) -> Result<std::process::Output, String> {
    let mut command = tokio::process::Command::new(curl);
    command
        .arg("-sS")
        .arg("-L")
        .arg("--fail")
        .arg("--connect-timeout")
        .arg(CONNECT_TIMEOUT_SECS)
        .arg("--max-time")
        .arg(MAX_TIME_SECS)
        // 连接卡死（长时间零速）时快速失败。
        // 不用 curl 自带的 --retry：那会和外层的重试层叠加，
        // 一个文件最坏要等 3×900 秒才放弃。
        .arg("--speed-limit")
        .arg(SPEED_LIMIT_BYTES)
        .arg("--speed-time")
        .arg(SPEED_LIMIT_SECS)
        .arg("-A")
        .arg(crate::core::webview::BROWSER_USER_AGENT)
        .arg("-H")
        .arg(format!("Referer: {page_url}"))
        .arg("-H")
        .arg("Accept: */*");
    if resume {
        command.arg("-C").arg("-");
    }
    if let Some(proxy) = crate::core::net::system_proxy() {
        command.arg("-x").arg(proxy);
    }
    if !cookie.is_empty() {
        command.arg("-H").arg(format!("Cookie: {cookie}"));
    }
    command
        .arg("-o")
        .arg(target)
        .arg("-w")
        .arg("%{content_type}\n%{url_effective}")
        .arg("--")
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    command
        .output()
        .await
        .map_err(|error| format!("无法启动 curl 下载: {error}"))
}

/// 解析 curl `-w` 打印的两行：Content-Type 与最终地址。
fn parse_info(stdout: &[u8]) -> FetchInfo {
    let text = String::from_utf8_lossy(stdout);
    let mut lines = text.lines();
    let content_type = lines.next().unwrap_or("").trim().to_string();
    let effective_url = lines.next().unwrap_or("").trim().to_string();
    FetchInfo { content_type, effective_url }
}

fn describe_failure(stderr: &[u8], exit_code: Option<i32>) -> String {
    let text = String::from_utf8_lossy(stderr).trim().to_string();
    if let Some(code) = http_status(&text) {
        return match code {
            401 | 403 => format!(
                "HTTP {code}：需要登录或没有访问权限（请在「设置 → 登录管理」登录该站点后重试）。"
            ),
            404 | 410 => format!("HTTP {code}：资源不存在或链接已过期。"),
            429 => "HTTP 429：请求过于频繁，请稍后重试。".to_string(),
            500..=599 => format!("HTTP {code}：服务器暂时不可用，请稍后重试。"),
            _ => format!("HTTP {code}：下载失败。"),
        };
    }
    if exit_code == Some(28) || text.to_ascii_lowercase().contains("timed out") {
        return "下载超时（超过 --max-time 限制或网络不稳定）。".to_string();
    }
    if text.is_empty() {
        return match exit_code {
            Some(code) => format!("下载失败（curl 退出码 {code}）。"),
            None => "下载失败（curl 未返回具体原因）。".to_string(),
        };
    }
    match exit_code {
        Some(code) => format!("下载失败（curl 退出码 {code}）：{text}"),
        None => format!("下载失败：{text}"),
    }
}

fn http_status(stderr: &str) -> Option<u16> {
    let after = stderr.split("returned error:").nth(1)?;
    after.trim().split_whitespace().next()?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_common_http_failures_to_friendly_messages() {
        assert!(describe_failure(b"curl: (22) The requested URL returned error: 403", Some(22))
            .contains("需要登录"));
        assert!(describe_failure(b"curl: (22) The requested URL returned error: 404", Some(22))
            .contains("不存在"));
        assert!(describe_failure(b"curl: (28) Operation timed out", Some(28)).contains("超时"));
        assert!(describe_failure(b"", Some(7)).contains("curl"));
    }
}
