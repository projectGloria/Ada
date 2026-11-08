use crate::events::{
    calculate_earnings, SessionCompletedPayload, SessionFailedPayload, SessionProjection,
    SessionStartedPayload, StoredEvent,
};
use crate::focus_monitor::{list_running_processes, FocusMonitor, SystemFocusEvent};
use crate::storage::Database;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct AppState {
    pub db: Arc<Database>,
    pub focus_monitor: Arc<dyn FocusMonitor>,
}

#[tauri::command]
pub fn start_focus_monitoring(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let app_handle = app.clone();
    state.focus_monitor.start(Box::new(move |event| {
        match event {
            SystemFocusEvent::ForegroundChanged(info) => {
                let _ = app_handle.emit("foreground-changed", &info);
            }
            SystemFocusEvent::SessionLocked => {
                let _ = app_handle.emit("session-locked", ());
            }
            SystemFocusEvent::SessionUnlocked => {
                let _ = app_handle.emit("session-unlocked", ());
            }
        }
    }))
}

#[tauri::command]
pub fn stop_focus_monitoring(state: State<'_, AppState>) -> Result<(), String> {
    state.focus_monitor.stop()
}

#[tauri::command]
pub fn get_running_processes_list() -> Result<Vec<String>, String> {
    Ok(list_running_processes())
}

#[tauri::command]
pub fn update_tray_tooltip(app: AppHandle, text: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_tooltip(Some(text));
    }
    Ok(())
}

#[tauri::command]
pub fn export_backup_json(state: State<'_, AppState>) -> Result<String, String> {
    crate::sync::export_backup(&state.db)
}

#[tauri::command]
pub fn import_backup_json(json_content: String, state: State<'_, AppState>) -> Result<usize, String> {
    crate::sync::import_and_merge_backup(&state.db, &json_content)
}

#[tauri::command]
pub fn record_purchase(
    item_id: String,
    cost_pence: i64,
    state: State<'_, AppState>,
) -> Result<StoredEvent, String> {
    let payload = crate::events::PurchasePayload { item_id, cost_pence };
    let json_str = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    state.db.append_event("Purchase", &json_str).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_mini_timer(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(mini) = app.get_webview_window("mini") {
        if mini.is_visible().unwrap_or(false) {
            let _ = mini.hide();
        } else {
            let _ = mini.show();
            let _ = mini.set_focus();
        }
    } else {
        let _ = tauri::WebviewWindowBuilder::new(
            &app,
            "mini",
            tauri::WebviewUrl::App("index.html?mode=mini".into()),
        )
        .title("Ada Mini")
        .inner_size(260.0, 110.0)
        .always_on_top(true)
        .resizable(false)
        .build();
    }
    Ok(())
}

#[tauri::command]
pub fn get_device_id(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.db.device_id.clone())
}

#[tauri::command]
pub fn start_session(
    session_id: String,
    duration_minutes: i64,
    target_building: String,
    strictness: String,
    tag_id: String,
    state: State<'_, AppState>,
) -> Result<StoredEvent, String> {
    let payload = SessionStartedPayload {
        session_id,
        duration_minutes,
        target_building,
        strictness,
        tag_id,
    };

    let json_str = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    state
        .db
        .append_event("SessionStarted", &json_str)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn complete_session(
    session_id: String,
    duration_minutes: i64,
    state: State<'_, AppState>,
) -> Result<StoredEvent, String> {
    let earned_pence = calculate_earnings(duration_minutes);
    let payload = SessionCompletedPayload {
        session_id,
        earned_pence,
        duration_minutes,
    };

    let json_str = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    state
        .db
        .append_event("SessionCompleted", &json_str)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fail_session(
    session_id: String,
    reason: String,
    elapsed_seconds: i64,
    target_duration_minutes: i64,
    state: State<'_, AppState>,
) -> Result<StoredEvent, String> {
    let payload = SessionFailedPayload {
        session_id,
        reason,
        elapsed_seconds,
        target_duration_minutes,
    };

    let json_str = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    state
        .db
        .append_event("SessionFailed", &json_str)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_sessions(state: State<'_, AppState>) -> Result<Vec<SessionProjection>, String> {
    state.db.project_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_balance(state: State<'_, AppState>) -> Result<i64, String> {
    state.db.calculate_balance().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_events(state: State<'_, AppState>) -> Result<Vec<StoredEvent>, String> {
    state.db.get_all_events().map_err(|e| e.to_string())
}
