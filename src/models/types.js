/**
 * @file Data models and JSDoc type contracts for Ada
 * Prepares the codebase for seamless future TypeScript migration.
 */

/**
 * Pre-decimal currency represented as total integer pence.
 * 12d = 1s, 20s = £1 (240d = £1).
 * @typedef {number} Pence
 */

/**
 * Strictness modes for focus enforcement.
 * @typedef {'lenient' | 'strict'} StrictnessMode
 */

/**
 * Failure reasons for focus sessions.
 * @typedef {'app_switch' | 'abandoned' | 'manual_give_up'} FailureReason
 */

/**
 * Victorian Industrial Building Categories based on session length.
 * @typedef {'cottage' | 'terrace' | 'mill' | 'station' | 'cathedral'} BuildingType
 */

/**
 * Construction stages of a building during a live focus session.
 * @typedef {'foundation' | 'scaffolding' | 'walls' | 'roof' | 'completed' | 'ruin'} ConstructionStage
 */

/**
 * Discrete timer states in the session finite-state machine.
 * @typedef {'idle' | 'running' | 'paused' | 'completed' | 'failed'} TimerStatus
 */

/**
 * @typedef {Object} SessionTag
 * @property {string} id
 * @property {string} name
 * @property {string} color
 */

/**
 * @typedef {Object} TimerState
 * @property {TimerStatus} status Current FSM state
 * @property {string|null} sessionId Unique UUIDv7 of the active session
 * @property {number} targetDurationMinutes Total target minutes
 * @property {number} totalSeconds Total duration in seconds
 * @property {number} remainingSeconds Remaining monotonic seconds
 * @property {number} elapsedSeconds Monotonic seconds focused
 * @property {StrictnessMode} strictness Strictness level
 * @property {string} tagId Associated tag id
 * @property {BuildingType} buildingType Building scheduled for construction
 * @property {ConstructionStage} currentStage Current visual stage
 * @property {FailureReason|null} failureReason Reason if failed
 * @property {number|null} earnedPence Integer pence earned on completion
 * @property {string|null} activeProcessName Currently focused OS executable (for monitor)
 * @property {number} gracePeriodSeconds Remaining grace period for lenient mode
 */

/**
 * @typedef {Object} FocusEvent
 * @property {string} id UUIDv7 event identifier
 * @property {string} event_type Event discrimination key
 * @property {number} timestamp Milliseconds since epoch
 * @property {string} device_id Machine UUID
 * @property {Object} payload JSON payload
 */

/**
 * @typedef {Object} BuildingTierConfig
 * @property {BuildingType} type
 * @property {string} name
 * @property {number} minMinutes
 * @property {number} maxMinutes
 * @property {string} description
 */

export const BUILDING_TIERS = [
  { type: 'cottage', name: "Worker's Cottage", minMinutes: 10, maxMinutes: 24, description: 'Modest brick dwelling with smoking hearth' },
  { type: 'terrace', name: 'Terraced House', minMinutes: 25, maxMinutes: 59, description: 'Ornate multi-storey Victorian terrace' },
  { type: 'mill', name: 'Textile Mill', minMinutes: 60, maxMinutes: 119, description: 'Sprawling steam-powered manufacturing mill' },
  { type: 'station', name: 'Railway Station', minMinutes: 120, maxMinutes: 179, description: 'Iron-and-glass grand terminus' },
  { type: 'cathedral', name: 'Cathedral', minMinutes: 180, maxMinutes: Infinity, description: 'Gothic-revival stone monument with spire' }
];

/**
 * Resolves building type based on duration in minutes.
 * @param {number} minutes
 * @returns {BuildingType}
 */
export function getBuildingTypeForDuration(minutes) {
  const match = BUILDING_TIERS.find(tier => minutes >= tier.minMinutes && minutes <= tier.maxMinutes);
  return match ? match.type : 'cottage';
}

/**
 * Formats integer pence into pre-decimal £sd string.
 * Rule: 12d = 1s, 20s = £1 (240d = £1).
 * Negative values formatted as -£X Ys Zd.
 * @param {Pence} pence
 * @returns {string}
 */
export function formatLsd(pence) {
  const isNegative = pence < 0;
  const absPence = Math.abs(Math.round(pence));

  const pounds = Math.floor(absPence / 240);
  const remainderAfterPounds = absPence % 240;
  const shillings = Math.floor(remainderAfterPounds / 12);
  const remainingPence = remainderAfterPounds % 12;

  const sign = isNegative ? '-' : '';

  if (pounds > 0) {
    return `${sign}£${pounds} ${shillings}s ${remainingPence}d`;
  }
  if (shillings > 0) {
    return `${sign}${shillings}s ${remainingPence}d`;
  }
  return `${sign}${remainingPence}d`;
}
