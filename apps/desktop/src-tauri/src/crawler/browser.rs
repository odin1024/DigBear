use crate::core::error::AppError;
use crate::core::models::MediaKind;
use crate::crawler::script::EXTRACT_JS;
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration as StdDuration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use url::Url;

pub const CRAWL_LABEL: &str = "crawl-worker";

#[derive(Debug, Clone, Deserialize)]
pub struct RawResource {
    pub url: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub filename_hint: Option<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(default)]
    pub poster: Option<String>,
    #[serde(default)]
    pub alt: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawPage {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub final_url: String,
    #[serde(default)]
    pub resources: Vec<RawResource>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub has_password: bool,
    #[serde(default)]
    pub body_text_len: usize,
}

async fn eval_json(win: &WebviewWindow, js: &str, timeout: StdDuration) -> Result<Value, AppError> {
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    win.eval_with_callback(js.to_string(), move |value| {
        let _ = tx.send(value);
    })
    .map_err(|e| AppError::new("crawl_failed", format!("页面脚本执行失败: {e}")))?;

    let raw = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(timeout))
        .await
        .map_err(|e| AppError::internal(format!("等待页面响应失败: {e}")))?
        .map_err(|_| AppError::new("crawl_failed", "页面响应超时。"))?;
    let raw = raw.trim();
    if raw.is_empty() {
        return Err(AppError::new("crawl_failed", "页面还没有准备好。"));
    }
    let first = serde_json::from_str::<Value>(raw)
        .map_err(|e| AppError::internal(format!("无法解析页面数据: {e}")))?;
    if let Value::String(inner) = first {
        if let Ok(second) = serde_json::from_str::<Value>(&inner) {
            return Ok(second);
        }
        return Ok(Value::String(inner));
    }
    Ok(first)
}

fn kind_from_raw(raw: &RawResource) -> MediaKind {
    match raw.kind.as_str() {
        "image" => MediaKind::Image,
        "video" => MediaKind::Video,
        "audio" => MediaKind::Audio,
        "font" => MediaKind::Font,
        _ => crate::core::classify::kind_from_url(&Url::parse(&raw.url).unwrap_or_else(|_| Url::parse("https://invalid").unwrap()))
            .unwrap_or(MediaKind::Other),
    }
}

pub async fn load_and_extract(
    app: &AppHandle,
    url: Url,
    scroll: bool,
) -> Result<RawPage, AppError> {
    if let Some(old) = app.get_webview_window(CRAWL_LABEL) {
        let _ = old.close();
    }

    let win = WebviewWindowBuilder::new(app, CRAWL_LABEL, WebviewUrl::External(url.clone()))
        .title("正在爬取")
        .inner_size(1280.0, 900.0)
        .visible(false)
        .skip_taskbar(true)
        .user_agent(crate::core::webview::BROWSER_USER_AGENT)
        .initialization_script(crate::core::webview::CRAWL_INIT_SCRIPT)
        .build()
        .map_err(|e| AppError::new("crawl_failed", format!("无法创建爬取窗口: {e}")))?;

    let result = async {
        let deadline = std::time::Instant::now() + StdDuration::from_secs(35);
        loop {
            if std::time::Instant::now() > deadline {
                return Err(AppError::new("crawl_failed", "页面加载超时，请检查网址是否可以访问。"));
            }
            if let Ok(v) = eval_json(
                &win,
                "JSON.stringify(window.__CRAWLBear_ready || document.readyState)",
                StdDuration::from_secs(3),
            )
            .await
            {
                if v.as_str() == Some("complete") {
                    break;
                }
            }
            tokio::time::sleep(StdDuration::from_millis(500)).await;
        }

        let _ = win.eval("try{performance.setResourceTimingBufferSize(3000)}catch(e){}");
        if scroll {
            for _ in 0..3 {
                let _ = win.eval("window.scrollTo(0, document.body.scrollHeight)");
                tokio::time::sleep(StdDuration::from_millis(650)).await;
            }
            let _ = win.eval("window.scrollTo(0, 0)");
            tokio::time::sleep(StdDuration::from_millis(500)).await;
        }

        let value = eval_json(&win, EXTRACT_JS, StdDuration::from_secs(10)).await?;
        let mut page: RawPage = serde_json::from_value(value)
            .map_err(|e| AppError::new("crawl_failed", format!("无法解析页面资源: {e}")))?;

        // Give SPA / infinite-scroll pages one more chance to expose resources,
        // then merge by URL in the crawler layer.
        tokio::time::sleep(StdDuration::from_millis(700)).await;
        if let Ok(Value::Object(second)) = eval_json(&win, EXTRACT_JS, StdDuration::from_secs(8)).await {
            if let Some(items) = second.get("resources").and_then(|v| v.as_array()) {
                for item in items {
                    if let Ok(raw) = serde_json::from_value::<RawResource>(item.clone()) {
                        page.resources.push(raw);
                    }
                }
            }
            if let Some(warnings) = second.get("warnings").and_then(|v| v.as_array()) {
                for warning in warnings {
                    if let Some(text) = warning.as_str() {
                        if !page.warnings.iter().any(|w| w == text) {
                            page.warnings.push(text.to_string());
                        }
                    }
                }
            }
        }

        // Login heuristic inputs are intentionally separate from the extractor
        // so the shared script stays focused on media discovery.
        if let Ok(Value::Object(meta)) = eval_json(
            &win,
            "JSON.stringify({has_password: !!document.querySelector('input[type=password]'), body_text_len: ((document.body && document.body.innerText) || '').length})",
            StdDuration::from_secs(3),
        )
        .await
        {
            page.has_password = meta.get("has_password").and_then(|v| v.as_bool()).unwrap_or(false);
            page.body_text_len = meta
                .get("body_text_len")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize;
        }
        if let Ok(final_url) = win.url() {
            if !final_url.as_str().starts_with("about:") {
                page.final_url = final_url.to_string();
            }
        }
        if page.final_url.is_empty() {
            page.final_url = url.to_string();
        }
        Ok::<RawPage, AppError>(page)
    }
    .await;

    let _ = win.close();
    result
}

pub fn raw_kind(raw: &RawResource) -> MediaKind {
    kind_from_raw(raw)
}

