use crate::core::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

/// 下载清单最多保留多少条记录。
const MANIFEST_LIMIT: usize = 5000;

/// 一条「已经下载过」的记录。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestEntry {
    /// 资源地址 —— 用作唯一键。
    pub url: String,
    /// 保存到的目录。
    pub folder: String,
    /// 落盘的文件名。
    pub filename: String,
    /// 文件大小（字节）。
    pub size: u64,
    /// 下载时间（Unix 秒）。
    pub at: u64,
}

/// 已经下载过的资源清单。
///
/// 存在配置目录的 `downloads.json` 里：同一份资源再次翻找时，
/// 如果文件还在就直接跳过，不用重新走一遍网络。
pub struct DownloadManifest {
    path: PathBuf,
    entries: RwLock<HashMap<String, ManifestEntry>>,
}

impl DownloadManifest {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join("downloads.json");
        let entries = match std::fs::read_to_string(&path) {
            Ok(raw) => serde_json::from_str::<Vec<ManifestEntry>>(raw.strip_prefix('\u{feff}').unwrap_or(&raw))
                .map(|list| {
                    list.into_iter()
                        .map(|entry| (entry.url.clone(), entry))
                        .collect()
                })
                .unwrap_or_else(|error| {
                    eprintln!("[digbear] 下载清单解析失败: {error}");
                    HashMap::new()
                }),
            Err(_) => HashMap::new(),
        };
        Self {
            path,
            entries: RwLock::new(entries),
        }
    }

    /// 清空下载清单。
    pub fn clear(&self) -> Result<(), AppError> {
        {
            let mut guard = self.entries.write().expect("manifest lock");
            guard.clear();
        }
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&self.path, b"[]")?;
        Ok(())
    }

    /// 查一条记录；文件已经不在磁盘上时视为没下过。
    pub fn lookup(&self, url: &str) -> Option<ManifestEntry> {
        let entry = self.entries.read().expect("manifest lock").get(url).cloned()?;
        let path = Path::new(&entry.folder).join(&entry.filename);
        if path.exists() {
            Some(entry)
        } else {
            None
        }
    }

    /// 记一条「已下载」。
    pub fn record(&self, entry: ManifestEntry) {
        let mut guard = self.entries.write().expect("manifest lock");
        guard.insert(entry.url.clone(), entry);
        // 清单不能无限增长：超过上限就丢掉最老的记录。
        if guard.len() > MANIFEST_LIMIT {
            let mut sorted: Vec<(String, u64)> = guard
                .iter()
                .map(|(url, item)| (url.clone(), item.at))
                .collect();
            sorted.sort_by_key(|(_, at)| *at);
            let drop_count = sorted.len().saturating_sub(MANIFEST_LIMIT);
            for (url, _) in sorted.into_iter().take(drop_count) {
                guard.remove(&url);
            }
        }
    }

    /// 把清单落盘。
    pub fn persist(&self) -> Result<(), AppError> {
        let list: Vec<ManifestEntry> = self
            .entries
            .read()
            .expect("manifest lock")
            .values()
            .cloned()
            .collect();
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let payload = serde_json::to_vec_pretty(&list)?;
        let temp = self.path.with_extension("json.tmp");
        std::fs::write(&temp, payload)?;
        std::fs::rename(&temp, &self.path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_ignores_missing_files() {
        let dir = std::env::temp_dir().join("digbear-manifest-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let manifest = DownloadManifest::load(&dir);
        manifest.record(ManifestEntry {
            url: "https://example.com/a.png".to_string(),
            folder: dir.to_string_lossy().to_string(),
            filename: "a.png".to_string(),
            size: 10,
            at: 1,
        });
        // 文件并不存在，所以算「没下过」。
        assert!(manifest.lookup("https://example.com/a.png").is_none());
        std::fs::write(dir.join("a.png"), b"0123456789").unwrap();
        assert!(manifest.lookup("https://example.com/a.png").is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }
}