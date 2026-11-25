import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, CalendarClock, CalendarDays, Check, ChevronDown,
  CircleHelp, CircleUserRound, Clock3, Crosshair, Focus, Inbox, Layers3, Maximize, Minus, Mountain, Pause, Play,
  Plus, Search, Settings2, Square, Sun, Trees, X, Columns3, Grid2X2, Folder, ListFilter, Repeat, ListChecks,
} from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { lotAt, TownArt, type Lot } from './town-art'
import { Board, Browse, Calendar, Projects, statusLabels } from './planner'
import {
  dateLabel, duration, elapsed, minute, send, timer,
  type Action, type Page, type Preferences, type Session, type Snapshot, type Startup, type Tag, type Task,
  type Project, type TaskDraft, type TaskStatus,
} from './workspace'
import './styles.css'

const windowHandle = getCurrentWindow()
const destinations = [
  { label: 'Planner', links: [
    { page: 'inbox', name: 'Inbox', icon: Inbox }, { page: 'today', name: 'Today', icon: CalendarDays },
    { page: 'upcoming', name: 'Upcoming', icon: CalendarClock },
    { page: 'calendar', name: 'Calendar', icon: CalendarDays },
    { page: 'kanban', name: 'Kanban', icon: Columns3 }, { page: 'matrix', name: 'Priority Matrix', icon: Grid2X2 },
    { page: 'projects', name: 'Projects', icon: Folder }, { page: 'browse', name: 'Browse', icon: ListFilter },
  ] },
  { label: 'Focus & reflection', links: [
    { page: 'focus', name: 'Focus', icon: Focus }, { page: 'town', name: 'Town', icon: Trees },
    { page: 'reports', name: 'Reports', icon: BarChart3 },
  ] },
] as const
const startupOptions: { id: Startup; title: string; note: string; icon: typeof Focus }[] = [
  { id: 'today', title: 'Today', note: 'Tasks and focused time', icon: CalendarDays },
  { id: 'focus', title: 'Focus', note: 'Straight to the timer', icon: Focus },
  { id: 'town', title: 'Town', note: 'Visit your districts', icon: Trees },
  { id: 'reports', title: 'Reports', note: 'Review your time', icon: BarChart3 },
]
const tones = ['clay', 'sage', 'gold', 'mauve']
const numberText = new Intl.NumberFormat()
const emptyLots: { lot: number; stage: number }[] = []
const SaveError = createContext('')

function Badge({ tag }: { tag?: Tag }) {
  return tag ? <span className={'badge ' + tones[tag.lot % tones.length]}><i />{tag.name}</span> : null
}

function IconButton({ label, children, onClick, className = '', disabled = false }: {
  label: string; children: ReactNode; onClick: () => void; className?: string; disabled?: boolean
}) {
  return <button className={'icon-button ' + className} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>
}

function Modal({ title, children, close, variant = '' }: {
  title: string; children: ReactNode; close?: () => void; variant?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const error = useContext(SaveError)
  useEffect(() => {
    const dialog = ref.current!
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-initial]')?.focus()
    return () => { dialog.close(); origin?.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className={variant} aria-label={title} onCancel={event => { event.preventDefault(); close?.() }}
    onClick={event => { if (event.target === ref.current) close?.() }}>
    <article>
      <header className="modal-heading"><h2>{title}</h2>{close && <IconButton label="Close dialog" onClick={close}><X size={18} /></IconButton>}</header>
      {children}
      {error && <p className="modal-error" role="alert">{error}</p>}
    </article>
  </dialog>
}

function Brand() {
  return <span className="brand"><span className="brand-icon"><Layers3 size={16} strokeWidth={2.4} /></span><span>Ada</span></span>
}

function WindowBar() {
  return <header className="window-bar">
    <div className="drag-region" data-tauri-drag-region><Brand /></div>
    <div className="window-controls">
      <IconButton label="Minimize window" onClick={() => void windowHandle.minimize()}><Minus size={15} /></IconButton>
      <IconButton label="Maximize or restore window" onClick={() => void windowHandle.toggleMaximize()}><Square size={11} /></IconButton>
      <IconButton label="Close Ada" className="window-close" onClick={() => void windowHandle.close()}><X size={17} /></IconButton>
    </div>
  </header>
}

type Overlay = 'task' | 'project' | 'search' | 'profile' | 'startup' | 'tag' | 'finish' | null

function App() {
  const [data, setData] = useState<Snapshot>()
  const [page, setPage] = useState<Page>('today')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [taskForm, setTaskForm] = useState<{ id?: number; due?: string; fromSearch?: boolean }>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [calendarDay, setCalendarDay] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [detail, setDetail] = useState<number | null>(null)
  const [chosenTask, setChosenTask] = useState<Task | null>(null)
  const [chosenTag, setChosenTag] = useState<number | null>(null)
  const [target, setTarget] = useState(25)
  const [custom, setCustom] = useState('25')
  const [district, setDistrict] = useState<number | null>(null)
  const [reportDay, setReportDay] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const lastData = useRef<Snapshot>(undefined)
  const pending = useRef(false)
  const pane = useRef<HTMLElement>(null)
  const navigation = useRef<HTMLElement>(null)
  const scroll = useRef<Partial<Record<Page, number>>>({})
  const revision = useRef(0)
  const focusHeading = useRef(false)
  const ready = data !== undefined

  function accept(snapshot: Snapshot) {
    lastData.current = snapshot
    setData(snapshot)
    setNow(Date.now())
  }

  async function save(action: Action) {
    if (pending.current) return
    pending.current = true
    revision.current += 1
    setBusy(true)
    setError('')
    try {
      const snapshot = await send(action)
      accept(snapshot)
      return snapshot
    } catch (cause) {
      setError('Ada could not save this change. ' + String(cause))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  useEffect(() => {
    let closed = false
    let reading = false
    async function refresh() {
      if (pending.current || reading) return
      reading = true
      const requestRevision = revision.current
      try {
        const snapshot = await send({ type: 'read' })
        if (closed || pending.current || requestRevision !== revision.current) return
        const old = lastData.current
        if (!old) {
          setPage(snapshot.active ? 'focus' : snapshot.settings.startup)
          if (!snapshot.settings.onboarded) setOverlay('startup')
          const minutes = snapshot.settings.lastTargetMs === null ? 0 : snapshot.settings.lastTargetMs / minute
          setTarget([0, 15, 25, 50].includes(minutes) ? minutes : -1)
          setCustom(String(minutes || 25))
        } else if (old.active && !snapshot.active) {
          const session = snapshot.sessions.find(item => item.id === old.active?.id)
          setOverlay(current => current === 'finish' ? null : current)
          if (session) setNotice('Focus saved · ' + duration(session.creditedMs))
        }
        accept(snapshot)
      } catch (cause) {
        if (!closed) setError('Ada could not read your local workspace. ' + String(cause))
      } finally {
        reading = false
      }
    }
    void refresh()
    const sync = window.setInterval(refresh, 2200)
    const display = window.setInterval(() => setNow(Date.now()), 240)
    const onVisible = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      closed = true
      window.clearInterval(sync)
      window.clearInterval(display)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.metaKey && ['k', 'n'].includes(event.key.toLowerCase())) {
        event.preventDefault()
        if (!document.querySelector('dialog[open]') && lastData.current) {
          if (event.key.toLowerCase() === 'k') setOverlay('search')
          else openTask({})
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (pane.current) pane.current.scrollTop = scroll.current[page] ?? 0
    if (focusHeading.current) {
      const heading = pane.current?.querySelector('h1')
      if (heading) {
        heading.tabIndex = -1
        heading.focus({ preventScroll: true })
      }
      focusHeading.current = false
    }
  }, [page])

  useEffect(() => {
    navigation.current?.querySelector('[aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [page, ready])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 6500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const go = (next: Page) => {
    if (pane.current) scroll.current[page] = pane.current.scrollTop
    if (next !== page) focusHeading.current = true
    setPage(next)
    setDetail(null)
  }

  function configure(task: Task | null = null, tag: number | null = null) {
    setChosenTask(task)
    const preferred = tag ?? task?.lastTagId ?? null
    setChosenTag(task?.tagIds.length === 1 ? task.tagIds[0] :
      !task?.tagIds.length || task.tagIds.includes(preferred ?? -1) ? preferred : null)
    go('focus')
  }

  function openTask(form: { id?: number; due?: string; fromSearch?: boolean }) {
    setTaskForm(form)
    setOverlay('task')
  }

  const displayNotice = error || notice
  if (!data) return <><WindowBar /><main className="initial">{error || 'Opening your local workspace…'}</main></>

  const active = data.active
  const activeTag = data.tags.find(tag => tag.id === active?.tagId)
  const activeMinutes = active ? elapsed(active, now) : 0
  const constructionTag = activeTag ?? data.tags.find(tag => tag.id === chosenTag && tag.totalMs > 0)
  const constructionMs = (constructionTag?.totalMs ?? 0) + activeMinutes
  const clock = active && timer(active.targetMs === null ? activeMinutes : active.targetMs - activeMinutes, active.targetMs !== null)
  const session = data.sessions.find(item => item.id === detail)
  const tagsById = new Map(data.tags.map(tag => [tag.id, tag]))
  const projectsById = new Map(data.projects.map(project => [project.id, project]))
  const projectName = (id: number | null | undefined) => id == null ? undefined : projectsById.get(id)?.name
  const founded = data.tags.filter(tag => tag.totalMs > 0)
  const currentDistrict = founded.find(tag => tag.id === district) ?? founded[0]
  const stage = (ms: number) => data.milestones.filter(item => ms >= item.minutes * minute).at(-1)?.stage ?? 0
  const townLots = founded.map(tag => ({ lot: tag.lot, stage: stage(tag.totalMs), selected: tag.id === currentDistrict?.id }))
  const openToday = data.tasks.filter(task => task.due !== null && task.due <= data.today && !task.done)
  const doneToday = data.tasks.filter(task => task.due === data.today && task.done)
  const todaysTime = data.week.at(-1)?.totalMs ?? 0
  const focusTask = chosenTask && data.tasks.find(task => task.id === chosenTask.id)
  const runningTask = active && data.tasks.find(task => task.id === active.taskId)
  const upcoming = data.tasks.filter(task => task.due !== null && task.due > data.today)
  const upcomingDays = [...new Set(upcoming.map(task => task.due!))].sort()
  const available = focusTask?.tagIds.length ? data.tags.filter(tag => focusTask.tagIds.includes(tag.id)) : data.tags
  const finishedTag = (tagId: number) => { setDistrict(tagId); go('town') }
  const openProject = (id: number) => { setProjectId(id); go('projects') }

  async function changeStatus(task: Task, status: TaskStatus) {
    const hadNext = data!.tasks.some(item => item.previousId === task.id)
    const next = await save({ type: 'setStatus', id: task.id, status })
    const occurrence = next?.tasks.find(item => item.previousId === task.id)
    if (occurrence?.due && !hadNext) {
      setNotice('Next occurrence · ' + dateLabel(occurrence.due, { month: 'short', day: 'numeric' }))
    }
  }

  async function finish() {
    if (!active) return
    const next = await save({ type: 'finish', id: active.id })
    if (!next) return
    const item = next.sessions.find(entry => entry.id === active.id)
    setNotice('Focus saved · ' + duration(item?.creditedMs ?? 0))
    setOverlay(null)
    finishedTag(active.tagId)
  }

  async function recover(count: boolean) {
    if (!active) return
    const next = await save({ type: 'recover', id: active.id, count })
    const saved = next?.sessions.find(item => item.id === active.id)
    if (saved) setNotice('Focus saved · ' + duration(saved.creditedMs))
  }

  function taskList(tasks: Task[], empty: ReactNode, board = false) {
    return tasks.length ? <ul className="tasks">{tasks.map(task => <li className={'task' + (task.done ? ' is-done' : '') + (board ? ' board-task' : '')} key={task.id}>
      <button className="check-task" aria-label={task.done ? 'Reopen ' + task.title : 'Complete ' + task.title}
        title={task.done ? 'Reopen task' : 'Complete task'} aria-pressed={task.done} disabled={busy} onClick={() => void changeStatus(task, task.done ? 'todo' : 'done')}>
        {task.done && <Check size={13} />}
      </button>
      <div className="task-content"><button className="task-title" onClick={() => openTask({ id: task.id })} title="Edit task"><strong>{task.title}</strong></button>
        <span className="task-meta">
          {task.due && task.due < data!.today && !task.done && <span className="overdue">Overdue</span>}
          {task.due && task.due > data!.today && <span>{dateLabel(task.due, { month: 'short', day: 'numeric' })}</span>}
          {!board && task.status === 'inProgress' && <span className="task-in-progress">In progress</span>}
          {task.tagIds.map(id => <Badge key={id} tag={tagsById.get(id)} />)}
          {projectName(task.projectId) && <span className="task-indicator"><Folder size={11} />{projectName(task.projectId)}</span>}
          {task.recurrence && <span className="task-indicator" title={'Repeats ' + task.recurrence}><Repeat size={11} /><span className="visually-hidden">{'Repeats ' + task.recurrence}</span></span>}
          {task.subtasks.length > 0 && <span className="task-indicator"><ListChecks size={12} />{task.subtasks.filter(item => item.done).length}/{task.subtasks.length}</span>}
        </span>
      </div>
      {!task.done && <IconButton label={'Focus on ' + task.title} className="play-task" onClick={() => configure(task)}><Play size={16} /></IconButton>}
      {board && <select className="board-status" aria-label={'Status for ' + task.title} value={task.status} disabled={busy}
        onChange={event => void changeStatus(task, event.target.value as TaskStatus)}>
        {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
      </select>}
    </li>)}</ul> : empty
  }

  return <SaveError.Provider value={error}><div className="app">
    <WindowBar />
    <div className="shell">
      <aside className="sidebar" aria-label="Workspace">
        <button className="profile" title={data.demo ? 'Demo workspace' : 'Local workspace'} onClick={() => setOverlay('profile')}>
          <span className="avatar">{data.demo ? 'D' : 'A'}</span>
          <span className="profile-copy"><strong>{data.demo ? 'Sample week' : 'My workspace'}</strong><small>On this PC</small></span>
          <ChevronDown className="profile-chevron" size={14} />
        </button>
        <div className="quick-actions">
          <button className="nav-link" title="Search (Ctrl+K)" aria-label="Search" onClick={() => setOverlay('search')}><Search size={17} /><span>Search</span><kbd>Ctrl K</kbd></button>
          <button className="primary add-task" title="Add task (Ctrl+N)" aria-label="Add task" onClick={() => openTask({})}><Plus size={18} /><span>Add task</span></button>
        </div>
        <nav className="navigation" ref={navigation} aria-label="Main navigation">
          {destinations.map(group => <div className="nav-group" key={group.label}><div className="nav-heading">{group.label}</div>
            {group.links.map(({ page: id, name, icon: Icon }) =>
              <button className="nav-link" key={id} aria-current={id === page ? 'page' : undefined} aria-label={name} title={name} onClick={() => go(id)}>
                <Icon size={17} /><span>{name}</span>{id === 'inbox' && <small>{data.tasks.filter(task => !task.due && !task.done).length || ''}</small>}
              </button>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          {active && page !== 'focus' && <button className="mini-timer" title="Return to focus" onClick={() => go('focus')}><Clock3 size={16} /><span>{clock}</span></button>}
          <button className="nav-link" title="Settings" aria-label="Settings" aria-current={page === 'settings' ? 'page' : undefined} onClick={() => go('settings')}>
            <Settings2 size={17} /><span>Settings</span>
          </button>
          <div className="local-status"><i /> Stored locally</div>
        </div>
      </aside>

      <main className="pane" ref={pane} id="main">
        {page === 'today' && <div className="content today">
          <header className="page-header">
            <p className="eyebrow"><Sun size={15} /> {dateLabel(data.today)}</p>
            <h1>Today<span className="title-period">.</span></h1>
            <p>Plan a little. Make time for what matters.</p>
          </header>
          <section className={'daily-banner' + (data.settings.townVisibility === 'town' ? ' hide-scene' : '')}>
            <div className="daily-content"><div className="banner-kicker"><Focus size={16} /> Focus time</div>
              <h2>{active ? 'A session is underway' : 'Make room for focus'}</h2>
              <p>{active ? active.activity : 'Pick one thing to work on. Your town will grow as you go.'}</p>
              <button className="primary" onClick={() => active ? go('focus') : configure()}><Play size={15} />{active ? 'Return to Focus' : 'Start focus'}</button>
            </div>
            {data.settings.townVisibility === 'focus' && <div className="banner-scene"><TownArt lots={townLots.length ? townLots : emptyLots} /></div>}
          </section>
          <div className="today-columns">
            <section className="card task-card">
              <div className="card-heading"><h2>Your tasks</h2><IconButton label="Add a task for today" onClick={() => openTask({ due: data.today })}><Plus size={18} /></IconButton></div>
              {taskList([...openToday, ...doneToday], <div className="inline-empty"><CalendarDays size={23} /><strong>Nothing scheduled today</strong><p>Give a task today’s date to see it here.</p><button className="text-button" onClick={() => openTask({ due: data.today })}>Add a task <ArrowRight size={14} /></button></div>)}
            </section>
            <section className="card time-card">
              <div className="card-heading"><h2>Time tracked</h2><IconButton label="Open today’s report" onClick={() => { setReportDay(data.today); go('reports') }}><ArrowUpRight size={17} /></IconButton></div>
              <strong className="total">{duration(todaysTime)}</strong>
              <p className="time-note">Focused today</p>
              <WeekChart data={data} />
            </section>
          </div>
        </div>}

        {(page === 'inbox' || page === 'upcoming') && <div className="content">
          <header className="page-header"><h1>{page === 'inbox' ? 'Inbox' : 'Upcoming'}<span className="title-period">.</span></h1>
            <p>{page === 'inbox' ? 'A place for tasks without a due date.' : 'Tasks scheduled for the days ahead.'}</p>
          </header>
          {page === 'upcoming' && upcomingDays.length ? upcomingDays.map(date => <section className="card task-card planner-panel" key={date}>
            <div className="card-heading"><h2>{dateLabel(date)}</h2><IconButton label={'Add a task for ' + dateLabel(date)} onClick={() => openTask({ due: date })}><Plus size={18} /></IconButton></div>
            {taskList(upcoming.filter(task => task.due === date), null)}
          </section>) : <section className="card task-card">
            <div className="card-heading"><h2>Tasks</h2><IconButton label="Add task" onClick={() => openTask({})}><Plus size={18} /></IconButton></div>
            {taskList(page === 'inbox' ? data.tasks.filter(task => !task.due) : [], <div className="inline-empty"><Inbox size={22} /><strong>No tasks here yet</strong>
              <button className="text-button" onClick={() => openTask({})}>Add a task <ArrowRight size={14} /></button></div>)}
          </section>}
        </div>}

        {page === 'calendar' && <Calendar data={data} selected={calendarDay ?? data.today} setSelected={setCalendarDay} tasks={taskList} add={due => openTask({ due })} />}
        {(page === 'kanban' || page === 'matrix') && <Board kind={page} data={data} tasks={taskList} />}
        {page === 'browse' && <Browse data={data} tasks={taskList} />}
        {page === 'projects' && <Projects data={data} selected={projectId} select={setProjectId} add={() => setOverlay('project')} busy={busy}
          archive={project => void save({ type: 'archiveProject', id: project.id, archived: !project.archived })}
          tasks={taskList} sessions={items => <SessionList sessions={items} tags={tagsById} open={setDetail} zone={data.zone} />} />}

        {page === 'focus' && <div className="content focus-page">
          <header className="page-header"><h1>Focus<span className="title-period">.</span></h1><p>Give one activity your attention and watch it take shape.</p></header>
          <div className={'focus-layout ' + (data.settings.townVisibility === 'town' ? 'single' : '')}>
            <section className="card focus-card">
              {active ? <>
                <div className="session-state"><i className={active.runningSince === null || active.recoveryTo !== null ? 'paused-dot' : ''} />
                  {active.recoveryTo !== null ? 'Needs review' : active.runningSince === null ? 'Paused' : 'In focus'}</div>
                <h2>{active.activity}</h2><div className="focus-meta"><Badge tag={activeTag} />{projectName(active.projectId) && <span className="task-indicator"><Folder size={14} />{projectName(active.projectId)}</span>}</div>
                <div className="timer" aria-label={active.targetMs === null ? 'Elapsed time' : 'Time remaining'}>{clock}</div>
                <div className="timer-actions">
                  <button className="secondary" disabled={busy || active.recoveryTo !== null}
                    onClick={() => void save({ type: active.runningSince === null ? 'resume' : 'pause', id: active.id })}>
                    {active.runningSince === null ? <><Play size={16} /> Resume</> : <><Pause size={16} /> Pause</>}
                  </button>
                  <button className="primary" disabled={busy || active.recoveryTo !== null} onClick={() => void finish()}><Square size={14} /> Finish</button>
                </div>
                {focusTask && focusTask.id !== active.taskId && <div className="another-session">
                  <p>“{focusTask.title}” is ready when you are.</p>
                  <button className="text-button" onClick={() => setOverlay('finish')}>Finish and set up the next session <ArrowRight size={15} /></button>
                </div>}
                {runningTask && <button className="text-button mark-done" disabled={busy || runningTask.done}
                  onClick={() => void changeStatus(runningTask, 'done')}><Check size={15} /> {runningTask.done ? 'Task complete' : 'Mark task complete'}</button>}
              </> : <>
                <h2>{focusTask?.title ?? 'Set up a session'}</h2>
                {focusTask && <div className="focus-meta focus-task-links">
                  {projectName(focusTask.projectId) && <span className="task-indicator"><Folder size={14} />{projectName(focusTask.projectId)}</span>}
                  <button className="text-button remove-task" onClick={() => { setChosenTask(null); setChosenTag(null) }}>Focus without this task</button>
                </div>}
                <fieldset><legend>Focus tag</legend>
                  <div className="choice-row">
                    {available.map(tag => <button className="choice" aria-pressed={chosenTag === tag.id} key={tag.id} onClick={() => setChosenTag(tag.id)}><Badge tag={tag} /></button>)}
                    {!focusTask?.tagIds.length && <button className="choice choice-new" onClick={() => setOverlay('tag')}><Plus size={15} /> New tag</button>}
                  </div>
                  <p className="field-hint">Choose one tag to give this time a district.</p>
                </fieldset>
                <fieldset><legend>Timer</legend><div className="choice-row">
                  {[15, 25, 50, 0, -1].map(item => <button key={item} className="choice" aria-pressed={target === item} onClick={() => setTarget(item)}>
                    {item === 0 ? 'Stopwatch' : item === -1 ? 'Custom' : item + ' min'}
                  </button>)}
                </div>
                {target === -1 && <label className="custom-time"><input aria-label="Custom minutes" type="number" min="1" max="1440" step="1" value={custom} onChange={event => setCustom(event.target.value)} /> minutes</label>}
                </fieldset>
                <button className="primary focus-start" disabled={busy || chosenTag === null || (target === -1 && (!Number.isInteger(Number(custom)) || Number(custom) < 1 || Number(custom) > 1440))}
                  onClick={() => { if (chosenTag !== null) void save({ type: 'start', taskId: focusTask?.id ?? null, tagId: chosenTag, targetMs: target === 0 ? null : (target === -1 ? Number(custom) : target) * minute }) }}>
                  <Play size={16} /> Start focus
                </button>
                {data.sessions.length > 0 && !focusTask && <button className="text-button repeat" onClick={() => {
                  const recent = data.sessions[0]
                  const task = data.tasks.find(task => task.id === recent.taskId && (!task.tagIds.length || task.tagIds.includes(recent.tagId)))
                  configure(task ?? null, recent.tagId)
                }}>
                  Repeat {data.sessions[0].activity} <ArrowRight size={14} />
                </button>}
              </>}
            </section>
            {data.settings.townVisibility === 'focus' && <section className="card construction">
              <TownArt lots={constructionTag ? [{ lot: 0, color: constructionTag.lot, stage: stage(constructionMs) }] : emptyLots} />
              <div><p className="eyebrow"><Mountain size={14} /> Construction</p><h2>{constructionTag?.name || 'Room to grow'}</h2>
                {constructionTag ? <Progress data={data} total={constructionMs} /> : <p>A focus session starts a site for its tag.</p>}
              </div>
            </section>}
          </div>
        </div>}

        {page === 'town' && <div className="content town-page">
          <header className="page-header"><h1>Town<span className="title-period">.</span></h1><p>Every district holds the time you spent on a tag.</p></header>
          <TownMap lots={townLots} select={lot => setDistrict(founded.find(tag => tag.lot === lot)?.id ?? null)} />
          {!currentDistrict ? <section className="card inline-empty town-empty"><Trees size={24} /><strong>A quiet plot of land</strong>
            <p>Finish a focus session to start your first district.</p><button className="primary" onClick={() => configure()}><Play size={15} /> Start focus</button></section> :
            <div className="district-layout">
              <section className="card district-card"><h2>Districts</h2><div className="district-buttons">
                {founded.map(tag => <button key={tag.id} className="choice" aria-pressed={tag.id === currentDistrict.id} onClick={() => setDistrict(tag.id)}><Badge tag={tag} /></button>)}
              </div><strong className="total">{duration(currentDistrict.totalMs)}</strong><Progress data={data} total={currentDistrict.totalMs} /></section>
              <section className="card district-card"><h2>Recent sessions in {currentDistrict.name}</h2>
                <SessionList sessions={data.sessions.filter(entry => entry.tagId === currentDistrict.id).slice(0, 6)} tags={tagsById} open={setDetail} zone={data.zone} />
              </section>
            </div>}
        </div>}

        {page === 'reports' && <Reports data={data} tags={tagsById} open={setDetail} day={reportDay} setDay={setReportDay} />}

        {page === 'settings' && <div className="content settings-page">
          <header className="page-header"><h1>Settings<span className="title-period">.</span></h1><p>Make Ada feel at home on this PC.</p></header>
          <section className="card settings-card"><h2>Preferences</h2>
            <SettingChoice label="Open Ada on" value={data.settings.startup} options={startupOptions.map(item => [item.id, item.title])}
              onChange={value => void save({ type: 'saveSettings', ...data.settings, startup: value as Startup })} />
            <SettingChoice label="Appearance" value={data.settings.theme} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'Follow Windows']]}
              onChange={value => void save({ type: 'saveSettings', ...data.settings, theme: value as Preferences['theme'] })} />
            <SettingChoice label="Show the town" value={data.settings.townVisibility} options={[['focus', 'Focus and Town'], ['town', 'Town page only']]}
              onChange={value => void save({ type: 'saveSettings', ...data.settings, townVisibility: value as Preferences['townVisibility'] })} />
            <label className="setting-row"><span>Countdown notifications</span><input type="checkbox" checked={data.settings.notifications}
              onChange={event => void save({ type: 'saveSettings', ...data.settings, notifications: event.target.checked })} /></label>
            <div className="setting-row"><span>Reporting time zone</span><strong>{data.zone}</strong></div>
          </section>
          <section className="card settings-card"><h2>Workspace</h2><p>Your tasks, sessions, and town are saved on this PC.</p>
            <button className="secondary" onClick={() => setOverlay('profile')}><CircleUserRound size={16} /> View workspace</button>
          </section>
        </div>}
      </main>
    </div>
    <Theme value={data.settings.theme} />

    {displayNotice && !overlay && !session && active?.recoveryTo == null && <div className={'toast ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>
      {error ? <CircleHelp size={17} /> : <Check size={17} />}{displayNotice}
      <IconButton label="Dismiss message" onClick={() => { setError(''); setNotice('') }}><X size={15} /></IconButton>
    </div>}

    {overlay === 'startup' && <StartupDialog settings={data.settings} busy={busy} submit={async startup => {
      const next = await save({ type: 'saveSettings', ...data.settings, startup })
      if (next) { setOverlay(null); if (!active) go(startup) }
    }} />}
    {overlay === 'task' && <TaskEditor tags={data.tags} projects={data.projects} due={taskForm.due}
      task={data.tasks.find(item => item.id === taskForm.id)} busy={busy} close={() => setOverlay(taskForm.fromSearch ? 'search' : null)}
      submit={async draft => {
        if (await save({ type: 'saveTask', id: taskForm.id ?? null, draft })) {
          if (page === 'calendar' && draft.due) setCalendarDay(draft.due)
          setOverlay(taskForm.fromSearch ? 'search' : null)
          setNotice(taskForm.id ? 'Task updated' : 'Task added')
        }
      }} />}
    {overlay === 'project' && <AddProject busy={busy} close={() => setOverlay(null)} submit={async name => {
      const next = await save({ type: 'addProject', name })
      if (next) {
        setProjectId(next.projects.find(project => project.name === name.trim())?.id ?? null)
        setOverlay(null)
      }
    }} />}
    {overlay === 'tag' && <NewTag busy={busy} close={() => setOverlay(null)} submit={async name => {
      const next = await save({ type: 'addTag', name })
      if (!next) return
      setChosenTag(next.tags.find(tag => tag.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null)
      setOverlay(null)
    }} />}
    {overlay === 'search' && <SearchDialog data={data} query={searchQuery} setQuery={setSearchQuery} close={() => setOverlay(null)} task={id => openTask({ id, fromSearch: true })}
      project={id => { setOverlay(null); openProject(id) }}
      tag={id => { setOverlay(null); if (founded.some(tag => tag.id === id)) finishedTag(id); else configure(null, id) }} />}
    {overlay === 'profile' && <Modal title={data.demo ? 'Demo workspace' : 'My workspace'} close={() => setOverlay(null)}>
      <p>{data.demo ? 'This workspace contains sample activity and uses its own local database.' : 'You’re using Ada offline. Your workspace is saved on this PC.'}</p>
      <div className="dialog-actions"><button className="secondary" onClick={() => { setOverlay(null); go('settings') }}><Settings2 size={16} /> Settings</button></div>
    </Modal>}
    {overlay === 'finish' && active && <Modal title="Finish the current session?" close={() => setOverlay(null)}>
      <p>Ada will save the time you’ve already focused on {active.activity}.</p>
      <div className="dialog-actions"><button className="secondary" onClick={() => { setChosenTask(null); setOverlay(null) }}>Return to timer</button>
        <button className="primary" disabled={busy} onClick={async () => { if (await save({ type: 'finish', id: active.id })) { setOverlay(null); setNotice('Focus saved') } }}>Finish session</button></div>
    </Modal>}
    {session && <SessionDetail key={session.id} session={session} data={data} busy={busy} close={() => setDetail(null)}
      save={save} />}
    {!overlay && active?.recoveryTo != null && !session && <Modal title="Review interrupted time">
      <p>Ada last confirmed your timer at <strong>{new Date(active.heartbeatAt!).toLocaleString()}</strong>. It could not verify the timer through <strong>{new Date(active.recoveryTo).toLocaleString()}</strong>.</p>
      <p>Choose whether to credit this interval ({duration(active.recoveryTo - active.heartbeatAt!)}). The countdown limit still applies.</p>
      <div className="dialog-actions">
        <button className="secondary" disabled={busy} onClick={() => void recover(false)}>Exclude this time</button>
        <button className="primary" disabled={busy} onClick={() => void recover(true)}>Count this time</button>
      </div>
    </Modal>}
  </div></SaveError.Provider>
}

function Theme({ value }: { value: Preferences['theme'] }) {
  useEffect(() => { document.documentElement.dataset.theme = value }, [value])
  return null
}

function Progress({ data, total }: { data: Snapshot; total: number }) {
  const next = data.milestones.find(item => item.minutes * minute > total)
  if (!next) return <p className="milestone-finished"><Check size={15} /> First expansion complete</p>
  const previous = data.milestones.filter(item => item.stage < next.stage).at(-1)?.minutes ?? 0
  const percent = ((total / minute - previous) / (next.minutes - previous)) * 100
  const remaining = next.minutes * minute - total
  return <div className="progress">
    <div><span>{next.label}</span><small>{duration(Math.ceil(remaining / minute) * minute)} to go</small></div>
    <progress aria-label={'Progress toward ' + next.label} max={100} value={percent} />
  </div>
}

function WeekChart({ data, select, selected }: { data: Snapshot; select?: (date: string) => void; selected?: string | null }) {
  const max = Math.max(30 * minute, ...data.week.map(day => day.totalMs))
  return <div className={'week-chart ' + (select ? 'interactive' : '')} aria-label="Focused time over the last seven days">
    {data.week.map(day => {
      const label = dateLabel(day.date, { weekday: 'short' })
      const description = label + ', ' + duration(day.totalMs)
      const children = <><span className="bar-area"><i style={{ height: Math.max(4, day.totalMs / max * 100) + '%' }} /></span><span>{label}</span></>
      return select ? <button key={day.date} title={description} aria-label={description} aria-pressed={day.date === selected}
        className={day.date === data.today ? 'current' : ''} onClick={() => select(day.date)}>{children}</button> :
        <div key={day.date} title={description} className={day.date === data.today ? 'current' : ''}>{children}</div>
    })}
  </div>
}

function Reports({ data, tags, open, day, setDay }: {
  data: Snapshot; tags: Map<number, Tag>; open: (id: number) => void
  day: string | null; setDay: (day: string | null) => void
}) {
  const displayed = day ? data.week.filter(item => item.date === day) : data.week
  const credits = new Map<number, number>()
  for (const item of displayed) {
    for (const [id, ms] of Object.entries(item.credits)) {
      credits.set(Number(id), (credits.get(Number(id)) ?? 0) + ms)
    }
  }
  const sessions = data.sessions.filter(item => credits.has(item.id))
  const total = displayed.reduce((sum, item) => sum + item.totalMs, 0)
  return <div className="content reports-page">
    <header className="page-header"><h1>Reports<span className="title-period">.</span></h1><p>See where your focus time went.</p></header>
    <div className="today-columns">
      <section className="card report-card"><div className="card-heading"><h2>{day ? dateLabel(day, { weekday: 'long', day: 'numeric', month: 'short' }) : 'Last seven days'}</h2>
        {day && <button className="text-button" onClick={() => setDay(null)}>View week</button>}</div>
        <strong className="total">{duration(total)}</strong><WeekChart data={data} selected={day} select={setDay} />
      </section>
      <section className="card report-card"><h2>Sessions <span className="count">{numberText.format(sessions.length)}</span></h2>
        <SessionList sessions={sessions} tags={tags} open={open} zone={data.zone} credits={credits} />
      </section>
    </div>
  </div>
}

function SessionList({ sessions, tags, open, zone, credits }: {
  sessions: Session[]; tags: Map<number,Tag>; open: (id: number) => void; zone: string; credits?: Map<number, number>
}) {
  return sessions.length ? <ul className="session-list">{sessions.map(session => <li key={session.id}>
    <button onClick={() => open(session.id)}><div><strong>{session.activity}</strong><small>{new Date(session.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: zone })} · {tags.get(session.tagId)?.name}</small></div>
      <span>{duration(credits?.get(session.id) ?? session.creditedMs)}</span><ArrowUpRight size={14} /></button></li>)}</ul> :
    <p className="no-sessions">Completed focus sessions will appear here.</p>
}

function TownMap({ lots, select }: { lots: Lot[]; select: (lot: number) => void }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<[number, number]>([0, 0])
  const start = useRef<[number, number, number, number] | null>(null)
  const resize = (change: number) => setZoom(value => Math.max(.65, Math.min(2.5, value + change)))
  const fit = () => { setZoom(1); setPan([0, 0]) }
  return <div className="town-map">
    <div className="map-surface" tabIndex={0} role="group" aria-label="Town map. Arrow keys pan, plus and minus zoom, Home fits the town."
      onKeyDown={event => {
        const moves: Record<string, [number, number]> = { ArrowLeft: [40,0], ArrowRight: [-40,0], ArrowUp: [0,40], ArrowDown: [0,-40] }
        const move = moves[event.key]
        if (move) setPan(([x,y]) => [x + move[0], y + move[1]])
        else if (event.key === '+' || event.key === '=') resize(.2)
        else if (event.key === '-') resize(-.2)
        else if (event.key === 'Home') fit()
        else return
        event.preventDefault()
      }}
      onPointerDown={event => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = [event.clientX, event.clientY, ...pan]
      }}
      onPointerMove={event => { if (start.current) setPan([start.current[2] + event.clientX - start.current[0], start.current[3] + event.clientY - start.current[1]]) }}
      onPointerUp={event => {
        const from = start.current
        if (!from || Math.hypot(event.clientX - from[0], event.clientY - from[1]) > 5) return
        const bounds = event.currentTarget.getBoundingClientRect()
        const lot = lotAt(event.clientX - bounds.x, event.clientY - bounds.y, bounds.width, bounds.height, lots, zoom, pan)
        if (lot !== undefined) select(lot)
      }}
      onLostPointerCapture={() => { start.current = null }}>
      <TownArt lots={lots} scale={zoom} pan={pan} />
    </div>
    <div className="map-controls"><IconButton label="Zoom out" onClick={() => resize(-.2)} disabled={zoom <= .65}><Minus size={17} /></IconButton>
      <IconButton label="Zoom in" onClick={() => resize(.2)} disabled={zoom >= 2.5}><Plus size={17} /></IconButton>
      <IconButton label="Fit to town" onClick={fit}><Crosshair size={17} /></IconButton></div>
  </div>
}

function SettingChoice({ label, value, options, onChange }: {
  label: string; value: string; options: string[][]; onChange: (value: string) => void
}) {
  return <label className="setting-row"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>
    {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
  </select></label>
}

function StartupDialog({ settings, busy, submit }: { settings: Preferences; busy: boolean; submit: (value: Startup) => void }) {
  const [selected, setSelected] = useState(settings.startup)
  return <Modal title="Welcome to Ada" variant="welcome">
    <p>Choose where you’d like to land when you open Ada. You can change this in Settings.</p>
    <fieldset className="startup-options"><legend className="visually-hidden">Startup destination</legend>
      {startupOptions.map(({ id, title, note, icon: Icon }) => <label key={id} className="startup-choice">
        <input type="radio" name="startup" checked={selected === id} onChange={() => setSelected(id)} data-initial={id === 'today' ? '' : undefined} />
        <Icon size={19} /><span><strong>{title}</strong><small>{note}</small></span>
      </label>)}
    </fieldset>
    <div className="dialog-actions"><button className="primary" disabled={busy} onClick={() => submit(selected)}>Open Ada <ArrowRight size={16} /></button></div>
  </Modal>
}

function TaskEditor({ task, due, tags, projects, busy, close, submit }: {
  task?: Task; due?: string; tags: Tag[]; projects: Project[]; busy: boolean; close: () => void
  submit: (draft: TaskDraft) => void
}) {
  const [draft, setDraft] = useState<TaskDraft>(task ? {
    title: task.title, due: task.due, notes: task.notes, tagIds: task.tagIds, newTags: [], projectId: task.projectId,
    important: task.important, urgent: task.urgent, recurrence: task.recurrence, subtasks: task.subtasks,
  } : {
    title: '', due: due ?? null, notes: '', tagIds: [], newTags: [], projectId: null,
    important: false, urgent: false, recurrence: null, subtasks: [],
  })
  const [tagNames, setTagNames] = useState('')
  const [subtasks, setSubtasks] = useState(() => draft.subtasks.map((item, key) => ({ ...item, key })))
  const nextSubtask = useRef(subtasks.length)
  const focusSubtask = useRef<number | null>(null)
  const set = <K extends keyof TaskDraft,>(key: K, value: TaskDraft[K]) => setDraft(old => ({ ...old, [key]: value }))
  const editSubtask = (key: number, edit: { title?: string; done?: boolean }) =>
    setSubtasks(items => items.map(item => item.key === key ? { ...item, ...edit } : item))

  return <Modal title={task ? 'Edit task' : 'Add task'} close={close} variant="task-editor">
    <form onSubmit={event => {
      event.preventDefault()
      submit({
        ...draft,
        newTags: tagNames.split(',').map(name => name.trim()).filter(Boolean),
        subtasks: subtasks.filter(item => item.title.trim()).map(({ title, done }) => ({ title, done })),
      })
    }}>
      <label className="form-field">Task name<input value={draft.title} onChange={event => set('title', event.target.value)}
        placeholder="What needs doing?" maxLength={200} required data-initial /></label>
      <div className="editor-grid">
        <label className="form-field">Due date<input type="date" required={draft.recurrence !== null} value={draft.due ?? ''}
          onChange={event => set('due', event.target.value || null)} /></label>
        <label className="form-field">Project<select value={draft.projectId ?? ''} onChange={event => set('projectId', Number(event.target.value) || null)}>
          <option value="">No project</option>
          {projects.filter(project => !project.archived || project.id === draft.projectId).map(project =>
            <option key={project.id} value={project.id}>{project.name}{project.archived ? ' (archived)' : ''}</option>)}
        </select></label>
      </div>
      <details className="editor-details" open={Boolean(task)}>
        <summary>Task details</summary>
        <label className="form-field">Notes<textarea value={draft.notes} maxLength={10000} rows={2}
          onChange={event => set('notes', event.target.value)} /></label>
        <div className="editor-grid">
          <label className="form-field">Repeat<select value={draft.recurrence ?? ''}
            onChange={event => set('recurrence', (event.target.value || null) as TaskDraft['recurrence'])}>
            <option value="">Doesn’t repeat</option><option value="daily">Daily</option>
            <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select></label>
          <fieldset className="priorities"><legend>Priority</legend>
            <label><input type="checkbox" checked={draft.important} onChange={event => set('important', event.target.checked)} /> Important</label>
            <label><input type="checkbox" checked={draft.urgent} onChange={event => set('urgent', event.target.checked)} /> Urgent</label>
          </fieldset>
        </div>
        <fieldset><legend>Tags</legend>
          <div className="choice-row">
            {tags.map(tag => <button type="button" key={tag.id} className="choice" aria-pressed={draft.tagIds.includes(tag.id)}
              onClick={() => set('tagIds', draft.tagIds.includes(tag.id) ? draft.tagIds.filter(id => id !== tag.id) : [...draft.tagIds, tag.id])}><Badge tag={tag} /></button>)}
          </div>
          <label className="form-field">New tags<input value={tagNames} maxLength={500} placeholder="Separate names with commas"
            onChange={event => setTagNames(event.target.value)} /></label>
        </fieldset>
        <fieldset><legend>Subtasks</legend>
          {subtasks.map((item, index) => <div className="subtask-row" key={item.key}>
            <input type="checkbox" checked={item.done} aria-label={'Complete subtask ' + (index + 1)}
              onChange={event => editSubtask(item.key, { done: event.target.checked })} />
            <input ref={input => {
              if (input && focusSubtask.current === item.key) {
                focusSubtask.current = null
                input.focus()
              }
            }} value={item.title} aria-label={'Subtask ' + (index + 1)} placeholder="Subtask name" maxLength={200}
              onChange={event => editSubtask(item.key, { title: event.target.value })} />
            <button type="button" className="icon-button" aria-label={'Remove subtask ' + (index + 1)} title="Remove subtask"
              onClick={() => setSubtasks(items => items.filter(subtask => subtask.key !== item.key))}><X size={15} /></button>
          </div>)}
          <button type="button" className="text-button" onClick={() => {
            const key = nextSubtask.current++
            focusSubtask.current = key
            setSubtasks(items => [...items, { key, title: '', done: false }])
          }}><Plus size={15} /> Add subtask</button>
        </fieldset>
      </details>
      {!draft.due && !task && <p className="field-hint">Tasks without a date go to Inbox.</p>}
      <div className="dialog-actions"><button className="secondary" type="button" onClick={close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy || !draft.title.trim()}>{task ? <Check size={16} /> : <Plus size={16} />}
          {task ? 'Save task' : 'Add task'}</button></div>
    </form>
  </Modal>
}

function AddProject({ busy, close, submit }: { busy: boolean; close: () => void; submit: (name: string) => void }) {
  const [name, setName] = useState('')
  return <Modal title="New project" close={close}><form onSubmit={event => { event.preventDefault(); submit(name) }}>
    <label className="form-field">Project name<input value={name} maxLength={80} required data-initial
      onChange={event => setName(event.target.value)} /></label>
    <div className="dialog-actions"><button className="secondary" type="button" onClick={close}>Cancel</button>
      <button className="primary" disabled={busy || !name.trim()}><Plus size={16} /> Create project</button></div>
  </form></Modal>
}

function NewTag({ busy, close, submit }: { busy: boolean; close: () => void; submit: (name: string) => void }) {
  const [name, setName] = useState('')
  function add(event: FormEvent) { event.preventDefault(); if (name.trim()) submit(name) }
  return <Modal title="New focus tag" close={close}><form onSubmit={add}>
    <label className="form-field">Tag name<input maxLength={40} placeholder="For example, Reading" required value={name} onChange={event => setName(event.target.value)} data-initial /></label>
    <p className="field-hint">The first session you finish with this tag establishes its district.</p>
    <div className="dialog-actions"><button className="primary" disabled={!name.trim() || busy}>Create tag</button></div>
  </form></Modal>
}

function SearchDialog({ data, query, setQuery, close, task, tag, project }: {
  data: Snapshot; query: string; setQuery: (query: string) => void; close: () => void
  task: (id: number) => void; tag: (id: number) => void; project: (id: number) => void
}) {
  const search = query.trim().toLocaleLowerCase()
  const tasks = search ? data.tasks.filter(item => [item.title, item.notes, ...item.subtasks.map(subtask => subtask.title)]
    .some(value => value.toLocaleLowerCase().includes(search))) : []
  const tags = search ? data.tags.filter(item => item.name.toLocaleLowerCase().includes(search)) : []
  const projects = search ? data.projects.filter(item => item.name.toLocaleLowerCase().includes(search)) : []
  return <Modal title="Search workspace" close={close}>
    <input className="search-input" value={query} placeholder="Search tasks, projects, and tags" aria-label="Search tasks, projects, and tags" data-initial
      onChange={event => setQuery(event.target.value)} />
    {search && !tasks.length && !tags.length && !projects.length && <p>No results for “{query}”.</p>}
    <div className="search-results">{tasks.map(item => <button key={'task-' + item.id} onClick={() => task(item.id)}>
      <ListChecks size={15} /><span>{item.title}<small>{item.due ? dateLabel(item.due, { month: 'short', day: 'numeric' }) : 'Inbox'} · {statusLabels[item.status]}</small></span><ArrowDownRight size={15} />
    </button>)}
      {projects.map(item => <button key={'project-' + item.id} onClick={() => project(item.id)}><Folder size={15} /><span>{item.name}<small>{item.archived ? 'Archived project' : 'Project'}</small></span><ArrowDownRight size={15} /></button>)}
      {tags.map(item => <button key={'tag-' + item.id} onClick={() => tag(item.id)}><Trees size={15} />{item.name}<ArrowDownRight size={15} /></button>)}</div>
  </Modal>
}

function SessionDetail({ session, data, busy, close, save }: {
  session: Session; data: Snapshot; busy: boolean; close: () => void; save: (action: Action) => Promise<Snapshot | undefined>
}) {
  const [confirm, setConfirm] = useState(false)
  const [tagId, setTagId] = useState(session.tagId)
  const [taskId, setTaskId] = useState(session.taskId)
  const project = data.projects.find(project => project.id === session.projectId)
  const intervals = data.sessionIntervals[session.id] ?? []
  const formatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: data.zone })
  return <Modal title={session.activity} close={close}>
    <div className="session-summary"><strong className="total">{duration(session.creditedMs)}</strong>
      <p>{new Date(session.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: data.zone })} · {session.targetMs === null ? 'Stopwatch' : duration(session.targetMs) + ' countdown'}
        {project && ' · ' + project.name}</p></div>
    <label className="form-field">District tag<select value={tagId} onChange={event => setTagId(Number(event.target.value))}>
      {data.tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
    </select></label>
    {tagId !== session.tagId && <button className="secondary" disabled={busy} onClick={() => void save({ type: 'correctTag', id: session.id, tagId })}>Save tag correction</button>}
    <label className="form-field">Linked task<select value={taskId ?? ''} onChange={event => setTaskId(event.target.value ? Number(event.target.value) : null)}>
      <option value="">No linked task</option>
      {data.tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
    </select></label>
    {taskId !== session.taskId && <button className="secondary" disabled={busy} onClick={() => void save({ type: 'correctTask', id: session.id, taskId })}>Save linked task</button>}
    <h3>Focused intervals</h3>
    {intervals.length ? <ul className="intervals">{intervals.map(interval => <li key={interval.start}>
      <span>{formatter.format(interval.start)} – {formatter.format(interval.end)}</span><span>{duration(interval.end - interval.start)}</span>
    </li>)}</ul> : <p>No time was credited.</p>}
    {confirm && <p>Delete this session and remove its time from Reports and Town?</p>}
    <div className="dialog-actions split">
      {confirm ? <><button className="danger" disabled={busy} onClick={async () => { if (await save({ type: 'deleteSession', id: session.id })) close() }}>Delete session</button>
        <button className="secondary" onClick={() => setConfirm(false)}>Cancel</button></> :
        <><button className="text-button danger-text" onClick={() => setConfirm(true)}>Delete session</button><button className="secondary" onClick={close}><ArrowLeft size={14} /> Back</button></>}
    </div>
  </Modal>
}

createRoot(document.getElementById('root')!).render(<App />)
