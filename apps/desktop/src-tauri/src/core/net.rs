//! Shared HTTP helpers that respect the system proxy.

use std::time::Duration;

/// System proxy, or standard proxy environment variables.
///
/// Environment variables win: they are what CLI tools and most modern proxy
/// clients (Clash / v2rayN / sing-box in "environment" mode) expose, and they
/// are unambiguous. When they are absent we fall back to the operating system
/// setting — WinINET on Windows, `scutil` on macOS.
pub fn system_proxy() -> Option<String> {
    for key in ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"] {
        if let Ok(value) = std::env::var(key) {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("scutil")
            .arg("--proxy")
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let get = |key: &str| {
            text.lines().find_map(|line| {
                let (name, value) = line.split_once(':')?;
                (name.trim() == key).then(|| value.trim().to_string())
            })
        };
        if get("HTTPSEnable").as_deref() == Some("1") {
            if let (Some(host), Some(port)) = (get("HTTPSProxy"), get("HTTPSPort")) {
                return Some(format!("http://{host}:{port}"));
            }
        }
        if get("HTTPEnable").as_deref() == Some("1") {
            if let (Some(host), Some(port)) = (get("HTTPProxy"), get("HTTPPort")) {
                return Some(format!("http://{host}:{port}"));
            }
        }
    }

    #[cfg(windows)]
    {
        if let Some(proxy) = windows_system_proxy() {
            return Some(proxy);
        }
    }

    None
}

/// Read the WinINET proxy configuration (`Internet Settings` in the current
/// user's registry hive).
///
/// This is the setting Windows exposes to every WinINET consumer, which is
/// exactly what a desktop app should honour. The value is either a bare
/// `host:port` or a per-protocol list such as
/// `http=127.0.0.1:7890;https=127.0.0.1:7890`.
#[cfg(windows)]
fn windows_system_proxy() -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    const INTERNET_SETTINGS: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey_with_flags(INTERNET_SETTINGS, KEY_READ).ok()?;

    let enabled: u32 = match key.get_value("ProxyEnable") {
        Ok(value) => value,
        Err(_) => return None,
    };
    if enabled == 0 {
        return None;
    }
    let server: String = key.get_value("ProxyServer").ok()?;
    let server = server.trim();
    if server.is_empty() {
        return None;
    }
    parse_windows_proxy(server)
}

/// Pick the entry that applies to HTTPS traffic out of a WinINET
/// `ProxyServer` value, falling back to plain HTTP and then to a bare
/// `host:port` pair.
#[cfg(windows)]
fn parse_windows_proxy(server: &str) -> Option<String> {
    if !server.contains('=') {
        return Some(format!("http://{server}"));
    }
    let mut http = None;
    let mut https = None;
    let mut socks = None;
    for entry in server.split(';') {
        let Some((scheme, endpoint)) = entry.split_once('=') else {
            continue;
        };
        let endpoint = endpoint.trim();
        if endpoint.is_empty() {
            continue;
        }
        match scheme.trim().to_ascii_lowercase().as_str() {
            "http" => http = Some(endpoint.to_string()),
            "https" => https = Some(endpoint.to_string()),
            "socks" | "socks5" => socks = Some(endpoint.to_string()),
            _ => {}
        }
    }
    let endpoint = https.or(http).or(socks)?;
    if endpoint.starts_with("http://") || endpoint.starts_with("socks5://") {
        Some(endpoint.to_string())
    } else {
        Some(format!("http://{endpoint}"))
    }
}

pub fn client(timeout: Duration) -> Result<reqwest::Client, String> {
    client_with_user_agent(crate::core::webview::BROWSER_USER_AGENT, timeout)
}

pub fn client_with_user_agent(
    user_agent: &str,
    timeout: Duration,
) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent(user_agent)
        .timeout(timeout)
        .gzip(true);
    if let Some(proxy) = system_proxy() {
        builder = builder.proxy(
            reqwest::Proxy::all(&proxy)
                .map_err(|error| format!("系统代理配置无效（{proxy}）：{error}"))?,
        );
    }
    builder
        .build()
        .map_err(|error| format!("无法初始化网络请求：{error}"))
}

#[cfg(all(test, windows))]
mod tests {
    use super::parse_windows_proxy;

    #[test]
    fn parses_bare_host_port() {
        assert_eq!(
            parse_windows_proxy("127.0.0.1:7890").as_deref(),
            Some("http://127.0.0.1:7890")
        );
    }

    #[test]
    fn prefers_the_https_entry() {
        let value = "http=127.0.0.1:8080;https=127.0.0.1:8443";
        assert_eq!(
            parse_windows_proxy(value).as_deref(),
            Some("http://127.0.0.1:8443")
        );
    }

    #[test]
    fn falls_back_to_http_entry() {
        assert_eq!(
            parse_windows_proxy("http=127.0.0.1:8080").as_deref(),
            Some("http://127.0.0.1:8080")
        );
    }

    #[test]
    fn rejects_empty_configuration() {
        assert_eq!(parse_windows_proxy("https=;http="), None);
    }
}
