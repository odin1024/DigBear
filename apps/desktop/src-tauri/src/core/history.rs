use crate::core::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

/// 历史记录最多保留多少条。
const HISTORY_LIMIT: usize = 100;

/// 一次翻找的历史条目。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub url: String,
    pub title: String,
    pub host: String,
    pub total: usize,
    pub counts: BTreeMap<String, usize>,
    pub crawled_at: u64,
}

/// 收藏的站点。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FavoriteEntry {
    pub id: String,
    pub url: String,
    pub title: String,
    pub host: String,
    pub added_at: u64,
}

/// 历史与收藏的落盘存储。
///
/// 两个文件都放在配置目录里，和 `settings.json` 放在一起：
/// `history.json` 与 `favorites.json`。
pub struct HistoryStore {
    dir: PathBuf,
    history: RwLock<Vec<HistoryEntry>>,
    favorites: RwLock<Vec<FavoriteEntry>>,
}

impl HistoryStore {
    pub fn load(dir: &Path) -> Self {
        std::fs::create_dir_all(dir).ok();
        let store = Self {
            dir: dir.to_path_buf(),
            history: RwLock::new(Vec::new()),
            favorites: RwLock::new(Vec::new()),
        };
        *store.history.write().expect("history lock") = read_json(&store.history_path());
        *store.favorites.write().expect("favorites lock") =
            read_json(&store.favorites_path());
        store
    }

    fn history_path(&self) -> PathBuf {
        self.dir.join("history.json")
    }

    fn favorites_path(&self) -> PathBuf {
        self.dir.join("favorites.json")
    }

    pub fn history(&self) -> Vec<HistoryEntry> {
        self.history.read().expect("history lock").clone()
    }

    pub fn favorites(&self) -> Vec<FavoriteEntry> {
        self.favorites.read().expect("favorites lock").clone()
    }

    /// 记一条翻找历史。同一个网址只保留最新的一条。
    pub fn record(&self, mut entry: HistoryEntry) -> Result<Vec<HistoryEntry>, AppError> {
        entry.id = entry_key(&entry.url);
        {
            let mut guard = self.history.write().expect("history lock");
            guard.retain(|item| item.url != entry.url);
            guard.insert(0, entry);
            guard.truncate(HISTORY_LIMIT);
        }
        let snapshot = self.history();
        write_json(&self.history_path(), &snapshot)?;
        Ok(snapshot)
    }

    pub fn clear_history(&self) -> Result<Vec<HistoryEntry>, AppError> {
        {
            let mut guard = self.history.write().expect("history lock");
            guard.clear();
        }
        write_json(&self.history_path(), &Vec::<HistoryEntry>::new())?;
        Ok(Vec::new())
    }

    /// 收藏 / 取消收藏同一个网址，返回操作之后的状态。
    pub fn toggle_favorite(&self, entry: FavoriteEntry) -> Result<Vec<FavoriteEntry>, AppError> {
        let mut favorites = self.favorites.write().expect("favorites lock");
        let exists = favorites.iter().any(|item| item.url == entry.url);
        if exists {
            favorites.retain(|item| item.url != entry.url);
        } else {
            let mut entry = entry;
            entry.id = entry_key(&entry.url);
            favorites.insert(0, entry);
        }
        let snapshot = favorites.clone();
        drop(favorites);
        write_json(&self.favorites_path(), &snapshot)?;
        Ok(snapshot)
    }

    /// 清空全部收藏。
    pub fn clear_favorites(&self) -> Result<Vec<FavoriteEntry>, AppError> {
        {
            let mut guard = self.favorites.write().expect("favorites lock");
            guard.clear();
        }
        write_json(&self.favorites_path(), &Vec::<FavoriteEntry>::new())?;
        Ok(Vec::new())
    }

    pub fn remove_favorite(&self, url: &str) -> Result<Vec<FavoriteEntry>, AppError> {
        {
            let mut favorites = self.favorites.write().expect("favorites lock");
            favorites.retain(|item| item.url != url);
        }
        let snapshot = self.favorites();
        write_json(&self.favorites_path(), &snapshot)?;
        Ok(snapshot)
    }
}

/// 网址的稳定标识：同一网址无论收藏还是历史都用同一个 key。
fn entry_key(url: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in url.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> T {
    match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(raw.strip_prefix('\u{feff}').unwrap_or(&raw)).unwrap_or_else(|error| {
            eprintln!("[digbear] 读取 {} 失败: {error}", path.display());
            T::default()
        }),
        Err(_) => T::default(),
    }
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let payload = serde_json::to_vec_pretty(value)?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, payload)?;
    std::fs::rename(&temp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("digbear-history-{tag}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sample(url: &str) -> HistoryEntry {
        HistoryEntry {
            id: String::new(),
            url: url.to_string(),
            title: "示例".to_string(),
            host: "example.com".to_string(),
            total: 3,
            counts: BTreeMap::new(),
            crawled_at: 1,
        }
    }

    #[test]
    fn records_and_dedupes_history() {
        let dir = temp_dir("dedupe");
        let store = HistoryStore::load(&dir);
        store.record(sample("https://example.com/a")).unwrap();
        store.record(sample("https://example.com/b")).unwrap();
        store.record(sample("https://example.com/a")).unwrap();
        let history = store.history();
        assert_eq!(history.len(), 2);
        // 重复翻找的网址排在最前面。
        assert_eq!(history[0].url, "https://example.com/a");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn toggles_favorite_off_and_on() {
        let dir = temp_dir("favorite");
        let store = HistoryStore::load(&dir);
        let favorite = FavoriteEntry {
            id: String::new(),
            url: "https://example.com".to_string(),
            title: "示例".to_string(),
            host: "example.com".to_string(),
            added_at: 1,
        };
        let after = store.toggle_favorite(favorite.clone()).unwrap();
        assert_eq!(after.len(), 1);
        let after = store.toggle_favorite(favorite.clone()).unwrap();
        assert!(after.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn persists_across_reload() {
        let dir = temp_dir("persist");
        {
            let store = HistoryStore::load(&dir);
            store.record(sample("https://example.com/x")).unwrap();
        }
        let store = HistoryStore::load(&dir);
        assert_eq!(store.history().len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}