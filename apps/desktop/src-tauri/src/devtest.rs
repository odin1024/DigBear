//! Debug-only integration harness for local development.
//!
//! Enabled only in debug builds. It never runs in release builds and does not
//! ship in the app bundle. Use it to exercise crawl/download/session logic
//! without UI automation:
//!
//! - `DIGBEAR_TEST_URL=<url>` and optionally `DIGBEAR_TEST_DOWNLOAD=1`
//! - `DIGBEAR_TEST_LOGIN_URL=<url>`
//! - `DIGBEAR_TEST_EXTENSION=<id>`, `DIGBEAR_TEST_PAGE_VIDEO=<url>`
//!
//! The upstream `CRAWLBear_*` spellings keep working as a fallback.

#![cfg(debug_assertions)]

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
}
