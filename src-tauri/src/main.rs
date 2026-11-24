#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod store;

use std::{fs, fs::OpenOptions, sync::Mutex, thread, time::Duration};
use store::{Action, Snapshot, Store};
use tauri::{Manager, State};
use tauri_plugin_notification::NotificationExt;

fn notify(app: &tauri::AppHandle) {
    let _ = app
        .notification()
        .builder()
        .title("Focus session complete")
        .body("Your focused time has been saved in Ada.")
        .show();
}

#[tauri::command]
fn workspace(
    app: tauri::AppHandle,
    state: State<'_, Mutex<Store>>,
    action: Action,
) -> Result<Snapshot, String> {
    let mut store = state
        .lock()
        .map_err(|_| "Ada could not access its local database.".to_owned())?;
    let should_notify = store.tick().map_err(|error| error.to_string())?;
    let result = store.apply(action).map_err(|error| error.to_string());
    drop(store);
    if should_notify {
        notify(&app);
    }
    result
}

fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let demo = args.iter().any(|arg| arg == "--demo");
    let compact = args.iter().any(|arg| arg == "--compact");
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            let root = match std::env::var_os("ADA_LOCAL_DATA_DIR") {
                Some(directory) => std::path::PathBuf::from(directory),
                None => app.path().app_local_data_dir()?,
            };
            fs::create_dir_all(&root)?;
            let path = root.join(if demo { "demo.sqlite3" } else { "ada.sqlite3" });
            let lock = OpenOptions::new()
                .create(true)
                .truncate(false)
                .write(true)
                .open(path.with_extension("lock"))?;
            lock.try_lock()
                .map_err(|_| std::io::Error::other("This Ada workspace is already open."))?;
            let store = Store::open(path, demo)?;
            app.manage(lock);
            app.manage(Mutex::new(store));
            if compact {
                if let Some(window) = app.get_webview_window("main") {
                    window.set_size(tauri::LogicalSize::new(610, 540))?;
                    window.center()?;
                }
            }
            let handle = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_secs(1));
                let state = handle.state::<Mutex<Store>>();
                let Ok(mut store) = state.lock() else { break };
                let should_notify = store.tick().unwrap_or_else(|error| {
                    eprintln!("Ada timer checkpoint failed: {error}");
                    false
                });
                drop(store);
                if should_notify {
                    notify(&handle);
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Ok(mut store) = window.state::<Mutex<Store>>().lock() {
                    let _ = store.tick();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![workspace])
        .run(tauri::generate_context!())
        .expect("Ada could not start");
}
