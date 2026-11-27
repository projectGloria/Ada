/** Wikilink and tag autocomplete, and click-to-follow, fed by Ada's list of notes. */
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

export type NoteIndex = { titles: { title: string; folder: string }[]; tags: Map<string, number> }

let index: NoteIndex = { titles: [], tags: new Map() }

export function setNoteIndex(next: NoteIndex): void {
  index = next
}

/** Suggest notes after `[[`, title prefixes first. */
export function wikilinkCompletion(context: CompletionContext): CompletionResult | null {
  const before = context.matchBefore(/\[\[[^\]\n|#]*/)
  if (!before) return null
  if (before.from === before.to && !context.explicit) return null
  const query = before.text.slice(2).toLowerCase()
  const scored: { completion: Completion; score: number }[] = []
  for (const { title, folder } of index.titles) {
    const lower = title.toLowerCase()
    let score: number
    if (!query) score = 0
    else if (lower.startsWith(query)) score = 4
    else if (lower.includes(query)) score = 3
    else if (folder.toLowerCase().includes(query)) score = 1
    else continue
    scored.push({ completion: { label: title, detail: folder, type: 'text', apply: closeLink(title) }, score })
  }
  scored.sort((a, b) => b.score - a.score || a.completion.label.localeCompare(b.completion.label))
  const options = scored.slice(0, 50).map(item => item.completion)
  const typed = before.text.slice(2).trim()
  if (typed && !index.titles.some(note => note.title.toLowerCase() === typed.toLowerCase())) {
    options.push({ label: typed, detail: 'New note', type: 'keyword', boost: -99, apply: closeLink(typed) })
  }
  return { from: before.from + 2, options, validFor: /^[^\]\n|#]*$/ }
}

/** Insert the title and step past `]]`, adding it when the brackets were not auto-closed. */
function closeLink(title: string) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const closed = view.state.sliceDoc(to, to + 2) === ']]'
    const insert = closed ? title : title + ']]'
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + title.length + 2 } })
  }
}

/** Suggest existing tags after `#`. */
export function tagCompletion(context: CompletionContext): CompletionResult | null {
  const before = context.matchBefore(/#[\w/-]*/)
  if (!before) return null
  const row = context.state.doc.lineAt(before.from)
  if (before.from === row.from) return null // a heading, not a tag
  if (before.from > row.from && /\w/.test(context.state.sliceDoc(before.from - 1, before.from))) return null
  if (before.from === before.to && !context.explicit) return null
  if (!index.tags.size) return null
  return {
    from: before.from + 1,
    options: [...index.tags].sort((a, b) => a[0].localeCompare(b[0])).map(([tag, count]) => ({ label: tag, detail: String(count), type: 'keyword' })),
    validFor: /^[\w/-]*$/,
  }
}

export type ClickTarget = { kind: 'note'; target: string } | { kind: 'tag'; tag: string } | { kind: 'url'; url: string }

export function targetAt(view: EditorView, pos: number): ClickTarget | null {
  let node = syntaxTree(view.state).resolveInner(pos, 1)
  for (;;) {
    if (node.name === 'WikiLink') {
      const raw = view.state.sliceDoc(node.from, node.to).replace(/^!?\[\[/, '').replace(/\]\]$/, '')
      const target = raw.split('|')[0].split(/[#^]/)[0].trim()
      return target ? { kind: 'note', target } : null
    }
    if (node.name === 'HashTag') return { kind: 'tag', tag: view.state.sliceDoc(node.from, node.to).replace(/^#/, '') }
    if (node.name === 'Link') {
      const match = view.state.sliceDoc(node.from, node.to).match(/\]\(([^)\s]+)/)
      if (!match) return null
      if (/^[a-z][a-z0-9+.-]*:/i.test(match[1])) return { kind: 'url', url: match[1] }
      return { kind: 'note', target: decodeURI(match[1].split('#')[0]).replace(/\.md$/i, '') }
    }
    if (node.name === 'URL') return { kind: 'url', url: view.state.sliceDoc(node.from, node.to) }
    if (!node.parent) return null
    node = node.parent
  }
}

export type ClickHandlers = { openNote: (title: string) => void; openTag: (tag: string) => void; openUrl: (url: string) => void }

/** Follow links on a plain click; prose clicks still just place the caret. */
export function linkClickHandlers(handlers: () => ClickHandlers): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) return false
      const el = (event.target as HTMLElement | null)?.closest('.cm-wikilink, .cm-mdlink, .cm-tag, .cm-url')
      if (!el) return false
      // On the line being edited, a plain click edits and Ctrl+click follows.
      const pos = view.posAtDOM(el)
      const editing = view.hasFocus && view.state.selection.ranges.some(range => view.state.doc.lineAt(range.head).number === view.state.doc.lineAt(pos).number)
      if (editing && !event.ctrlKey) return false
      const target = targetAt(view, pos)
      if (!target) return false
      event.preventDefault()
      const { openNote, openTag, openUrl } = handlers()
      if (target.kind === 'note') openNote(target.target)
      else if (target.kind === 'tag') openTag(target.tag)
      else openUrl(target.url)
      return true
    },
  })
}
