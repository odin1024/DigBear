mod commands;
mod core;
#[cfg(debug_assertions)]
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

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = core::state::AppState::new(app.handle())?;
            app.manage(state);
            build_app_menu(app.handle(), false)?;
            app.on_menu_event(|app, event| {
                let id = event.id().0.as_str().to_string();
                let _ = app.emit("app-menu", id);
            });
            #[cfg(debug_assertions)]
            devtest::maybe_spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
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
