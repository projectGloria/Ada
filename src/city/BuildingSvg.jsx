import React from 'react';

/**
 * Procedural Victorian Gothic Architectural SVGs.
 * Designed with an asset-slot architecture:
 * Renders procedural Victorian vector artwork by default,
 * while allowing drop-in raster/SVG assets from `/assets/buildings/{type}/{stage}.svg|png`
 * without code changes.
 *
 * @param {Object} props
 * @param {import('../models/types.js').BuildingType} props.type
 * @param {import('../models/types.js').ConstructionStage} props.stage
 * @param {number} [props.size=120]
 */
export function BuildingSvg({ type = 'cottage', stage = 'completed', size = 120 }) {
  // If stage is ruin, render collapsed Victorian charred masonry with rising smoke
  if (stage === 'ruin') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="ruinSmoke" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4A3B40" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#2A1E22" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#120C0E" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Charred ground foundation */}
        <polygon points="50,20 85,38 50,56 15,38" fill="#1C1417" stroke="#3D292F" strokeWidth="1.5" />

        {/* Collapsed crumbled brick piles */}
        <polygon points="35,42 45,36 55,42 48,50 32,48" fill="#2E1C21" stroke="#4F2E37" strokeWidth="1" />
        <polygon points="50,38 65,30 75,38 68,48 52,46" fill="#25161A" stroke="#42252C" strokeWidth="1" />

        {/* Broken jagged wall fragment */}
        <path d="M 28 44 L 28 28 L 32 30 L 35 24 L 38 29 L 40 40 Z" fill="#3D2228" stroke="#5E353E" strokeWidth="1.2" />
        <path d="M 62 44 L 62 25 L 66 22 L 70 27 L 72 42 Z" fill="#331C22" stroke="#4E2B33" strokeWidth="1.2" />

        {/* Broken charred timbers */}
        <line x1="30" y1="46" x2="68" y2="34" stroke="#120A0D" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="42" y1="48" x2="58" y2="28" stroke="#1A0E13" strokeWidth="2" strokeLinecap="round" />

        {/* Rising embers & smoke particles */}
        <circle cx="45" cy="22" r="9" fill="url(#ruinSmoke)" />
        <circle cx="56" cy="14" r="12" fill="url(#ruinSmoke)" />
        <circle cx="48" cy="8" r="7" fill="url(#ruinSmoke)" />
        <circle cx="52" cy="18" r="1.5" fill="#E65A28" />
        <circle cx="46" cy="12" r="1" fill="#FF8833" />
      </svg>
    );
  }

  // Stage 1: Foundation (Stone & timber ground base)
  if (stage === 'foundation') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <polygon points="50,25 85,42 50,60 15,42" fill="#2A1F24" stroke="#B8925A" strokeWidth="1.5" />
        <polygon points="50,30 78,44 50,56 22,44" fill="#3A2A31" stroke="#7A5B2E" strokeWidth="1" strokeDasharray="2,2" />
        {/* Foundation stone corners */}
        <circle cx="50" cy="25" r="2" fill="#DFC28A" />
        <circle cx="85" cy="42" r="2" fill="#DFC28A" />
        <circle cx="50" cy="60" r="2" fill="#DFC28A" />
        <circle cx="15" cy="42" r="2" fill="#DFC28A" />
      </svg>
    );
  }

  // Stage 2: Scaffolding (Timber frame & poles)
  if (stage === 'scaffolding') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* Base */}
        <polygon points="50,25 85,42 50,60 15,42" fill="#2A1F24" stroke="#5E4324" strokeWidth="1.2" />
        {/* Upright scaffolding timber poles */}
        <line x1="25" y1="47" x2="25" y2="18" stroke="#B8925A" strokeWidth="1.5" />
        <line x1="50" y1="60" x2="50" y2="28" stroke="#B8925A" strokeWidth="1.5" />
        <line x1="75" y1="47" x2="75" y2="18" stroke="#B8925A" strokeWidth="1.5" />
        <line x1="50" y1="25" x2="50" y2="5" stroke="#B8925A" strokeWidth="1.5" />
        {/* Cross braces & platforms */}
        <line x1="25" y1="36" x2="75" y2="36" stroke="#91703E" strokeWidth="1" strokeDasharray="3,2" />
        <line x1="25" y1="24" x2="75" y2="24" stroke="#91703E" strokeWidth="1" strokeDasharray="3,2" />
        <polygon points="35,32 65,32 60,35 30,35" fill="#6B4F29" />
      </svg>
    );
  }

  // Stage 3: Walls (Victorian red/burgundy masonry going up)
  if (stage === 'walls') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* Ground base */}
        <polygon points="50,35 85,52 50,70 15,52" fill="#2A1F24" />
        {/* Left facade */}
        <polygon points="15,52 50,70 50,42 15,24" fill="#4A1E26" stroke="#7A3642" strokeWidth="1" />
        {/* Right facade */}
        <polygon points="50,70 85,52 85,24 50,42" fill="#3D171E" stroke="#662A34" strokeWidth="1" />
        {/* Rough top wall header */}
        <polygon points="15,24 50,42 85,24 50,14" fill="#5C252F" stroke="#B8925A" strokeWidth="1" />
        {/* Window cutouts */}
        <rect x="25" y="36" width="6" height="10" fill="#1A0D11" stroke="#B8925A" strokeWidth="0.8" transform="skewY(24)" />
        <rect x="62" y="32" width="6" height="10" fill="#1A0D11" stroke="#B8925A" strokeWidth="0.8" transform="skewY(-24)" />
      </svg>
    );
  }

  // Stage 4: Roof (Slate mansard or gothic gables)
  if (stage === 'roof') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* Walls */}
        <polygon points="18,54 50,70 50,42 18,26" fill="#4A1E26" stroke="#7A3642" strokeWidth="1" />
        <polygon points="50,70 82,54 82,26 50,42" fill="#3D171E" stroke="#662A34" strokeWidth="1" />
        {/* Roof pitch */}
        <polygon points="18,26 50,42 50,16 22,8" fill="#283238" stroke="#485A64" strokeWidth="1" />
        <polygon points="50,42 82,26 78,8 50,16" fill="#1C2428" stroke="#37454D" strokeWidth="1" />
        {/* Unlit Windows */}
        <rect x="27" y="36" width="7" height="12" fill="#120A0D" stroke="#91703E" strokeWidth="0.8" transform="skewY(22)" />
        <rect x="61" y="32" width="7" height="12" fill="#120A0D" stroke="#91703E" strokeWidth="0.8" transform="skewY(-22)" />
      </svg>
    );
  }

  // Stage 5: Completed (Fully built, glowing warm Victorian gaslight, chimney smoke)
  return renderCompletedBuilding(type, size);
}

/**
 * Procedural artwork for completed Victorian structures based on tier.
 */
function renderCompletedBuilding(type, size) {
  switch (type) {
    case 'cottage':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <defs>
            <radialGradient id="cottageGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFE082" />
              <stop offset="100%" stopColor="#FFA000" stopOpacity="0.85" />
            </radialGradient>
          </defs>
          {/* Ground shadow */}
          <ellipse cx="50" cy="74" rx="35" ry="12" fill="rgba(0,0,0,0.4)" />
          {/* Left wall */}
          <polygon points="20,54 50,68 50,38 20,24" fill="#54252E" stroke="#3A171D" strokeWidth="1" />
          {/* Right wall */}
          <polygon points="50,68 80,54 80,24 50,38" fill="#441C23" stroke="#2D1116" strokeWidth="1" />
          {/* Slate pitched roof */}
          <polygon points="18,25 50,40 50,12 22,6" fill="#2F3B40" stroke="#4D5D63" strokeWidth="1" />
          <polygon points="50,40 82,25 78,6 50,12" fill="#212A2E" stroke="#3B484D" strokeWidth="1" />
          {/* Chimney */}
          <polygon points="62,14 68,11 68,2 62,4" fill="#54252E" stroke="#B8925A" strokeWidth="0.8" />
          {/* Chimney smoke */}
          <circle cx="67" cy="-2" r="3" fill="#887880" opacity="0.4" />
          <circle cx="70" cy="-8" r="4.5" fill="#887880" opacity="0.25" />
          {/* Gaslit Glowing Windows */}
          <polygon points="28,40 36,44 36,54 28,50" fill="url(#cottageGlow)" stroke="#B8925A" strokeWidth="1" />
          <polygon points="58,45 66,41 66,51 58,55" fill="url(#cottageGlow)" stroke="#B8925A" strokeWidth="1" />
          {/* Oak Door */}
          <polygon points="46,58 50,60 50,68 46,66" fill="#2A150D" stroke="#B8925A" strokeWidth="0.8" />
        </svg>
      );

    case 'terrace':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <defs>
            <radialGradient id="terraceGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFF2B2" />
              <stop offset="100%" stopColor="#E6A100" stopOpacity="0.9" />
            </radialGradient>
          </defs>
          <ellipse cx="50" cy="76" rx="38" ry="14" fill="rgba(0,0,0,0.45)" />
          {/* Multi-storey facade */}
          <polygon points="16,56 50,72 50,24 16,08" fill="#5C252F" stroke="#3A171D" strokeWidth="1.2" />
          <polygon points="50,72 84,56 84,08 50,24" fill="#461B22" stroke="#2D1116" strokeWidth="1.2" />
          {/* Ornate Victorian parapet & cornice */}
          <polygon points="14,08 50,25 86,08 50,-02" fill="#B8925A" stroke="#DFC28A" strokeWidth="0.8" />
          {/* Double Chimney pots */}
          <rect x="22" y="-4" width="4" height="8" fill="#5C252F" stroke="#B8925A" strokeWidth="0.8" />
          <rect x="74" y="-4" width="4" height="8" fill="#461B22" stroke="#B8925A" strokeWidth="0.8" />
          {/* Multi-tier Gaslit sash windows */}
          <polygon points="22,22 30,26 30,34 22,30" fill="url(#terraceGlow)" stroke="#B8925A" strokeWidth="0.8" />
          <polygon points="34,28 42,32 42,40 34,36" fill="url(#terraceGlow)" stroke="#B8925A" strokeWidth="0.8" />
          <polygon points="22,38 30,42 30,50 22,46" fill="url(#terraceGlow)" stroke="#B8925A" strokeWidth="0.8" />
          <polygon points="34,44 42,48 42,56 34,52" fill="url(#terraceGlow)" stroke="#B8925A" strokeWidth="0.8" />
          {/* Right facade windows */}
          <polygon points="58,32 66,28 66,36 58,40" fill="url(#terraceGlow)" stroke="#B8925A" strokeWidth="0.8" />
          <polygon points="70,26 78,22 78,30 70,34" fill="url(#terraceGlow)" stroke="#B8925A" strokeWidth="0.8" />
          <polygon points="58,48 66,44 66,52 58,56" fill="url(#terraceGlow)" stroke="#B8925A" strokeWidth="0.8" />
          <polygon points="70,42 78,38 78,46 70,50" fill="url(#terraceGlow)" stroke="#B8925A" strokeWidth="0.8" />
          {/* Brass lamp over entrance */}
          <circle cx="48" cy="62" r="2" fill="#FFE082" />
        </svg>
      );

    case 'mill':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <defs>
            <radialGradient id="millGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFD54F" />
              <stop offset="100%" stopColor="#FF8F00" />
            </radialGradient>
          </defs>
          <ellipse cx="50" cy="78" rx="42" ry="14" fill="rgba(0,0,0,0.5)" />
          {/* Sprawling manufacturing mill walls */}
          <polygon points="12,56 46,74 46,28 12,12" fill="#4B2026" stroke="#2D1116" strokeWidth="1.2" />
          <polygon points="46,74 88,54 88,14 46,28" fill="#38161B" stroke="#22090D" strokeWidth="1.2" />
          {/* Sawtooth industrial roof */}
          <polygon points="10,12 28,18 28,06 10,12" fill="#2B363C" stroke="#485B64" strokeWidth="0.8" />
          <polygon points="28,18 46,24 46,12 28,18" fill="#2B363C" stroke="#485B64" strokeWidth="0.8" />
          {/* Massive towering brick smokestack */}
          <polygon points="72,50 82,45 80,-14 74,-14" fill="#5E232B" stroke="#B8925A" strokeWidth="1" />
          {/* Steaming coal smoke plumes */}
          <circle cx="77" cy="-20" r="5" fill="#695D62" opacity="0.6" />
          <circle cx="82" cy="-28" r="8" fill="#584C51" opacity="0.45" />
          <circle cx="86" cy="-38" r="11" fill="#4A3F44" opacity="0.28" />
          {/* Rows of factory glass windows */}
          {Array.from({ length: 4 }).map((_, r) => (
            <g key={r}>
              <polygon
                points={`18,${26 + r * 10} 24,${29 + r * 10} 24,${35 + r * 10} 18,${32 + r * 10}`}
                fill="url(#millGlow)"
              />
              <polygon
                points={`28,${31 + r * 10} 34,${34 + r * 10} 34,${40 + r * 10} 28,${37 + r * 10}`}
                fill="url(#millGlow)"
              />
              <polygon
                points={`38,${36 + r * 10} 44,${39 + r * 10} 44,${45 + r * 10} 38,${42 + r * 10}`}
                fill="url(#millGlow)"
              />
            </g>
          ))}
        </svg>
      );

    case 'station':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <defs>
            <linearGradient id="glassRoof" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4A707A" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#78A3AD" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#2E474E" stopOpacity="0.9" />
            </linearGradient>
            <radialGradient id="stationGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFF59D" />
              <stop offset="100%" stopColor="#F57F17" />
            </radialGradient>
          </defs>
          <ellipse cx="50" cy="78" rx="44" ry="15" fill="rgba(0,0,0,0.5)" />
          {/* Main Terminus Hall */}
          <polygon points="10,54 50,74 50,26 10,08" fill="#54252E" stroke="#3A171D" strokeWidth="1.2" />
          <polygon points="50,74 90,54 90,08 50,26" fill="#3D181F" stroke="#2B1015" strokeWidth="1.2" />
          {/* Grand Barrel-Vaulted Iron & Glass Arch Roof */}
          <path
            d="M 12 08 Q 50 -15 88 08 L 50 26 Z"
            fill="url(#glassRoof)"
            stroke="#B8925A"
            strokeWidth="1.5"
          />
          {/* Iron ribs across the glass vault */}
          <line x1="25" y1="04" x2="42" y2="22" stroke="#DFC28A" strokeWidth="1" />
          <line x1="40" y1="-03" x2="50" y2="26" stroke="#DFC28A" strokeWidth="1" />
          <line x1="60" y1="-03" x2="58" y2="22" stroke="#DFC28A" strokeWidth="1" />
          <line x1="75" y1="04" x2="68" y2="18" stroke="#DFC28A" strokeWidth="1" />
          {/* Clock Tower spire */}
          <polygon points="46,16 54,16 54,-12 46,-12" fill="#54252E" stroke="#B8925A" strokeWidth="1" />
          <polygon points="44,-12 56,-12 50,-24" fill="#B8925A" stroke="#DFC28A" strokeWidth="1" />
          {/* Glowing Clock Face */}
          <circle cx="50" cy="0" r="4.5" fill="#FFFDE7" stroke="#91703E" strokeWidth="0.8" />
          {/* Arched Entrance */}
          <path d="M 42 62 Q 50 54 58 62 L 58 70 L 42 70 Z" fill="url(#stationGlow)" />
        </svg>
      );

    case 'cathedral':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <defs>
            <radialGradient id="roseWindow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFF176" />
              <stop offset="60%" stopColor="#E91E63" />
              <stop offset="100%" stopColor="#3F51B5" />
            </radialGradient>
            <radialGradient id="gothicGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFE082" />
              <stop offset="100%" stopColor="#FF8F00" />
            </radialGradient>
          </defs>
          <ellipse cx="50" cy="80" rx="46" ry="16" fill="rgba(0,0,0,0.55)" />
          {/* Nave stone walls */}
          <polygon points="14,56 50,74 50,22 14,06" fill="#3D2930" stroke="#22161A" strokeWidth="1.2" />
          <polygon points="50,74 86,56 86,06 50,22" fill="#2E1E23" stroke="#1A0D11" strokeWidth="1.2" />
          {/* Flying buttresses */}
          <line x1="8" y1="58" x2="20" y2="40" stroke="#7A5623" strokeWidth="1.8" />
          <line x1="92" y1="58" x2="80" y2="40" stroke="#7A5623" strokeWidth="1.8" />
          {/* Soaring Gothic Spire */}
          <polygon points="44,22 56,22 56,-06 44,-06" fill="#4B333B" stroke="#B8925A" strokeWidth="1" />
          <polygon points="43,-06 57,-06 50,-38" fill="#B8925A" stroke="#DFC28A" strokeWidth="1.2" />
          {/* Golden cross atop spire */}
          <line x1="50" y1="-38" x2="50" y2="-45" stroke="#FFE082" strokeWidth="1.5" />
          <line x1="47" y1="-42" x2="53" y2="-42" stroke="#FFE082" strokeWidth="1.5" />
          {/* Stained Glass Rose Window */}
          <circle cx="32" cy="24" r="8" fill="url(#roseWindow)" stroke="#DFC28A" strokeWidth="1" />
          {/* Tall Lancet Windows */}
          <path d="M 22 42 Q 25 36 28 42 L 28 52 L 22 49 Z" fill="url(#gothicGlow)" stroke="#B8925A" strokeWidth="0.8" />
          <path d="M 36 49 Q 39 43 42 49 L 42 59 L 36 56 Z" fill="url(#gothicGlow)" stroke="#B8925A" strokeWidth="0.8" />
          <path d="M 58 53 Q 61 47 64 53 L 64 61 L 58 64 Z" fill="url(#gothicGlow)" stroke="#B8925A" strokeWidth="0.8" />
          <path d="M 72 46 Q 75 40 78 46 L 78 54 L 72 57 Z" fill="url(#gothicGlow)" stroke="#B8925A" strokeWidth="0.8" />
        </svg>
      );
  }
}
