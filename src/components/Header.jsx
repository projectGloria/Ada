import React from 'react';
import { formatLsd } from '../models/types.js';

/**
 * @param {Object} props
 * @param {number} props.balancePence
 * @param {string} props.deviceId
 */
export function Header({ balancePence, deviceId }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 28px',
        borderBottom: '1px solid rgba(184, 146, 90, 0.25)',
        background: 'linear-gradient(180deg, rgba(35, 23, 27, 0.8) 0%, rgba(18, 12, 14, 0.6) 100%)',
        backdropFilter: 'blur(8px)'
      }}
    >
      {/* Title with Victorian Flourish */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '1.8rem',
              letterSpacing: '0.12em',
              color: 'var(--color-gold-bright)',
              textShadow: '0 2px 10px rgba(0, 0, 0, 0.8)'
            }}
          >
            ADA
          </h1>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-ash)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Focus Engine
          </span>
        </div>
      </div>

      {/* Derived Pre-Decimal Balance & Machine ID */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Pre-decimal Economy Badge */}
        <div
          style={{
            background: 'rgba(26, 19, 22, 0.9)',
            border: '1px solid var(--color-gold)',
            padding: '6px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: 'inset 0 0 8px rgba(184, 146, 90, 0.15)'
          }}
        >
          <span style={{ fontSize: '0.78rem', color: 'var(--color-ash)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Coffers:
          </span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              color: 'var(--color-parchment)',
              letterSpacing: '0.05em'
            }}
          >
            {formatLsd(balancePence)}
          </span>
        </div>

        {/* Device ID pill */}
        <div
          title={`Machine ID: ${deviceId}`}
          style={{
            fontSize: '0.72rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-ash)',
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '4px 8px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 2
          }}
        >
          {deviceId ? `${deviceId.slice(0, 8)}…` : 'connecting…'}
        </div>
      </div>
    </header>
  );
}
