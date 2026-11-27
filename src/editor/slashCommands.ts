/** Type `/` at the start of a line (or after a space) to insert a block. */
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import { insertCallout, insertCodeFence, insertDate, insertDivider, insertTable } from './format'

type Item = { label: string; detail: string; run: (view: EditorView, from: number, to: number) => void }

/** Drop the typed `/command` and put a block prefix at the start of the line. */
const replaceLine = (prefix: string) => (view: EditorView, from: number, to: number) => {
  const start = view.state.doc.lineAt(from).from
  view.dispatch({ changes: [{ from: start, insert: prefix }, { from, to }], selection: { anchor: from + prefix.length } })
  view.focus()
}

const items: Item[] = [
  { label: 'Heading 1', detail: '#', run: replaceLine('# ') },
  { label: 'Heading 2', detail: '##', run: replaceLine('## ') },
  { label: 'Heading 3', detail: '###', run: replaceLine('### ') },
  { label: 'Bullet list', detail: '-', run: replaceLine('- ') },
  { label: 'Numbered list', detail: '1.', run: replaceLine('1. ') },
  { label: 'Checklist', detail: '- [ ]', run: replaceLine('- [ ] ') },
  { label: 'Quote', detail: '>', run: replaceLine('> ') },
  { label: 'Callout', detail: '> [!note]', run: insertCallout },
  { label: 'Code block', detail: '```', run: insertCodeFence },
  { label: 'Table', detail: '| |', run: insertTable },
  { label: 'Divider', detail: '---', run: insertDivider },
  { label: 'Today’s date', detail: 'YYYY-MM-DD', run: insertDate },
]

export function slashCompletion(context: CompletionContext): CompletionResult | null {
  const before = context.matchBefore(/(?:^|\s)\/[\w ’']*$/)
  if (!before) return null
  const slash = before.from + before.text.indexOf('/')
  const tree = syntaxTree(context.state).resolveInner(slash, -1)
  for (let node: typeof tree | null = tree; node; node = node.parent) {
    if (['FencedCode', 'CodeBlock', 'InlineCode'].includes(node.name)) return null
  }
  const query = context.state.sliceDoc(slash + 1, context.pos).toLowerCase().trim()
  const options: Completion[] = items
    .filter(item => !query || item.label.toLowerCase().includes(query))
    .map(item => ({
      label: item.label,
      detail: item.detail,
      type: 'keyword',
      apply: (view: EditorView, _completion: Completion, _from: number, to: number) => item.run(view, slash, to),
    }))
  if (!options.length) return null
  return { from: slash + 1, options, filter: false }
}
