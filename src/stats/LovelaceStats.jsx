import React, { useMemo } from 'react';

/**
 * Formats minutes into human readable hours & minutes.
 */
function formatHours(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * @param {Object} props
 * @param {Array<import('../models/types.js').SessionRecord>} props.sessions
 * @param {Array<{ id: string, name: string, color: string }>} [props.tags]
 */
export function LovelaceStats({ sessions = [], tags = [] }) {
  // Aggregate statistics
  const stats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneWeekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const oneYearAgo = now.getTime() - 365 * 24 * 60 * 60 * 1000;

    let todayMins = 0;
    let weekMins = 0;
    let monthMins = 0;
    let yearMins = 0;
    let completedCount = 0;
    let failedCount = 0;

    const hourCounts = Array(24).fill(0);
    const tagMinutes = {};

    sessions.forEach(s => {
      const isCompleted = s.status === 'completed';
      if (isCompleted) {
        completedCount++;
        const mins = s.duration_minutes || 0;

        if (s.started_at >= startOfToday) todayMins += mins;
        if (s.started_at >= oneWeekAgo) weekMins += mins;
        if (s.started_at >= oneMonthAgo) monthMins += mins;
        if (s.started_at >= oneYearAgo) yearMins += mins;

        // Hour distribution
        const hour = new Date(s.started_at).getHours();
        hourCounts[hour] += mins;

        // Tag distribution
        const tag = s.tag_id || 'work';
        tagMinutes[tag] = (tagMinutes[tag] || 0) + mins;
      } else if (s.status === 'failed') {
        failedCount++;
      }
    });

    const totalSessions = completedCount + failedCount;
    const successRate = totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 100;

    // Find best hour of the day
    let bestHour = 0;
    let maxHourMins = 0;
    hourCounts.forEach((mins, h) => {
      if (mins > maxHourMins) {
        maxHourMins = mins;
        bestHour = h;
      }
    });

    // Compute longest streak of days with completed sessions
    const completedDays = new Set(
      sessions
        .filter(s => s.status === 'completed')
        .map(s => new Date(s.started_at).toISOString().slice(0, 10))
    );
    const sortedDays = Array.from(completedDays).sort();

    let currentStreak = 0;
    let maxStreak = 0;
    let prevDate = null;

    sortedDays.forEach(dayStr => {
      const curDate = new Date(dayStr);
      if (prevDate) {
        const diffDays = Math.round((curDate - prevDate) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          currentStreak++;
        } else if (diffDays > 1) {
          currentStreak = 1;
        }
      } else {
        currentStreak = 1;
      }
      if (currentStreak > maxStreak) maxStreak = currentStreak;
      prevDate = curDate;
    });

    return {
      todayMins,
      weekMins,
      monthMins,
      yearMins,
      completedCount,
      failedCount,
      successRate,
      bestHour,
      maxStreak,
      hourCounts,
      tagMinutes
    };
  }, [sessions]);

  // Generate GitHub-style yearly heatmap grid (52 weeks x 7 days)
  const heatmapData = useMemo(() => {
    const daysMap = {};
    sessions.forEach(s => {
      if (s.status === 'completed') {
        const dStr = new Date(s.started_at).toISOString().slice(0, 10);
        daysMap[dStr] = (daysMap[dStr] || 0) + (s.duration_minutes || 0);
      }
    });

    const weeks = [];
    const today = new Date();
    // 52 weeks back
    const start = new Date(today);
    start.setDate(today.getDate() - 364);

    for (let w = 0; w < 52; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const current = new Date(start);
        current.setDate(start.getDate() + (w * 7 + d));
        const key = current.toISOString().slice(0, 10);
        const minutes = daysMap[key] || 0;
        week.push({ date: key, minutes });
      }
      weeks.push(week);
    }
    return weeks;
  }, [sessions]);

  return (
    <div className="lovelace-notes gothic-card" style={{ maxWidth: 880, margin: '0 auto', padding: '32px' }}>
      {/* Victorian Analytical Header */}
      <div style={{ textAlign: 'center', borderBottom: '2px solid rgba(184, 146, 90, 0.4)', paddingBottom: 16, marginBottom: 28 }}>
        <div style={{ fontSize: '0.78rem', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-gold)' }}>
          Sketch of the Analytical Engine With Notes by the Translator
        </div>
        <h2 style={{ margin: '4px 0', fontFamily: 'var(--font-display)', color: 'var(--color-gold-bright)', fontSize: '1.6rem', letterSpacing: '0.06em' }}>
          ADA’S MEMORANDA & TEMPORAL PROJECT
        </h2>
        <div style={{ fontSize: '0.82rem', color: 'var(--color-ash)', fontStyle: 'italic' }}>
          Observations on Discipline, Concentration, and the Manufacture of Time
        </div>
      </div>

      {/* NOTE A: Summary Metrics */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: 'var(--color-burgundy)', color: 'var(--color-gold-bright)', padding: '2px 8px', border: '1px solid var(--color-gold)', fontFamily: 'var(--font-display)', fontSize: '0.9rem' }}>
            Note A
          </span>
          <span style={{ fontSize: '1.05rem', fontFamily: 'var(--font-display)', color: 'var(--color-parchment)' }}>
            Summary of Focused Exertion
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div style={{ background: 'rgba(26, 19, 22, 0.7)', padding: '12px', border: '1px solid var(--color-panel-border)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-ash)', textTransform: 'uppercase' }}>Today</div>
            <div style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', color: 'var(--color-gold-bright)', marginTop: 4 }}>
              {formatHours(stats.todayMins)}
            </div>
          </div>

          <div style={{ background: 'rgba(26, 19, 22, 0.7)', padding: '12px', border: '1px solid var(--color-panel-border)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-ash)', textTransform: 'uppercase' }}>7-Day Period</div>
            <div style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', color: 'var(--color-gold-bright)', marginTop: 4 }}>
              {formatHours(stats.weekMins)}
            </div>
          </div>

          <div style={{ background: 'rgba(26, 19, 22, 0.7)', padding: '12px', border: '1px solid var(--color-panel-border)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-ash)', textTransform: 'uppercase' }}>30-Day Period</div>
            <div style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', color: 'var(--color-gold-bright)', marginTop: 4 }}>
              {formatHours(stats.monthMins)}
            </div>
          </div>

          <div style={{ background: 'rgba(26, 19, 22, 0.7)', padding: '12px', border: '1px solid var(--color-panel-border)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-ash)', textTransform: 'uppercase' }}>Yearly Total</div>
            <div style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', color: 'var(--color-gold-bright)', marginTop: 4 }}>
              {formatHours(stats.yearMins)}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
          <div style={{ background: 'rgba(26, 19, 22, 0.5)', padding: '10px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-ash)' }}>Discipline Ratio: </span>
            <strong style={{ color: 'var(--color-parchment)' }}>{stats.successRate}%</strong>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-ash)' }}>({stats.completedCount} erected / {stats.failedCount} ruins)</div>
          </div>

          <div style={{ background: 'rgba(26, 19, 22, 0.5)', padding: '10px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-ash)' }}>Longest Streak: </span>
            <strong style={{ color: 'var(--color-gold-bright)' }}>{stats.maxStreak} Consecutive Days</strong>
          </div>

          <div style={{ background: 'rgba(26, 19, 22, 0.5)', padding: '10px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-ash)' }}>Optimum Hour: </span>
            <strong style={{ color: 'var(--color-parchment)' }}>{stats.bestHour}:00 hrs</strong>
          </div>
        </div>
      </div>

      {/* NOTE B: Yearly Analytical Heatmap */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: 'var(--color-burgundy)', color: 'var(--color-gold-bright)', padding: '2px 8px', border: '1px solid var(--color-gold)', fontFamily: 'var(--font-display)', fontSize: '0.9rem' }}>
            Note B
          </span>
          <span style={{ fontSize: '1.05rem', fontFamily: 'var(--font-display)', color: 'var(--color-parchment)' }}>
            Annual Cadence of Labor (Perforated Ledger)
          </span>
        </div>

        <div style={{ overflowX: 'auto', padding: '12px 0' }}>
          <svg width="780" height="116" viewBox="0 0 780 116">
            {heatmapData.map((week, wIdx) => (
              <g key={wIdx} transform={`translate(${wIdx * 14 + 20}, 10)`}>
                {week.map((day, dIdx) => {
                  let fill = '#1F1518';
                  if (day.minutes >= 120) fill = '#DFC28A';
                  else if (day.minutes >= 60) fill = '#B8925A';
                  else if (day.minutes >= 25) fill = '#7A323F';
                  else if (day.minutes > 0) fill = '#4A1822';

                  return (
                    <rect
                      key={dIdx}
                      y={dIdx * 14}
                      width="10"
                      height="10"
                      rx="1.5"
                      fill={fill}
                      stroke="#140D0F"
                      strokeWidth="1"
                    >
                      <title>{`${day.date}: ${day.minutes} mins focused`}</title>
                    </rect>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* NOTE C: Diurnal 24-Hour Distribution (Hand-Rolled SVG Bar Chart) */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: 'var(--color-burgundy)', color: 'var(--color-gold-bright)', padding: '2px 8px', border: '1px solid var(--color-gold)', fontFamily: 'var(--font-display)', fontSize: '0.9rem' }}>
            Note C
          </span>
          <span style={{ fontSize: '1.05rem', fontFamily: 'var(--font-display)', color: 'var(--color-parchment)' }}>
            Diurnal Productivity Distribution (24-Hour Cycle)
          </span>
        </div>

        <svg width="100%" height="110" viewBox="0 0 720 110" style={{ background: 'rgba(20, 14, 16, 0.6)', border: '1px solid var(--color-panel-border)' }}>
          {(() => {
            const maxVal = Math.max(...stats.hourCounts, 1);
            return stats.hourCounts.map((val, h) => {
              const barHeight = (val / maxVal) * 75;
              const x = h * 29 + 18;
              const y = 85 - barHeight;
              return (
                <g key={h}>
                  <rect
                    x={x}
                    y={y}
                    width="18"
                    height={Math.max(2, barHeight)}
                    fill={h === stats.bestHour && val > 0 ? '#DFC28A' : '#7A2C39'}
                    stroke="#B8925A"
                    strokeWidth="0.5"
                  >
                    <title>{`${h}:00 - ${h}:59: ${val} minutes`}</title>
                  </rect>
                  {h % 3 === 0 && (
                    <text x={x + 9} y="100" textAnchor="middle" fill="#8E7F75" fontSize="9" fontFamily="var(--font-mono)">
                      {h}h
                    </text>
                  )}
                </g>
              );
            });
          })()}
        </svg>
      </div>
    </div>
  );
}
