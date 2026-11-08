import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/tauriApi.js';

export const SYSTEM_ALLOWLIST = [
  'ada.exe',
  'ada_focus.exe',
  'explorer.exe',
  'lockapp.exe',
  'logonui.exe',
  'taskmgr.exe',
  'shellexperiencehost.exe',
  'searchhost.exe',
  'startmenuexperiencehost.exe'
];

export const DEFAULT_PROFILES = {
  Coding: ['code.exe', 'cursor.exe', 'windowsterminal.exe', 'wt.exe', 'powershell.exe', 'cmd.exe', 'firefox.exe', 'chrome.exe', 'git-credential-manager.exe'],
  Writing: ['notepad.exe', 'obsidian.exe', 'winword.exe', 'typora.exe', 'focuswriter.exe'],
  Research: ['firefox.exe', 'chrome.exe', 'msedge.exe', 'acrobat.exe', 'zotero.exe']
};

/**
 * @param {Object} props
 * @param {string[]} props.allowedApps
 * @param {Function} props.onUpdateAllowedApps
 */
export function AllowlistManager({ allowedApps = [], onUpdateAllowedApps }) {
  const [runningProcesses, setRunningProcesses] = useState([]);
  const [customExe, setCustomExe] = useState('');
  const [activeProfile, setActiveProfile] = useState('Coding');
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(false);

  // Fetch running processes from Win32 backend
  const loadRunning = useCallback(async () => {
    setIsLoadingProcesses(true);
    try {
      const procs = await api.getRunningProcesses();
      setRunningProcesses(procs);
    } catch (err) {
      console.error('Failed to get running processes:', err);
    } finally {
      setIsLoadingProcesses(false);
    }
  }, []);

  useEffect(() => {
    loadRunning();
  }, [loadRunning]);

  const handleAddApp = (exe) => {
    const clean = exe.trim().toLowerCase();
    if (!clean) return;
    const formatted = clean.endsWith('.exe') ? clean : `${clean}.exe`;
    if (!allowedApps.includes(formatted)) {
      onUpdateAllowedApps([...allowedApps, formatted]);
    }
  };

  const handleRemoveApp = (exe) => {
    onUpdateAllowedApps(allowedApps.filter(app => app !== exe));
  };

  const handleApplyProfile = (profileName) => {
    setActiveProfile(profileName);
    const profileList = DEFAULT_PROFILES[profileName] || [];
    const merged = Array.from(new Set([...allowedApps, ...profileList]));
    onUpdateAllowedApps(merged);
  };

  return (
    <div className="allowlist-manager gothic-card" style={{ maxWidth: 680, margin: '0 auto' }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.25rem',
          color: 'var(--color-gold-bright)',
          borderBottom: '1px solid rgba(184, 146, 90, 0.3)',
          paddingBottom: 8,
          marginBottom: 16
        }}
      >
        Focus Allowlist & Enforcement
      </div>

      {/* Profile Selector */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-gold)', marginBottom: 6 }}>
          Preset Profiles
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {Object.keys(DEFAULT_PROFILES).map(p => (
            <button
              key={p}
              type="button"
              className={`btn-brass ${activeProfile === p ? 'active' : ''}`}
              style={{
                borderColor: activeProfile === p ? 'var(--color-gold)' : undefined,
                background: activeProfile === p ? 'rgba(184, 146, 90, 0.2)' : undefined
              }}
              onClick={() => handleApplyProfile(p)}
            >
              Profile: {p}
            </button>
          ))}
        </div>
      </div>

      {/* Manual Input */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="e.g. sublime_text.exe"
          value={customExe}
          onChange={(e) => setCustomExe(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleAddApp(customExe);
              setCustomExe('');
            }
          }}
          style={{
            flex: 1,
            background: 'rgba(18, 12, 14, 0.85)',
            border: '1px solid var(--color-brass)',
            color: 'var(--color-parchment)',
            padding: '8px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.88rem'
          }}
        />
        <button
          type="button"
          className="btn-wax"
          onClick={() => {
            handleAddApp(customExe);
            setCustomExe('');
          }}
        >
          Add Executable
        </button>
      </div>

      {/* Currently Permitted Executables */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-gold)', marginBottom: 8 }}>
          Permitted Applications ({allowedApps.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 160, overflowY: 'auto', padding: 4 }}>
          {SYSTEM_ALLOWLIST.map(sys => (
            <span
              key={sys}
              style={{
                background: 'rgba(40, 25, 30, 0.7)',
                border: '1px solid #5A4048',
                color: 'var(--color-ash)',
                padding: '4px 10px',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)'
              }}
            >
              🔒 {sys}
            </span>
          ))}

          {allowedApps.map(app => (
            <span
              key={app}
              style={{
                background: 'rgba(49, 92, 79, 0.25)',
                border: '1px solid var(--color-success-teal)',
                color: 'var(--color-parchment)',
                padding: '4px 10px',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {app}
              <button
                type="button"
                onClick={() => handleRemoveApp(app)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FF8888',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '0.9rem'
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Currently Running Processes Quick-Add */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-gold)' }}>
            Running Processes ({runningProcesses.length})
          </span>
          <button
            type="button"
            className="btn-brass"
            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
            onClick={loadRunning}
            disabled={isLoadingProcesses}
          >
            {isLoadingProcesses ? 'Scanning…' : '↻ Refresh'}
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
          {runningProcesses.map(proc => {
            const isAlreadyAdded = allowedApps.includes(proc) || SYSTEM_ALLOWLIST.includes(proc);
            return (
              <button
                key={proc}
                type="button"
                className="btn-brass"
                disabled={isAlreadyAdded}
                style={{
                  padding: '3px 8px',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  opacity: isAlreadyAdded ? 0.4 : 1
                }}
                onClick={() => handleAddApp(proc)}
              >
                + {proc}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
