use std::path::{Path, PathBuf};

/// Turn arbitrary text into a name that is safe to create as a file.
///
/// The character set already covers every character Windows forbids, so the
/// only platform-specific leftovers are the DOS device names and the trailing
/// dot / space that Windows silently strips when it creates the file.
pub fn sanitize_filename(input: &str, max_chars: usize) -> String {
    let mut out = String::new();
    for ch in input.chars() {
        if "\\/:*?\"<>|".contains(ch) || ch.is_control() {
            out.push('_');
        } else {
            out.push(ch);
        }
        if out.chars().count() >= max_chars {
            break;
        }
    }
    // Windows drops trailing dots and spaces, so the name we reserve has to
    // already be free of them — otherwise the file on disk would carry a
    // different name than the one we report back to the UI.
    let trimmed = trim_trailing(out.trim().trim_matches('.').to_string());
    if trimmed.is_empty() {
        return "media".to_string();
    }
    #[cfg(windows)]
    {
        escape_reserved_device_name(trimmed)
    }
    #[cfg(not(windows))]
    {
        trimmed
    }
}

/// Remove trailing dots and spaces, repeatedly — `"a . "` needs two passes.
fn trim_trailing(mut name: String) -> String {
    while name.ends_with('.') || name.ends_with(' ') {
        name.pop();
    }
    name
}

/// Windows refuses to create a file whose stem is one of the classic DOS
/// device names, whatever extension it carries (`CON.txt` is `CON`).
#[cfg(windows)]
fn escape_reserved_device_name(name: String) -> String {
    const RESERVED: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if RESERVED.contains(&stem.as_str()) {
        format!("_{name}")
    } else {
        name
    }
}

/// Characters a path may still occupy, including the terminating NUL.
///
/// Windows keeps the historical 260 character limit unless the long-path
/// opt-in is enabled, so a long download folder plus a long file name can
/// still overflow it. macOS and Linux have no comparable limit.
pub const fn path_budget() -> usize {
    #[cfg(windows)]
    {
        255
    }
    #[cfg(not(windows))]
    {
        usize::MAX
    }
}

/// Shorten a stem so that `stem + "." + ext` fits into `budget` characters.
pub fn fit_to_budget(stem: &str, ext: &str, budget: usize) -> String {
    let overhead = ext.chars().count() + 1;
    let room = budget.saturating_sub(overhead);
    if stem.chars().count() <= room {
        return stem.to_string();
    }
    stem.chars().take(room).collect()
}

pub fn filename_from_url(url: &url::Url) -> Option<String> {
    let last = url.path_segments()?.filter(|s| !s.is_empty()).last()?;
    let decoded = percent_encoding::percent_decode_str(last)
        .decode_utf8_lossy()
        .to_string();
    if decoded.is_empty() { None } else { Some(decoded) }
}

pub fn extension_from_url(url: &url::Url) -> Option<String> {
    let name = filename_from_url(url)?;
    Path::new(&name)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
}

pub fn extension_for_content_type(content_type: &str) -> Option<&'static str> {
    let mime = content_type.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    match mime.as_str() {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/avif" => Some("avif"),
        "image/svg+xml" => Some("svg"),
        "image/x-icon" | "image/vnd.microsoft.icon" => Some("ico"),
        "video/mp4" => Some("mp4"),
        "video/webm" => Some("webm"),
        "video/quicktime" => Some("mov"),
        "video/x-matroska" => Some("mkv"),
        "audio/mpeg" => Some("mp3"),
        "audio/mp4" | "audio/x-m4a" => Some("m4a"),
        "audio/wav" | "audio/x-wav" => Some("wav"),
        "audio/ogg" => Some("ogg"),
        "audio/flac" => Some("flac"),
        "font/woff" => Some("woff"),
        "font/woff2" => Some("woff2"),
        "font/ttf" | "application/x-font-ttf" => Some("ttf"),
        "font/otf" | "application/x-font-opentype" => Some("otf"),
        _ => None,
    }
}

pub fn unique_path(folder: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut candidate = folder.join(format!("{stem}.{ext}"));
    let mut i = 1usize;
    while candidate.exists() && i < 1000 {
        candidate = folder.join(format!("{stem} ({i}).{ext}"));
        i += 1;
    }
    candidate
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_reserved_characters() {
        assert_eq!(sanitize_filename("a/b:c*?", 64), "a_b_c__");
        assert_eq!(sanitize_filename("   ", 64), "media");
    }

    #[test]
    fn strips_trailing_dots_and_spaces() {
        // Windows silently removes these, so we must not plan a name that
        // differs from the file that ends up on disk.
        assert_eq!(sanitize_filename("clip. ", 64), "clip");
        assert_eq!(sanitize_filename("clip..", 64), "clip");
        assert_eq!(sanitize_filename("clip . .", 64), "clip");
    }

    #[cfg(windows)]
    #[test]
    fn escapes_reserved_device_names() {
        assert_eq!(sanitize_filename("CON", 64), "_CON");
        assert_eq!(sanitize_filename("nul", 64), "_nul");
        assert_eq!(sanitize_filename("LPT1", 64), "_LPT1");
        // Only the stem matters: `COM1` is reserved, `COM10` is not.
        assert_eq!(sanitize_filename("COM10", 64), "COM10");
        assert_eq!(sanitize_filename("console", 64), "console");
    }

    #[test]
    fn fits_stems_into_a_budget() {
        assert_eq!(fit_to_budget("clip", "mp4", 10), "clip");
        // budget 10 minus "mp4" and the dot leaves room for six characters.
        assert_eq!(fit_to_budget("averylongfilename", "mp4", 10), "averyl");
        assert_eq!(fit_to_budget("averylongfilename", "mp4", 10).len(), 6);
    }

    #[test]
    fn maps_common_content_types() {
        assert_eq!(extension_for_content_type("image/jpeg; charset=binary"), Some("jpg"));
        assert_eq!(extension_for_content_type("video/mp4"), Some("mp4"));
        assert_eq!(extension_for_content_type("audio/mpeg"), Some("mp3"));
        assert_eq!(extension_for_content_type("font/woff2"), Some("woff2"));
        assert_eq!(extension_for_content_type("text/html"), None);
    }

    #[test]
    fn filename_from_url_decodes_percent_encoding() {
        let url = url::Url::parse("https://cdn.example.com/a/%E7%85%A7%E7%89%87.png?x=1").unwrap();
        assert_eq!(filename_from_url(&url).as_deref(), Some("照片.png"));
        assert_eq!(extension_from_url(&url).as_deref(), Some("png"));
    }
}
