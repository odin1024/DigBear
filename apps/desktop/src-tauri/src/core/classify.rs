use crate::core::models::MediaKind;
use url::Url;

pub fn kind_from_extension(ext: &str) -> Option<MediaKind> {
    match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "avif" | "bmp" | "svg" | "ico" | "tif" | "tiff" => {
            Some(MediaKind::Image)
        }
        "mp4" | "webm" | "mov" | "m4v" | "mkv" | "avi" | "m3u8" | "mpd" => Some(MediaKind::Video),
        "mp3" | "m4a" | "wav" | "ogg" | "oga" | "flac" | "aac" | "opus" | "wma" => Some(MediaKind::Audio),
        "woff" | "woff2" | "ttf" | "otf" | "eot" => Some(MediaKind::Font),
        _ => None,
    }
}

/// Extensions that are unambiguously code/data, never downloadable media.
const NON_MEDIA_EXTENSIONS: &[&str] = &[
    "js", "mjs", "cjs", "css", "json", "map", "html", "htm", "xml", "txt", "csv", "pdf",
    "zip", "gz", "tar", "rar", "7z", "wasm",
];

pub fn has_non_media_extension(url: &Url) -> bool {
    url.path_segments()
        .and_then(|mut segments| segments.next_back())
        .and_then(|name| name.rsplit_once('.').map(|(_, ext)| ext))
        .map(|ext| NON_MEDIA_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn kind_from_url(url: &Url) -> Option<MediaKind> {
    url.path_segments()
        .and_then(|mut segments| segments.next_back())
        .and_then(|name| name.rsplit_once('.').map(|(_, ext)| ext))
        .and_then(kind_from_extension)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_media_extensions() {
        let js = Url::parse("https://example.com/a/bzPopper_7e9d94e.js").unwrap();
        assert!(has_non_media_extension(&js));
        let img = Url::parse("https://example.com/a/hero.webp").unwrap();
        assert!(!has_non_media_extension(&img));
    }

    #[test]
    fn classifies_media_extensions() {
        assert_eq!(kind_from_extension("JPG"), Some(MediaKind::Image));
        assert_eq!(kind_from_extension("m3u8"), Some(MediaKind::Video));
        assert_eq!(kind_from_extension("flac"), Some(MediaKind::Audio));
        assert_eq!(kind_from_extension("woff2"), Some(MediaKind::Font));
        assert_eq!(kind_from_extension("css"), None);
    }
}
