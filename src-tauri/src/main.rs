#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod account;
mod store;

use account::{Accounts, CredentialManager, Request, Service, View};
use std::{
    fs,
    fs::OpenOptions,
    sync::{
        mpsc::{self, RecvTimeoutError, Sender},
        Mutex,
    },
    thread,
    time::Duration,
};
use store::{Action, NoteBody, NoteHit, Snapshot, Store};
use tauri::{Emitter, Manager, State};
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

/// Asks the sync worker for a round: `Soon` waits for edits to settle, `Now` doesn't.
enum Nudge {
    Soon,
    Now,
}

struct Syncer(Mutex<Sender<Nudge>>);

impl Syncer {
    fn nudge(&self, nudge: Nudge) {
        if let Ok(sender) = self.0.lock() {
            let _ = sender.send(nudge);
        }
    }
}

/// One sync round for the signed-in account, if there is one. Network calls run without
/// holding the store lock; the window is told to reload when it starts and ends.
fn sync_round(app: &tauri::AppHandle) {
    let accounts = app.state::<Mutex<Accounts>>();
    let store = app.state::<Mutex<Store>>();
    for _ in 0..2 {
        let target = match accounts.lock() {
            Ok(mut accounts) => accounts.sync_target(),
            Err(_) => return,
        };
        let (remote, path) = match target {
            Ok(Some(target)) => target,
            Ok(None) => return,
            Err(message) => {
                if let Ok(mut store) = store.lock() {
                    store.record_sync_error(&message);
                }
                let _ = app.emit("sync-changed", ());
                return;
            }
        };
        if let Ok(mut store) = store.lock() {
            if store.path() != path {
                return;
            }
            store.set_syncing(true);
        }
        let _ = app.emit("sync-changed", ());
        let result = store::sync::run(&store, &remote, &path);
        let _ = app.emit("sync-changed", ());
        match result {
            Err(error) if error.expired => {
                // The token may have been revoked early: refresh it once and retry.
                if let Ok(mut accounts) = accounts.lock() {
                    accounts.forget_access();
                }
            }
            _ => return,
        }
    }
}

#[tauri::command]
fn sync_now(syncer: State<'_, Syncer>) {
    syncer.nudge(Nudge::Now);
}

#[tauri::command]
fn workspace(
    app: tauri::AppHandle,
    state: State<'_, Mutex<Store>>,
    syncer: State<'_, Syncer>,
    action: Action,
) -> Result<Snapshot, String> {
    let changes = !matches!(action, Action::Read);
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
    if changes && result.is_ok() {
        syncer.nudge(Nudge::Soon);
    }
    result
}

#[tauri::command]
fn note(state: State<'_, Mutex<Store>>, id: i64) -> Result<NoteBody, String> {
    let store = state
        .lock()
        .map_err(|_| "Ada could not access its local database.".to_owned())?;
    store.note(id).map_err(|error| store::describe(&*error))
}

#[tauri::command]
fn search_notes(state: State<'_, Mutex<Store>>, query: String) -> Result<Vec<NoteHit>, String> {
    let store = state
        .lock()
        .map_err(|_| "Ada could not access its local database.".to_owned())?;
    store
        .search_notes(&query)
        .map_err(|error| store::describe(&*error))
}

/// Open a web or mail link from a note in the default browser. Only http, https, and mailto links
/// are passed on, so a note can never launch a program or open a local file.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    let allowed = ["http://", "https://", "mailto:"].iter().any(|scheme| lower.starts_with(scheme));
    if !allowed || url.len() > 2048 || url.chars().any(|c| c.is_control() || c == '"') {
        return Err("Ada only opens web and email links.".into());
    }
    std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", &url])
        .spawn()
        .map(|_| ())
        .map_err(|_| "Ada could not open that link.".into())
}

#[tauri::command]
async fn account(app: tauri::AppHandle, request: Request) -> Result<View, String> {
    // Account requests wait on the network, so they run off the window's thread.
    tauri::async_runtime::spawn_blocking(move || {
        let accounts = app.state::<Mutex<Accounts>>();
        let mut accounts = accounts
            .lock()
            .map_err(|_| "Ada could not access your account details.".to_owned())?;
        let view = accounts.handle(request, &app.state::<Mutex<Store>>())?;
        drop(accounts);
        if view.reload {
            app.state::<Syncer>().nudge(Nudge::Now);
        }
        Ok(view)
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
            let (sender, nudges) = mpsc::channel();
            // Sync once at launch.
            let _ = sender.send(Nudge::Now);
            app.manage(Syncer(Mutex::new(sender)));
            let handle = app.handle().clone();
            thread::spawn(move || loop {
                match nudges.recv_timeout(Duration::from_secs(60)) {
                    Ok(Nudge::Soon) => {
                        // Wait until edits pause for a few seconds, so typing isn't synced per key.
                        loop {
                            match nudges.recv_timeout(Duration::from_secs(3)) {
                                Ok(Nudge::Soon) => continue,
                                Ok(Nudge::Now) | Err(RecvTimeoutError::Timeout) => break,
                                Err(RecvTimeoutError::Disconnected) => return,
                            }
                        }
                    }
                    Ok(Nudge::Now) | Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => return,
                }
                sync_round(&handle);
            });
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
        .invoke_handler(tauri::generate_handler![workspace, account, sync_now, note, search_notes, open_url])
        .run(tauri::generate_context!());
    if let Err(error) = result {
        report(&format!("Ada could not start. {error}"));
        std::process::exit(1);
    }
}
