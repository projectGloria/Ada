use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForegroundInfo {
    pub process_name: String,
    pub process_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", content = "data")]
pub enum SystemFocusEvent {
    ForegroundChanged(ForegroundInfo),
    SessionLocked,
    SessionUnlocked,
}

pub trait FocusMonitor: Send + Sync {
    fn start(&self, callback: Box<dyn Fn(SystemFocusEvent) + Send + Sync + 'static>) -> Result<(), String>;
    fn stop(&self) -> Result<(), String>;
}

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "windows")]
pub use self::windows::{list_running_processes, WindowsFocusMonitor};

#[cfg(not(target_os = "windows"))]
pub fn list_running_processes() -> Vec<String> {
    Vec::new()
}
