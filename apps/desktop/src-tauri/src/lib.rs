mod commands;
mod core;
mod devtest;
mod crawler;
mod downloader;
mod extensions;
mod session;

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};

/// Replace the default File/Edit/View/Window/Help bar with a tiny app menu:
/// only 设置 and 关于 (plus the standard macOS quit item).
pub(crate) fn build_app_menu(app: &tauri::AppHandle, english: bool) -> tauri::Result<()> {
    let about = MenuItemBuilder::with_id("about", if english { "About" } else { "关于" }).build(app)?;
    let settings = MenuItemBuilder::with_id("settings", if english { "Settings…" } else { "设置…" }).build(app)?;
    let quit = PredefinedMenuItem::quit(app, Some(if english { "Quit DigBear" } else { "退出 DigBear" }))?;

    let app_menu = SubmenuBuilder::new(app, "DigBear")
        .items(&[&about, &settings])
        .separator()
        .item(&quit)
        .build()?;

    let edit_title = if english { "Edit" } else { "编辑" };
    let undo = PredefinedMenuItem::undo(app, Some(if english { "Undo" } else { "撤销" }))?;
    let redo = PredefinedMenuItem::redo(app, Some(if english { "Redo" } else { "重做" }))?;
    let cut = PredefinedMenuItem::cut(app, Some(if english { "Cut" } else { "剪切" }))?;
    let copy = PredefinedMenuItem::copy(app, Some(if english { "Copy" } else { "复制" }))?;
    let paste = PredefinedMenuItem::paste(app, Some(if english { "Paste" } else { "粘贴" }))?;
    let select_all = PredefinedMenuItem::select_all(app, Some(if english { "Select All" } else { "全选" }))?;
    let edit_menu = SubmenuBuilder::new(app, edit_title)
        .items(&[&undo, &redo])
        .separator()
        .items(&[&cut, &copy, &paste])
        .separator()
        .item(&select_all)
        .build()?;

    let menu = MenuBuilder::new(app).items(&[&app_menu, &edit_menu]).build()?;
    app.set_menu(menu)?;
    Ok(())
}

/// 启动时用 `--crawl <url>` 指定的网址，界面会直接翻好并停在结果页。
///
/// 用来做脚本化批处理，或开机自动翻找某个固定站点。
pub struct StartUrl(pub Option<String>);

/// 从命令行参数里取 `--crawl <url>`（也接受 `--crawl=<url>`）。
fn parse_crawl_arg<I: Iterator<Item = String>>(mut args: I) -> Option<String> {
    while let Some(arg) = args.next() {
        if let Some(url) = arg.strip_prefix("--crawl=") {
            return Some(url.trim().to_string());
        }
        if arg == "--crawl" {
            return args.next().map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        }
    }
    None
}

/// 按主显示器的工作区调整窗口初始尺寸。
///
/// 上游把窗口写死成 1240x900，但在 1536x864 / 125% 缩放这类很常见的屏幕上，
/// 逻辑可用区只有 1229x653 —— 窗口比屏幕还大，标题栏和上下边框会被直接顶掉，
/// 底部内容也看不全。这里按实际工作区夹紧，保证窗口始终完整可见。
fn fit_window_to_work_area(app: &tauri::AppHandle) {
    const PREFERRED_W: f64 = 1240.0;
    const PREFERRED_H: f64 = 860.0;
    const MIN_W: f64 = 640.0;
    const MIN_H: f64 = 440.0;
    const MARGIN: f64 = 36.0;

    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let scale = monitor.scale_factor().max(1.0);
    let area = monitor.work_area();
    // work_area 是物理像素；除以缩放比才是逻辑像素。
    let avail_w = (area.size.width as f64 / scale - MARGIN * 2.0).max(MIN_W);
    let avail_h = (area.size.height as f64 / scale - MARGIN * 2.0).max(MIN_H);

    let width = PREFERRED_W.min(avail_w);
    let height = PREFERRED_H.min(avail_h);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
        let _ = window.center();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            fit_window_to_work_area(app.handle());
            let start_url = parse_crawl_arg(std::env::args().skip(1));
            if let Some(url) = start_url.as_ref() {
                eprintln!("[digbear] 启动即翻找: {url}");
            }
            app.manage(StartUrl(start_url));
            let state = core::state::AppState::new(app.handle())?;
            app.manage(state);
            build_app_menu(app.handle(), false)?;
            app.on_menu_event(|app, event| {
                let id = event.id().0.as_str().to_string();
                let _ = app.emit("app-menu", id);
            });
            devtest::maybe_spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::app_start_url,
            commands::save_settings,
            commands::pick_download_dir,
            commands::crawl_site,
            commands::download_media,
            commands::cancel_download,
            commands::open_site_login,
            commands::close_site_login,
            commands::get_site_session,
            commands::clear_site_session,
            commands::reveal_path,
            commands::open_url,
            commands::open_video_preview,
            commands::list_extensions,
            commands::install_extension,
            commands::remove_extension,
            commands::set_app_language,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DigBear");
}
