use crate::core::config::SettingsStore;
use crate::core::history::HistoryStore;
use crate::core::manifest::DownloadManifest;
use crate::core::error::AppError;
use crate::core::models::AppSettings;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;
use tokio::sync::Mutex;

pub struct AppState {
    pub settings: SettingsStore,
    pub history: HistoryStore,
    pub manifest: DownloadManifest,
    pub crawl_lock: Mutex<()>,
    pub download_cancel: AtomicBool,
}

impl AppState {
    pub fn new(app: &AppHandle) -> Result<Self, AppError> {
        let settings = SettingsStore::load(app)?;
        let history = HistoryStore::load(settings.dir());
        let manifest = DownloadManifest::load(settings.dir());
        Ok(Self {
            settings,
            history,
            manifest,
            crawl_lock: Mutex::new(()),
            download_cancel: AtomicBool::new(false),
        })
    }

    /// 恢复出厂状态：清空历史、收藏、下载清单，并把设置还原成默认值。
    ///
    /// 登录态（Cookie）不在这里清，由调用方另行处理 WebView 侧的数据。
    pub fn reset_all(&self) -> Result<(), AppError> {
        self.history.clear_history()?;
        self.history.clear_favorites()?;
        self.manifest.clear()?;
        self.settings.replace(AppSettings::defaults())?;
        Ok(())
    }

    pub fn settings(&self) -> AppSettings {
        self.settings.get()
    }

    pub fn replace_settings(&self, settings: AppSettings) -> Result<AppSettings, AppError> {
        self.settings.replace(settings)
    }

    pub fn reset_cancel(&self) {
        self.download_cancel.store(false, Ordering::SeqCst);
    }

    pub fn request_cancel(&self) -> bool {
        !self.download_cancel.swap(true, Ordering::SeqCst)
    }

    pub fn is_canceled(&self) -> bool {
        self.download_cancel.load(Ordering::SeqCst)
    }
}
