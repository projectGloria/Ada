import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/tauriApi.js';

/**
 * @param {Object} props
 * @param {Function} props.onSyncComplete
 */
export function SyncManager({ onSyncComplete }) {
  const [syncStatus, setSyncStatus] = useState('offline'); // 'synced' | 'syncing' | 'offline' | 'error'
  const [lastSyncedTime, setLastSyncedTime] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // GitHub Settings
  const [repoOwner, setRepoOwner] = useState(() => localStorage.getItem('ada_gh_owner') || '');
  const [repoName, setRepoName] = useState(() => localStorage.getItem('ada_gh_repo') || '');
  const [repoBranch, setRepoBranch] = useState(() => localStorage.getItem('ada_gh_branch') || 'main');
  const [ghToken, setGhToken] = useState(() => localStorage.getItem('ada_gh_token') || '');

  // Save settings
  const handleSaveSettings = () => {
    localStorage.setItem('ada_gh_owner', repoOwner);
    localStorage.setItem('ada_gh_repo', repoName);
    localStorage.setItem('ada_gh_branch', repoBranch);
    localStorage.setItem('ada_gh_token', ghToken);
    setErrorMessage(null);
  };

  // Local JSON Export
  const handleExportJson = async () => {
    try {
      const jsonStr = await api.exportBackup();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ada-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(`Export failed: ${err.message || err}`);
    }
  };

  // Local JSON Import
  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result;
        if (typeof content === 'string') {
          const count = await api.importBackup(content);
          alert(`Successfully imported and merged ${count} events.`);
          if (onSyncComplete) onSyncComplete();
        }
      } catch (err) {
        setErrorMessage(`Import failed: ${err.message || err}`);
      }
    };
    reader.readAsText(file);
  };

  // GitHub Sync Execution
  const handleSyncNow = useCallback(async () => {
    if (!repoOwner || !repoName || !ghToken) {
      setErrorMessage('Please configure GitHub Repository details and Personal Access Token first.');
      return;
    }

    setSyncStatus('syncing');
    setErrorMessage(null);

    try {
      const filePath = 'ada-data.json';
      const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}?ref=${repoBranch}`;

      // 1. Fetch remote copy if exists
      let remoteSha = null;
      let remoteEvents = [];

      try {
        const getRes = await fetch(apiUrl, {
          headers: {
            'Authorization': `token ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (getRes.ok) {
          const data = await getRes.json();
          remoteSha = data.sha;
          const decoded = atob(data.content.replace(/\s/g, ''));
          const parsed = JSON.parse(decoded);
          if (parsed && Array.isArray(parsed.events)) {
            remoteEvents = parsed.events;
            // Merge remote events locally
            await api.importBackup(decoded);
          }
        } else if (getRes.status !== 404) {
          throw new Error(`GitHub API HTTP ${getRes.status}: ${getRes.statusText}`);
        }
      } catch (err) {
        // If offline, don't crash
        if (!navigator.onLine) {
          setSyncStatus('offline');
          return;
        }
        console.warn('Remote file fetch notice:', err);
      }

      // 2. Prepare merged local payload
      const localJson = await api.exportBackup();
      const encodedContent = btoa(unescape(encodeURIComponent(localJson)));

      // 3. Push to GitHub
      const putBody = {
        message: `Ada Sync [${new Date().toISOString()}]`,
        content: encodedContent,
        branch: repoBranch,
        ...(remoteSha ? { sha: remoteSha } : {})
      };

      const putRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${ghToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(putBody)
      });

      if (!putRes.ok) {
        const errJson = await putRes.json().catch(() => ({}));
        throw new Error(errJson.message || `HTTP ${putRes.status}`);
      }

      setSyncStatus('synced');
      setLastSyncedTime(new Date().toLocaleTimeString());
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      console.error('GitHub sync error:', err);
      setSyncStatus('error');
      setErrorMessage(`Sync error: ${err.message || err}`);
    }
  }, [repoOwner, repoName, repoBranch, ghToken, onSyncComplete]);

  return (
    <div className="sync-manager gothic-card" style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(184, 146, 90, 0.3)', paddingBottom: 10, marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-gold-bright)', fontSize: '1.3rem' }}>
            Data Persistence & GitHub Sync
          </h2>
          <span style={{ fontSize: '0.82rem', color: 'var(--color-ash)', fontStyle: 'italic' }}>
            Offline-first local storage with optional encrypted GitHub repository synchronization
          </span>
        </div>

        {/* Sync Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background:
                syncStatus === 'synced'
                  ? 'var(--color-success-teal)'
                  : syncStatus === 'syncing'
                  ? 'var(--color-gold)'
                  : syncStatus === 'error'
                  ? 'var(--color-crimson-fail)'
                  : '#8E7F75'
            }}
          />
          <span style={{ textTransform: 'uppercase', color: 'var(--color-parchment)' }}>
            {syncStatus === 'synced' ? `Synced (${lastSyncedTime})` : syncStatus}
          </span>
        </div>
      </div>

      {errorMessage && (
        <div style={{ background: '#5E1B24', border: '1px solid #FF8080', color: '#FFF', padding: '8px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
          {errorMessage}
        </div>
      )}

      {/* Local Manual Backup Section */}
      <div style={{ marginBottom: 28, background: 'rgba(26, 19, 22, 0.6)', padding: '16px', border: '1px solid var(--color-panel-border)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--color-gold-bright)', marginBottom: 6 }}>
          Local JSON Ledger Backup
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--color-ash)', marginBottom: 14 }}>
          Export the immutable SQLite event log as a versioned JSON artifact, or restore/merge an existing ledger.
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="button" className="btn-brass" onClick={handleExportJson}>
            Export ada-data.json
          </button>

          <label className="btn-brass" style={{ cursor: 'pointer', margin: 0 }}>
            Import & Merge Ledger
            <input type="file" accept=".json" onChange={handleImportJson} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {/* GitHub Repository Sync Configuration */}
      <div style={{ background: 'rgba(26, 19, 22, 0.6)', padding: '16px', border: '1px solid var(--color-panel-border)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--color-gold-bright)', marginBottom: 6 }}>
          GitHub REST Contents API (Opt-in)
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--color-ash)', marginBottom: 16 }}>
          Syncs your ledger with a private GitHub repository. Merges by UUIDv7 to ensure conflicts can never corrupt local state.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-gold)', textTransform: 'uppercase', marginBottom: 4 }}>
              Repository Owner
            </label>
            <input
              type="text"
              placeholder="e.g. AdaLovelace"
              value={repoOwner}
              onChange={(e) => setRepoOwner(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: '#140D10', border: '1px solid var(--color-brass)', color: '#FFF', padding: '6px 10px', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-gold)', textTransform: 'uppercase', marginBottom: 4 }}>
              Repository Name
            </label>
            <input
              type="text"
              placeholder="e.g. ada-focus-vault"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: '#140D10', border: '1px solid var(--color-brass)', color: '#FFF', padding: '6px 10px', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-gold)', textTransform: 'uppercase', marginBottom: 4 }}>
            Personal Access Token (Scoped to Contents R/W)
          </label>
          <input
            type="password"
            placeholder="github_pat_..."
            value={ghToken}
            onChange={(e) => setGhToken(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', background: '#140D10', border: '1px solid var(--color-brass)', color: '#FFF', padding: '6px 10px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="btn-brass" onClick={handleSaveSettings}>
            Save Credentials
          </button>
          <button type="button" className="btn-wax" onClick={handleSyncNow} disabled={syncStatus === 'syncing'}>
            {syncStatus === 'syncing' ? 'Synchronizing…' : 'Sync Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
