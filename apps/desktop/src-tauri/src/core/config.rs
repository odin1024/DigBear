use crate::core::error::AppError;
use crate::core::models::AppSettings;
use std::path::PathBuf;
use std::sync::RwLock;
use tauri::{AppHandle, Manager};

/// 免安装预览版的标记文件，放在 exe 同目录。
///
/// 打包脚本复制预览版 exe 时会一并放上这个文件：预览版的配置写到
/// 独立子目录里，和正式安装版互不干扰 —— 开发时在预览版里翻找出的
/// 历史与收藏，不会出现在用户装好的正式版里。
pub const PREVIEW_MARKER: &str = "digbear-preview.marker";

/// 当前是不是免安装预览版。
pub fn is_preview_build() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join(PREVIEW_MARKER).exists()))
        .unwrap_or(false)
}

pub struct SettingsStore {
    path: PathBuf,
    data: RwLock<AppSettings>,
}

impl SettingsStore {
    pub fn load(app: &AppHandle) -> Result<Self, AppError> {
        // The upstream macOS build used `CRAWLBear_CONFIG_DIR`; keep it
        // working so an existing profile carries over.
        let dir = if let Ok(test_dir) = std::env::var("DIGBEAR_CONFIG_DIR")
            .or_else(|_| std::env::var("CRAWLBear_CONFIG_DIR"))
        {
            std::path::PathBuf::from(test_dir)
        } else {
            let base = app
                .path()
                .app_config_dir()
                .map_err(|e| AppError::new("settings_failed", format!("无法定位配置目录: {e}")))?;
            if is_preview_build() {
                base.join("preview")
            } else {
                base
            }
        };
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("settings.json");
        let data = if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(raw) => serde_json::from_str::<AppSettings>(strip_bom(&raw))
                    .map(|settings| settings.normalized())
                    .unwrap_or_else(|e| {
                        eprintln!("[digbear] settings parse failed: {e}");
                        AppSettings::defaults()
                    }),
                Err(e) => {
                    eprintln!("[digbear] settings read failed: {e}");
                    AppSettings::defaults()
                }
            }
        } else {
            AppSettings::defaults()
        };
        let store = Self { path, data: RwLock::new(data) };
        // Persist defaults on first launch so the user can see/edit the file.
        if !converted_exists(&store.path) {
            let _ = store.persist(&store.get());
        }
        Ok(store)
    }

    /// 配置目录：历史记录、收藏都放在这里。
    pub fn dir(&self) -> &std::path::Path {
        self.path.parent().unwrap_or_else(|| std::path::Path::new("."))
    }

    pub fn get(&self) -> AppSettings {
        self.data.read().expect("settings lock poisoned").clone()
    }

    pub fn replace(&self, settings: AppSettings) -> Result<AppSettings, AppError> {
        let settings = settings.normalized();
        self.persist(&settings)?;
        *self.data.write().expect("settings lock poisoned") = settings.clone();
        Ok(settings)
    }

    fn persist(&self, settings: &AppSettings) -> Result<(), AppError> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let payload = serde_json::to_vec_pretty(settings)?;
        let temp = self.path.with_extension("json.tmp");
        std::fs::write(&temp, payload)?;
        std::fs::rename(&temp, &self.path)?;
        Ok(())
    }
}


/// 去掉 UTF-8 BOM。
///
/// Windows 记事本、PowerShell 的 `Set-Content -Encoding UTF8` 都会写 BOM，
/// 而 serde_json 不认 BOM，会直接报「expected value at line 1 column 1」。
fn strip_bom(raw: &str) -> &str {
    raw.strip_prefix('﻿').unwrap_or(raw)
}

fn converted_exists(path: &std::path::Path) -> bool {
    path.exists()
}
