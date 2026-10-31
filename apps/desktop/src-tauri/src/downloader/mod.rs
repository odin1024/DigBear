//! Generic batch media downloader.
//!
//! Flow: `<download_dir>/<host>/` -> bounded worker pool (`JoinSet` sized by
//! `settings.concurrency`, 1..=5) -> each worker downloads through `curl` or
//! `ffmpeg` into a `.part` file -> response is validated -> extension corrected
//! from Content-Type -> unique final rename.  Progress / per-item / done events
//! are emitted for the UI and a `DownloadSummary` is returned.

mod curl;
pub(crate) mod hls;
mod paths;
pub(crate) mod resolvers;
mod youtube;

use crate::core::error::AppError;
use crate::core::models::{
    DownloadFailure, DownloadFile, DownloadItem, DownloadItemEvent, DownloadProgress,
    DownloadRequest, DownloadSummary,
};
use crate::core::state::AppState;
use crate::core::url::{host_label, normalize_page_url, site_folder};
use paths::{PathPlanner, PartGuard};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::task::JoinSet;
use url::Url;

pub async fn download_batch(
    app: &AppHandle,
    state: &AppState,
    request: DownloadRequest,
) -> Result<DownloadSummary, AppError> {
    let page_url = normalize_page_url(&request.page_url)?;
    if request.items.is_empty() {
        return Err(AppError::new("no_selection", "请先选择要下载的资源。"));
    }

    let settings = state.settings();
    let folder = PathBuf::from(&settings.download_dir).join(site_folder(&host_label(&page_url)));
    tokio::fs::create_dir_all(&folder).await.map_err(|error| {
        AppError::internal(format!("无法创建下载目录 {}: {error}", folder.display()))
    })?;

    let total = request.items.len();
    let concurrency = usize::from(settings.concurrency.clamp(1, 5));
    let planner = Arc::new(PathPlanner::new(folder.clone()));
    let page_url_label = page_url.to_string();

    let mut summary = DownloadSummary {
        folder: folder.to_string_lossy().to_string(),
        total,
        success_count: 0,
        failed_count: 0,
        files: Vec::new(),
        failures: Vec::new(),
        canceled: false,
    };
    let mut tasks: JoinSet<ItemOutcome> = JoinSet::new();
    let mut items = request.items.into_iter();
    let mut completed = 0usize;
    let mut canceled = false;

    emit_progress(app, 0, total, None, None);

    loop {
        // Launch while there is worker capacity; cancellation is honoured before
        // every single item.
        while !canceled && tasks.len() < concurrency {
            if state.is_canceled() {
                canceled = true;
                summary.canceled = true;
                break;
            }
            let Some(item) = items.next() else {
                break;
            };
            let item_url = Url::parse(&item.url).ok();
            let stem = paths::filename_stem(&item, item_url.as_ref());
            let ext = paths::planned_extension(item_url.as_ref(), item.kind);
            let target = planner.reserve(&stem, &ext);
            let planned_name = target
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| "media".to_string());
            emit_progress(
                app,
                completed,
                total,
                Some(item.id.clone()),
                Some(planned_name.clone()),
            );

            let progress_app = app.clone();
            let progress_id = item.id.clone();
            let progress_name = planned_name.clone();
            let progress: ProgressSink = Arc::new(move |received, total_bytes| {
                let _ = progress_app.emit(
                    "download-progress",
                    DownloadProgress {
                        completed,
                        total,
                        current_id: Some(progress_id.clone()),
                        current_name: Some(progress_name.clone()),
                        current_received: Some(received),
                        current_total: total_bytes,
                    },
                );
            });
            let context = ItemContext {
                app: app.clone(),
                item,
                page_url: page_url_label.clone(),
                planner: Arc::clone(&planner),
                target,
                stem,
                progress,
            };
            let retries = settings.retry_count;
            tasks.spawn(async move { run_item_with_retry(context, retries).await });
        }

        if canceled {
            // Aborted worker futures drop their `PartGuard`, removing partial files.
            tasks.abort_all();
            break;
        }
        if tasks.is_empty() {
            break;
        }

        // Wait for one worker, waking up periodically to poll cancellation even
        // when every in-flight download is slow.
        match tokio::time::timeout(
            std::time::Duration::from_millis(200),
            tasks.join_next(),
        )
        .await
        {
            Ok(Some(Ok(outcome))) => {
                completed += 1;
                apply_outcome(app, &mut summary, outcome, completed, total);
            }
            Ok(Some(Err(error))) => {
                eprintln!("[digbear] download worker failed: {error}");
            }
            Ok(None) => break,
            Err(_elapsed) => {
                if state.is_canceled() {
                    canceled = true;
                    summary.canceled = true;
                    tasks.abort_all();
                    break;
                }
            }
        }
    }

    // Let workers that were already finishing (or that completed before cancel)
    // report their result; aborted ones are skipped.
    while let Some(joined) = tasks.join_next().await {
        if let Ok(outcome) = joined {
            completed += 1;
            apply_outcome(app, &mut summary, outcome, completed, total);
        }
    }
    summary.canceled = canceled;

    let _ = app.emit("download-done", &summary);
    Ok(summary)
}

type ProgressSink = Arc<dyn Fn(u64, Option<u64>) + Send + Sync>;

#[derive(Clone)]
struct ItemContext {
    app: AppHandle,
    item: DownloadItem,
    page_url: String,
    planner: Arc<PathPlanner>,
    target: PathBuf,
    stem: String,
    progress: ProgressSink,
}

enum ItemOutcome {
    Success(DownloadFile),
    Failure(DownloadFailure),
}

fn failure(item: &DownloadItem, message: impl Into<String>) -> ItemOutcome {
    ItemOutcome::Failure(DownloadFailure {
        id: item.id.clone(),
        url: item.url.clone(),
        error: message.into(),
    })
}

/// Download one item into its planned target.  Every failure path keeps the
/// batch alive; the error is reported on the item event instead.
/// Cheap, deterministic checks that will never succeed on a retry.
///
/// A malformed URL or an unsupported scheme is the caller's mistake, so we
/// bail out before spending any network time on it.
fn validate_item(item: &DownloadItem) -> Result<(), String> {
    let parsed = Url::parse(&item.url).map_err(|_| "链接格式不正确。")?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("只支持 http/https 链接。".to_string());
    }
    Ok(())
}

/// Download one item, retrying transient failures with exponential backoff.
///
/// Most failures here are momentary — a reset connection, a throttled CDN, a
/// signed URL that expired mid-flight. Retrying a couple of times turns those
/// into successes; the backoff keeps us from hammering a struggling server.
async fn run_item_with_retry(context: ItemContext, retries: u8) -> ItemOutcome {
    if let Err(message) = validate_item(&context.item) {
        return failure(&context.item, message);
    }
    let mut attempt = 0u8;
    loop {
        let outcome = run_item(context.clone()).await;
        match &outcome {
            ItemOutcome::Success(_) => return outcome,
            ItemOutcome::Failure(failure) => {
                if attempt >= retries {
                    return outcome;
                }
                attempt += 1;
                let delay = std::time::Duration::from_millis(400u64 << (attempt - 1).min(4));
                eprintln!(
                    "[digbear] 下载失败，第 {attempt}/{retries} 次重试（{}）: {}",
                    context.item.url, failure.error
                );
                tokio::time::sleep(delay).await;
            }
        }
    }
}

async fn run_item(context: ItemContext) -> ItemOutcome {
    let ItemContext { app, item, page_url, planner, target, stem, progress } = context;

    let parsed_url = match Url::parse(&item.url) {
        Ok(url) => url,
        Err(_) => return failure(&item, "链接格式不正确。"),
    };

    if paths::is_page_video_url(&item.url) {
        return run_page_video(&app, &item, &planner, &target, &stem, &progress).await;
    }

    let direct_part = paths::part_path(&target);
    let hls_part = paths::hls_part_path(&target);
    let mut guard = PartGuard::new(vec![direct_part.clone(), hls_part.clone()]);

    let mut is_hls = paths::is_hls_url(&item.url);
    let mut content_type = String::new();
    let mut effective_url = String::new();
    let part: PathBuf;

    if is_hls {
        part = hls_part.clone();
        if let Err(error) = hls::fetch_hls(&app, &item.url, &page_url, &part).await {
            return failure(&item, error);
        }
    } else {
        match curl::fetch_direct(&app, &item.url, &page_url, &direct_part).await {
            Ok(info) => {
                let probe = read_prefix(&direct_part).await.unwrap_or_default();
                let playlist = paths::is_hls_content_type(&info.content_type)
                    || paths::looks_like_playlist(&probe);
                if playlist {
                    // Some sites serve a playlist from a signed, extension-less URL.
                    let _ = tokio::fs::remove_file(&direct_part).await;
                    is_hls = true;
                    content_type.clear();
                    part = hls_part.clone();
                    if let Err(error) = hls::fetch_hls(&app, &item.url, &page_url, &part).await {
                        return failure(&item, error);
                    }
                } else {
                    part = direct_part.clone();
                    content_type = info.content_type;
                    effective_url = info.effective_url;
                }
            }
            Err(error) => return failure(&item, error),
        }
    }

    let size = match tokio::fs::metadata(&part).await {
        Ok(metadata) => metadata.len(),
        Err(error) => return failure(&item, format!("下载结果不可用: {error}")),
    };
    if size == 0 {
        return failure(&item, "服务器返回了空文件（可能是链接过期或需要登录）。");
    }

    let prefix = read_prefix(&part).await.unwrap_or_default();
    if let Err(message) = paths::validate_response(&content_type, &prefix, is_hls) {
        return failure(&item, message);
    }

    let effective_parsed = Url::parse(&effective_url).ok();
    let extension = paths::final_extension(
        Some(&parsed_url),
        effective_parsed.as_ref(),
        &content_type,
        item.kind,
        is_hls,
    );
    let final_target = planner.correct(&target, &stem, &extension);
    if let Err(error) = tokio::fs::rename(&part, &final_target).await {
        return failure(&item, format!("保存文件失败: {error}"));
    }
    guard.disarm();

    let filename = final_target
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "media".to_string());
    ItemOutcome::Success(DownloadFile {
        id: item.id,
        url: item.url,
        path: final_target.to_string_lossy().to_string(),
        filename,
        size,
        kind: item.kind,
    })
}

/// Download a page video through the pluggable resolver registry.
async fn run_page_video(
    app: &AppHandle,
    item: &DownloadItem,
    planner: &PathPlanner,
    target: &Path,
    stem: &str,
    progress: &ProgressSink,
) -> ItemOutcome {
    let Some(resolved) = resolvers::resolve(&item.url).await else {
        return failure(item, "这个视频是网页播放页，暂时还没有可用的解析方案。");
    };
    let (resolver_id, media) = match resolved {
        Ok(value) => value,
        Err(error) => return failure(item, format!("视频解析失败：{error}")),
    };
    eprintln!("[digbear] page video resolver: {resolver_id}");

    if let Err(error) = resolvers::download(app, &media, target, |received, total| {
        progress(received, total)
    })
    .await
    {
        return failure(item, error);
    }

    let size = match tokio::fs::metadata(target).await {
        Ok(metadata) => metadata.len(),
        Err(error) => return failure(item, format!("读取下载结果失败: {error}")),
    };
    if size == 0 {
        return failure(item, "解析结果返回了空文件。");
    }

    let final_target = planner.correct(target, stem, &media.container);
    if final_target != target {
        if let Err(error) = tokio::fs::rename(target, &final_target).await {
            return failure(item, format!("保存文件失败: {error}"));
        }
    }

    let filename = final_target
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "media".to_string());
    ItemOutcome::Success(DownloadFile {
        id: item.id.clone(),
        url: item.url.clone(),
        path: final_target.to_string_lossy().to_string(),
        filename,
        size,
        kind: item.kind,
    })
}

async fn read_prefix(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut buffer = vec![0u8; 512];
    let read = file.read(&mut buffer).await?;
    buffer.truncate(read);
    Ok(buffer)
}

fn apply_outcome(
    app: &AppHandle,
    summary: &mut DownloadSummary,
    outcome: ItemOutcome,
    completed: usize,
    total: usize,
) {
    match outcome {
        ItemOutcome::Success(file) => {
            summary.success_count += 1;
            let event = DownloadItemEvent {
                id: file.id.clone(),
                status: "success".to_string(),
                path: Some(file.path.clone()),
                error: None,
            };
            let _ = app.emit("download-item", &event);
            emit_progress(
                app,
                completed,
                total,
                Some(file.id.clone()),
                Some(file.filename.clone()),
            );
            summary.files.push(file);
        }
        ItemOutcome::Failure(item_failure) => {
            summary.failed_count += 1;
            let event = DownloadItemEvent {
                id: item_failure.id.clone(),
                status: "failed".to_string(),
                path: None,
                error: Some(item_failure.error.clone()),
            };
            let _ = app.emit("download-item", &event);
            emit_progress(app, completed, total, Some(item_failure.id.clone()), None);
            summary.failures.push(item_failure);
        }
    }
}

fn emit_progress(
    app: &AppHandle,
    completed: usize,
    total: usize,
    current_id: Option<String>,
    current_name: Option<String>,
) {
    let payload = DownloadProgress {
        completed,
        total,
        current_id,
        current_name,
        current_received: None,
        current_total: None,
    };
    let _ = app.emit("download-progress", payload);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::MediaKind;

    fn item(url: &str) -> DownloadItem {
        DownloadItem {
            id: "x".to_string(),
            url: url.to_string(),
            kind: MediaKind::Image,
            filename_hint: None,
        }
    }

    #[test]
    fn rejects_malformed_urls() {
        assert!(validate_item(&item("not a url")).is_err());
        assert!(validate_item(&item("")).is_err());
    }

    #[test]
    fn rejects_non_http_schemes() {
        assert!(validate_item(&item("ftp://example.com/a.png")).is_err());
        assert!(validate_item(&item("file:///C:/secret.png")).is_err());
        assert!(validate_item(&item("javascript:alert(1)")).is_err());
        assert!(validate_item(&item("data:image/png;base64,AAAA")).is_err());
    }

    #[test]
    fn accepts_http_and_https() {
        assert!(validate_item(&item("https://example.com/a.png")).is_ok());
        assert!(validate_item(&item("http://example.com/a.png")).is_ok());
    }
}
