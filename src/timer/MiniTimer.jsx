import React from 'react';
import { formatLsd } from '../models/types.js';

/**
 * Format seconds into MM:SS
 */
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Ultra-compact always-on-top Victorian mini timer widget.
 * @param {Object} props
 * @param {import('../models/types.js').TimerState} props.state
 * @param {Function} props.onGiveUp
 */
export function MiniTimer({ state, onGiveUp }) {
  const { remainingSeconds, status, buildingType, currentStage, isGraceActive, gracePeriodSeconds } = state;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: '#140D10',
        border: '2px solid var(--color-gold)',
        boxShadow: '0 0 15px rgba(0,0,0,0.9)',
        height: '100vh',
        boxSizing: 'border-box'
      }}
    >
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--color-parchment)' }}>
          {formatTime(remainingSeconds)}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-gold)', textTransform: 'uppercase' }}>
          {status === 'running' ? `${buildingType} • ${currentStage}` : status}
        </div>
      </div>

      <div>
        {status === 'running' && (
          <button
            type="button"
            className="btn-brass"
            onClick={onGiveUp}
            style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: 'var(--color-crimson-fail)', color: '#FF9999' }}
          >
            Abandon
          </button>
        )}
      </div>

      {isGraceActive && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(139, 26, 36, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFF',
            fontSize: '0.85rem'
          }}
        >
          Return in {gracePeriodSeconds}s!
        </div>
      )}
    </div>
  );
}
