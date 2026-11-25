import { invoke } from '@tauri-apps/api/core'

export type Startup = 'today' | 'focus' | 'town' | 'reports'
export type Page = Startup | 'inbox' | 'upcoming' | 'calendar' | 'kanban' | 'matrix' | 'projects' | 'browse' | 'settings'
export type Preferences = {
  startup: Startup
  theme: 'dark' | 'light' | 'system'
  townVisibility: 'focus' | 'town'
  notifications: boolean
}
export type Settings = Preferences & { onboarded: boolean; lastTargetMs: number | null }
export type TaskStatus = 'todo' | 'inProgress' | 'done'
export type Recurrence = 'daily' | 'weekly' | 'monthly'
export type Subtask = { title: string; done: boolean }
export type TaskDraft = {
  title: string; due: string | null; tagIds: number[]; newTags: string[]; notes: string
  projectId: number | null; important: boolean; urgent: boolean; recurrence: Recurrence | null; subtasks: Subtask[]
}
export type Task = Omit<TaskDraft, 'newTags'> & {
  id: number; done: boolean; status: TaskStatus; lastTagId: number | null; previousId: number | null
  completedAt: number | null
}
export type Project = { id: number; name: string; archived: boolean }
export type Tag = { id: number; name: string; lot: number; totalMs: number; archived: boolean }
export type Session = {
  id: number; tagId: number; taskId: number | null; projectId: number | null; activity: string; targetMs: number | null
  startedAt: number; endedAt: number | null; runningSince: number | null
  heartbeatAt: number | null; recoveryTo: number | null; creditedMs: number
}
export type Interval = { start: number; end: number }
export type Day = { date: string; totalMs: number; credits: Record<number, number> }
export type Milestone = { stage: number; minutes: number; label: string }
export type Snapshot = {
  now: number; today: string; todayStart: number; zone: string; demo: boolean; settings: Settings
  tasks: Task[]; projects: Project[]; tags: Tag[]; sessions: Session[]; active: Session | null; week: Day[]
  milestones: Milestone[]; sessionIntervals: Record<number, Interval[]>
}
export type Action =
  | { type: 'read' }
  | { type: 'saveTask'; id: number | null; draft: TaskDraft }
  | { type: 'complete'; id: number; done: boolean }
  | { type: 'setStatus'; id: number; status: TaskStatus }
  | { type: 'deleteTask'; id: number }
  | { type: 'renameTag'; id: number; name: string }
  | { type: 'archiveTag'; id: number; archived: boolean }
  | { type: 'addProject'; name: string }
  | { type: 'archiveProject'; id: number; archived: boolean }
  | { type: 'addTag'; name: string }
  | { type: 'start'; taskId: number | null; tagId: number; targetMs: number | null }
  | { type: 'pause' | 'resume' | 'finish' | 'deleteSession'; id: number }
  | { type: 'recover'; id: number; count: boolean }
  | { type: 'correctTag'; id: number; tagId: number }
  | { type: 'correctTask'; id: number; taskId: number | null }
  | ({ type: 'saveSettings' } & Preferences)

export const minute = 60_000
export const send = (action: Action) => invoke<Snapshot>('workspace', { action })

export type Counts = { tasks: number; sessions: number; tags: number; projects: number }
export type AccountStep = 'idle' | 'verify' | 'merge' | 'recoveryCode' | 'newPassword' | 'passwordChanged'
  | 'signedIn' | 'signedOut' | 'deleted'
export type AccountView = {
  configured: boolean; demo: boolean; email: string | null; merge: Counts | null
  recovering: boolean; step: AccountStep; reload: boolean
}
export type AccountRequest =
  | { type: 'read' | 'cancelMerge' | 'signOut' }
  | { type: 'signUp' | 'signIn'; email: string; password: string }
  | { type: 'verify' | 'verifyRecovery'; email: string; code: string }
  | { type: 'resend' | 'recover'; email: string }
  | { type: 'setPassword'; password: string }
  | { type: 'chooseMerge'; merge: boolean }
  | { type: 'delete'; password: string }
export const accountRequest = (request: AccountRequest) => invoke<AccountView>('account', { request })

/** Time focused today in the running session, which reports only include once it finishes. */
export function activeToday(data: Snapshot, now: number) {
  const session = data.active
  if (!session) return 0
  const overlap = (start: number, end: number) => Math.max(0, end - Math.max(start, data.todayStart))
  const credited = (data.sessionIntervals[session.id] ?? []).reduce((sum, item) => sum + overlap(item.start, item.end), 0)
  const end = session.recoveryTo === null ? now : session.heartbeatAt ?? now
  const running = session.runningSince === null ? 0 : overlap(session.runningSince, end)
  const limit = session.targetMs === null ? Infinity : Math.max(0, session.targetMs - session.creditedMs)
  return credited + Math.min(running, limit)
}

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
