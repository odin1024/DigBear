use crate::core::error::AppError;
use regex::Regex;
use url::Url;

pub fn extract_first_url(input: &str) -> Option<String> {
    let re = Regex::new(r#"https?://[^\s"'<>，。；、）】]+"#).ok()?;
    if let Some(found) = re.find(input) {
        return Some(trim_url(found.as_str()).to_string());
    }
    // Accept a bare domain like example.com/media without a scheme.
    let bare = Regex::new(r#"(?i)^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:/[^\s]*)?$"#).ok()?;
    let candidate = input.trim();
    if bare.is_match(candidate) {
        return Some(format!("https://{candidate}"));
    }
    None
}

pub fn trim_url(raw: &str) -> &str {
    raw.trim_end_matches(|c: char| {
        matches!(c, ')' | ']' | '}' | ',' | '.' | ';' | '，' | '。' | '；' | '、' | '"' | '\'')
    })
}

pub fn normalize_page_url(input: &str) -> Result<Url, AppError> {
    let raw = extract_first_url(input).ok_or_else(|| {
        AppError::invalid_url("没有找到有效网址。请输入以 http(s):// 开头的网站链接。")
    })?;
    let mut url = Url::parse(&raw)?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err(AppError::invalid_url("只支持 http/https 网站。")),
    }
    let host = url.host_str().unwrap_or("");
    if host.is_empty() {
        return Err(AppError::invalid_url("网址缺少域名。"));
    }
    let is_ip = matches!(url.host(), Some(url::Host::Ipv4(_)) | Some(url::Host::Ipv6(_)));
    if !host.contains('.') && host != "localhost" && !is_ip {
        return Err(AppError::invalid_url("网址缺少域名。"));
    }
    url.set_fragment(None);
    Ok(url)
}

pub fn host_label(url: &Url) -> String {
    let host = url.host_str().unwrap_or("unknown");
    host.trim_start_matches("www.").to_string()
}

pub fn site_folder(host: &str) -> String {
    let cleaned: String = host
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() { "site".to_string() } else { cleaned }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_url_from_share_text() {
        let text = "看看这个 https://example.com/gallery?x=1 很棒";
        assert_eq!(
            extract_first_url(text).as_deref(),
            Some("https://example.com/gallery?x=1")
        );
    }

    #[test]
    fn accepts_bare_domains() {
        let url = normalize_page_url("example.com/gallery").unwrap();
        assert_eq!(url.as_str(), "https://example.com/gallery");
    }

    #[test]
    fn rejects_non_http_schemes() {
        assert!(normalize_page_url("file:///etc/passwd").is_err());
        assert!(normalize_page_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn site_folder_is_filesystem_safe() {
        assert_eq!(site_folder("www.example.com"), "www.example.com");
        assert_eq!(site_folder("exa mple.com"), "exa_mple.com");
    }
}
