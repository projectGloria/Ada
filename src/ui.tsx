import { X } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'

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

