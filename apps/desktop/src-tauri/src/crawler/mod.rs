pub mod browser;
mod twitter;
pub mod fallback;
pub mod script;

use crate::core::error::AppError;
use crate::core::models::{
    CrawlProgress, CrawlRequest, CrawlResult, MediaKind, MediaResource, ResourceSource,
};
use crate::core::state::AppState;
use crate::core::url::{host_label, normalize_page_url};
use crate::crawler::browser::RawPage;
use std::collections::{BTreeMap, HashSet};
use std::hash::{Hash, Hasher};
use tauri::{AppHandle, Emitter};
use url::Url;

fn source_from(raw: &str) -> ResourceSource {
    match raw {
        "img" => ResourceSource::Img,
        "picture" => ResourceSource::Picture,
        "video" => ResourceSource::Video,
        "audio" => ResourceSource::Audio,
        "css_background" => ResourceSource::CssBackground,
        "css_font_face" => ResourceSource::CssFontFace,
        "link" => ResourceSource::Link,
        "meta" => ResourceSource::Meta,
        "anchor" => ResourceSource::Anchor,
        "performance" => ResourceSource::Performance,
        "inline_style" => ResourceSource::InlineStyle,
        "fallback" => ResourceSource::Fallback,
        _ => ResourceSource::Other,
    }
}

fn id_for(url: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    url.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn kind_key(kind: MediaKind) -> String {
    match kind {
        MediaKind::Image => "image",
        MediaKind::Video => "video",
        MediaKind::Audio => "audio",
        MediaKind::Font => "font",
        MediaKind::Other => "other",
    }
    .to_string()
}

fn to_resources(page: &RawPage) -> Vec<MediaResource> {
    let mut seen = HashSet::new();
    let mut resources = Vec::new();
    for raw in &page.resources {
        let Ok(url) = Url::parse(&raw.url) else { continue };
        if !matches!(url.scheme(), "http" | "https") {
            continue;
        }
        let mut canonical = url.clone();
        canonical.set_fragment(None);
        let key = canonical.to_string();
        let path_lower = canonical.path().to_ascii_lowercase();
        // HLS/DASH fragments are implementation details, not user-facing media.
        // The parent playlist is offered instead and downloaded via ffmpeg.
        if path_lower.ends_with(".ts") || path_lower.ends_with(".m4s") {
            continue;
        }
        if !seen.insert(key.clone()) {
            continue;
        }
        if crate::core::classify::has_non_media_extension(&canonical) {
            continue;
        }
        let kind = crate::crawler::browser::raw_kind(raw);
        if kind == MediaKind::Other {
            continue;
        }
        resources.push(MediaResource {
            id: id_for(&key),
            url: key,
            kind,
            source: source_from(&raw.source),
            filename_hint: raw
                .filename_hint
                .clone()
                .or_else(|| crate::core::naming::filename_from_url(&canonical)),
            width: raw.width,
            height: raw.height,
            duration: raw.duration,
            poster: raw.poster.clone(),
            alt: raw.alt.clone(),
            host: host_label(&canonical),
        });
    }
    resources
}

fn looks_like_login(final_url: &Url, page: &RawPage, resource_count: usize) -> bool {
    let path = final_url.path().to_ascii_lowercase();
    if path.contains("login") || path.contains("signin") || path.contains("passport") {
        return true;
    }
    let title = page.title.to_ascii_lowercase();
    let login_title = title.contains("登录") || title.contains("sign in") || title.contains("log in");
    let thin_page = page.body_text_len < 400;
    (page.has_password && resource_count < 3) || (login_title && resource_count < 3 && thin_page)
}

pub async fn crawl(
    app: &AppHandle,
    state: &AppState,
    request: CrawlRequest,
) -> Result<CrawlResult, AppError> {
    let _guard = state.crawl_lock.lock().await;
    let page_url = normalize_page_url(&request.url)?;
    let host = host_label(&page_url);

    let _ = app.emit(
        "crawl-progress",
        CrawlProgress {
            stage: "loading".to_string(),
            message: format!("正在打开 {host}…"),
            percent: 12.0,
        },
    );

    let mut warnings = Vec::new();
    let page = match browser::load_and_extract(app, page_url.clone(), request.scroll).await {
        Ok(page) => page,
        Err(webview_error) => {
            warnings.push(format!("WebView 加载失败，改用 HTML 兜底：{}", webview_error.message));
            let _ = app.emit(
                "crawl-progress",
                CrawlProgress {
                    stage: "loading".to_string(),
                    message: "WebView 失败，正在尝试 HTML 兜底…".to_string(),
                    percent: 28.0,
                },
            );
            fallback::fetch_and_extract(app, &page_url).await?
        }
    };

    let _ = app.emit(
        "crawl-progress",
        CrawlProgress {
            stage: "extracting".to_string(),
            message: format!("正在整理 {} 个候选资源…", page.resources.len()),
            percent: 64.0,
        },
    );

    let final_url = Url::parse(&page.final_url).unwrap_or_else(|_| page_url.clone());
    let host = host_label(&final_url);
    let mut resources = to_resources(&page);
    let twitter_enhanced = twitter::normalize_video_resources(app, &page.final_url, &mut resources).await;
    let enhanced = twitter_enhanced
        || resources
            .iter()
            .any(|resource| crate::downloader::resolvers::supports(&resource.url));
    let mut counts = BTreeMap::new();
    for kind in [MediaKind::Image, MediaKind::Video, MediaKind::Audio, MediaKind::Font, MediaKind::Other] {
        let count = resources.iter().filter(|resource| resource.kind == kind).count();
        counts.insert(kind_key(kind), count);
    }
    let total_found = resources.len();
    let max_items = request.max_items.clamp(50, 2000);
    resources.truncate(max_items);
    resources.sort_by_key(|resource| match resource.kind {
        MediaKind::Image => 0,
        MediaKind::Video => 1,
        MediaKind::Audio => 2,
        MediaKind::Font => 3,
        MediaKind::Other => 4,
    });
    warnings.extend(page.warnings.clone());

    let needs_login = looks_like_login(&final_url, &page, total_found);
    if needs_login {
        warnings.push("页面看起来需要登录，请到设置中的登录管理完成登录后重试。".to_string());
    } else if resources.is_empty() {
        warnings.push("没有发现可下载的媒体资源。部分站点可能依赖登录、滚动或 JavaScript 异步加载。".to_string());
    }

    let _ = app.emit(
        "crawl-progress",
        CrawlProgress {
            stage: "done".to_string(),
            message: format!("发现 {} 个媒体资源", resources.len()),
            percent: 100.0,
        },
    );

    Ok(CrawlResult {
        page_url: page_url.to_string(),
        final_url: final_url.to_string(),
        title: page.title,
        host,
        resources,
        counts,
        warnings,
        needs_login,
        enhanced,
    })
}
