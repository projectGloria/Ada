/**
 * @file Tauri IPC bridge with seamless browser fallback for local development.
 */

const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);

/**
 * Invokes a Tauri command or uses localStorage mock during non-Tauri dev.
 * @param {string} cmd
 * @param {Object} [args={}]
 * @returns {Promise<any>}
 */
async function invokeTauri(cmd, args = {}) {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke(cmd, args);
  }

  return mockHandler(cmd, args);
}

// In-memory mock store for non-Tauri browser preview
let mockDeviceId = 'dev-browser-device-001';
let mockEvents = [];
let mockBalance = 0;

function mockHandler(cmd, args) {
  switch (cmd) {
    case 'get_device_id':
      return Promise.resolve(mockDeviceId);

    case 'start_session': {
      const event = {
        id: `mock-evt-${Date.now()}`,
        event_type: 'SessionStarted',
        timestamp: Date.now(),
        device_id: mockDeviceId,
        payload: JSON.stringify(args)
      };
      mockEvents.push(event);
      return Promise.resolve(event);
    }

    case 'complete_session': {
      const earnings = Math.floor((args.duration_minutes / 5) * 12) + 12;
      mockBalance += earnings;
      const event = {
        id: `mock-evt-${Date.now()}`,
        event_type: 'SessionCompleted',
        timestamp: Date.now(),
        device_id: mockDeviceId,
        payload: JSON.stringify({ ...args, earned_pence: earnings })
      };
      mockEvents.push(event);
      return Promise.resolve(event);
    }

    case 'fail_session': {
      const event = {
        id: `mock-evt-${Date.now()}`,
        event_type: 'SessionFailed',
        timestamp: Date.now(),
        device_id: mockDeviceId,
        payload: JSON.stringify(args)
      };
      mockEvents.push(event);
      return Promise.resolve(event);
    }

    case 'record_purchase': {
      mockBalance -= args.cost_pence;
      const event = {
        id: `mock-evt-${Date.now()}`,
        event_type: 'Purchase',
        timestamp: Date.now(),
        device_id: mockDeviceId,
        payload: JSON.stringify(args)
      };
      mockEvents.push(event);
      return Promise.resolve(event);
    }

    case 'get_sessions': {
      const sessions = [];
      for (const e of mockEvents) {
        const payload = JSON.parse(e.payload);
        if (e.event_type === 'SessionStarted') {
          sessions.push({
            session_id: payload.session_id,
            status: 'running',
            building_type: payload.target_building,
            duration_minutes: payload.duration_minutes,
            started_at: e.timestamp,
            ended_at: null,
            tag_id: payload.tag_id,
            earned_pence: null,
            failure_reason: null
          });
        } else if (e.event_type === 'SessionCompleted') {
          const s = sessions.find(item => item.session_id === payload.session_id);
          if (s) {
            s.status = 'completed';
            s.ended_at = e.timestamp;
            s.earned_pence = payload.earned_pence;
          }
        } else if (e.event_type === 'SessionFailed') {
          const s = sessions.find(item => item.session_id === payload.session_id);
          if (s) {
            s.status = 'failed';
            s.ended_at = e.timestamp;
            s.failure_reason = payload.reason;
          }
        }
      }
      return Promise.resolve(sessions);
    }

    case 'get_balance':
      return Promise.resolve(mockBalance);

    case 'get_all_events':
      return Promise.resolve(mockEvents);

    case 'start_focus_monitoring':
    case 'stop_focus_monitoring':
    case 'update_tray_tooltip':
      return Promise.resolve();

    case 'get_running_processes_list':
      return Promise.resolve(['code.exe', 'firefox.exe', 'explorer.exe', 'notepad.exe', 'terminal.exe']);

    case 'export_backup_json':
      return Promise.resolve(JSON.stringify({ schema_version: 1, exported_at: Date.now(), events: mockEvents }, null, 2));

    case 'toggle_mini_timer':
      return Promise.resolve();

    case 'import_backup_json': {
      const parsed = JSON.parse(args.json_content);
      const incoming = parsed.events || [];
      mockEvents = [...mockEvents, ...incoming];
      return Promise.resolve(incoming.length);
    }

    default:
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
  }
}

export const api = {
  getDeviceId: () => invokeTauri('get_device_id'),
  startSession: (sessionId, durationMinutes, targetBuilding, strictness, tagId) =>
    invokeTauri('start_session', {
      session_id: sessionId,
      duration_minutes: durationMinutes,
      target_building: targetBuilding,
      strictness,
      tag_id: tagId
    }),
  completeSession: (sessionId, durationMinutes) =>
    invokeTauri('complete_session', {
      session_id: sessionId,
      duration_minutes: durationMinutes
    }),
  failSession: (sessionId, reason, elapsedSeconds, targetDurationMinutes) =>
    invokeTauri('fail_session', {
      session_id: sessionId,
      reason,
      elapsed_seconds: elapsedSeconds,
      target_duration_minutes: targetDurationMinutes
    }),
  recordPurchase: (itemId, costPence) =>
    invokeTauri('record_purchase', {
      item_id: itemId,
      cost_pence: costPence
    }),
  getSessions: () => invokeTauri('get_sessions'),
  getBalance: () => invokeTauri('get_balance'),
  getAllEvents: () => invokeTauri('get_all_events'),
  startFocusMonitoring: () => invokeTauri('start_focus_monitoring'),
  stopFocusMonitoring: () => invokeTauri('stop_focus_monitoring'),
  getRunningProcesses: () => invokeTauri('get_running_processes_list'),
  updateTrayTooltip: (text) => invokeTauri('update_tray_tooltip', { text }),
  exportBackup: () => invokeTauri('export_backup_json'),
  importBackup: (jsonContent) => invokeTauri('import_backup_json', { json_content: jsonContent }),
  toggleMiniTimer: () => invokeTauri('toggle_mini_timer'),

  // Tauri Event Listeners (with unlisten cleanup)
  listenToForegroundChanges: async (callback) => {
    if (isTauri) {
      const { listen } = await import('@tauri-apps/api/event');
      return listen('foreground-changed', (event) => callback(event.payload));
    }
    return () => {};
  },
  listenToLockEvents: async (onLock, onUnlock) => {
    if (isTauri) {
      const { listen } = await import('@tauri-apps/api/event');
      const unlistenLock = await listen('session-locked', () => onLock());
      const unlistenUnlock = await listen('session-unlocked', () => onUnlock());
      return () => {
        unlistenLock();
        unlistenUnlock();
      };
    }
    return () => {};
  }
};
