use crate::core::error::AppError;
use crate::core::models::AppSettings;
use std::path::PathBuf;
use std::sync::RwLock;
use tauri::{AppHandle, Manager};

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
            app.path()
                .app_config_dir()
                .map_err(|e| AppError::new("settings_failed", format!("无法定位配置目录: {e}")))?
        };
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("settings.json");
        let data = if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(raw) => serde_json::from_str::<AppSettings>(&raw)
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

fn converted_exists(path: &std::path::Path) -> bool {
    path.exists()
}
