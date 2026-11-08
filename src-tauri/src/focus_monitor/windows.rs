use super::{FocusMonitor, ForegroundInfo, SystemFocusEvent};
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, WPARAM};
use windows::Win32::System::Threading::{
    GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{
    SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK,
};

const WINEVENT_OUTOFCONTEXT: u32 = 0;
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetMessageW, GetWindowThreadProcessId, PostThreadMessageW,
    TranslateMessage, EVENT_SYSTEM_FOREGROUND, MSG, WM_QUIT,
};

type EventCallback = Box<dyn Fn(SystemFocusEvent) + Send + Sync + 'static>;

static GLOBAL_CALLBACK: Mutex<Option<Arc<EventCallback>>> = Mutex::new(None);

pub struct WindowsFocusMonitor {
    thread_id: Arc<AtomicU32>,
    join_handle: Mutex<Option<JoinHandle<()>>>,
}

impl WindowsFocusMonitor {
    pub fn new() -> Self {
        Self {
            thread_id: Arc::new(AtomicU32::new(0)),
            join_handle: Mutex::new(None),
        }
    }
}

impl Default for WindowsFocusMonitor {
    fn default() -> Self {
        Self::new()
    }
}

unsafe extern "system" fn win_event_proc(
    _h_win_event_hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    if event == EVENT_SYSTEM_FOREGROUND && !hwnd.is_invalid() {
        if let Some(info) = resolve_foreground_process(hwnd) {
            let callback_lock = GLOBAL_CALLBACK.lock().unwrap();
            if let Some(ref cb) = *callback_lock {
                cb(SystemFocusEvent::ForegroundChanged(info));
            }
        }
    }
}

fn resolve_foreground_process(hwnd: HWND) -> Option<ForegroundInfo> {
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }

        let process_handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut path_buf = vec![0u16; 1024];
        let mut size = path_buf.len() as u32;

        let success = QueryFullProcessImageNameW(
            process_handle,
            PROCESS_NAME_WIN32,
            PWSTR(path_buf.as_mut_ptr()),
            &mut size,
        );

        let _ = CloseHandle(process_handle);

        if success.is_ok() && size > 0 {
            let path_str = String::from_utf16_lossy(&path_buf[..size as usize]);
            let name = Path::new(&path_str)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone());

            Some(ForegroundInfo {
                process_name: name.to_lowercase(),
                process_path: path_str,
            })
        } else {
            None
        }
    }
}

impl FocusMonitor for WindowsFocusMonitor {
    fn start(&self, callback: EventCallback) -> Result<(), String> {
        self.stop()?;

        {
            let mut cb_guard = GLOBAL_CALLBACK.lock().unwrap();
            *cb_guard = Some(Arc::new(callback));
        }

        let thread_id_atomic = self.thread_id.clone();

        let handle = thread::Builder::new()
            .name("ada-win32-event-hook".into())
            .spawn(move || unsafe {
                let tid = GetCurrentThreadId();
                thread_id_atomic.store(tid, Ordering::SeqCst);

                let hook = SetWinEventHook(
                    EVENT_SYSTEM_FOREGROUND,
                    EVENT_SYSTEM_FOREGROUND,
                    None,
                    Some(win_event_proc),
                    0,
                    0,
                    WINEVENT_OUTOFCONTEXT,
                );

                if hook.is_invalid() {
                    eprintln!("[Ada Focus Monitor] Failed to install SetWinEventHook");
                    return;
                }

                let mut msg = MSG::default();
                // Dedicated Win32 message loop required for WinEventHooks to fire
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }

                let _ = UnhookWinEvent(hook);
            })
            .map_err(|e| format!("Failed to spawn monitor thread: {e}"))?;

        let mut join_guard = self.join_handle.lock().unwrap();
        *join_guard = Some(handle);

        Ok(())
    }

    fn stop(&self) -> Result<(), String> {
        let tid = self.thread_id.swap(0, Ordering::SeqCst);
        if tid != 0 {
            unsafe {
                let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }

        let mut join_guard = self.join_handle.lock().unwrap();
        if let Some(handle) = join_guard.take() {
            let _ = handle.join();
        }

        let mut cb_guard = GLOBAL_CALLBACK.lock().unwrap();
        *cb_guard = None;

        Ok(())
    }
}

impl Drop for WindowsFocusMonitor {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

pub fn list_running_processes() -> Vec<String> {
    unsafe {
        let mut pids = vec![0u32; 1024];
        let mut bytes_returned = 0u32;
        let pids_size = (pids.len() * std::mem::size_of::<u32>()) as u32;

        if windows::Win32::System::ProcessStatus::EnumProcesses(
            pids.as_mut_ptr(),
            pids_size,
            &mut bytes_returned,
        )
        .is_err()
        {
            return Vec::new();
        }

        let count = (bytes_returned as usize) / std::mem::size_of::<u32>();
        let mut process_names = std::collections::BTreeSet::new();

        for &pid in &pids[..count] {
            if pid == 0 {
                continue;
            }
            if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                let mut path_buf = vec![0u16; 1024];
                let mut size = path_buf.len() as u32;
                if QueryFullProcessImageNameW(
                    handle,
                    PROCESS_NAME_WIN32,
                    PWSTR(path_buf.as_mut_ptr()),
                    &mut size,
                )
                .is_ok()
                    && size > 0
                {
                    let path_str = String::from_utf16_lossy(&path_buf[..size as usize]);
                    if let Some(file_name) = Path::new(&path_str).file_name() {
                        let name = file_name.to_string_lossy().to_lowercase();
                        process_names.insert(name);
                    }
                }
                let _ = CloseHandle(handle);
            }
        }

        process_names.into_iter().collect()
    }
}
