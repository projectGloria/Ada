/** Token colours for fenced code and the few surfaces CodeMirror styles inline. Layout lives in styles.css. */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

const codeHighlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--accent)' },
  { tag: [t.controlKeyword, t.moduleKeyword], color: 'var(--accent)', fontWeight: '600' },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: 'var(--text)' },
  { tag: [t.function(t.variableName), t.labelName], color: 'var(--primary)' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: 'var(--accent)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--accent)' },
  { tag: [t.number, t.integer, t.float, t.bool], color: 'var(--accent)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--green)' },
  { tag: [t.meta, t.comment], color: 'var(--dim)', fontStyle: 'italic' },
  { tag: t.operator, color: 'var(--muted)' },
  { tag: t.link, color: 'var(--primary)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
])

const base = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'transparent' },
  '.cm-scroller': { fontFamily: 'inherit' },
  '.cm-placeholder': { color: 'var(--dim)' },
  '.cm-tooltip': { backgroundColor: 'var(--raised)', border: '1px solid var(--line)', color: 'var(--text)', borderRadius: '8px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent-bg)', color: 'var(--text)' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'inherit', maxHeight: '16em' },
  '.cm-completionDetail': { color: 'var(--dim)', fontStyle: 'normal', marginLeft: '1em' },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-searchMatch': { backgroundColor: 'var(--accent-bg)', outline: '1px solid var(--accent)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--accent-bg)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-bg) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
})

export const editorTheme: Extension = [base, syntaxHighlighting(codeHighlight)]
