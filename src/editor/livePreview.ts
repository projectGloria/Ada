/**
 * Live preview: markdown is styled in place and its markup hides on every line
 * the cursor is not on, so a note reads like a page and edits like plain text.
 */
import { syntaxTree } from '@codemirror/language'
import { StateEffect, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'

/** Rebuild decorations, for example after the list of notes changes. */
export const refreshPreview = StateEffect.define<null>()

let exists: (title: string) => boolean = () => true

/** Tell the preview which wikilink targets exist, so missing ones look different. */
export function setNoteResolver(resolver: (title: string) => boolean): void {
  exists = resolver
}

const hide = Decoration.replace({})

class Bullet extends WidgetType {
  eq() { return true }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-bullet'
    span.textContent = '•'
    return span
  }
}

class Rule extends WidgetType {
  eq() { return true }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-hr-widget'
    return span
  }
}

class Checkbox extends WidgetType {
  constructor(readonly checked: boolean, readonly at: number) { super() }
  eq(other: Checkbox) { return other.checked === this.checked && other.at === this.at }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-task-box'
    box.checked = this.checked
    box.setAttribute('aria-label', this.checked ? 'Mark as not done' : 'Mark as done')
    box.addEventListener('mousedown', event => event.preventDefault())
    box.addEventListener('click', event => {
      event.preventDefault()
      view.dispatch({ changes: { from: this.at + 1, to: this.at + 2, insert: this.checked ? ' ' : 'x' } })
    })
    return box
  }
  ignoreEvent() { return true }
}

const line = (className: string) => Decoration.line({ class: className })
const mark = (className: string, attributes?: Record<string, string>) => Decoration.mark({ class: className, attributes })

function build(view: EditorView): DecorationSet {
  const { state } = view
  const doc = state.doc
  const out: Range<Decoration>[] = []
  const active = new Set<number>()
  if (view.hasFocus) {
    for (const range of state.selection.ranges) {
      const first = doc.lineAt(range.from).number
      const last = doc.lineAt(range.to).number
      for (let n = first; n <= last; n++) active.add(n)
    }
  }
  const isActive = (pos: number) => active.has(doc.lineAt(pos).number)
  const lineSpan = (from: number, to: number, className: string) => {
    const first = doc.lineAt(from).number
    const last = doc.lineAt(Math.max(from, to - 1)).number
    for (let n = first; n <= last; n++) {
      const at = doc.line(n)
      out.push(line(className + (n === first ? ' is-first' : '') + (n === last ? ' is-last' : '')).range(at.from))
    }
  }

  // YAML frontmatter is not part of the markdown grammar, so find it by hand.
  let frontmatterEnd = -1
  if (doc.lines > 1 && doc.line(1).text === '---') {
    for (let n = 2; n <= Math.min(doc.lines, 200); n++) {
      if (doc.line(n).text === '---') { frontmatterEnd = doc.line(n).to; break }
    }
    if (frontmatterEnd >= 0) lineSpan(0, frontmatterEnd, 'cm-frontmatter')
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter(node) {
        if (node.from < frontmatterEnd) return node.to <= frontmatterEnd ? false : undefined
        const name = node.name
        const heading = /^(ATX|Setext)Heading(\d)$/.exec(name)
        if (heading) {
          lineSpan(node.from, node.to, 'cm-h cm-h' + heading[2])
          return
        }
        switch (name) {
          case 'HeaderMark': {
            if (isActive(node.from)) return
            const after = state.sliceDoc(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
            if (doc.lineAt(node.from).from === node.from) out.push(hide.range(node.from, after))
            else out.push(hide.range(node.from, node.to)) // closing ### or setext underline
            return
          }
          case 'Emphasis': out.push(mark('cm-em').range(node.from, node.to)); return
          case 'StrongEmphasis': out.push(mark('cm-strong').range(node.from, node.to)); return
          case 'Strikethrough': out.push(mark('cm-strike').range(node.from, node.to)); return
          case 'Highlight': out.push(mark('cm-highlight').range(node.from, node.to)); return
          case 'InlineCode': out.push(mark('cm-inline-code').range(node.from, node.to)); return
          case 'EmphasisMark': case 'StrikethroughMark': case 'HighlightMark':
            if (!isActive(node.from)) out.push(hide.range(node.from, node.to))
            return
          case 'CodeMark':
            if (node.node.parent?.name === 'InlineCode' && !isActive(node.from)) out.push(hide.range(node.from, node.to))
            return
          case 'FencedCode': case 'CodeBlock':
            lineSpan(node.from, node.to, 'cm-codeblock')
            return
          case 'Blockquote': {
            const first = doc.lineAt(node.from).text
            const callout = /^\s*>\s*\[!(\w+)\]/.exec(first)
            lineSpan(node.from, node.to, callout ? 'cm-quote cm-callout cm-callout-' + callout[1].toLowerCase() : 'cm-quote')
            return
          }
          case 'QuoteMark':
            if (!isActive(node.from)) {
              const after = state.sliceDoc(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
              out.push(hide.range(node.from, after))
            }
            return
          case 'HorizontalRule':
            if (!isActive(node.from)) out.push(Decoration.replace({ widget: new Rule() }).range(node.from, node.to))
            return
          case 'ListMark': {
            const text = state.sliceDoc(node.from, node.to)
            const task = node.node.nextSibling?.name === 'Task'
            if (isActive(node.from)) return
            if (task) {
              const after = state.sliceDoc(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
              out.push(hide.range(node.from, after))
            } else if (/^[-*+]$/.test(text)) {
              out.push(Decoration.replace({ widget: new Bullet() }).range(node.from, node.to))
            }
            return
          }
          case 'TaskMarker': {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to))
            if (checked) {
              const row = doc.lineAt(node.from)
              if (node.to < row.to) out.push(mark('cm-task-done').range(node.to, row.to))
            }
            if (!isActive(node.from)) out.push(Decoration.replace({ widget: new Checkbox(checked, node.from) }).range(node.from, node.to))
            return
          }
          case 'Table':
            lineSpan(node.from, node.to, 'cm-table')
            return
          case 'Link': {
            out.push(mark('cm-mdlink').range(node.from, node.to))
            if (isActive(node.from)) return false
            const cursor = node.node.cursor()
            if (cursor.firstChild()) {
              let afterText = false
              do {
                if (cursor.name === 'LinkMark') {
                  out.push(hide.range(cursor.from, cursor.to))
                  if (state.sliceDoc(cursor.from, cursor.to) === ']') afterText = true
                } else if (afterText && (cursor.name === 'URL' || cursor.name === 'LinkTitle')) {
                  out.push(hide.range(cursor.from, cursor.to))
                }
              } while (cursor.nextSibling())
            }
            return false
          }
          case 'URL':
            out.push(mark('cm-url').range(node.from, node.to))
            return
          case 'WikiLink': {
            const text = state.sliceDoc(node.from, node.to)
            const target = text.replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0].split(/[#^]/)[0].trim()
            const missing = target ? !exists(target) : true
            out.push(mark('cm-wikilink' + (missing ? ' is-unresolved' : ''), { title: missing ? 'Create ' + target : target }).range(node.from, node.to))
            if (isActive(node.from)) return false
            const hasAlias = text.includes('|')
            const cursor = node.node.cursor()
            if (cursor.firstChild()) {
              do {
                if (cursor.name === 'WikiLinkMark' || (hasAlias && cursor.name === 'WikiLinkTarget')) out.push(hide.range(cursor.from, cursor.to))
              } while (cursor.nextSibling())
            }
            return false
          }
          case 'HashTag':
            out.push(mark('cm-tag').range(node.from, node.to))
            return false
        }
      },
    })
  }
  return Decoration.set(out, true)
}

const plugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = build(view) }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged
      || syntaxTree(update.startState) !== syntaxTree(update.state)
      || update.transactions.some(tr => tr.effects.some(effect => effect.is(refreshPreview)))) {
      this.decorations = build(update.view)
    }
  }
}, { decorations: value => value.decorations })

export const livePreview: Extension = plugin
