import React, { useReducer, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { timerReducer, initialTimerState } from './timer/timerReducer.js';
import { FocusTimer } from './timer/FocusTimer.jsx';
import { MiniTimer } from './timer/MiniTimer.jsx';
import { Header } from './components/Header.jsx';
import { SessionHistory } from './components/SessionHistory.jsx';
import { IsometricCity } from './city/IsometricCity.jsx';
import { LovelaceStats } from './stats/LovelaceStats.jsx';
import { Shop } from './shop/Shop.jsx';
import { AllowlistManager, SYSTEM_ALLOWLIST, DEFAULT_PROFILES } from './settings/AllowlistManager.jsx';
import { SyncManager } from './sync/SyncManager.jsx';
import { TagSelector, DEFAULT_TAGS } from './tags/TagManager.jsx';
import { playChurchBell, playCrumblingMasonry } from './audio/soundEffects.js';
import { api } from './api/tauriApi.js';
import './styles/theme.css';

export function App() {
  // Detect if opened in mini timer window mode (?mode=mini)
  const isMiniMode = typeof window !== 'undefined' && window.location.search.includes('mode=mini');

  const [state, dispatch] = useReducer(timerReducer, initialTimerState);
  const [activeTab, setActiveTab] = useState('timer'); // 'timer' | 'city' | 'stats' | 'shop' | 'allowlist' | 'sync'
  const [deviceId, setDeviceId] = useState('');
  const [balance, setBalance] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  // App settings
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('ada_sound_enabled') === 'true');
  const [tags, setTags] = useState(() => {
    try {
      const saved = localStorage.getItem('ada_tags');
      return saved ? JSON.parse(saved) : DEFAULT_TAGS;
    } catch {
      return DEFAULT_TAGS;
    }
  });
  const [allowedApps, setAllowedApps] = useState(() => {
    try {
      const saved = localStorage.getItem('ada_allowed_apps');
      return saved ? JSON.parse(saved) : DEFAULT_PROFILES.Coding;
    } catch {
      return DEFAULT_PROFILES.Coding;
    }
  });
  const [unlockedItemIds, setUnlockedItemIds] = useState(() => {
    try {
      const saved = localStorage.getItem('ada_unlocked_items');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist settings changes
  useEffect(() => {
    localStorage.setItem('ada_sound_enabled', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('ada_tags', JSON.stringify(tags));
  }, [tags]);

  useEffect(() => {
    localStorage.setItem('ada_allowed_apps', JSON.stringify(allowedApps));
  }, [allowedApps]);

  useEffect(() => {
    localStorage.setItem('ada_unlocked_items', JSON.stringify(unlockedItemIds));
  }, [unlockedItemIds]);

  // Refresh balance & session history projections from SQLite
  const refreshLedger = useCallback(async () => {
    try {
      const [currentBalance, history] = await Promise.all([
        api.getBalance(),
        api.getSessions()
      ]);
      setBalance(currentBalance);
      setSessions(history);
    } catch (err) {
      console.error('Failed to load ledger projections:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let mounted = true;
    async function loadMeta() {
      try {
        const id = await api.getDeviceId();
        if (mounted) setDeviceId(id);
        await refreshLedger();
      } catch (err) {
        if (mounted) setErrorMsg(err.message || String(err));
      }
    }
    loadMeta();
    return () => {
      mounted = false;
    };
  }, [refreshLedger]);

  // Start Win32 Focus Monitor and hook events
  useEffect(() => {
    let unlistenFocus = null;
    let unlistenLock = null;

    async function initMonitoring() {
      try {
        await api.startFocusMonitoring();

        // Listen for foreground changes
        unlistenFocus = await api.listenToForegroundChanges((payload) => {
          if (!payload?.process_name) return;
          const procName = payload.process_name.toLowerCase();

          // If lock screen is foreground, pause
          if (procName === 'lockapp.exe' || procName === 'logonui.exe') {
            dispatch({ type: 'PAUSE' });
            return;
          }

          // Check against allowed lists
          const isAllowed =
            allowedApps.some(app => app.toLowerCase() === procName) ||
            SYSTEM_ALLOWLIST.some(sys => sys.toLowerCase() === procName);

          if (isAllowed) {
            dispatch({ type: 'CLEAR_GRACE' });
          } else {
            // Disallowed application detected
            if (state.status === 'running') {
              if (state.strictness === 'strict') {
                handleSessionFailed('app_switch');
              } else {
                dispatch({ type: 'TRIGGER_GRACE', payload: { processName: procName } });
              }
            }
          }
        });

        // Listen for session lock / unlock events
        unlistenLock = await api.listenToLockEvents(
          () => dispatch({ type: 'PAUSE' }),
          () => dispatch({ type: 'RESUME' })
        );
      } catch (err) {
        console.error('Failed to initialize Win32 focus monitor:', err);
      }
    }

    initMonitoring();

    return () => {
      api.stopFocusMonitoring().catch(() => {});
      if (unlistenFocus) unlistenFocus();
      if (unlistenLock) unlistenLock();
    };
  }, [allowedApps, state.status, state.strictness]);

  // Monotonic tick loop
  useEffect(() => {
    if (state.status !== 'running') return;

    const interval = setInterval(() => {
      if (state.remainingSeconds <= 1) {
        handleSessionCompleted();
      } else {
        dispatch({ type: 'TICK' });

        // Update system tray tooltip
        const m = Math.floor(state.remainingSeconds / 60);
        api.updateTrayTooltip(`Ada: ${m}m remaining (${state.buildingType})`).catch(() => {});

        // Handle lenient grace countdown
        if (state.isGraceActive) {
          if (state.gracePeriodSeconds <= 1) {
            handleSessionFailed('app_switch');
          } else {
            dispatch({ type: 'GRACE_TICK' });
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state.status, state.remainingSeconds, state.isGraceActive, state.gracePeriodSeconds, state.buildingType]);

  // Start Session
  const handleStartSession = useCallback(async () => {
    const sessionId = crypto.randomUUID();
    try {
      await api.startSession(
        sessionId,
        state.targetDurationMinutes,
        state.buildingType,
        state.strictness,
        state.tagId
      );
      dispatch({ type: 'START_SESSION', payload: { sessionId } });
      api.updateTrayTooltip(`Ada: ${state.targetDurationMinutes}m remaining`).catch(() => {});
      await refreshLedger();
    } catch (err) {
      console.error('Failed to start session:', err);
      setErrorMsg(`Error starting session: ${err}`);
    }
  }, [state.targetDurationMinutes, state.buildingType, state.strictness, state.tagId, refreshLedger]);

  // Complete Session
  const handleSessionCompleted = useCallback(async () => {
    if (!state.sessionId) return;
    try {
      await api.completeSession(state.sessionId, state.targetDurationMinutes);
      dispatch({ type: 'COMPLETE_SESSION' });
      playChurchBell(soundEnabled);
      api.updateTrayTooltip('Ada — Focus Session Complete!').catch(() => {});
      await refreshLedger();
    } catch (err) {
      console.error('Failed to complete session:', err);
    }
  }, [state.sessionId, state.targetDurationMinutes, soundEnabled, refreshLedger]);

  // Fail Session
  const handleSessionFailed = useCallback(async (reason) => {
    if (!state.sessionId) return;
    try {
      await api.failSession(
        state.sessionId,
        reason,
        state.elapsedSeconds,
        state.targetDurationMinutes
      );
      dispatch({ type: 'FAIL_SESSION', payload: { reason } });
      playCrumblingMasonry(soundEnabled);
      api.updateTrayTooltip(`Ada — Ruin (${reason})`).catch(() => {});
      await refreshLedger();
    } catch (err) {
      console.error('Failed to record session failure:', err);
    }
  }, [state.sessionId, state.elapsedSeconds, state.targetDurationMinutes, soundEnabled, refreshLedger]);

  const handleGiveUp = useCallback(() => {
    handleSessionFailed('manual_give_up');
  }, [handleSessionFailed]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Purchase shop item
  const handlePurchase = useCallback(async (item) => {
    if (balance < item.costPence) return;
    try {
      await api.recordPurchase(item.id, item.costPence);
      setUnlockedItemIds(prev => [...prev, item.id]);
      await refreshLedger();
    } catch (err) {
      console.error('Purchase failed:', err);
    }
  }, [balance, refreshLedger]);

  // Render mini timer mode if requested
  if (isMiniMode) {
    return <MiniTimer state={state} onGiveUp={handleGiveUp} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Victorian Header with Coffers & Device ID */}
      <Header balancePence={balance} deviceId={deviceId} />

      {/* Navigation Tab Bar */}
      <nav
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 28px',
          background: 'rgba(26, 19, 22, 0.95)',
          borderBottom: '1px solid rgba(184, 146, 90, 0.2)'
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { id: 'timer', label: '🕰️ Focus Engine' },
            { id: 'city', label: '🏙️ Victorian City' },
            { id: 'stats', label: '📜 Analytical Notes' },
            { id: 'shop', label: '⚙️ Manufactory' },
            { id: 'allowlist', label: '🛡️ Allowlist' },
            { id: 'sync', label: '☁️ Ledger Sync' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`btn-brass ${activeTab === tab.id ? 'active' : ''}`}
              style={{
                borderColor: activeTab === tab.id ? 'var(--color-gold-bright)' : undefined,
                background: activeTab === tab.id ? 'rgba(184, 146, 90, 0.22)' : undefined,
                color: activeTab === tab.id ? 'var(--color-gold-bright)' : undefined
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Global Controls: Sound Toggle & Mini Window */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="btn-brass"
            style={{ padding: '6px 12px', fontSize: '0.82rem' }}
            onClick={() => setSoundEnabled(s => !s)}
          >
            {soundEnabled ? '🔔 Sound: Chimes On' : '🔕 Sound: Muted'}
          </button>

          <button
            type="button"
            className="btn-brass"
            style={{ padding: '6px 12px', fontSize: '0.82rem' }}
            onClick={() => api.toggleMiniTimer()}
          >
            🪟 Mini Timer
          </button>
        </div>
      </nav>

      {errorMsg && (
        <div style={{ background: '#541515', color: '#FFF', padding: '6px 16px', fontSize: '0.85rem' }}>
          Notice: {errorMsg}
        </div>
      )}

      {/* Main View Area */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: activeTab === 'city' ? 0 : '24px 32px',
          boxSizing: 'border-box'
        }}
      >
        {activeTab === 'timer' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(400px, 1fr) minmax(360px, 480px)',
              gap: 32,
              alignItems: 'center'
            }}
          >
            <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              {/* Tag Selector */}
              {state.status === 'idle' && (
                <TagSelector
                  tags={tags}
                  selectedTagId={state.tagId}
                  onSelectTag={(id) => dispatch({ type: 'SET_TAG', payload: id })}
                  onAddTag={(tag) => setTags(prev => [...prev, tag])}
                />
              )}

              <FocusTimer
                state={state}
                dispatch={dispatch}
                onStartSession={handleStartSession}
                onGiveUp={handleGiveUp}
                onReset={handleReset}
              />
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <SessionHistory sessions={sessions} />
            </section>
          </div>
        )}

        {activeTab === 'city' && (
          <IsometricCity sessions={sessions} activeSessionState={state} />
        )}

        {activeTab === 'stats' && (
          <LovelaceStats sessions={sessions} tags={tags} />
        )}

        {activeTab === 'shop' && (
          <Shop
            balancePence={balance}
            unlockedItemIds={unlockedItemIds}
            onPurchase={handlePurchase}
          />
        )}

        {activeTab === 'allowlist' && (
          <AllowlistManager
            allowedApps={allowedApps}
            onUpdateAllowedApps={setAllowedApps}
          />
        )}

        {activeTab === 'sync' && (
          <SyncManager onSyncComplete={refreshLedger} />
        )}
      </main>
    </div>
  );
}
export default App;
