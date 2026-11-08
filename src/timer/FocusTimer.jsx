import React from 'react';
import { WatchDial } from './WatchDial.jsx';
import { BUILDING_TIERS, formatLsd } from '../models/types.js';

/**
 * @param {Object} props
 * @param {import('../models/types.js').TimerState} props.state
 * @param {Function} props.dispatch
 * @param {Function} props.onStartSession
 * @param {Function} props.onGiveUp
 * @param {Function} props.onReset
 */
export function FocusTimer({
  state,
  dispatch,
  onStartSession,
  onGiveUp,
  onReset
}) {
  const isIdle = state.status === 'idle';
  const isRunning = state.status === 'running' || state.status === 'paused';
  const isFinished = state.status === 'completed' || state.status === 'failed';

  const currentTier = BUILDING_TIERS.find(t => t.type === state.buildingType) || BUILDING_TIERS[0];

  return (
    <div className="focus-timer-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      {/* Pocket Watch Dial */}
      <WatchDial state={state} />

      {/* Target Building Info */}
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ color: 'var(--color-gold-bright)', fontSize: '1.25rem', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
          {currentTier.name}
        </div>
        <div style={{ color: 'var(--color-ash)', fontSize: '0.88rem', fontStyle: 'italic', marginTop: 3 }}>
          {currentTier.description}
        </div>
      </div>

      {/* Configuration Controls (Visible in Idle state) */}
      {isIdle && (
        <div className="gothic-card" style={{ width: '100%', maxWidth: 480 }}>
          {/* Duration Presets */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-gold)', marginBottom: 8 }}>
              Prescribed Duration
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {BUILDING_TIERS.map(tier => (
                <button
                  key={tier.type}
                  type="button"
                  className={`btn-brass ${state.targetDurationMinutes === tier.minMinutes ? 'active' : ''}`}
                  style={{
                    padding: '8px 4px',
                    fontSize: '0.85rem',
                    textAlign: 'center',
                    borderColor: state.targetDurationMinutes === tier.minMinutes ? 'var(--color-gold-bright)' : undefined,
                    background: state.targetDurationMinutes === tier.minMinutes ? 'rgba(184, 146, 90, 0.2)' : undefined
                  }}
                  onClick={() => dispatch({ type: 'SET_DURATION', payload: tier.minMinutes })}
                >
                  {tier.minMinutes}m
                </button>
              ))}
            </div>
          </div>

          {/* Strictness Mode Selector */}
          <div>
            <div style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-gold)', marginBottom: 8 }}>
              Discipline Strictness
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="btn-brass"
                style={{
                  flex: 1,
                  borderColor: state.strictness === 'lenient' ? 'var(--color-gold-bright)' : undefined,
                  background: state.strictness === 'lenient' ? 'rgba(184, 146, 90, 0.2)' : undefined
                }}
                onClick={() => dispatch({ type: 'SET_STRICTNESS', payload: 'lenient' })}
              >
                <strong>Lenient</strong>
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>10s Grace Window</div>
              </button>

              <button
                type="button"
                className="btn-brass"
                style={{
                  flex: 1,
                  borderColor: state.strictness === 'strict' ? 'var(--color-gold-bright)' : undefined,
                  background: state.strictness === 'strict' ? 'rgba(184, 146, 90, 0.2)' : undefined
                }}
                onClick={() => dispatch({ type: 'SET_STRICTNESS', payload: 'strict' })}
              >
                <strong>Strict</strong>
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Immediate Collapse</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Primary Actions */}
      <div style={{ display: 'flex', gap: 16 }}>
        {isIdle && (
          <button
            type="button"
            className="btn-wax"
            style={{ padding: '12px 36px', fontSize: '1.05rem' }}
            onClick={onStartSession}
          >
            Commence Construction
          </button>
        )}

        {isRunning && (
          <button
            type="button"
            className="btn-brass"
            style={{
              borderColor: 'var(--color-crimson-fail)',
              color: '#FFB0B0',
              padding: '10px 24px'
            }}
            onClick={onGiveUp}
          >
            Abandon Session (Ruin)
          </button>
        )}

        {isFinished && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: '1rem', color: state.status === 'completed' ? 'var(--color-gold-bright)' : 'var(--color-crimson-fail)' }}>
              {state.status === 'completed'
                ? `Erected! Rewarded ${formatLsd(state.earnedPence || 0)}`
                : `Collapsed into Ruin (${state.failureReason})`}
            </div>
            <button
              type="button"
              className="btn-wax"
              onClick={onReset}
            >
              Begin Anew
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
