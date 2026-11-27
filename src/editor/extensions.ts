import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, completionStatus } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, standardKeymap } from '@codemirror/commands'
import { insertNewlineContinueMarkup, markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { EditorState, Prec, type Extension } from '@codemirror/state'
import { drawSelection, dropCursor, EditorView, highlightSpecialChars, keymap, placeholder, rectangularSelection } from '@codemirror/view'
import { editorTheme } from './cmTheme'
import { insertLink, insertWikilink, toggleBullet, toggleHeading, toggleTask, toggleWrap } from './format'
import { livePreview } from './livePreview'
import { noteMarkdownExtensions } from './markdownExtensions'
import { slashCompletion } from './slashCommands'
import { linkClickHandlers, tagCompletion, wikilinkCompletion, type ClickHandlers } from './wikilink'

export type EditorOptions = {
  handlers: () => ClickHandlers
  onChange: (text: string) => void
  onSave: () => void
  label: string
}

export function createExtensions(options: EditorOptions): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    highlightSpecialChars(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(true),
    EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': options.label }),
    placeholder('Start writing… type / for blocks, [[ to link a note'),
    markdown({ base: markdownLanguage, codeLanguages: languages, extensions: noteMarkdownExtensions, addKeymap: false }),
    autocompletion({ override: [wikilinkCompletion, tagCompletion, slashCompletion], activateOnTyping: true, icons: false, closeOnBlur: true }),
    livePreview,
    linkClickHandlers(options.handlers),
    editorTheme,
    Prec.highest(keymap.of([
      { key: 'Enter', run: view => completionStatus(view.state) === 'active' ? false : insertNewlineContinueMarkup(view) },
      { key: 'Tab', run: indentMore, shift: indentLess },
      { key: 'Mod-s', run: () => { options.onSave(); return true } },
      { key: 'Mod-b', run: view => toggleWrap(view, '**') },
      { key: 'Mod-i', run: view => toggleWrap(view, '*') },
      { key: 'Mod-e', run: view => toggleWrap(view, '`') },
      { key: 'Mod-Shift-x', run: view => toggleWrap(view, '~~') },
      { key: 'Mod-Shift-h', run: view => toggleWrap(view, '==') },
      { key: 'Mod-l', run: toggleTask },
      { key: 'Mod-Shift-8', run: toggleBullet },
      { key: 'Mod-1', run: view => toggleHeading(view, 1) },
      { key: 'Mod-2', run: view => toggleHeading(view, 2) },
      { key: 'Mod-3', run: view => toggleHeading(view, 3) },
      { key: 'Mod-Shift-k', run: insertLink },
      { key: 'Mod-Shift-l', run: insertWikilink },
    ])),
    keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap]),
    keymap.of(standardKeymap),
    keymap.of(defaultKeymap),
    EditorView.updateListener.of(update => {
      if (update.docChanged) options.onChange(update.state.doc.toString())
    }),
  ]
}
