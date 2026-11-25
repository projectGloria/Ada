import { ChevronLeft, ChevronRight, Folder, Plus } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { dateLabel, duration, type Project, type Session, type Snapshot, type Task, type TaskStatus } from './workspace'

export type RenderTasks = (tasks: Task[], empty: ReactNode, board?: boolean) => ReactNode

export const statusLabels: Record<TaskStatus, string> = {
  todo: 'To do', inProgress: 'In progress', done: 'Done',
}

function Heading({ title, note, children }: { title: string; note: string; children?: ReactNode }) {
  return <header className="page-header planner-heading">
    <div><h1>{title}<span className="title-period">.</span></h1><p>{note}</p></div>
    {children}
  </header>
}

function dayAt(year: number, month: number, day: number) {
  const date = new Date(0)
  date.setUTCFullYear(year, month, day)
  return date
}

const iso = (date: Date) => date.toISOString().slice(0, 10)
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' })
const calendarSteps: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

export function Calendar({ data, selected, setSelected, tasks, add }: {
  data: Snapshot; selected: string; setSelected: (date: string) => void; tasks: RenderTasks; add: (date: string) => void
}) {
  const [year, month] = selected.split('-').map(Number)
  const first = dayAt(year, month - 1, 1)
  const days = dayAt(year, month, 0).getUTCDate()
  const leading = (first.getUTCDay() + 6) % 7
  const grid = useRef<HTMLDivElement>(null)
  const focusDay = useRef(false)
  useLayoutEffect(() => {
    if (focusDay.current) {
      grid.current?.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({ preventScroll: true })
      focusDay.current = false
    }
  }, [selected])
  const byDate = new Map<string, Task[]>()
  for (const task of data.tasks) {
    if (!task.due) continue
    const list = byDate.get(task.due) ?? []
    list.push(task)
    byDate.set(task.due, list)
  }
  const shiftMonth = (direction: number) => setSelected(iso(dayAt(year, month - 1 + direction, 1)))
  return <div className="content planner-page">
    <Heading title="Calendar" note="See what’s planned and adjust dates from any task." />
    <section className="card calendar-card">
      <div className="calendar-toolbar">
        <h2 aria-live="polite">{dateLabel(iso(first), { month: 'long', year: 'numeric' })}</h2>
        <div className="planner-controls">
          <button className="secondary" onClick={() => setSelected(data.today)}>Today</button>
          <button className="icon-button" title="Previous month" aria-label="Previous month" onClick={() => shiftMonth(-1)} disabled={year === 1 && month === 1}><ChevronLeft size={17} /></button>
          <button className="icon-button" title="Next month" aria-label="Next month" onClick={() => shiftMonth(1)} disabled={year === 9999 && month === 12}><ChevronRight size={17} /></button>
        </div>
      </div>
      <div className="calendar-grid" ref={grid}>
        {Array.from({ length: 7 }, (_, index) => <span className="calendar-weekday" key={index}>{weekday.format(dayAt(2024, 0, index + 1))}</span>)}
        {Array.from({ length: leading }, (_, index) => <span className="calendar-padding" aria-hidden="true" key={'pad' + index} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1
          const date = iso(dayAt(year, month - 1, day))
          const items = byDate.get(date) ?? []
          return <button key={date} className="calendar-day" aria-current={date === data.today ? 'date' : undefined}
            tabIndex={date === selected ? 0 : -1} aria-pressed={date === selected}
            aria-label={dateLabel(date) + (items.length === 1 ? ' · 1 task' : items.length > 1 ? ' · ' + items.length + ' tasks' : '')}
            onClick={() => setSelected(date)}
            onKeyDown={event => {
              const step = calendarSteps[event.key]
              if (!step) return
              event.preventDefault()
              const next = dayAt(year, month - 1, day + step)
              if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) return
              focusDay.current = true
              setSelected(iso(next))
            }}>
            <span className="calendar-number">{day}</span>
            {items.length > 0 && <span className="calendar-count">{items.length}</span>}
            {items.slice(0, 2).map(task => <span className={'calendar-item' + (task.done ? ' completed' : '')} key={task.id}>{task.title}</span>)}
          </button>
        })}
      </div>
    </section>
    <section className="card task-card planner-panel">
      <div className="card-heading"><h2>{dateLabel(selected)}</h2><button className="secondary" onClick={() => add(selected)}><Plus size={15} /> Add task</button></div>
      {tasks(byDate.get(selected) ?? [], <p className="planner-empty">No tasks scheduled for this day.</p>)}
    </section>
  </div>
}

export function Board({ kind, data, tasks }: { kind: 'kanban' | 'matrix'; data: Snapshot; tasks: RenderTasks }) {
  const kanban = kind === 'kanban'
  const columns: { title: string; note?: string; tone: string; match: (task: Task) => boolean }[] = kanban ? [
    { title: statusLabels.todo, tone: 'neutral', match: task => task.status === 'todo' },
    { title: statusLabels.inProgress, tone: 'gold', match: task => task.status === 'inProgress' },
    { title: statusLabels.done, tone: 'sage', match: task => task.status === 'done' },
  ] : [
    { title: 'Do first', note: 'Important and urgent', tone: 'clay', match: task => task.important && task.urgent },
    { title: 'Plan ahead', note: 'Important, less urgent', tone: 'sage', match: task => task.important && !task.urgent },
    { title: 'Handle soon', note: 'Urgent, less important', tone: 'gold', match: task => !task.important && task.urgent },
    { title: 'Set aside', note: 'Neither important nor urgent', tone: 'neutral', match: task => !task.important && !task.urgent },
  ]
  return <div className="content planner-page">
    <Heading title={kanban ? 'Kanban' : 'Priority Matrix'} note={kanban ? 'Move tasks through your workflow.' : 'Sort open tasks by importance and urgency.'} />
    <div className={kanban ? 'planner-board kanban-board' : 'planner-board'}>
      {columns.map(({ title, note, tone, match }) => {
        const items = data.tasks.filter(task => (kanban || !task.done) && match(task))
        return <section className="card task-card board-column" key={title}>
          <div className="board-heading"><h2><i className={tone} />{title}</h2><span className="board-count">{items.length}</span></div>
          {note && <p className="board-note">{note}</p>}
          {tasks(items, <p className="planner-empty">No tasks here.</p>, kanban)}
        </section>
      })}
    </div>
  </div>
}

export function Projects({ data, selected, select, add, archive, tasks, sessions, busy }: {
  data: Snapshot; selected: number | null; select: (id: number) => void; add: () => void
  archive: (project: Project) => void; tasks: RenderTasks; sessions: (items: Session[]) => ReactNode; busy: boolean
}) {
  const project = data.projects.find(item => item.id === selected) ?? data.projects[0]
  const items = project ? data.tasks.filter(task => task.projectId === project.id) : []
  const history = project ? data.sessions.filter(session => session.projectId === project.id) : []
  return <div className="content planner-page">
    <Heading title="Projects" note="See each project’s tasks and the focus time they’ve earned.">
      <button className="primary" onClick={add}><Plus size={16} /> New project</button>
    </Heading>
    {project ? <div className="project-layout">
      <section className="card planner-panel project-list"><h2>All projects</h2>
        {data.projects.map(item => <button key={item.id} className="project-link" aria-pressed={item.id === project.id} onClick={() => select(item.id)}>
          <Folder size={16} /><span>{item.name}</span>{item.archived && <small>Archived</small>}
        </button>)}
      </section>
      <div className="project-detail">
        <section className="card planner-panel">
          <div className="card-heading"><h2>{project.name}</h2><button className="secondary" disabled={busy} onClick={() => archive(project)}>
            {project.archived ? 'Restore project' : 'Archive project'}
          </button></div>
          {project.archived && <p className="field-hint">Archived projects keep their tasks and focus history.</p>}
          <strong className="total">{duration(history.reduce((sum, session) => sum + session.creditedMs, 0))}</strong>
          <p className="time-note">Total focused time</p>
          {sessions(history)}
        </section>
        <section className="card task-card"><div className="card-heading"><h2>Tasks</h2></div>
          {tasks(items, <p className="planner-empty">Assign a task to this project to see it here.</p>)}
        </section>
      </div>
    </div> : <section className="card inline-empty"><Folder size={24} /><strong>No projects yet</strong>
      <p>Create a project for work you want to track together.</p>
    </section>}
  </div>
}

export function Browse({ data, tasks }: { data: Snapshot; tasks: RenderTasks }) {
  const [filter, setFilter] = useState<'completed' | 'overdue' | number>('overdue')
  const selectedTag = data.tags.find(tag => tag.id === filter)
  const items = data.tasks.filter(task => filter === 'completed' ? task.done :
    filter === 'overdue' ? !task.done && task.due !== null && task.due < data.today : task.tagIds.includes(filter))
  return <div className="content planner-page">
    <Heading title="Browse" note="Find overdue work, completed tasks, and tasks by tag." />
    <section className="card planner-panel">
      <div className="choice-row">
        <button className="choice" aria-pressed={filter === 'overdue'} onClick={() => setFilter('overdue')}>Overdue</button>
        <button className="choice" aria-pressed={filter === 'completed'} onClick={() => setFilter('completed')}>Completed</button>
        {data.tags.map(tag => <button className="choice" key={tag.id} aria-pressed={filter === tag.id} onClick={() => setFilter(tag.id)}>{tag.name}</button>)}
      </div>
    </section>
    <section className="card task-card planner-panel"><div className="card-heading">
      <h2>{selectedTag?.name ?? (filter === 'completed' ? 'Completed tasks' : 'Overdue tasks')}</h2>
    </div>{tasks(items, <p className="planner-empty">No matching tasks.</p>)}</section>
  </div>
}
