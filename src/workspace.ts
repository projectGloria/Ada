import { invoke } from '@tauri-apps/api/core'

export type Startup = 'today' | 'focus' | 'town' | 'reports'
export type Page = Startup | 'inbox' | 'upcoming' | 'settings'
export type Preferences = {
  startup: Startup
  theme: 'dark' | 'light' | 'system'
  townVisibility: 'focus' | 'town'
  notifications: boolean
}
export type Settings = Preferences & { onboarded: boolean; lastTargetMs: number | null }
export type Task = { id: number; title: string; due: string | null; done: boolean; tagIds: number[]; lastTagId: number | null }
export type Tag = { id: number; name: string; lot: number; totalMs: number }
export type Session = {
  id: number; tagId: number; taskId: number | null; activity: string; targetMs: number | null
  startedAt: number; endedAt: number | null; runningSince: number | null
  heartbeatAt: number | null; recoveryTo: number | null; creditedMs: number
}
export type Interval = { start: number; end: number }
export type Day = { date: string; totalMs: number; credits: Record<number, number> }
export type Milestone = { stage: number; minutes: number; label: string }
export type Snapshot = {
  now: number; today: string; zone: string; demo: boolean; settings: Settings
  tasks: Task[]; tags: Tag[]; sessions: Session[]; active: Session | null; week: Day[]
  milestones: Milestone[]; sessionIntervals: Record<number, Interval[]>
}
export type Action =
  | { type: 'read' }
  | { type: 'addTask'; title: string; due: string | null; tagIds: number[] }
  | { type: 'complete'; id: number; done: boolean }
  | { type: 'addTag'; name: string }
  | { type: 'start'; taskId: number | null; tagId: number; targetMs: number | null }
  | { type: 'pause' | 'resume' | 'finish' | 'deleteSession'; id: number }
  | { type: 'recover'; id: number; count: boolean }
  | { type: 'correctTag'; id: number; tagId: number }
  | { type: 'correctTask'; id: number; taskId: number | null }
  | ({ type: 'saveSettings' } & Preferences)

export const minute = 60_000
export const send = (action: Action) => invoke<Snapshot>('workspace', { action })

export function duration(ms: number) {
  const minutes = Math.floor(ms / minute)
  if (ms > 0 && minutes === 0) return '< 1 min'
  if (minutes < 60) return minutes + ' min'
  return Math.floor(minutes / 60) + 'h' + (minutes % 60 ? ' ' + minutes % 60 + 'm' : '')
}

export function elapsed(session: Session, now: number) {
  const end = session.recoveryTo === null ? now : session.heartbeatAt ?? now
  const running = session.runningSince === null ? 0 : Math.max(0, end - session.runningSince)
  return Math.min(session.creditedMs + running, session.targetMs ?? Infinity)
}

export function timer(ms: number, countdown: boolean) {
  const seconds = Math.max(0, (countdown ? Math.ceil : Math.floor)(ms / 1000))
  const pad = (value: number) => String(value).padStart(2, '0')
  const hours = Math.floor(seconds / 3600)
  return (hours ? pad(hours) + ':' : '') + pad(Math.floor(seconds / 60) % 60) + ':' + pad(seconds % 60)
}

export function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, options)
}
