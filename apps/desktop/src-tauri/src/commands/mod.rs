use crate::core::error::AppError;
use crate::core::models::{
    AppSettings, CrawlRequest, CrawlResult, DownloadRequest, DownloadSummary, LoginSite, SessionInfo,
};
use crate::core::state::AppState;
use crate::{crawler, downloader, extensions, session};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
    Ok(state.settings())
}

/// 命令行 `--crawl <url>` 指定的网址；没有则为 None。
///
/// 注意：Tauri v2 要求「带引用参数的异步命令必须返回 Result」。
#[tauri::command]
pub async fn app_start_url(start: State<'_, crate::StartUrl>) -> Result<Option<String>, AppError> {
    Ok(start.0.clone())
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, AppError> {
    state.replace_settings(settings)
}

#[tauri::command]
pub async fn pick_download_dir(app: AppHandle) -> Result<Option<String>, AppError> {
    let path = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("选择下载文件夹")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| AppError::internal(format!("文件夹选择失败: {e}")))?;

    Ok(path
        .and_then(|file_path| file_path.into_path().ok())
        .map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn crawl_site(
    app: AppHandle,
    state: State<'_, AppState>,
    request: CrawlRequest,
) -> Result<CrawlResult, AppError> {
    crawler::crawl(&app, &state, request).await
}

#[tauri::command]
pub async fn download_media(
    app: AppHandle,
    state: State<'_, AppState>,
    request: DownloadRequest,
) -> Result<DownloadSummary, AppError> {
    if request.items.is_empty() {
        return Err(AppError::new("no_selection", "请先选择要下载的媒体资源。"));
    }
    state.reset_cancel();
    downloader::download_batch(&app, &state, request).await
}

#[tauri::command]
pub async fn cancel_download(state: State<'_, AppState>) -> Result<serde_json::Value, AppError> {
    let canceled = state.request_cancel();
    Ok(serde_json::json!({ "canceled": canceled }))
}

#[tauri::command]
pub async fn open_site_login(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<serde_json::Value, AppError> {
    let message = session::open_site_login(&app, &url)?;
    // Remember the site so it appears in Settings → 登录管理.
    let parsed = crate::core::url::normalize_page_url(&url)?;
    let domain = crate::core::url::host_label(&parsed);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut settings = state.settings();
    if let Some(site) = settings.sites.iter_mut().find(|s| s.domain == domain) {
        site.url = parsed.to_string();
        site.last_opened_at = Some(now);
    } else {
        settings.sites.push(LoginSite {
            id: format!("{domain}-{now}"),
            label: domain.clone(),
            url: parsed.to_string(),
            domain,
            last_opened_at: Some(now),
        });
    }
    state.replace_settings(settings)?;
    Ok(serde_json::json!({ "message": message }))
}

#[tauri::command]
pub async fn close_site_login(app: AppHandle) -> Result<(), AppError> {
    session::close_site_login(&app);
    Ok(())
}

#[tauri::command]
pub async fn get_site_session(app: AppHandle, url: String) -> Result<SessionInfo, AppError> {
    session::get_site_session(&app, &url)
}

#[tauri::command]
pub async fn clear_site_session(app: AppHandle, url: String) -> Result<SessionInfo, AppError> {
    session::clear_site_session(&app, &url)
}

#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), AppError> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::new("not_found", "文件或文件夹不存在。"));
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = std::process::Command::new("open");
        if p.is_file() {
            command.arg("-R");
        }
        command
            .arg(&p)
            .spawn()
            .map_err(|e| AppError::internal(format!("无法打开 Finder: {e}")))?;
        Ok(())
    }
    #[cfg(windows)]
    {
        // `explorer /select,` reveals the file inside its folder; a folder is
        // opened directly.
        let mut command = std::process::Command::new("explorer");
        if p.is_file() {
            command.arg(format!("/select,{}", p.display()));
        } else {
            command.arg(&p);
        }
        command
            .spawn()
            .map_err(|e| AppError::internal(format!("无法打开资源管理器: {e}")))?;
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        Err(AppError::new("unsupported", "当前系统不支持自动打开目录。"))
    }
}

/// Open a page-type video (YouTube etc.) in its own webview window.
///
/// Embeds inside the app webview are rejected by some sites (YouTube error 153),
/// but a top-level window loads the player like a normal browser tab.
#[tauri::command]
pub async fn open_video_preview(
    app: AppHandle,
    url: String,
    title: Option<String>,
) -> Result<(), AppError> {
    const LABEL: &str = "video-preview";
    let parsed = crate::core::url::normalize_page_url(&url)?;

    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.navigate(parsed.clone());
        if let Some(title) = title {
            let _ = win.set_title(&title);
        }
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(parsed))
        .title(title.unwrap_or_else(|| "视频预览 · DigBear".to_string()))
        .inner_size(1080.0, 760.0)
        .min_inner_size(760.0, 520.0)
        .center()
        .user_agent(crate::core::webview::BROWSER_USER_AGENT)
        .build()
        .map_err(|e| AppError::new("video_failed", format!("无法打开视频窗口: {e}")))?;
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), AppError> {
    let parsed = url::Url::parse(&url)
        .map_err(|_| AppError::invalid_url("链接格式不正确。"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::invalid_url("只能打开 http/https 链接。"));
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(parsed.as_str())
            .spawn()
            .map_err(|e| AppError::internal(format!("无法打开浏览器: {e}")))?;
        Ok(())
    }
    #[cfg(windows)]
    {
        // `start` with an empty title hands the URL to the default browser.
        std::process::Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("")
            .arg(parsed.as_str())
            .spawn()
            .map_err(|e| AppError::internal(format!("无法打开浏览器: {e}")))?;
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        Err(AppError::new("unsupported", "当前系统不支持自动打开链接。"))
    }
}


#[tauri::command]
pub fn list_extensions(app: AppHandle) -> Vec<extensions::ExtensionStatus> {
    extensions::list(&app)
}

#[tauri::command]
pub async fn install_extension(
    app: AppHandle,
    id: String,
) -> Result<extensions::ExtensionStatus, AppError> {
    extensions::install(&app, &id).await
}

#[tauri::command]
pub fn remove_extension(
    app: AppHandle,
    id: String,
) -> Result<Vec<extensions::ExtensionStatus>, AppError> {
    extensions::remove(&app, &id)
}


#[tauri::command]
pub fn set_app_language(app: AppHandle, language: String) -> Result<(), AppError> {
    crate::build_app_menu(&app, language == "en")
        .map_err(|error| AppError::internal(format!("无法更新菜单语言: {error}")))
}
