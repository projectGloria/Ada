/**
 * @file Single source of truth finite-state machine (FSM) for Ada Focus Sessions.
 * Strictly models transitions: idle -> running -> (paused) -> completed | failed
 */

import { getBuildingTypeForDuration } from '../models/types.js';

/**
 * Calculates current construction stage based on completion percentage.
 * @param {number} percent 0 to 100
 * @returns {import('../models/types.js').ConstructionStage}
 */
export function calculateStage(percent) {
  if (percent >= 100) return 'completed';
  if (percent >= 75) return 'roof';
  if (percent >= 45) return 'walls';
  if (percent >= 20) return 'scaffolding';
  return 'foundation';
}

/**
 * Calculates pre-decimal earnings: 1 shilling (12d) per 5 focused minutes + 1s bonus
 * @param {number} totalMinutes
 * @returns {number} Integer pence
 */
export function calculateEarningsPence(totalMinutes) {
  // 12d per 5 minutes = 2.4 pence per minute
  const basePence = Math.floor((totalMinutes / 5) * 12);
  const completionBonusPence = 12; // 1 shilling completion bonus
  return basePence + completionBonusPence;
}

export const initialTimerState = {
  status: 'idle',
  sessionId: null,
  targetDurationMinutes: 25,
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  elapsedSeconds: 0,
  strictness: 'lenient',
  tagId: 'work',
  buildingType: 'terrace',
  currentStage: 'foundation',
  failureReason: null,
  earnedPence: null,
  activeProcessName: null,
  gracePeriodSeconds: 10,
  isGraceActive: false
};

/**
 * @param {import('../models/types.js').TimerState} state
 * @param {Object} action
 * @returns {import('../models/types.js').TimerState}
 */
export function timerReducer(state, action) {
  switch (action.type) {
    case 'SET_DURATION': {
      if (state.status !== 'idle') return state;
      const minutes = Math.max(1, Math.min(300, action.payload));
      return {
        ...state,
        targetDurationMinutes: minutes,
        totalSeconds: minutes * 60,
        remainingSeconds: minutes * 60,
        elapsedSeconds: 0,
        buildingType: getBuildingTypeForDuration(minutes),
        currentStage: 'foundation'
      };
    }

    case 'SET_STRICTNESS': {
      if (state.status !== 'idle') return state;
      return {
        ...state,
        strictness: action.payload
      };
    }

    case 'SET_TAG': {
      if (state.status !== 'idle') return state;
      return {
        ...state,
        tagId: action.payload
      };
    }

    case 'START_SESSION': {
      if (state.status !== 'idle') return state;
      const totalSecs = state.targetDurationMinutes * 60;
      return {
        ...state,
        status: 'running',
        sessionId: action.payload.sessionId,
        totalSeconds: totalSecs,
        remainingSeconds: totalSecs,
        elapsedSeconds: 0,
        currentStage: 'foundation',
        failureReason: null,
        earnedPence: null,
        isGraceActive: false,
        gracePeriodSeconds: 10
      };
    }

    case 'TICK': {
      if (state.status !== 'running') return state;
      const nextRemaining = Math.max(0, state.remainingSeconds - 1);
      const nextElapsed = state.elapsedSeconds + 1;
      const percent = (nextElapsed / state.totalSeconds) * 100;

      return {
        ...state,
        remainingSeconds: nextRemaining,
        elapsedSeconds: nextElapsed,
        currentStage: calculateStage(percent)
      };
    }

    case 'PAUSE': {
      if (state.status !== 'running') return state;
      return {
        ...state,
        status: 'paused'
      };
    }

    case 'RESUME': {
      if (state.status !== 'paused') return state;
      return {
        ...state,
        status: 'running'
      };
    }

    case 'TRIGGER_GRACE': {
      if (state.status !== 'running') return state;
      return {
        ...state,
        isGraceActive: true,
        gracePeriodSeconds: 10,
        activeProcessName: action.payload?.processName || 'Disallowed Application'
      };
    }

    case 'CLEAR_GRACE': {
      return {
        ...state,
        isGraceActive: false,
        gracePeriodSeconds: 10,
        activeProcessName: null
      };
    }

    case 'GRACE_TICK': {
      if (!state.isGraceActive || state.status !== 'running') return state;
      return {
        ...state,
        gracePeriodSeconds: Math.max(0, state.gracePeriodSeconds - 1)
      };
    }

    case 'FAIL_SESSION': {
      if (state.status !== 'running' && state.status !== 'paused') return state;
      return {
        ...state,
        status: 'failed',
        failureReason: action.payload.reason || 'manual_give_up',
        currentStage: 'ruin',
        isGraceActive: false
      };
    }

    case 'COMPLETE_SESSION': {
      if (state.status !== 'running') return state;
      const earnings = calculateEarningsPence(state.targetDurationMinutes);
      return {
        ...state,
        status: 'completed',
        remainingSeconds: 0,
        currentStage: 'completed',
        earnedPence: earnings,
        isGraceActive: false
      };
    }

    case 'RESET': {
      if (state.status !== 'completed' && state.status !== 'failed') return state;
      const totalSecs = state.targetDurationMinutes * 60;
      return {
        ...state,
        status: 'idle',
        sessionId: null,
        remainingSeconds: totalSecs,
        elapsedSeconds: 0,
        currentStage: 'foundation',
        failureReason: null,
        earnedPence: null,
        isGraceActive: false,
        gracePeriodSeconds: 10
      };
    }

    default:
      return state;
  }
}
