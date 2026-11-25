#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod account;
mod store;

use account::{Accounts, CredentialManager, Request, Service, View};
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

/// Release builds have no console, so problems before the window opens need a dialog.
fn report(message: &str) {
    eprintln!("{message}");
    #[cfg(windows)]
    rfd::MessageDialog::new()
        .set_title("Ada")
        .set_description(message)
        .set_level(rfd::MessageLevel::Error)
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
    let should_notify = store.tick().map_err(|error| store::describe(&*error))?;
    let result = store
        .apply(action)
        .map_err(|error| store::describe(&*error));
    drop(store);
    if should_notify {
        notify(&app);
    }
    result
}

#[tauri::command]
async fn account(app: tauri::AppHandle, request: Request) -> Result<View, String> {
    // Account requests wait on the network, so they run off the window's thread.
    tauri::async_runtime::spawn_blocking(move || {
        let accounts = app.state::<Mutex<Accounts>>();
        let mut accounts = accounts
            .lock()
            .map_err(|_| "Ada could not access your account details.".to_owned())?;
        accounts.handle(request, &app.state::<Mutex<Store>>())
    })
    .await
    .map_err(|_| "Ada could not finish the account request.".to_owned())?
}

fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let demo = args.iter().any(|arg| arg == "--demo");
    let compact = args.iter().any(|arg| arg == "--compact");
    let separate = demo || std::env::var_os("ADA_LOCAL_DATA_DIR").is_some();
    let mut builder = tauri::Builder::default();
    if !separate {
        // Opening Ada again brings the existing window forward instead of failing quietly.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }
    let result = builder
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            let root = match std::env::var_os("ADA_LOCAL_DATA_DIR") {
                Some(directory) => std::path::PathBuf::from(directory),
                None => app.path().app_local_data_dir()?,
            };
            fs::create_dir_all(&root)?;
            let accounts = Accounts::load(
                &root,
                demo,
                Service::from_env(),
                Box::new(CredentialManager),
            );
            let lock = OpenOptions::new()
                .create(true)
                .truncate(false)
                .write(true)
                .open(accounts.guest_path().with_extension("lock"))?;
            lock.try_lock().map_err(|_| {
                std::io::Error::other("This Ada workspace is already open in another window.")
            })?;
            let store = Store::open(accounts.workspace_path(), demo)
                .map_err(|error| std::io::Error::other(store::describe(&*error)))?;
            app.manage(lock);
            app.manage(Mutex::new(store));
            app.manage(Mutex::new(accounts));
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
        .invoke_handler(tauri::generate_handler![workspace, account])
        .run(tauri::generate_context!());
    if let Err(error) = result {
        report(&format!("Ada could not start. {error}"));
        std::process::exit(1);
    }
}
