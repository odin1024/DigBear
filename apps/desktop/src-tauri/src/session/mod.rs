use crate::core::error::AppError;
use crate::core::models::SessionInfo;
use crate::core::url::{host_label, normalize_page_url};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url as ParsedUrl;

pub const LOGIN_LABEL: &str = "site-login";

pub fn open_site_login(app: &AppHandle, raw_url: &str) -> Result<String, AppError> {
    let url = normalize_page_url(raw_url)?;
    let host = host_label(&url);
    if let Some(win) = app.get_webview_window(LOGIN_LABEL) {
        let _ = win.navigate(url.clone());
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.set_title(&format!("登录 · {host}"));
        return Ok(format!("已打开 {host} 的登录窗口。"));
    }

    let win = WebviewWindowBuilder::new(app, LOGIN_LABEL, WebviewUrl::External(url))
        .title(format!("登录 · {host}"))
        .inner_size(1180.0, 860.0)
        .min_inner_size(900.0, 640.0)
        .center()
        .user_agent(crate::core::webview::BROWSER_USER_AGENT)
        .build()
        .map_err(|e| AppError::new("session_failed", format!("无法打开登录窗口: {e}")))?;
    let _ = win.set_focus();
    Ok(format!("已打开 {host} 的登录窗口，完成登录后关闭窗口即可。"))
}

pub fn close_site_login(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(LOGIN_LABEL) {
        let _ = win.close();
    }
}


/// Whether a cookie should be sent for this URL. We deliberately do not use
/// `cookies_for_url`: Wry compares `cookie.domain()` with `Url::domain()`, which
/// returns `None` for IP-literal hosts (e.g. 127.0.0.1), so local fixtures and
/// LAN sites would otherwise lose their session cookies.
fn cookie_applies(cookie: &tauri::webview::Cookie<'static>, url: &url::Url) -> bool {
    let host = url.host_str().unwrap_or("");
    let domain = cookie.domain().unwrap_or("").trim_start_matches('.').to_ascii_lowercase();
    let host_ok = if domain.is_empty() {
        true
    } else {
        host.eq_ignore_ascii_case(&domain) || host.to_ascii_lowercase().ends_with(&format!(".{domain}"))
    };
    if !host_ok {
        return false;
    }
    let secure = cookie.secure().unwrap_or(false);
    if secure && url.scheme() != "https" {
        let loopback = host == "localhost" || host == "::1" || host.starts_with("127.");
        if !(url.scheme() == "http" && loopback) {
            return false;
        }
    }
    if let Some(path) = cookie.path() {
        if !path.is_empty() && !url.path().starts_with(path) {
            return false;
        }
    }
    true
}

/// Collect cookies from every app webview for the URL and de-duplicate by
/// name+value. WKWebView normally shares its default data store; reading every
/// window makes this robust across WebKit versions and window lifecycles.
pub fn all_cookies_for_url(
    app: &AppHandle,
    url: &url::Url,
) -> Vec<tauri::webview::Cookie<'static>> {
    let mut out: Vec<tauri::webview::Cookie<'static>> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for label in ["main", LOGIN_LABEL, "crawl-worker"] {
        let Some(webview) = app.get_webview_window(label) else { continue };
        let Ok(cookies) = webview.cookies() else { continue };
        for cookie in cookies {
            if !cookie_applies(&cookie, url) {
                continue;
            }
            let key = format!("{}={}", cookie.name(), cookie.value());
            if seen.insert(key) {
                out.push(cookie);
            }
        }
    }
    out
}

pub fn get_site_session(app: &AppHandle, raw_url: &str) -> Result<SessionInfo, AppError> {
    let url = normalize_page_url(raw_url)?;
    let domain = host_label(&url);
    let cookies = all_cookies_for_url(app, &url);
    Ok(SessionInfo { url: url.to_string(), domain, cookies: cookies.len() })
}

pub fn clear_site_session(app: &AppHandle, raw_url: &str) -> Result<SessionInfo, AppError> {
    let url = normalize_page_url(raw_url)?;
    let cookies = all_cookies_for_url(app, &url);
    for label in ["main", LOGIN_LABEL, "crawl-worker"] {
        if let Some(webview) = app.get_webview_window(label) {
            for cookie in &cookies {
                let _ = webview.delete_cookie(cookie.clone());
            }
        }
    }
    // Also clear page-local storage if the login window is currently on this site.
    if let Some(login) = app.get_webview_window(LOGIN_LABEL) {
        if let Ok(current) = login.url() {
            if current.host_str() == url.host_str() {
                let _ = login.eval("try{localStorage.clear();sessionStorage.clear()}catch(e){}");
            }
        }
    }
    get_site_session(app, url.as_str())
}

pub fn cookie_header_for(app: &AppHandle, raw_url: &str) -> String {
    let Ok(url) = ParsedUrl::parse(raw_url) else {
        return String::new();
    };
    all_cookies_for_url(app, &url)
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ")
}

