//! Pure-ish helpers shared by the download workers: binary discovery, filename /
//! extension decisions, response validation, `.part` guards and batch-unique path
//! planning.  Everything that does not touch the filesystem is unit tested.

use crate::core::classify;
use crate::core::models::{DownloadItem, MediaKind};
use crate::core::naming;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use url::Url;

/// Locate an executable: explicit fallbacks first, then `$PATH`.
pub fn find_binary(name: &str, fallbacks: &[&str]) -> Option<PathBuf> {
    for candidate in fallbacks {
        let path = PathBuf::from(candidate);
        if is_executable(&path) {
            return Some(path);
        }
    }
    let paths = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&paths) {
        let candidate = dir.join(name);
        if is_executable(&candidate) {
            return Some(candidate);
        }
    }
    None
}

fn is_executable(path: &Path) -> bool {
    std::fs::metadata(path).map(|meta| meta.is_file()).unwrap_or(false)
}

/// `<target>.part` - the temporary file used while curl is writing.
pub fn part_path(target: &Path) -> PathBuf {
    with_suffix(target, "part")
}

/// `<target>.part.mp4` - ffmpeg needs a real container extension to pick a muxer.
pub fn hls_part_path(target: &Path) -> PathBuf {
    with_suffix(target, "part.mp4")
}

fn with_suffix(target: &Path, suffix: &str) -> PathBuf {
    let name = target
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "media".to_string());
    target.with_file_name(format!("{name}.{suffix}"))
}

/// Removes every `.part` file it owns unless it was disarmed after a successful
/// rename.  Dropping the owning worker future on cancellation therefore cleans
/// up half-written files.
pub struct PartGuard {
    paths: Vec<PathBuf>,
    armed: bool,
}

impl PartGuard {
    pub fn new(paths: Vec<PathBuf>) -> Self {
        Self { paths, armed: true }
    }

    pub fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for PartGuard {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        for path in &self.paths {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// 按媒体类型分目录时使用的子目录名。
///
/// 用 ASCII 命名，避免不同系统之间拷贝时出现编码问题。
pub fn kind_folder(kind: crate::core::models::MediaKind) -> &'static str {
    use crate::core::models::MediaKind;
    match kind {
        MediaKind::Image => "images",
        MediaKind::Video => "videos",
        MediaKind::Audio => "audio",
        MediaKind::Font => "fonts",
        MediaKind::Other => "other",
    }
}

pub fn mime_of(content_type: &str) -> String {
    content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

/// Hosts whose "video" URLs are player pages, not direct media files.
/// Page videos (YouTube) are extracted by the in-app downloader.
pub fn is_page_video_url(raw: &str) -> bool {
    let Ok(url) = Url::parse(raw) else { return false };
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    let known = [
        "youtube.com",
        "youtu.be",
        "youtube-nocookie.com",
        "vimeo.com",
        "bilibili.com",
        "b23.tv",
        "tiktok.com",
        "douyin.com",
        "twitter.com",
        "x.com",
        "instagram.com",
        "dailymotion.com",
        "twitch.tv",
        "nicovideo.jp",
    ];
    known
        .iter()
        .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}

pub fn is_hls_url(raw: &str) -> bool {
    Url::parse(raw)
        .map(|url| {
            let path = url.path().to_ascii_lowercase();
            path.ends_with(".m3u8") || path.ends_with(".mpd")
        })
        .unwrap_or(false)
}

pub fn is_hls_content_type(content_type: &str) -> bool {
    matches!(
        mime_of(content_type).as_str(),
        "application/vnd.apple.mpegurl"
            | "application/x-mpegurl"
            | "application/mpegurl"
            | "audio/mpegurl"
            | "application/dash+xml"
            | "video/vnd.mpeg.dash.mpd"
    )
}

const KNOWN_MEDIA_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "svg", "ico", "tif", "tiff", "mp4", "webm",
    "mov", "m4v", "mkv", "avi", "mp3", "m4a", "wav", "ogg", "oga", "flac", "aac", "opus", "wma",
    "woff", "woff2", "ttf", "otf", "eot",
];

pub fn is_known_media_extension(ext: &str) -> bool {
    KNOWN_MEDIA_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str())
}

pub fn default_extension(kind: MediaKind) -> &'static str {
    match kind {
        MediaKind::Image => "jpg",
        MediaKind::Video => "mp4",
        MediaKind::Audio => "mp3",
        MediaKind::Font => "woff2",
        MediaKind::Other => "bin",
    }
}

/// Best-effort extension *before* the response is known (used to plan the final
/// path and its uniqueness inside the batch).
pub fn planned_extension(url: Option<&Url>, kind: MediaKind) -> String {
    if let Some(url) = url {
        if is_hls_url(url.as_str()) {
            return "mp4".to_string();
        }
        if let Some(ext) = naming::extension_from_url(url) {
            if is_known_media_extension(&ext) {
                return ext;
            }
        }
    }
    default_extension(kind).to_string()
}

/// Extension after the response is known: Content-Type wins, then the URL (and
/// effective URL after redirects), then the media kind.
pub fn final_extension(
    url: Option<&Url>,
    effective_url: Option<&Url>,
    content_type: &str,
    kind: MediaKind,
    is_hls: bool,
) -> String {
    if is_hls {
        return "mp4".to_string();
    }
    if let Some(ext) = naming::extension_for_content_type(content_type) {
        return ext.to_string();
    }
    for candidate in [url, effective_url].into_iter().flatten() {
        if let Some(ext) = naming::extension_from_url(candidate) {
            if is_known_media_extension(&ext) {
                return ext;
            }
        }
    }
    default_extension(kind).to_string()
}

fn strip_known_extension(name: &str) -> String {
    if let Some(ext) = Path::new(name).extension().and_then(|ext| ext.to_str()) {
        if classify::kind_from_extension(ext).is_some() {
            return Path::new(name)
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or(name)
                .to_string();
        }
    }
    name.to_string()
}

/// Filename stem: `filename_hint` first, then the percent-decoded URL basename,
/// then a stable id based fallback.  Always sanitized against path traversal.
/// 渲染文件名模板。
///
/// 支持的占位符：
/// - `{name}`  原始文件名（默认）
/// - `{site}`  站点域名
/// - `{kind}`  媒体类型（image / video / audio / font）
/// - `{index}` 本批次内的序号，从 1 开始，补零到三位
/// - `{date}`  下载当天日期（YYYYMMDD）
///
/// 模板为空或渲染后为空时回退到 `{name}`。
pub struct TemplateContext<'a> {
    pub name: &'a str,
    pub site: &'a str,
    pub kind: &'a str,
    pub index: usize,
    pub date: &'a str,
}

pub fn render_template(template: &str, ctx: &TemplateContext) -> String {
    let rendered = template
        .replace("{name}", ctx.name)
        .replace("{site}", ctx.site)
        .replace("{kind}", ctx.kind)
        .replace("{index}", &format!("{:03}", ctx.index))
        .replace("{date}", ctx.date);
    let cleaned = rendered.trim();
    if cleaned.is_empty() {
        ctx.name.to_string()
    } else {
        cleaned.to_string()
    }
}

/// 今天的日期戳（YYYYMMDD，UTC）。
///
/// 用 Howard Hinnant 的 civil_from_days 算法，避免为此引入 chrono 依赖。
pub fn today_stamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = (secs / 86_400) as i64;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}{month:02}{day:02}")
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// 媒体类型在文件名模板里的写法。
pub fn kind_name(kind: MediaKind) -> &'static str {
    match kind {
        MediaKind::Image => "image",
        MediaKind::Video => "video",
        MediaKind::Audio => "audio",
        MediaKind::Font => "font",
        MediaKind::Other => "other",
    }
}

/// 按模板生成文件名主干。
///
/// 先算出原始主干（去掉媒体扩展名），再套模板，最后统一做文件名消毒。
pub fn filename_stem_with_template(
    item: &DownloadItem,
    url: Option<&Url>,
    template: &str,
    index: usize,
    site: &str,
    date: &str,
) -> String {
    let raw = raw_stem(item, url);
    let ctx = TemplateContext {
        name: &raw,
        site,
        kind: kind_name(item.kind),
        index,
        date,
    };
    let rendered = render_template(template, &ctx);
    naming::sanitize_filename(&rendered, 120)
}

fn raw_stem(item: &DownloadItem, url: Option<&Url>) -> String {
    let raw = item
        .filename_hint
        .as_deref()
        .map(str::trim)
        .filter(|hint| !hint.is_empty())
        .map(str::to_string)
        .or_else(|| url.and_then(naming::filename_from_url))
        .unwrap_or_else(|| {
            let id: String = item
                .id
                .chars()
                .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
                .take(64)
                .collect();
            if id.is_empty() { "media".to_string() } else { format!("media-{id}") }
        });
    strip_known_extension(&raw)
}

/// 不套模板的主干，仅供测试对照使用。
#[cfg(test)]
pub fn filename_stem(item: &DownloadItem, url: Option<&Url>) -> String {
    let stem = raw_stem(item, url);
    naming::sanitize_filename(&stem, 120)
}

/// Playlists are often served as `text/plain`; sniff the first bytes so they are
/// routed to ffmpeg instead of being saved as a tiny text "media" file.
pub fn looks_like_playlist(prefix: &[u8]) -> bool {
    let text = String::from_utf8_lossy(prefix);
    let trimmed = text.trim_start_matches('\u{feff}').trim_start();
    trimmed.starts_with("#EXTM3U")
}

/// Reject login walls / expired links that return HTML or JSON with a 200.
pub fn validate_response(content_type: &str, prefix: &[u8], is_hls: bool) -> Result<(), String> {
    if is_hls {
        return Ok(());
    }
    let mime = mime_of(content_type);
    let auth_error =
        || "服务器返回的是网页或 JSON，而不是媒体文件（可能需要登录、链接已过期或无访问权限）。".to_string();

    if matches!(
        mime.as_str(),
        "text/html"
            | "application/xhtml+xml"
            | "application/json"
            | "text/json"
            | "application/problem+json"
    ) || mime.ends_with("+json")
    {
        return Err(auth_error());
    }

    let head: Vec<u8> = prefix
        .iter()
        .copied()
        .skip_while(|byte| byte.is_ascii_whitespace())
        .take(64)
        .collect();
    if head.is_empty() {
        return Ok(());
    }
    let head_lower = String::from_utf8_lossy(&head).to_ascii_lowercase();
    if head_lower.starts_with("<!doctype html")
        || head_lower.starts_with("<html")
        || head_lower.starts_with("<head")
    {
        return Err(auth_error());
    }
    // Binary-ish responses that actually contain a JSON error document.
    if (mime.is_empty() || mime == "application/octet-stream")
        && (head[0] == b'{' || head[0] == b'[')
        && head.iter().all(|byte| byte.is_ascii())
    {
        return Err(auth_error());
    }
    Ok(())
}

/// Allocates batch-unique target paths even before any file exists.
pub struct PathPlanner {
    folder: PathBuf,
    reserved: Mutex<HashSet<PathBuf>>,
}

impl PathPlanner {
    pub fn new(folder: PathBuf) -> Self {
        Self { folder, reserved: Mutex::new(HashSet::new()) }
    }

    /// Reserve a unique target path for the first attempt.
    pub fn reserve(&self, stem: &str, ext: &str) -> PathBuf {
        let mut reserved = self.lock();
        self.reserve_locked(&mut reserved, stem, ext)
    }

    /// Reserve the final target path.  When the planned extension already
    /// matches the response, the original reservation is kept so filenames stay
    /// clean; otherwise the old reservation is released and a new one taken.
    pub fn correct(&self, previous: &Path, stem: &str, ext: &str) -> PathBuf {
        let mut reserved = self.lock();
        if previous.extension().and_then(|value| value.to_str()) == Some(ext) {
            reserved.insert(previous.to_path_buf());
            return previous.to_path_buf();
        }
        reserved.remove(previous);
        self.reserve_locked(&mut reserved, stem, ext)
    }

    fn reserve_locked(&self, reserved: &mut HashSet<PathBuf>, stem: &str, ext: &str) -> PathBuf {
        // Windows refuses paths longer than 260 characters unless the
        // long-path opt-in is enabled, so the stem has to give way when the
        // download folder itself is deep.
        let budget = naming::path_budget().saturating_sub(self.folder.as_os_str().len() + 1);
        let stem = naming::fit_to_budget(stem, ext, budget);
        let stem = stem.as_str();
        for attempt in 0..1000usize {
            let base = if attempt == 0 { stem.to_string() } else { format!("{stem} ({attempt})") };
            let candidate = naming::unique_path(&self.folder, &base, ext);
            if reserved.insert(candidate.clone()) {
                return candidate;
            }
        }
        // Extremely unlikely: fall back to a process-unique suffix.
        let unique = format!(
            "{stem}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or_default()
        );
        let candidate = naming::unique_path(&self.folder, &unique, ext);
        reserved.insert(candidate.clone());
        candidate
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashSet<PathBuf>> {
        self.reserved.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::DownloadItem;

    fn download_item(id: &str, url: &str, hint: Option<&str>, kind: MediaKind) -> DownloadItem {
        DownloadItem {
            id: id.to_string(),
            url: url.to_string(),
            kind,
            filename_hint: hint.map(str::to_string),
        }
    }

    fn parsed(raw: &str) -> Url {
        Url::parse(raw).expect("valid url")
    }

    #[test]
    fn hint_strips_media_extension_and_path_characters() {
        let item = download_item("a", "https://cdn.test/x/a.png", Some("poster.jpg"), MediaKind::Image);
        assert_eq!(filename_stem(&item, Some(&parsed(&item.url))), "poster");
        // Path segments in a hint are dropped instead of leaking into the folder.
        let item = download_item("b", "https://cdn.test/x/a.png", Some("../weird/name.png"), MediaKind::Image);
        assert_eq!(filename_stem(&item, Some(&parsed(&item.url))), "name");
    }

    #[test]
    fn hint_keeps_unknown_extension_dots() {
        let item = download_item("a", "https://cdn.test/a.mp4", Some("clip.final"), MediaKind::Video);
        assert_eq!(filename_stem(&item, Some(&parsed(&item.url))), "clip.final");
    }

    #[test]
    fn url_basename_is_percent_decoded_and_sanitized() {
        let item = download_item("a", "https://cdn.test/path/%E7%8C%AB%20photo.JPG", None, MediaKind::Image);
        assert_eq!(filename_stem(&item, Some(&parsed(&item.url))), "猫 photo");
    }

    #[test]
    fn content_type_wins_over_url_extension() {
        let url = parsed("https://cdn.test/image.php?id=1");
        assert_eq!(
            final_extension(Some(&url), None, "image/webp; charset=binary", MediaKind::Image, false),
            "webp"
        );
        let url = parsed("https://cdn.test/photo.jpg");
        assert_eq!(final_extension(Some(&url), None, "", MediaKind::Image, false), "jpg");
        let url = parsed("https://cdn.test/no-ext");
        assert_eq!(final_extension(Some(&url), None, "", MediaKind::Audio, false), "mp3");
    }

    #[test]
    fn hls_urls_plan_mp4() {
        assert!(is_hls_url("https://cdn.test/master.m3u8?token=1"));
        assert!(is_hls_url("https://cdn.test/manifest.MPD"));
        assert!(!is_hls_url("https://cdn.test/video.mp4"));
        assert_eq!(planned_extension(Some(&parsed("https://cdn.test/master.m3u8")), MediaKind::Video), "mp4");
        assert!(is_hls_content_type("application/vnd.apple.mpegurl"));
    }

    #[test]
    fn html_and_json_responses_are_rejected() {
        assert!(validate_response("text/html; charset=utf-8", b"", false).is_err());
        assert!(validate_response("application/json", b"", false).is_err());
        assert!(validate_response("application/octet-stream", b"  <!DOCTYPE html><html>", false).is_err());
        assert!(validate_response("", b"{\"error\":\"login required\"}", false).is_err());
        assert!(validate_response("application/octet-stream", b"fake media bytes", false).is_ok());
        assert!(validate_response("", b"\x00\x00\x00\x20ftypisom", false).is_ok());
        assert!(validate_response("", b"#EXTM3U\n", true).is_ok());
        assert!(looks_like_playlist(b"#EXTM3U\n#EXT-X-VERSION:3\n"));
        assert!(looks_like_playlist(b"\xef\xbb\xbf  #EXTM3U\n"));
        assert!(!looks_like_playlist(b"\x00\x00\x00\x20ftypisom"));
    }

    #[test]
    fn planner_keeps_batch_paths_unique() {
        let folder = std::env::temp_dir().join(format!(
            "digbear-downloader-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or_default()
        ));
        std::fs::create_dir_all(&folder).expect("create test folder");
        let planner = PathPlanner::new(folder.clone());
        let first = planner.reserve("clip", "mp4");
        let second = planner.reserve("clip", "mp4");
        assert_ne!(first, second);
        assert_eq!(first.file_name().and_then(|name| name.to_str()), Some("clip.mp4"));
        assert_eq!(second.file_name().and_then(|name| name.to_str()), Some("clip (1).mp4"));
        let corrected = planner.correct(&first, "clip", "webm");
        assert_eq!(corrected.file_name().and_then(|name| name.to_str()), Some("clip.webm"));
        // Re-applying the same extension keeps the path instead of renaming again.
        assert_eq!(planner.correct(&corrected, "clip", "webm"), corrected);
        assert_eq!(part_path(&corrected).file_name().and_then(|name| name.to_str()), Some("clip.webm.part"));
        assert_eq!(
            hls_part_path(&corrected).file_name().and_then(|name| name.to_str()),
            Some("clip.webm.part.mp4")
        );
        let _ = std::fs::remove_dir_all(&folder);
    }

    #[test]
    fn renders_filename_templates() {
        let ctx = TemplateContext {
            name: "cover",
            site: "example.com",
            kind: "image",
            index: 7,
            date: "20261031",
        };
        assert_eq!(render_template("{name}", &ctx), "cover");
        assert_eq!(render_template("{site}-{name}", &ctx), "example.com-cover");
        assert_eq!(
            render_template("{site}_{kind}_{index}_{name}", &ctx),
            "example.com_image_007_cover"
        );
        assert_eq!(
            render_template("{date}-{name}", &ctx),
            "20261031-cover"
        );
    }

    #[test]
    fn empty_template_falls_back_to_name() {
        let ctx = TemplateContext {
            name: "cover",
            site: "example.com",
            kind: "image",
            index: 1,
            date: "20261031",
        };
        assert_eq!(render_template("", &ctx), "cover");
        assert_eq!(render_template("   ", &ctx), "cover");
    }

    #[test]
    fn converts_epoch_days_to_calendar_dates() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_723), (2024, 1, 1));
        assert_eq!(civil_from_days(20_727), (2026, 10, 1));
        assert_eq!(civil_from_days(20_710), (2026, 9, 14));
    }

    #[test]
    fn detects_page_video_urls() {
        assert!(is_page_video_url("https://www.youtube.com/watch?v=abc123"));
        assert!(is_page_video_url("https://youtu.be/abc123"));
        assert!(is_page_video_url("https://vimeo.com/12345"));
        assert!(!is_page_video_url("https://cdn.example.com/clip.mp4"));
        assert!(!is_page_video_url("not a url"));
    }
}
