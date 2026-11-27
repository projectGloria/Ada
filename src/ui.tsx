import { Check, X } from 'lucide-react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export const SaveError = createContext('')

export function IconButton({ label, children, onClick, className = '', disabled = false }: {
  label: string; children: ReactNode; onClick: () => void; className?: string; disabled?: boolean
}) {
  return <button className={'icon-button ' + className} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>
}

export function Modal({ title, children, close, variant = '' }: {
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

export type ContextMenuItem =
  | { separator: true }
  | { separator?: false; label: string; icon?: ReactNode; danger?: boolean; active?: boolean; onSelect: () => void }

export type ContextMenuState = { x: number; y: number; items: ContextMenuItem[] }

export function ContextMenu({ menu, close }: { menu: ContextMenuState | null; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos({
      x: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)),
    })
  }, [menu])

  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!menu || !ref.current) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { opener.current?.focus({ preventScroll: true }) }
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onDown = () => close()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      const all = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      if (!all.length) return
      event.preventDefault()
      const current = all.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? all.length - 1
        : event.key === 'ArrowDown' ? (current + 1 + all.length) % all.length
        : (current - 1 + all.length) % all.length
      all[next]?.focus()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, close])

  if (!menu) return null
  return <div ref={ref} className="context-menu" style={{ left: pos.x, top: pos.y }}
    onMouseDown={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()} role="menu">
    {menu.items.map((item, i) => item.separator
      ? <div key={`sep-${i}`} className="context-menu-sep" role="separator" />
      : <button key={`${item.label}-${i}`} className={'context-menu-item' + (item.danger ? ' danger' : '') + (item.active ? ' is-active' : '')}
        role="menuitem" onClick={() => { close(); item.onSelect() }}>
        <span className="context-menu-icon">{item.icon ?? (item.active ? <Check size={13} /> : null)}</span>
        <span>{item.label}</span>
      </button>)}
  </div>
}

