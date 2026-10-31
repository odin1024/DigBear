//! WebView compatibility shims shared by the crawl worker and site-login windows.
//!
//! Two platform differences matter for media discovery:
//!
//! * **User agent.** Tauri's macOS WKWebView omits the `Safari/` token, which a
//!   number of sites sniff for and answer with a degraded / downgrade page.
//!   Windows has the opposite problem: WebView2 already speaks a complete
//!   Chromium UA, but the downloader talks plain HTTP and would look like an
//!   unrelated client. We therefore pin one desktop UA per platform and reuse
//!   the *same* string for the HTTP downloader, so a CDN sees one consistent
//!   client whether the asset was discovered in the browser or fetched later.
//! * **Hidden windows do not paint.** A hidden WKWebView never receives display
//!   refreshes, so `requestAnimationFrame` callbacks do not fire and
//!   JavaScript-rendered or lazy-loaded content stays in its initial state.
//!   Mapping rAF onto a short timer lets the DOM settle while the window
//!   remains invisible. WebView2 needs the same shim: its renderer also stops
//!   producing frames while the window is off screen.

/// Desktop user agent used for remote pages.
///
/// macOS keeps the Safari token that Tauri's WKWebView drops. Windows uses a
/// plain Chromium token — deliberately without the `Edg/` marker, so the
/// downloader and the browser present the same identity to a CDN.
#[cfg(target_os = "macos")]
pub const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";

#[cfg(windows)]
pub const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

#[cfg(not(any(target_os = "macos", windows)))]
pub const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/// Injected before any page script in the hidden crawl window.
///
/// Hidden windows never receive display refreshes, so `requestAnimationFrame`
/// callbacks do not fire and JavaScript-rendered or lazy-loaded content stays
/// in its initial loading state. Mapping rAF onto a short timer lets the DOM
/// settle while the window remains invisible.
pub const CRAWL_INIT_SCRIPT: &str = r#"
(function () {
  try {
    window.requestAnimationFrame = function (cb) {
      return setTimeout(function () {
        cb((window.performance && performance.now) ? performance.now() : Date.now());
      }, 16);
    };
    window.cancelAnimationFrame = function (id) { clearTimeout(id); };
  } catch (e) {}
})();
"#;
