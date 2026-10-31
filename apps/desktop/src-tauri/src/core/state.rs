use crate::core::config::SettingsStore;
use crate::core::error::AppError;
use crate::core::models::AppSettings;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;
use tokio::sync::Mutex;

pub struct AppState {
    pub settings: SettingsStore,
    pub crawl_lock: Mutex<()>,
    pub download_cancel: AtomicBool,
}

impl AppState {
    pub fn new(app: &AppHandle) -> Result<Self, AppError> {
        Ok(Self {
            settings: SettingsStore::load(app)?,
            crawl_lock: Mutex::new(()),
            download_cancel: AtomicBool::new(false),
        })
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
