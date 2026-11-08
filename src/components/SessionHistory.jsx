import React from 'react';
import { formatLsd, BUILDING_TIERS } from '../models/types.js';

/**
 * @param {Object} props
 * @param {Array<import('../models/types.js').SessionRecord>} props.sessions
 */
export function SessionHistory({ sessions }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="gothic-card" style={{ textAlign: 'center', color: 'var(--color-ash)', padding: '24px' }}>
        <em>No architectural works recorded yet. Commence a focus session to lay the foundations of your city.</em>
      </div>
    );
  }

  // Show latest 6 sessions descending
  const recent = [...sessions].reverse().slice(0, 6);

  return (
    <div className="gothic-card" style={{ width: '100%', maxWidth: 540 }}>
      <div
        style={{
          fontSize: '0.85rem',
          fontFamily: 'var(--font-display)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--color-gold)',
          marginBottom: 14,
          borderBottom: '1px solid rgba(184, 146, 90, 0.2)',
          paddingBottom: 6
        }}
      >
        Recent Architectural Ledger
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {recent.map((s, index) => {
          const tier = BUILDING_TIERS.find(t => t.type === s.building_type);
          const name = tier ? tier.name : s.building_type;
          const isCompleted = s.status === 'completed';
          const isFailed = s.status === 'failed';

          return (
            <div
              key={s.session_id || index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: 'rgba(0, 0, 0, 0.25)',
                borderLeft: `3px solid ${isCompleted ? 'var(--color-gold)' : isFailed ? 'var(--color-crimson-fail)' : '#777'}`
              }}
            >
              <div>
                <div style={{ fontSize: '0.95rem', color: isCompleted ? 'var(--color-parchment)' : 'var(--color-ash)' }}>
                  {isFailed ? `Ruin (${name})` : name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-ash)' }}>
                  {s.duration_minutes}m • Tag: {s.tag_id}
                  {s.failure_reason && ` • Failed: ${s.failure_reason}`}
                </div>
              </div>

              <div>
                {isCompleted && s.earned_pence != null && (
                  <span style={{ fontSize: '0.9rem', color: 'var(--color-gold-bright)', fontFamily: 'var(--font-display)' }}>
                    +{formatLsd(s.earned_pence)}
                  </span>
                )}
                {isFailed && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-crimson-fail)', fontStyle: 'italic' }}>
                    0d (Ruin)
                  </span>
                )}
                {s.status === 'running' && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-gold)' }}>
                    In progress…
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
