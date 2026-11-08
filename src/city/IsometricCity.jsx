import React, { useState, useMemo, useRef, useCallback } from 'react';
import { BuildingSvg } from './BuildingSvg.jsx';
import { BUILDING_TIERS, formatLsd } from '../models/types.js';

/**
 * Isometric grid dimensions (2:1 projection)
 */
const TILE_W = 140;
const TILE_H = 70;

/**
 * Transforms grid coordinates (x, y) into isometric 2D canvas coordinates.
 */
function toIso(x, y) {
  return {
    px: (x - y) * (TILE_W / 2),
    py: (x + y) * (TILE_H / 2)
  };
}

/**
 * @param {Object} props
 * @param {Array<import('../models/types.js').SessionRecord>} props.sessions
 * @param {import('../models/types.js').TimerState} [props.activeSessionState]
 */
export function IsometricCity({ sessions = [], activeSessionState = null }) {
  // Pan & Zoom viewport state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 380, y: 140 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [hoveredBuilding, setHoveredBuilding] = useState(null);

  // Group sessions by day and compute isometric grid coordinates
  // useMemo justified: avoids recalculating layout projections on every re-render
  const cityLayout = useMemo(() => {
    // Collect all completed or failed past sessions + optional active building
    const items = [...sessions];

    // Filter by selected month if requested
    const filtered = items.filter(item => {
      if (selectedMonth === 'all') return true;
      const date = new Date(item.started_at);
      const mStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return mStr === selectedMonth;
    });

    // Group items by day (street)
    const dayBuckets = new Map();
    filtered.forEach(session => {
      const dayKey = new Date(session.started_at).toISOString().slice(0, 10);
      if (!dayBuckets.has(dayKey)) {
        dayBuckets.set(dayKey, []);
      }
      dayBuckets.get(dayKey).push(session);
    });

    const placements = [];
    let streetIndex = 0;

    dayBuckets.forEach((daySessions, dayKey) => {
      daySessions.forEach((session, slotIndex) => {
        // Grid coordinates: street along X, buildings along Y
        const gx = streetIndex;
        const gy = slotIndex;
        const { px, py } = toIso(gx, gy);

        placements.push({
          id: session.session_id,
          date: dayKey,
          gx,
          gy,
          px,
          py,
          zIndex: gx + gy,
          buildingType: session.building_type,
          stage: session.status === 'completed' ? 'completed' : 'ruin',
          status: session.status,
          duration: session.duration_minutes,
          earnings: session.earned_pence,
          reason: session.failure_reason,
          tag: session.tag_id
        });
      });
      streetIndex++;
    });

    // Add currently active in-progress session if active
    if (activeSessionState && (activeSessionState.status === 'running' || activeSessionState.status === 'paused')) {
      const activeGx = streetIndex;
      const activeGy = 0;
      const { px, py } = toIso(activeGx, activeGy);

      placements.push({
        id: 'active-session-in-progress',
        date: 'Today',
        gx: activeGx,
        gy: activeGy,
        px,
        py,
        zIndex: activeGx + activeGy + 10,
        buildingType: activeSessionState.buildingType,
        stage: activeSessionState.currentStage,
        status: 'running',
        duration: activeSessionState.targetDurationMinutes,
        earnings: null,
        reason: null,
        tag: activeSessionState.tagId,
        isActive: true
      });
    }

    // Sort by depth (isometric Painter's Algorithm: lowest Y rendered first, closest last)
    placements.sort((a, b) => a.zIndex - b.zIndex);
    return placements;
  }, [sessions, activeSessionState, selectedMonth]);

  // Extract unique months for the filter selector
  const availableMonths = useMemo(() => {
    const months = new Set();
    sessions.forEach(s => {
      const d = new Date(s.started_at);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(months).sort().reverse();
  }, [sessions]);

  // Pan interaction handlers
  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(z => Math.max(0.4, Math.min(2.2, z * zoomFactor)));
  }, []);

  return (
    <div
      className="isometric-city-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 480,
        overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 40%, #1E1519 0%, #100A0C 100%)',
        border: '1px solid var(--color-panel-border)',
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* City Controls Overlay */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          zIndex: 100,
          display: 'flex',
          gap: 10,
          alignItems: 'center'
        }}
      >
        {/* Month District Filter */}
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={{
            background: 'rgba(26, 19, 22, 0.92)',
            color: 'var(--color-parchment)',
            border: '1px solid var(--color-gold)',
            padding: '6px 12px',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem'
          }}
        >
          <option value="all">All Districts (Entire City)</option>
          {availableMonths.map(m => (
            <option key={m} value={m}>District: {m}</option>
          ))}
        </select>

        {/* Zoom controls */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="btn-brass"
            style={{ padding: '4px 10px' }}
            onClick={() => setZoom(z => Math.min(2.2, z * 1.2))}
          >
            +
          </button>
          <button
            type="button"
            className="btn-brass"
            style={{ padding: '4px 10px' }}
            onClick={() => setZoom(z => Math.max(0.4, z * 0.8))}
          >
            -
          </button>
          <button
            type="button"
            className="btn-brass"
            style={{ padding: '4px 10px', fontSize: '0.78rem' }}
            onClick={() => { setZoom(1); setPan({ x: 380, y: 140 }); }}
          >
            Center
          </button>
        </div>
      </div>

      {/* Hover Info Tooltip */}
      {hoveredBuilding && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            zIndex: 100,
            background: 'rgba(26, 19, 22, 0.95)',
            border: '1px solid var(--color-gold)',
            padding: '10px 16px',
            boxShadow: '0 4px 18px rgba(0,0,0,0.8)',
            pointerEvents: 'none'
          }}
        >
          <div style={{ color: 'var(--color-gold-bright)', fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
            {hoveredBuilding.status === 'failed' ? 'Charred Ruin' : hoveredBuilding.buildingType.toUpperCase()}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-ash)', marginTop: 2 }}>
            Constructed: {hoveredBuilding.date} • Duration: {hoveredBuilding.duration}m
          </div>
          {hoveredBuilding.status === 'completed' && hoveredBuilding.earnings != null && (
            <div style={{ fontSize: '0.82rem', color: 'var(--color-gold)' }}>
              Earned: {formatLsd(hoveredBuilding.earnings)}
            </div>
          )}
          {hoveredBuilding.reason && (
            <div style={{ fontSize: '0.8rem', color: 'var(--color-crimson-fail)' }}>
              Collapsed Reason: {hoveredBuilding.reason}
            </div>
          )}
        </div>
      )}

      {/* Pannable & Zoomable Isometric Plane */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          position: 'absolute',
          top: 0,
          left: 0,
          willChange: 'transform'
        }}
      >
        {/* Cobblestone Street Grid Base */}
        <svg width="2400" height="1600" style={{ position: 'absolute', top: -400, left: -600, pointerEvents: 'none' }}>
          <defs>
            <pattern id="isoCobblestone" width="140" height="70" patternUnits="userSpaceOnUse">
              <polygon points="70,0 140,35 70,70 0,35" fill="none" stroke="#2D2025" strokeWidth="0.8" opacity="0.4" />
            </pattern>
          </defs>
          <rect width="2400" height="1600" fill="url(#isoCobblestone)" />
        </svg>

        {/* Empty state prompt if city is new */}
        {cityLayout.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: 180,
              left: -120,
              width: 380,
              textAlign: 'center',
              color: 'var(--color-ash)',
              fontStyle: 'italic',
              background: 'rgba(26, 19, 22, 0.75)',
              padding: '16px',
              border: '1px dashed var(--color-gold-dark)'
            }}
          >
            The streets of Ada lie silent and bare. Complete focus sessions to build your Victorian industrial city.
          </div>
        )}

        {/* Render Isometric Buildings */}
        {cityLayout.map(item => (
          <div
            key={item.id}
            onMouseEnter={() => setHoveredBuilding(item)}
            onMouseLeave={() => setHoveredBuilding(null)}
            style={{
              position: 'absolute',
              left: item.px,
              top: item.py,
              width: 140,
              height: 140,
              transform: 'translate(-50%, -70%)',
              zIndex: item.zIndex,
              cursor: 'pointer',
              transition: 'transform 0.15s ease'
            }}
          >
            {/* Active session pulsing glow */}
            {item.isActive && (
              <div
                style={{
                  position: 'absolute',
                  inset: 10,
                  borderRadius: '50%',
                  boxShadow: '0 0 25px rgba(226, 193, 133, 0.45)',
                  pointerEvents: 'none',
                  animation: 'pulse 1.5s infinite'
                }}
              />
            )}

            <BuildingSvg
              type={item.buildingType}
              stage={item.stage}
              size={140}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
