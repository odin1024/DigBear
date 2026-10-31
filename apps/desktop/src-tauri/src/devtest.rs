//! Debug-only integration harness for local development.
//!
//! Enabled only in debug builds. It never runs in release builds and does not
//! ship in the app bundle. Use it to exercise crawl/download/session logic
//! without UI automation:
//!
//! - `DIGBEAR_TEST_URL=<url>` and optionally `DIGBEAR_TEST_DOWNLOAD=1`
//! - `DIGBEAR_TEST_LOGIN_URL=<url>`
//! - `DIGBEAR_TEST_EXTENSION=<id>`, `DIGBEAR_TEST_PAGE_VIDEO=<url>`
//! - `DIGBEAR_TEST_MEASURE=1`  打印布局测量结果（排查溢出 / 尺寸问题）
//!
//! The upstream `CRAWLBear_*` spellings keep working as a fallback.
//! The harness stays in release builds on purpose: it is the only way to
//! diagnose layout problems on a user's machine without shipping a debugger.

use crate::core::models::{CrawlRequest, DownloadItem, DownloadRequest};
use crate::core::state::AppState;
use crate::{crawler, downloader, session};
use tauri::{AppHandle, Manager};

pub fn maybe_spawn(handle: AppHandle) {
    let extension_handle = handle.clone();
    if let Ok(login_url) = std::env::var("DIGBEAR_TEST_LOGIN_URL")
            .or_else(|_| std::env::var("CRAWLBear_TEST_LOGIN_URL")) {
        let handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            match session::open_site_login(&handle, &login_url) {
                Ok(message) => eprintln!("[digbear][test] login window: {message}"),
                Err(error) => {
                    eprintln!("[digbear][test] login error: {} {}", error.code, error.message);
                    return;
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            match session::get_site_session(&handle, &login_url) {
                Ok(info) => eprintln!(
                    "[digbear][test] session domain={} cookies={}",
                    info.domain, info.cookies
                ),
                Err(error) => eprintln!(
                    "[digbear][test] session error: {} {}",
                    error.code, error.message
                ),
            }
            match session::clear_site_session(&handle, &login_url) {
                Ok(info) => eprintln!("[digbear][test] cleared cookies={}", info.cookies),
                Err(error) => eprintln!(
                    "[digbear][test] clear error: {} {}",
                    error.code, error.message
                ),
            }
        });
    }

    if let Ok(test_url) = std::env::var("DIGBEAR_TEST_URL")
            .or_else(|_| std::env::var("CRAWLBear_TEST_URL")) {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let settings = handle.state::<AppState>().settings();
            let request = CrawlRequest {
                url: test_url,
                kinds: vec![],
                scroll: true,
                max_items: settings.max_items,
            };
            let state = handle.state::<AppState>();
            let result = match crawler::crawl(&handle, &state, request).await {
                Ok(result) => result,
                Err(error) => {
                    eprintln!(
                        "[digbear][test] crawl error: {} {}",
                        error.code, error.message
                    );
                    return;
                }
            };
            eprintln!(
                "[digbear][test] crawl ok host={} title={} counts={:?} warnings={:?}",
                result.host, result.title, result.counts, result.warnings
            );
            for resource in result.resources.iter().filter(|r| matches!(r.kind, crate::core::models::MediaKind::Video)).take(5) {
                eprintln!("[digbear][test] video url={}", resource.url);
            }
            if std::env::var("DIGBEAR_TEST_DOWNLOAD")
            .or_else(|_| std::env::var("CRAWLBear_TEST_DOWNLOAD")).ok().as_deref() != Some("1") {
                return;
            }
            let items = result
                .resources
                .iter()
                .map(|resource| DownloadItem {
                    id: resource.id.clone(),
                    url: resource.url.clone(),
                    kind: resource.kind,
                    filename_hint: resource.filename_hint.clone(),
                })
                .collect::<Vec<_>>();
            let request = DownloadRequest {
                page_url: result.final_url.clone(),
                items,
            };
            let state = handle.state::<AppState>();
            match downloader::download_batch(&handle, &state, request).await {
                Ok(summary) => eprintln!(
                    "[digbear][test] download ok folder={} success={} failed={} canceled={}",
                    summary.folder, summary.success_count, summary.failed_count, summary.canceled
                ),
                Err(error) => eprintln!(
                    "[digbear][test] download error: {} {}",
                    error.code, error.message
                ),
            }
        });
    }

    if let Ok(extension_id) = std::env::var("DIGBEAR_TEST_EXTENSION")
            .or_else(|_| std::env::var("CRAWLBear_TEST_EXTENSION")) {
        let handle = extension_handle.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            match crate::extensions::install(&handle, &extension_id).await {
                Ok(status) => eprintln!(
                    "[digbear][test] extension installed id={} version={} path={:?}",
                    status.id, status.version, status.path
                ),
                Err(error) => eprintln!(
                    "[digbear][test] extension error: {} {}",
                    error.code, error.message
                ),
            }
        });
    }

    if let Ok(video_url) = std::env::var("DIGBEAR_TEST_PAGE_VIDEO")
            .or_else(|_| std::env::var("CRAWLBear_TEST_PAGE_VIDEO")) {
        let handle = extension_handle.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let Some(resolved) = crate::downloader::resolvers::resolve(&video_url).await else {
                eprintln!("[digbear][test] page video: no resolver");
                return;
            };
            match resolved {
                Ok((id, media)) => {
                    let target = std::path::Path::new("/tmp/dig-bear-page-video.mp4");
                    let _ = tokio::fs::remove_file(target).await;
                    match crate::downloader::resolvers::download(&handle, &media, target, |_, _| {}).await {
                        Ok(()) => eprintln!("[digbear][test] page video ok resolver={id}"),
                        Err(error) => eprintln!("[digbear][test] page video download error: {error}"),
                    }
                }
                Err(error) => eprintln!("[digbear][test] page video resolve error: {error}"),
            }
        });
    }

    // 打印当前窗口的布局测量结果。
    // 用来定位"内容被裁掉 / 超出窗口"这类问题：直接报告每个关键容器的
    // 实际宽度与溢出量，比在浏览器里猜要可靠得多。
    if let Ok(w) = std::env::var("DIGBEAR_TEST_RESIZE") {
        // 把主窗口改成指定宽度（物理像素），用来验证 WebView 视口与 DPI 的关系
        let width: u32 = w.trim().parse().unwrap_or(1000);
        let handle = extension_handle.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            if let Some(win) = handle.get_webview_window("main") {
                let _ = win.set_size(tauri::PhysicalSize::new(width, 700));
            }
        });
    }

    // 打印目标目录所在磁盘的剩余空间。
    if let Ok(dir) = std::env::var("DIGBEAR_TEST_DISK") {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            match crate::core::disk::free_space(std::path::Path::new(&dir)) {
                Some((available, total)) => eprintln!(
                    "[digbear][test] disk {}: 可用 {} / 共 {}",
                    dir,
                    crate::core::disk::human_size(available),
                    crate::core::disk::human_size(total)
                ),
                None => eprintln!("[digbear][test] disk {}: 查询失败", dir),
            }
        });
    }

    if std::env::var("DIGBEAR_TEST_MEASURE").ok().as_deref() == Some("1") {
        let handle = extension_handle.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let Some(win) = handle.get_webview_window("main") else {
                eprintln!("[digbear][test] measure: 主窗口不存在");
                return;
            };
            let js = r#"JSON.stringify({
              viewport: [window.innerWidth, window.innerHeight],
              dpr: window.devicePixelRatio,
              outer: [window.outerWidth, window.outerHeight],
              screen: [window.screen.width, window.screen.height],
              avail: [window.screen.availWidth, window.screen.availHeight],
              docScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
              bodyScroll: [document.body.scrollWidth, document.body.scrollHeight],
              boxes: Array.from(document.querySelectorAll(
                ".rb-app,.app-main,.view-slot,.crawler-view,.home-page,.shell,.hero,.hero__copy,.hero__mascot,.hero__mascot-stage,.home-search,.search-pill,.masthead__inner"
              )).map(function (el) {
                var r = el.getBoundingClientRect();
                return {
                  sel: el.className.split(" ").slice(0,2).join("."),
                  l: Math.round(r.left), r: Math.round(r.right),
                  w: Math.round(r.width), sw: el.scrollWidth,
                };
              })
            })"#;
            let win2 = win.clone();
            let (tx, rx) = std::sync::mpsc::channel::<String>();
            if win2.eval_with_callback(js.to_string(), move |v| { let _ = tx.send(v); }).is_err() {
                eprintln!("[digbear][test] measure: eval 失败");
                return;
            }
            match rx.recv_timeout(std::time::Duration::from_secs(8)) {
                Ok(raw) => {
                    let raw = raw.trim().trim_matches('"').replace("\\\"", "\"");
                    eprintln!("[digbear][test] measure: {}", raw);
                }
                Err(_) => eprintln!("[digbear][test] measure: 等待超时"),
            }
        });
    }
}
