use std::path::{Path, PathBuf};

/// 从本地文件夹里收集网址。
///
/// 两种来源：
/// - `.url` 快捷方式：读 `[InternetShortcut]` 段里的 `URL=`
/// - 文本类文件（txt / md / csv / json / html）：正则挑出 http(s) 链接
///
/// 用来配合资源管理器右键菜单：把一个收藏夹文件夹直接丢给爬虫。
/// 扫描是只读的，不会改动任何文件。
const MAX_DEPTH: usize = 3;
const MAX_FILES: usize = 400;
const MAX_URLS: usize = 200;
const MAX_TEXT_BYTES: u64 = 512 * 1024;

/// 会被当成文本扫一遍的扩展名。
const TEXT_EXTENSIONS: &[&str] = &["txt", "md", "csv", "json", "html", "htm", "log", "url", "webloc"];

#[derive(Debug, Clone, serde::Serialize)]
pub struct FolderScan {
    /// 找到的网址（去重、保持顺序）。
    pub urls: Vec<String>,
    /// 一共看了多少个文件。
    pub scanned_files: usize,
    /// 看了多少个文件夹。
    pub scanned_dirs: usize,
}

/// 扫描文件夹，返回里面的网址。
pub fn scan_folder(root: &Path) -> FolderScan {
    let mut urls: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut scanned_files = 0usize;
    let mut scanned_dirs = 0usize;

    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];
    while let Some((dir, depth)) = stack.pop() {
        if depth > MAX_DEPTH || scanned_files >= MAX_FILES || urls.len() >= MAX_URLS {
            break;
        }
        scanned_dirs += 1;
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if scanned_files >= MAX_FILES || urls.len() >= MAX_URLS {
                break;
            }
            let path = entry.path();
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push((path, depth + 1));
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !TEXT_EXTENSIONS.contains(&extension.as_str()) {
                continue;
            }
            if meta.len() > MAX_TEXT_BYTES {
                continue;
            }
            scanned_files += 1;
            let Ok(content) = std::fs::read_to_string(&path) else {
                continue;
            };
            for url in urls_in_text(&content) {
                if seen.insert(url.clone()) {
                    urls.push(url);
                    if urls.len() >= MAX_URLS {
                        break;
                    }
                }
            }
        }
    }

    FolderScan { urls, scanned_files, scanned_dirs }
}

/// 从一段文本里挑出网址。
///
/// `.url` 快捷方式走 \`URL=\` 这一行；其余文本用正则匹配。
pub fn urls_in_text(content: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        let Some(value) = line
            .strip_prefix("URL=")
            .or_else(|| line.strip_prefix("url="))
        else {
            continue;
        };
        let candidate = value.trim();
        if candidate.starts_with("http://") || candidate.starts_with("https://") {
            out.push(candidate.to_string());
        }
    }

    if out.is_empty() {
        // 退回到通用匹配：文本里任何像网址的东西。
        let bytes = content.as_bytes();
        let mut index = 0usize;
        while index < bytes.len() {
            let rest = &content[index..];
            let http_at = rest.find("http://");
            let https_at = rest.find("https://");
            let start = match (http_at, https_at) {
                (Some(a), Some(b)) => Some(a.min(b)),
                (Some(a), None) => Some(a),
                (None, Some(b)) => Some(b),
                (None, None) => None,
            };
            let Some(start) = start else { break };
            let absolute = index + start;
            let tail = &content[absolute..];
            let end = tail
                .find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == '<' || c == '>' || c == ')' || c == ']')
                .unwrap_or(tail.len());
            let candidate = tail[..end].trim_end_matches(['.', ',', ';', ':']);
            if candidate.len() > "https://".len() {
                out.push(candidate.to_string());
            }
            index = absolute + end.max(1);
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_url_shortcuts() {
        let content = "[InternetShortcut]\r\nURL=https://example.com/a\r\nIconIndex=0\r\n";
        assert_eq!(urls_in_text(content), vec!["https://example.com/a".to_string()]);
    }

    #[test]
    fn reads_plain_text_links() {
        let content = "看看这个 https://example.com/gallery?x=1 和 http://a.cn/b 都很棒";
        let urls = urls_in_text(content);
        assert!(urls.contains(&"https://example.com/gallery?x=1".to_string()));
        assert!(urls.contains(&"http://a.cn/b".to_string()));
    }

    #[test]
    fn scans_a_folder_recursively() {
        let dir = std::env::temp_dir().join("digbear-folder-scan");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("nested")).unwrap();
        std::fs::write(
            dir.join("a.url"),
            "[InternetShortcut]\nURL=https://example.com/a\n",
        )
        .unwrap();
        std::fs::write(dir.join("nested").join("b.txt"), "见 https://example.com/b").unwrap();
        std::fs::write(dir.join("skip.bin"), "https://example.com/skip").unwrap();

        let result = scan_folder(&dir);
        assert!(result.urls.contains(&"https://example.com/a".to_string()));
        assert!(result.urls.contains(&"https://example.com/b".to_string()));
        // 二进制/未知扩展名不参与扫描。
        assert!(!result.urls.contains(&"https://example.com/skip".to_string()));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
