pub mod commands;
pub mod events;
pub mod focus_monitor;
pub mod storage;
pub mod sync;

use commands::AppState;
use storage::Database;
use std::sync::Arc;
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

#[cfg(target_os = "windows")]
use focus_monitor::WindowsFocusMonitor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_dir = Database::resolve_app_dir();
    let db_path = app_dir.join("ada.db");

    let db = Database::new(&db_path)
        .expect("Failed to initialize Ada SQLite database and run migrations");

    let monitor = Arc::new(WindowsFocusMonitor::new());

    let app_state = AppState {
        db: Arc::new(db),
        focus_monitor: monitor,
    };

    tauri::Builder::default()
        .manage(app_state)
        .setup(|app| {
            // Setup system tray icon with remaining time tooltip and click-to-focus
            let _tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("Ada — Focus Engine")
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_device_id,
            commands::start_session,
            commands::complete_session,
            commands::fail_session,
            commands::get_sessions,
            commands::get_balance,
            commands::get_all_events,
            commands::start_focus_monitoring,
            commands::stop_focus_monitoring,
            commands::get_running_processes_list,
            commands::update_tray_tooltip,
            commands::export_backup_json,
            commands::import_backup_json,
            commands::record_purchase,
            commands::toggle_mini_timer
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ada application");
}
