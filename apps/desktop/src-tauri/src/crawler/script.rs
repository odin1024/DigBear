/// Injected into the crawl worker WebView after the page loads.
/// The script is synchronous, read-only and returns a JSON string.
/// Source: docs/media-extraction.md / .tmp-research/media/extract.js
pub const EXTRACT_JS: &str = include_str!("script.js");
