import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  ArrowUpDown, CalendarDays, ChevronDown, ChevronRight, Copy, FilePlus2, FileText, Folder, FolderInput, FolderPlus,
  Hash, ListTree, Link2, NotebookPen, PanelLeft, PanelRight, Pencil, Pin, PinOff, Search, Trash2, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref, type RefObject } from 'react'
import { createExtensions } from './editor/extensions'
import { revealLine } from './editor/format'
import { refreshPreview, setNoteResolver } from './editor/livePreview'
import { setNoteIndex } from './editor/wikilink'
import { ContextMenu, IconButton, Modal, type ContextMenuState } from './ui'
import { openUrl, readNote, searchNotes, type Action, type NoteHit, type NoteMeta, type Snapshot } from './workspace'

type Save = (action: Action) => Promise<Snapshot | undefined>
type SortOrder = 'modified' | 'name' | 'created'
type Dialog =
  | { kind: 'switcher' }
  | { kind: 'move'; note: NoteMeta }
  | { kind: 'rename'; note: NoteMeta }
  | { kind: 'delete'; note: NoteMeta }
  | { kind: 'newFolder'; parent: string }
  | { kind: 'folder'; folder: string }
  | { kind: 'deleteFolder'; folder: string }
  | null
type Tree = { name: string; path: string; folders: Tree[]; notes: NoteMeta[] }

const SAVE_DELAY = 600
const SORT_KEY = 'ada.notes.sortOrder'
const edited = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function readSortOrder(): SortOrder {
  const stored = window.localStorage.getItem(SORT_KEY)
  return stored === 'name' || stored === 'created' || stored === 'modified' ? stored : 'modified'
}

function buildTree(notes: NoteMeta[], explicitFolders: string[], sortOrder: SortOrder): Tree {
  const root: Tree = { name: '', path: '', folders: [], notes: [] }
  const find = (path: string): Tree => {
    if (!path) return root
    let node = root
    let walked = ''
    for (const part of path.split('/')) {
      walked = walked ? walked + '/' + part : part
      let child = node.folders.find(folder => folder.name === part)
      if (!child) {
        child = { name: part, path: walked, folders: [], notes: [] }
        node.folders.push(child)
      }
      node = child
    }
    return node
  }
  for (const path of explicitFolders) find(path)
  for (const note of notes) find(note.folder).notes.push(note)
  const sort = (node: Tree) => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    node.notes.sort((a, b) => sortOrder === 'name'
      ? a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
      : sortOrder === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt)
    node.folders.forEach(sort)
  }
  sort(root)
  return root
}

function countNotes(node: Tree): number {
  return node.notes.length + node.folders.reduce((sum, child) => sum + countNotes(child), 0)
}

function outlineOf(text: string) {
  const items: { level: number; text: string; line: number }[] = []
  let fence = false
  text.split('\n').forEach((row, line) => {
    if (/^\s*(```|~~~)/.test(row)) fence = !fence
    const match = !fence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(row)
    if (match) items.push({ level: match[1].length, text: match[2].replace(/[*_`=]/g, ''), line })
  })
  return items
}

const newUid = () => crypto.randomUUID()

export function Notes({ data, save, selected, select }: {
  data: Snapshot; save: Save; selected: string | null; select: (uid: string | null) => void
}) {
  const notes = data.notes
  const note = notes.find(item => item.uid === selected) ?? null
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<NoteHit[] | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [closed, setClosed] = useState<Set<string>>(() => new Set())
  const [showList, setShowList] = useState(true)
  const [showInfo, setShowInfo] = useState(true)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [text, setText] = useState('')
  const [folder, setFolder] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>(readSortOrder)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const searchInput = useRef<HTMLInputElement>(null)
  const editor = useRef<NoteEditorHandle>(null)

  const titles = useMemo(() => new Set(notes.map(item => item.title.toLowerCase())), [notes])
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of notes) for (const name of item.tags) counts.set(name, (counts.get(name) ?? 0) + 1)
    return counts
  }, [notes])
  const folders = data.noteFolders
  const titleKey = notes.map(item => item.title + '\u0000' + item.folder).join('\u0001')
  const tagKey = [...tags].map(([name, count]) => name + ':' + count).join(' ')

  useEffect(() => {
    setNoteResolver(title => titles.has(title.toLowerCase()))
    setNoteIndex({ titles: notes.map(item => ({ title: item.title, folder: item.folder })), tags })
    editor.current?.refresh()
  }, [titleKey, tagKey])

  // Open the most recent note the first time, and fall back when the open note is deleted elsewhere.
  useEffect(() => {
    if (!note && notes.length && selected === null) select(notes[0].uid)
    else if (selected && !note) select(notes[0]?.uid ?? null)
  }, [selected, note === null, notes.length])

  useEffect(() => { if (note) setFolder(note.folder) }, [note?.uid])

  useEffect(() => {
    const search = query.trim()
    if (!search) { setHits(null); return }
    let stale = false
    const timer = window.setTimeout(() => {
      searchNotes(search).then(result => { if (!stale) setHits(result) }).catch(() => { if (!stale) setHits([]) })
    }, 140)
    return () => { stale = true; window.clearTimeout(timer) }
  }, [query, data.notes])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  function notify(message: string) {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(null), 1800)
  }

  function changeSort(next: SortOrder) {
    setSortOrder(next)
    window.localStorage.setItem(SORT_KEY, next)
  }

  function expand(path: string) {
    if (!path) return
    setClosed(current => {
      const next = new Set(current)
      let walked = ''
      for (const part of path.split('/')) {
        walked = walked ? walked + '/' + part : part
        next.delete(walked)
      }
      return next
    })
  }

  async function duplicate(target: NoteMeta) {
    if (target.uid === selected) await editor.current?.flush()
    try {
      const found = await readNote(target.id)
      await create(target.title + ' copy', target.folder, found.body)
    } catch {
      notify('Could not duplicate note')
    }
  }

  async function create(title = 'Untitled', where = folder, body = '') {
    await editor.current?.flush()
    const uid = newUid()
    const snapshot = await save({ type: 'createNote', uid, title, folder: where, body })
    if (snapshot?.notes.some(item => item.uid === uid)) {
      select(uid)
      if (title === 'Untitled') window.setTimeout(() => document.querySelector<HTMLInputElement>('.note-title')?.select(), 60)
    }
  }

  async function daily() {
    await editor.current?.flush()
    const snapshot = await save({ type: 'dailyNote' })
    const today = snapshot?.notes.find(item => item.folder === 'Daily' && item.title === snapshot.today)
    if (today) select(today.uid)
  }

  async function open(uid: string) {
    if (uid === selected) return
    await editor.current?.flush()
    select(uid)
  }

  function follow(title: string) {
    const target = notes.find(item => item.title.toLowerCase() === title.toLowerCase())
    if (target) void open(target.uid)
    else void create(title.trim(), '')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || document.querySelector('dialog[open]')) return
      const key = event.key.toLowerCase()
      if (key === 'o' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); setDialog({ kind: 'switcher' }) }
      else if (key === 'n' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); void create() }
      else if (key === 'd' && event.shiftKey) { event.preventDefault(); event.stopPropagation(); void daily() }
      else if (key === 'f' && event.shiftKey) {
        event.preventDefault(); event.stopPropagation(); setShowList(true)
        window.setTimeout(() => { searchInput.current?.focus(); searchInput.current?.select() }, 0)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const visible = tag ? notes.filter(item => item.tags.includes(tag)) : notes
  const tree = useMemo(() => buildTree(visible.filter(item => !item.pinned), tag ? [] : folders, sortOrder), [visible, tag, folders, sortOrder])
  const pinned = visible.filter(item => item.pinned)
  const backlinks = note ? notes.filter(item => item.uid !== note.uid && item.links.includes(note.title.toLowerCase())) : []
  const outline = useMemo(() => outlineOf(text), [text])
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  function contextKey(event: ReactKeyboardEvent<HTMLElement>, openAt: (x: number, y: number) => void) {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault(); event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      openAt(rect.left + 24, rect.bottom)
    }
  }

  function openFolderMenu(path: string, x: number, y: number) {
    setMenu({
      x,
      y,
      items: [
        { label: 'New note here', icon: <FilePlus2 size={14} />, onSelect: () => { expand(path); void create('Untitled', path) } },
        { label: 'New subfolder', icon: <FolderPlus size={14} />, onSelect: () => setDialog({ kind: 'newFolder', parent: path }) },
        { separator: true },
        { label: 'Rename folder', icon: <Pencil size={14} />, onSelect: () => setDialog({ kind: 'folder', folder: path }) },
        { separator: true },
        { label: 'Delete folder', icon: <Trash2 size={14} />, danger: true, onSelect: () => setDialog({ kind: 'deleteFolder', folder: path }) },
      ],
    })
  }

  function openNoteMenu(item: NoteMeta, x: number, y: number) {
    setMenu({
      x,
      y,
      items: [
        {
          label: item.pinned ? 'Unpin' : 'Pin to top',
          icon: item.pinned ? <PinOff size={14} /> : <Pin size={14} />,
          onSelect: () => void save({ type: 'pinNote', id: item.id, pinned: !item.pinned }),
        },
        { separator: true },
        { label: 'Rename', icon: <Pencil size={14} />, onSelect: () => setDialog({ kind: 'rename', note: item }) },
        { label: 'Move to folder…', icon: <FolderInput size={14} />, onSelect: () => setDialog({ kind: 'move', note: item }) },
        { label: 'Duplicate', icon: <Copy size={14} />, onSelect: () => void duplicate(item) },
        {
          label: 'Copy link',
          icon: <Link2 size={14} />,
          onSelect: () => { void navigator.clipboard.writeText(`[[${item.title}]]`); notify('Link copied') },
        },
        { separator: true },
        { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => setDialog({ kind: 'delete', note: item }) },
      ],
    })
  }

  function isDragPayload(types: readonly string[]) {
    return types.includes('application/x-ada-note') || types.includes('application/x-ada-folder')
  }

  async function handleDrop(dataTransfer: DataTransfer, targetFolder: string) {
    const noteId = dataTransfer.getData('application/x-ada-note')
    if (noteId) {
      const target = notes.find(item => item.id === Number(noteId))
      if (target && target.folder !== targetFolder) {
        await save({ type: 'moveNote', id: target.id, folder: targetFolder })
        expand(targetFolder)
      }
      return
    }
    const draggedFolder = dataTransfer.getData('application/x-ada-folder')
    if (!draggedFolder) return
    const base = draggedFolder.split('/').pop()
    if (!base) return
    const nextPath = targetFolder ? `${targetFolder}/${base}` : base
    if (draggedFolder === targetFolder || targetFolder.startsWith(`${draggedFolder}/`) || draggedFolder === nextPath) return
    await save({ type: 'renameFolder', from: draggedFolder, to: nextPath })
    expand(targetFolder)
  }

  const row = (item: NoteMeta, depth: number) => <li key={item.uid}>
    <button className="note-row" style={{ paddingLeft: 10 + depth * 14 }} aria-current={item.uid === selected ? 'true' : undefined}
      draggable
      onDragStart={event => { event.dataTransfer.setData('application/x-ada-note', String(item.id)); event.dataTransfer.effectAllowed = 'move' }}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openNoteMenu(item, event.clientX, event.clientY) }}
      onKeyDown={event => contextKey(event, (x, y) => openNoteMenu(item, x, y))}
      onClick={() => void open(item.uid)} title={item.title}>
      <FileText size={14} /><span>{item.title}</span><small>{shortDate.format(item.updatedAt)}</small>
    </button>
  </li>

  const branch = (node: Tree, depth: number): ReactNode => <>
    {node.folders.map(child => {
      const isClosed = closed.has(child.path)
      return <li key={'folder-' + child.path}>
        <div className={'folder-row' + (folder === child.path ? ' is-current' : '') + (dropTarget === child.path ? ' is-dropping' : '')}
          style={{ paddingLeft: 4 + depth * 14 }}
          draggable
          onDragStart={event => { event.dataTransfer.setData('application/x-ada-folder', child.path); event.dataTransfer.effectAllowed = 'move' }}
          onDragOver={event => {
            if (!isDragPayload(event.dataTransfer.types)) return
            event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'
            setDropTarget(child.path)
          }}
          onDragLeave={() => setDropTarget(current => current === child.path ? null : current)}
          onDrop={event => {
            event.preventDefault(); event.stopPropagation(); setDropTarget(null)
            void handleDrop(event.dataTransfer, child.path)
          }}
          onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openFolderMenu(child.path, event.clientX, event.clientY) }}>
          <button className="folder-toggle" aria-expanded={!isClosed}
            onKeyDown={event => contextKey(event, (x, y) => openFolderMenu(child.path, x, y))}
            onClick={() => {
              setFolder(child.path)
              setClosed(current => { const next = new Set(current); if (isClosed) next.delete(child.path); else next.add(child.path); return next })
            }}>
            {isClosed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<Folder size={14} /><span>{child.name}</span>
            <span className="folder-count">{countNotes(child)}</span>
          </button>
          <IconButton label={'New note in ' + child.name} className="folder-action" onClick={() => { expand(child.path); void create('Untitled', child.path) }}><FilePlus2 size={13} /></IconButton>
          <IconButton label={'Rename ' + child.name} className="folder-action" onClick={() => setDialog({ kind: 'folder', folder: child.path })}><Pencil size={13} /></IconButton>
        </div>
        {!isClosed && <ul>{branch(child, depth + 1)}</ul>}
      </li>
    })}
    {node.notes.map(item => row(item, depth))}
  </>

  return <div className={'notes-page' + (showList ? '' : ' list-hidden') + (showInfo && note ? '' : ' info-hidden')}>
    <aside className="notes-list" aria-label="Notes">
      <header className="notes-list-head">
        <h1>Notes<span className="title-period">.</span></h1>
        <button className="icon-button" aria-label="Sort notes" title="Sort notes" onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          setMenu({
            x: rect.left,
            y: rect.bottom + 4,
            items: [
              { label: 'Date modified', active: sortOrder === 'modified', onSelect: () => changeSort('modified') },
              { label: 'Name', active: sortOrder === 'name', onSelect: () => changeSort('name') },
              { label: 'Date created', active: sortOrder === 'created', onSelect: () => changeSort('created') },
            ],
          })
        }}><ArrowUpDown size={15} /></button>
        <IconButton label="New folder" onClick={() => setDialog({ kind: 'newFolder', parent: '' })}><FolderPlus size={16} /></IconButton>
        <IconButton label="Today’s note (Ctrl+Shift+D)" onClick={() => void daily()}><CalendarDays size={16} /></IconButton>
        <IconButton label="New note (Ctrl+N)" onClick={() => void create()}><FilePlus2 size={16} /></IconButton>
      </header>
      <label className="notes-search"><Search size={14} />
        <input ref={searchInput} value={query} placeholder="Search notes" aria-label="Search notes" onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape') setQuery('') }} />
        {query && <IconButton label="Clear search" onClick={() => setQuery('')}><X size={13} /></IconButton>}
      </label>
      {tag && <div className="notes-filter"><Hash size={13} /><span>{tag}</span><IconButton label="Show all notes" onClick={() => setTag(null)}><X size={13} /></IconButton></div>}
      <div className={'notes-scroll' + (dropTarget === '__root__' ? ' is-dropping-root' : '')}
        onContextMenu={event => {
          if ((event.target as HTMLElement).closest('.folder-row, .note-row, .note-tag, .note-hit')) return
          event.preventDefault()
          setMenu({
            x: event.clientX,
            y: event.clientY,
            items: [
              { label: 'New note', icon: <FilePlus2 size={14} />, onSelect: () => void create('Untitled', '') },
              { label: 'New folder', icon: <FolderPlus size={14} />, onSelect: () => setDialog({ kind: 'newFolder', parent: '' }) },
            ],
          })
        }}
        onDoubleClick={event => {
          if ((event.target as HTMLElement).closest('.folder-row, .note-row, .note-tag, .note-hit, button')) return
          void create('Untitled', '')
        }}
        onDragOver={event => {
          if (!isDragPayload(event.dataTransfer.types) || (event.target as HTMLElement).closest('.folder-row')) return
          event.preventDefault(); event.dataTransfer.dropEffect = 'move'
          setDropTarget('__root__')
        }}
        onDragLeave={event => {
          if (event.currentTarget === event.target) setDropTarget(current => current === '__root__' ? null : current)
        }}
        onDrop={event => {
          if ((event.target as HTMLElement).closest('.folder-row')) return
          event.preventDefault(); setDropTarget(null)
          void handleDrop(event.dataTransfer, '')
        }}>
        {hits ? <ul className="note-hits">
          {hits.length ? hits.map(hit => {
            const target = notes.find(item => item.id === hit.id)
            return target && <li key={hit.id}><button className="note-hit" aria-current={target.uid === selected ? 'true' : undefined} onClick={() => void open(target.uid)}>
              <strong>{hit.title}</strong>{hit.folder && <small>{hit.folder}</small>}<span>{hit.snippet}</span>
            </button></li>
          }) : <li className="notes-empty">No notes match “{query.trim()}”.</li>}
        </ul> : <>
          {pinned.length > 0 && <><div className="notes-heading">Pinned</div><ul>{pinned.map(item => row(item, 0))}</ul></>}
          {(tree.folders.length > 0 || tree.notes.length > 0) && <div className="notes-heading">{pinned.length ? 'All notes' : 'Notes'}
            {folder && <button className="text-button" onClick={() => setFolder('')} title="New notes go to the top level">Top level</button>}</div>}
          <ul>{branch(tree, 0)}</ul>
          {!notes.length && !folders.length && <div className="notes-empty"><NotebookPen size={22} /><strong>No notes yet</strong>
            <span>Write down ideas, plans, and what you learn while you focus.</span>
            <button className="primary" onClick={() => void create()}>New note</button></div>}
        </>}
        {!hits && tags.size > 0 && <><div className="notes-heading">Tags</div>
          <div className="note-tags">{[...tags].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) =>
            <button key={name} className="note-tag" aria-pressed={tag === name} onClick={() => setTag(tag === name ? null : name)}>#{name}<small>{count}</small></button>)}</div></>}
      </div>
    </aside>

    <section className="note-main" aria-label={note ? note.title : 'No note open'}>
      <header className="note-toolbar">
        <IconButton label={showList ? 'Hide note list' : 'Show note list'} onClick={() => setShowList(!showList)}><PanelLeft size={16} /></IconButton>
        {note && <>
          <button className="note-folder" title="Move to folder" onClick={() => setDialog({ kind: 'move', note })}><Folder size={13} />{note.folder || 'Notes'}</button>
          <span className="note-stats">{words.toLocaleString()} {words === 1 ? 'word' : 'words'} · Edited {edited.format(note.updatedAt)}</span>
          <IconButton label={note.pinned ? 'Unpin note' : 'Pin note'} className={note.pinned ? 'is-on' : ''}
            onClick={() => void save({ type: 'pinNote', id: note.id, pinned: !note.pinned })}>{note.pinned ? <PinOff size={15} /> : <Pin size={15} />}</IconButton>
          <IconButton label="Move to folder" onClick={() => setDialog({ kind: 'move', note })}><FolderInput size={15} /></IconButton>
          <IconButton label="Delete note" onClick={() => setDialog({ kind: 'delete', note })}><Trash2 size={15} /></IconButton>
          <IconButton label={showInfo ? 'Hide outline and links' : 'Show outline and links'} onClick={() => setShowInfo(!showInfo)}><PanelRight size={16} /></IconButton>
        </>}
      </header>
      {note ? <div className="note-scroll">
        <div className="note-sheet">
          <TitleField key={note.uid} note={note} save={save} />
          <NoteEditor ref={editor} note={note} save={save} onText={setText}
            handlers={{ openNote: follow, openTag: name => { setTag(name.toLowerCase()); setShowList(true) }, openUrl: url => void openUrl(url).catch(() => {}) }} />
        </div>
      </div> : <div className="note-blank"><NotebookPen size={30} /><strong>Pick a note or start a new one</strong>
        <span><kbd>Ctrl N</kbd> new note · <kbd>Ctrl O</kbd> open a note · <kbd>Ctrl Shift D</kbd> today’s note</span>
        <div><button className="primary" onClick={() => void create()}>New note</button><button className="secondary" onClick={() => void daily()}>Today’s note</button></div></div>}
    </section>

    {note && showInfo && <aside className="note-info" aria-label="Outline and links">
      <section><h2><ListTree size={14} />Outline</h2>
        {outline.length ? <ul className="note-outline">{outline.map(item => <li key={item.line}>
          <button style={{ paddingLeft: 8 + (item.level - 1) * 12 }} onClick={() => editor.current?.reveal(item.line)}>{item.text}</button></li>)}</ul>
          : <p>Headings you write appear here.</p>}
      </section>
      <section><h2><Link2 size={14} />Linked from</h2>
        {backlinks.length ? <ul className="note-backlinks">{backlinks.map(item => <li key={item.uid}>
          <button onClick={() => void open(item.uid)}><strong>{item.title}</strong><span>{item.excerpt}</span></button></li>)}</ul>
          : <p>Link here from another note with <code>[[{note.title}]]</code>.</p>}
      </section>
      {note.tags.length > 0 && <section><h2><Hash size={14} />Tags</h2>
        <div className="note-tags">{note.tags.map(name => <button key={name} className="note-tag" aria-pressed={tag === name}
          onClick={() => { setTag(tag === name ? null : name); setShowList(true) }}>#{name}</button>)}</div></section>}
    </aside>}

    {dialog?.kind === 'switcher' && <Switcher notes={notes} close={() => setDialog(null)} open={uid => { setDialog(null); void open(uid) }}
      create={title => { setDialog(null); void create(title, '') }} />}
    {dialog?.kind === 'move' && <FolderDialog title="Move note" label="Folder" initial={dialog.note.folder} folders={folders} confirm="Move"
      hint="Leave empty for the top level. Use / for subfolders."
      close={() => setDialog(null)} submit={async value => { if (await save({ type: 'moveNote', id: dialog.note.id, folder: value })) { setFolder(value.trim()); setDialog(null) } }} />}
    {dialog?.kind === 'rename' && <RenameNoteDialog note={dialog.note} close={() => setDialog(null)}
      submit={async title => { if (await save({ type: 'renameNote', id: dialog.note.id, title })) setDialog(null) }} />}
    {dialog?.kind === 'newFolder' && <FolderDialog title={dialog.parent ? 'New subfolder' : 'New folder'} label="Folder name" initial="" folders={[]} confirm="Create"
      hint={dialog.parent ? `Inside ${dialog.parent}. Use / for nested subfolders.` : 'Use / for nested folders (e.g. Projects/Ada).'}
      close={() => setDialog(null)} submit={async value => {
        const clean = value.trim().replace(/^[/\\]+|[/\\]+$/g, '')
        const path = dialog.parent ? `${dialog.parent}/${clean}` : clean
        if (await save({ type: 'createFolder', path })) { expand(path); setFolder(path); setDialog(null) }
      }} />}
    {dialog?.kind === 'folder' && <FolderDialog title="Rename folder" label="Folder name" initial={dialog.folder} folders={folders} confirm="Rename"
      hint="Notes and subfolders move with it. Use / to nest it inside another folder."
      close={() => setDialog(null)} submit={async value => { if (await save({ type: 'renameFolder', from: dialog.folder, to: value })) { setFolder(value.trim()); setDialog(null) } }} />}
    {dialog?.kind === 'deleteFolder' && (() => {
      const inside = notes.filter(item => item.folder === dialog.folder || item.folder.startsWith(dialog.folder + '/')).length
      return <Modal title="Delete folder?" close={() => setDialog(null)}>
        <p>“{dialog.folder}”{inside > 0 ? ` and its ${inside} ${inside === 1 ? 'note' : 'notes'} will be permanently deleted` : ' will be deleted'}. This can’t be undone.</p>
        <div className="modal-actions"><button className="secondary" data-initial onClick={() => setDialog(null)}>Cancel</button>
          <button className="danger" onClick={async () => {
            if (note && (note.folder === dialog.folder || note.folder.startsWith(dialog.folder + '/'))) {
              editor.current?.discard()
              select(null)
            }
            if (await save({ type: 'deleteFolder', path: dialog.folder })) {
              if (folder === dialog.folder || folder.startsWith(dialog.folder + '/')) setFolder('')
              setDialog(null)
            }
          }}>Delete folder</button></div>
      </Modal>
    })()}
    {dialog?.kind === 'delete' && <Modal title="Delete note?" close={() => setDialog(null)}>
      <p>“{dialog.note.title}” will be deleted from this PC{data.sync.lastSyncedAt !== null ? ' and from your other PCs' : ''}. This can’t be undone.</p>
      <div className="modal-actions"><button className="secondary" data-initial onClick={() => setDialog(null)}>Cancel</button>
        <button className="danger" onClick={async () => {
          if (dialog.note.uid === selected) editor.current?.discard()
          if (await save({ type: 'deleteNote', id: dialog.note.id })) {
            setDialog(null)
            if (dialog.note.uid === selected) select(null)
          }
        }}>Delete note</button></div>
    </Modal>}
    <ContextMenu menu={menu} close={() => setMenu(null)} />
    {toast && <div className="notes-toast" role="status">{toast}</div>}
  </div>
}

function TitleField({ note, save }: { note: NoteMeta; save: Save }) {
  const [value, setValue] = useState(note.title)
  useEffect(() => setValue(note.title), [note.title])
  async function commit() {
    const title = value.trim()
    if (!title || title === note.title) { setValue(note.title); return }
    if (!(await save({ type: 'renameNote', id: note.id, title }))) setValue(note.title)
  }
  const onKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); void commit().then(() => document.querySelector<HTMLElement>('.note-editor .cm-content')?.focus()) }
    if (event.key === 'Escape') { setValue(note.title); event.currentTarget.blur() }
  }
  return <input className="note-title" value={value} aria-label="Note title" maxLength={200} spellCheck={false}
    onChange={event => setValue(event.target.value.replace(/[[\]|#^]/g, ''))} onBlur={() => void commit()} onKeyDown={onKey} />
}

type NoteEditorHandle = { flush: () => Promise<void>; discard: () => void; reveal: (line: number) => void; refresh: () => void }

function NoteEditor({ ref, note, save, onText, handlers }: {
  ref: Ref<NoteEditorHandle>; note: NoteMeta; save: Save; onText: (text: string) => void
  handlers: { openNote: (title: string) => void; openTag: (tag: string) => void; openUrl: (url: string) => void }
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView>(null)
  const loaded = useRef<{ id: number; updatedAt: number } | null>(null)
  const dirty = useRef(false)
  const saving = useRef<Promise<void> | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef({ handlers, save, onText })
  latest.current = { handlers, save, onText }
  const [error, setError] = useState('')

  // Reads the text synchronously, so a flush started just before another note opens still saves this one.
  async function flush() {
    window.clearTimeout(timer.current)
    const current = loaded.current
    if (!dirty.current || !current || !view.current) {
      if (saving.current) await saving.current
      return
    }
    const body = view.current.state.doc.toString()
    dirty.current = false
    const run = (async () => {
      const snapshot = await latest.current.save({ type: 'saveNote', id: current.id, body })
      const meta = snapshot?.notes.find(item => item.id === current.id)
      const same = loaded.current?.id === current.id
      if (!snapshot) { if (same) dirty.current = true }
      else if (meta && same) loaded.current = { id: current.id, updatedAt: meta.updatedAt }
    })()
    saving.current = run
    try { await run } finally { if (saving.current === run) saving.current = null }
  }

  const filling = useRef(false)
  const fill = (body: string, keepSelection: boolean) => {
    const editor = view.current!
    if (editor.state.doc.toString() === body) return
    if (keepSelection) {
      filling.current = true
      const head = Math.min(editor.state.selection.main.head, body.length)
      try { editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: body }, selection: { anchor: head } }) }
      finally { filling.current = false }
    } else {
      editor.setState(EditorState.create({ doc: body, extensions: extensions.current }))
    }
    latest.current.onText(body)
  }

  const [extensions] = useState(() => ({ current: createExtensions({
    label: 'Note text',
    handlers: () => latest.current.handlers,
    onSave: () => void flush(),
    onChange: text => {
      latest.current.onText(text)
      if (!loaded.current || filling.current) return
      dirty.current = true
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY)
    },
  }) }))

  useEffect(() => {
    const created = new EditorView({ parent: host.current!, state: EditorState.create({ doc: '', extensions: extensions.current }) })
    view.current = created
    const onLeave = () => void flush()
    window.addEventListener('blur', onLeave)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('beforeunload', onLeave)
      void flush().finally(() => created.destroy())
    }
  }, [])

  // Load the body whenever another note opens.
  useEffect(() => {
    let stale = false
    loaded.current = null
    dirty.current = false
    setError('')
    readNote(note.id).then(found => {
      if (stale || !view.current) return
      fill(found.body, false)
      loaded.current = { id: note.id, updatedAt: found.updatedAt }
    }).catch(cause => { if (!stale) setError('Ada could not open this note. ' + String(cause)) })
    return () => { stale = true; void flush() }
  }, [note.id])

  // Pick up a newer body (another PC, or a rename that rewrote links) when nothing is waiting to save.
  useEffect(() => {
    const current = loaded.current
    if (!current || current.id !== note.id || current.updatedAt === note.updatedAt || dirty.current || saving.current) return
    let stale = false
    readNote(note.id).then(found => {
      if (stale || dirty.current || saving.current || loaded.current?.id !== note.id) return
      fill(found.body, true)
      loaded.current = { id: note.id, updatedAt: found.updatedAt }
    }).catch(() => {})
    return () => { stale = true }
  }, [note.updatedAt])

  const handle: NoteEditorHandle = {
    flush,
    discard: () => { window.clearTimeout(timer.current); dirty.current = false },
    reveal: line => { if (view.current) revealLine(view.current, line) },
    refresh: () => view.current?.dispatch({ effects: refreshPreview.of(null) }),
  }
  if (typeof ref === 'function') ref(handle)
  else if (ref) (ref as RefObject<NoteEditorHandle | null>).current = handle

  return <>
    {error && <p className="note-error" role="alert">{error}</p>}
    <div className="note-editor" ref={host} />
  </>
}

function Switcher({ notes, close, open, create }: {
  notes: NoteMeta[]; close: () => void; open: (uid: string) => void; create: (title: string) => void
}) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const search = query.trim().toLowerCase()
  const matches = (search
    ? notes.map(item => {
      const title = item.title.toLowerCase()
      const score = title.startsWith(search) ? 3 : title.includes(search) ? 2 : item.folder.toLowerCase().includes(search) ? 1 : 0
      return { item, score }
    }).filter(entry => entry.score).sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt).map(entry => entry.item)
    : notes).slice(0, 40)
  const exact = notes.some(item => item.title.toLowerCase() === search)
  const count = matches.length + (search && !exact ? 1 : 0)
  const choose = (position: number) => {
    if (position < matches.length) open(matches[position].uid)
    else if (search) create(query.trim().replace(/[[\]|#^]/g, ''))
  }
  return <Modal title="Open note" close={close} variant="switcher">
    <input className="search-input" value={query} placeholder="Find or create a note" aria-label="Find or create a note" data-initial
      onChange={event => { setQuery(event.target.value); setIndex(0) }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(Math.min(count - 1, index + 1)) }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(Math.max(0, index - 1)) }
        else if (event.key === 'Enter') { event.preventDefault(); choose(index) }
      }} />
    <div className="search-results" role="listbox" aria-label="Notes">
      {matches.map((item, position) => <button key={item.uid} role="option" aria-selected={position === index} onMouseEnter={() => setIndex(position)} onClick={() => choose(position)}>
        <FileText size={15} /><span>{item.title}<small>{item.folder || 'Notes'}</small></span></button>)}
      {search && !exact && <button role="option" aria-selected={index === matches.length} onMouseEnter={() => setIndex(matches.length)} onClick={() => choose(matches.length)}>
        <FilePlus2 size={15} /><span>Create “{query.trim()}”<small>New note</small></span></button>}
    </div>
  </Modal>
}

function FolderDialog({ title, label, initial, folders, hint, confirm, close, submit }: {
  title: string; label: string; initial: string; folders: string[]; hint: string; confirm: string
  close: () => void; submit: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  return <Modal title={title} close={close}>
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); try { await submit(value) } finally { setBusy(false) } }}>
      <label className="form-field">{label}<input value={value} list={folders.length ? 'note-folders' : undefined} data-initial maxLength={200} onChange={event => setValue(event.target.value)} /></label>
      {folders.length > 0 && <datalist id="note-folders">{folders.map(item => <option key={item} value={item} />)}</datalist>}
      <p className="form-hint">{hint}</p>
      <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button>
        <button className="primary" disabled={busy}>{confirm}</button></div>
    </form>
  </Modal>
}

function RenameNoteDialog({ note, close, submit }: {
  note: NoteMeta; close: () => void; submit: (title: string) => Promise<void>
}) {
  const [value, setValue] = useState(note.title)
  const [busy, setBusy] = useState(false)
  return <Modal title="Rename note" close={close}>
    <form onSubmit={async event => {
      event.preventDefault()
      const clean = value.trim()
      if (!clean) return
      setBusy(true)
      try { await submit(clean) } finally { setBusy(false) }
    }}>
      <label className="form-field">Title<input value={value} data-initial maxLength={200} spellCheck={false}
        onChange={event => setValue(event.target.value.replace(/[[\]|#^]/g, ''))} /></label>
      <p className="form-hint">Links to this note update automatically.</p>
      <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button>
        <button className="primary" disabled={busy || !value.trim()}>Rename</button></div>
    </form>
  </Modal>
}
