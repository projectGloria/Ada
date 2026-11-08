import React from 'react';

/**
 * Roman numerals for the watch face perimeter.
 */
const ROMAN_HOURS = [
  { num: 'XII', angle: 0 },
  { num: 'I', angle: 30 },
  { num: 'II', angle: 60 },
  { num: 'III', angle: 90 },
  { num: 'IV', angle: 120 },
  { num: 'V', angle: 150 },
  { num: 'VI', angle: 180 },
  { num: 'VII', angle: 210 },
  { num: 'VIII', angle: 240 },
  { num: 'IX', angle: 270 },
  { num: 'X', angle: 300 },
  { num: 'XI', angle: 330 }
];

/**
 * Format seconds into MM:SS
 * @param {number} sec
 * @returns {string}
 */
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * @param {Object} props
 * @param {import('../models/types.js').TimerState} props.state
 */
export function WatchDial({ state }) {
  const { totalSeconds, remainingSeconds, currentStage, status, isGraceActive, gracePeriodSeconds } = state;

  // Hand rotation angle: 360 degrees when full, sweeps down to 0 at completion
  const fraction = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  const handAngle = fraction * 360;

  // Generate 60 tick marks for the perimeter
  const ticks = Array.from({ length: 60 }).map((_, i) => {
    const isMajor = i % 5 === 0;
    const angle = i * 6;
    const rad = (angle - 90) * (Math.PI / 180);
    const rOuter = 162;
    const rInner = isMajor ? 148 : 154;
    const x1 = 180 + rOuter * Math.cos(rad);
    const y1 = 180 + rOuter * Math.sin(rad);
    const x2 = 180 + rInner * Math.cos(rad);
    const y2 = 180 + rInner * Math.sin(rad);
    return { x1, y1, x2, y2, isMajor, angle };
  });

  return (
    <div className="watch-dial-container" style={{ position: 'relative', width: 360, height: 360, margin: '0 auto' }}>
      <svg
        width="360"
        height="360"
        viewBox="0 0 360 360"
        style={{ filter: 'drop-shadow(0 14px 28px rgba(0, 0, 0, 0.75))' }}
      >
        <defs>
          {/* Gilded brass rim gradient */}
          <linearGradient id="bezelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#DFBF82" />
            <stop offset="25%" stopColor="#7A5623" />
            <stop offset="50%" stopColor="#B8925A" />
            <stop offset="75%" stopColor="#5E3F16" />
            <stop offset="100%" stopColor="#DFC28A" />
          </linearGradient>

          {/* Deep enamelled dial face */}
          <radialGradient id="dialFace" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#28171E" />
            <stop offset="65%" stopColor="#1B1015" />
            <stop offset="100%" stopColor="#120A0D" />
          </radialGradient>

          {/* Golden hand gradient */}
          <linearGradient id="handGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#B8925A" />
            <stop offset="50%" stopColor="#F5E4B8" />
            <stop offset="100%" stopColor="#7A5623" />
          </linearGradient>
        </defs>

        {/* Pocket watch crown & bow (top ring) */}
        <path
          d="M 160 14 C 160 5, 200 5, 200 14 L 195 24 L 165 24 Z"
          fill="url(#bezelGrad)"
          stroke="#422912"
          strokeWidth="1.5"
        />
        <circle
          cx="180"
          cy="12"
          r="10"
          fill="none"
          stroke="url(#bezelGrad)"
          strokeWidth="3.5"
        />

        {/* Outer Outer Gilded Bezel */}
        <circle cx="180" cy="180" r="172" fill="url(#bezelGrad)" stroke="#38210D" strokeWidth="2" />
        <circle cx="180" cy="180" r="166" fill="#140D10" />

        {/* Dial Enamel Face */}
        <circle cx="180" cy="180" r="163" fill="url(#dialFace)" stroke="#7A5623" strokeWidth="1.5" />

        {/* Inner Filigree Ring */}
        <circle
          cx="180"
          cy="180"
          r="128"
          fill="none"
          stroke="#B8925A"
          strokeWidth="1"
          strokeDasharray="3, 3"
          opacity="0.45"
        />

        {/* Minute & Second Ticks */}
        {ticks.map((t, idx) => (
          <line
            key={idx}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.isMajor ? '#DFC28A' : '#7A5B2E'}
            strokeWidth={t.isMajor ? 2 : 1}
            opacity={t.isMajor ? 0.9 : 0.6}
          />
        ))}

        {/* Roman Numerals */}
        {ROMAN_HOURS.map(({ num, angle }) => {
          const rad = (angle - 90) * (Math.PI / 180);
          const r = 136;
          const x = 180 + r * Math.cos(rad);
          const y = 180 + r * Math.sin(rad);
          return (
            <text
              key={num}
              x={x}
              y={y + 4}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#E8DCC0"
              fontSize="12"
              fontFamily="var(--font-display)"
              fontWeight="600"
              letterSpacing="1"
            >
              {num}
            </text>
          );
        })}

        {/* Central Escapement / Cog Motif */}
        <g transform="translate(180, 180)" opacity="0.22">
          <circle cx="0" cy="0" r="42" fill="none" stroke="#B8925A" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="28" fill="none" stroke="#B8925A" strokeWidth="1" strokeDasharray="4, 3" />
          {Array.from({ length: 12 }).map((_, i) => (
            <line
              key={i}
              x1="0"
              y1="-44"
              x2="0"
              y2="-38"
              stroke="#B8925A"
              strokeWidth="2"
              transform={`rotate(${i * 30})`}
            />
          ))}
        </g>

        {/* Sweeping Ornate Hand */}
        <g transform={`translate(180, 180) rotate(${handAngle})`}>
          {/* Counterbalance tail */}
          <circle cx="0" cy="22" r="5" fill="url(#handGrad)" />
          <path d="M -2 22 L 2 22 L 1 0 L -1 0 Z" fill="url(#handGrad)" />

          {/* Main spear / fleur hand */}
          <path
            d="M 0 -138 L 4 -105 L 1.5 0 L -1.5 0 L -4 -105 Z"
            fill="url(#handGrad)"
            stroke="#4A2E0D"
            strokeWidth="0.75"
          />
          {/* Fleur-de-lis styled diamond near the tip */}
          <polygon
            points="0,-115 6,-105 0,-95 -6,-105"
            fill="url(#handGrad)"
            stroke="#4A2E0D"
            strokeWidth="0.75"
          />
        </g>

        {/* Center Hub & Ruby Pin */}
        <circle cx="180" cy="180" r="8" fill="url(#bezelGrad)" stroke="#2B150A" strokeWidth="1" />
        <circle cx="180" cy="180" r="3.5" fill="#8B1A24" stroke="#D13B49" strokeWidth="0.75" />
      </svg>

      {/* Digital readout overlay inside dial */}
      <div
        style={{
          position: 'absolute',
          top: 215,
          left: 0,
          right: 0,
          textAlign: 'center',
          pointerEvents: 'none'
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.2rem',
            color: 'var(--color-parchment)',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.9)',
            letterSpacing: '0.08em'
          }}
        >
          {formatTime(remainingSeconds)}
        </div>

        <div
          style={{
            marginTop: 4,
            fontSize: '0.78rem',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            fontFamily: 'var(--font-body)',
            color:
              status === 'failed'
                ? 'var(--color-crimson-fail)'
                : status === 'completed'
                ? 'var(--color-gold-bright)'
                : 'var(--color-gold)'
          }}
        >
          {status === 'failed'
            ? 'Ruin & Smoke'
            : status === 'completed'
            ? 'Gaslit & Complete'
            : currentStage}
        </div>
      </div>

      {/* Lenient grace warning banner */}
      {isGraceActive && (
        <div
          style={{
            position: 'absolute',
            bottom: -35,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-crimson-fail)',
            color: '#FFF',
            padding: '6px 14px',
            border: '1px solid #FF8080',
            fontSize: '0.85rem',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 15px rgba(0,0,0,0.6)',
            animation: 'pulse 1s infinite'
          }}
        >
          ⚠️ Disallowed App! Return in {gracePeriodSeconds}s
        </div>
      )}
    </div>
  );
}
