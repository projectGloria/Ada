import { ArrowLeft, KeyRound, LogIn, LogOut, Mail, Trash2, UserPlus } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Modal, SaveError } from './ui'
import { accountRequest, type AccountRequest, type AccountView, type Counts } from './workspace'

export type AccountMode = 'signIn' | 'signUp' | 'verify' | 'forgot' | 'recoveryCode' | 'newPassword' | 'merge'
  | 'manage' | 'changePassword' | 'delete'

const titles: Record<AccountMode, string> = {
  signIn: 'Sign in to Ada', signUp: 'Create your Ada account', verify: 'Confirm your email',
  forgot: 'Reset your password', recoveryCode: 'Enter your reset code', newPassword: 'Choose a new password',
  merge: 'Bring this PC’s work with you?', manage: 'Your account', changePassword: 'Change password',
  delete: 'Delete your account',
}

const done: Partial<Record<AccountView['step'], string>> = {
  signedIn: 'Signed in', signedOut: 'Signed out', deleted: 'Account deleted · your work stays on this PC',
  passwordChanged: 'Password changed',
}

const plural = (count: number, word: string) => count + ' ' + word + (count === 1 ? '' : 's')

function countsText(counts: Counts) {
  const parts = [plural(counts.tasks, 'task'), plural(counts.sessions, 'focus session'), plural(counts.tags, 'tag'), plural(counts.projects, 'project')]
  return parts.slice(0, -1).join(', ') + ', and ' + parts.at(-1)
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="form-field">{label}{children}{hint && <small className="field-hint">{hint}</small>}</label>
}

export function AccountDialog({ mode: initial, account, active, close, changed }: {
  mode: AccountMode; account: AccountView; active: boolean; close: () => void
  changed: (view: AccountView, message?: string) => void
}) {
  const [mode, setMode] = useState<AccountMode>(initial)
  const [email, setEmail] = useState(account.email ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const unavailable = account.demo ? 'The sample week can’t be linked to an account. Open Ada normally to sign in.'
    : !account.configured ? 'Accounts aren’t connected in this copy of Ada yet, so signing in isn’t possible. Your work stays saved on this PC.' : ''

  function go(next: AccountMode) {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
    setConfirm('')
    setCode('')
  }

  async function run(request: AccountRequest, after?: (view: AccountView) => void) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const view = await accountRequest(request)
      const finished = done[view.step]
      changed(view, finished)
      if (view.reload || finished) return
      const next: Partial<Record<AccountView['step'], AccountMode>> = {
        verify: 'verify', merge: 'merge', recoveryCode: 'recoveryCode', newPassword: 'newPassword',
      }
      const step = next[view.step]
      if (step && step !== mode) go(step)
      after?.(view)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
    }
  }

  function submit(request: AccountRequest, after?: (view: AccountView) => void) {
    return (event: FormEvent) => { event.preventDefault(); if (!busy) void run(request, after) }
  }

  const back = (target: AccountMode, label = 'Back') =>
    <button type="button" className="text-button" onClick={() => go(target)}><ArrowLeft size={14} /> {label}</button>
  const emailField = <Field label="Email"><input type="email" autoComplete="email" value={email} required maxLength={254}
    onChange={event => setEmail(event.target.value)} data-initial /></Field>
  const passwordsMatch = password === confirm
  const newPasswordFields = <>
    <Field label="New password" hint="Use at least 8 characters."><input type="password" autoComplete="new-password" value={password}
      minLength={8} maxLength={72} required onChange={event => setPassword(event.target.value)} data-initial /></Field>
    <Field label="Repeat password"><input type="password" autoComplete="new-password" value={confirm} required
      onChange={event => setConfirm(event.target.value)} aria-invalid={Boolean(confirm) && !passwordsMatch} /></Field>
    {confirm && !passwordsMatch && <p className="field-hint">The passwords don’t match yet.</p>}
  </>
  const blocked = Boolean(unavailable) || busy
  const timerNote = active && ['signIn', 'signUp', 'verify', 'merge', 'manage', 'delete'].includes(mode) &&
    <p className="field-hint">Finish your current focus session before signing in, signing out, or deleting an account.</p>

  let body: ReactNode
  switch (mode) {
    case 'signIn':
      body = <form onSubmit={submit({ type: 'signIn', email, password })}>
        {emailField}
        <Field label="Password"><input type="password" autoComplete="current-password" value={password} required
          onChange={event => setPassword(event.target.value)} /></Field>
        <div className="dialog-actions split">
          <button type="button" className="text-button" onClick={() => go('forgot')}>Forgot password?</button>
          <button className="primary" disabled={blocked}><LogIn size={16} /> Sign in</button>
        </div>
        <p className="account-switch">New to Ada? <button type="button" className="text-button" onClick={() => go('signUp')}>Create an account</button></p>
      </form>
      break
    case 'signUp':
      body = <form onSubmit={submit({ type: 'signUp', email, password })}>
        <p>An account keeps your workspace tied to you and prepares Ada for syncing between PCs.</p>
        {emailField}
        {newPasswordFields}
        <div className="dialog-actions"><button className="primary" disabled={blocked || !passwordsMatch}><UserPlus size={16} /> Create account</button></div>
        <p className="account-switch">Already have an account? <button type="button" className="text-button" onClick={() => go('signIn')}>Sign in</button></p>
      </form>
      break
    case 'verify':
      body = <form onSubmit={submit({ type: 'verify', email, code })}>
        <p><Mail size={15} className="inline-icon" /> We sent a confirmation code to <strong>{email}</strong>. Enter it here to finish.
          If the email has a link instead, open it, then come back and sign in.</p>
        <Field label="Confirmation code"><input inputMode="numeric" autoComplete="one-time-code" value={code} required maxLength={12}
          onChange={event => setCode(event.target.value)} data-initial /></Field>
        <div className="dialog-actions split">
          <button type="button" className="text-button" disabled={busy}
            onClick={() => void run({ type: 'resend', email }, () => setNotice('A new code is on its way.'))}>Send a new code</button>
          <span className="action-group">{back('signIn', 'Sign in instead')}<button className="primary" disabled={blocked}>Confirm</button></span>
        </div>
      </form>
      break
    case 'forgot':
      body = <form onSubmit={submit({ type: 'recover', email })}>
        <p>Enter your account’s email. Ada will send a code you can use to choose a new password.</p>
        {emailField}
        <div className="dialog-actions split">{back('signIn')}<button className="primary" disabled={blocked}><Mail size={16} /> Send reset code</button></div>
      </form>
      break
    case 'recoveryCode':
      body = <form onSubmit={submit({ type: 'verifyRecovery', email, code })}>
        <p>If an account uses <strong>{email}</strong>, a reset code is on its way. Enter it below.</p>
        <Field label="Reset code"><input inputMode="numeric" autoComplete="one-time-code" value={code} required maxLength={12}
          onChange={event => setCode(event.target.value)} data-initial /></Field>
        <div className="dialog-actions split">{back('forgot')}<button className="primary" disabled={blocked}>Continue</button></div>
      </form>
      break
    case 'newPassword':
    case 'changePassword':
      body = <form onSubmit={submit({ type: 'setPassword', password })}>
        {newPasswordFields}
        <div className="dialog-actions split">{mode === 'changePassword' ? back('manage') : <span />}
          <button className="primary" disabled={blocked || !passwordsMatch}><KeyRound size={16} /> Save password</button></div>
      </form>
      break
    case 'merge': {
      const counts = account.merge
      body = <>
        <p>This PC has work saved without an account{counts ? <>: <strong>{countsText(counts)}</strong></> : ''}.</p>
        <ul className="account-options">
          <li><strong>Merge into my account</strong> moves it into your account’s workspace. Matching tag and project names are combined, and each focus session is counted once.</li>
          <li><strong>Keep separate</strong> leaves it here. It reappears when you sign out.</li>
        </ul>
        <div className="dialog-actions split">
          <button type="button" className="text-button" disabled={busy} onClick={() => void run({ type: 'cancelMerge' }, close)}>Cancel sign-in</button>
          <span className="action-group">
            <button type="button" className="secondary" disabled={busy || active} onClick={() => void run({ type: 'chooseMerge', merge: false })}>Keep separate</button>
            <button type="button" className="primary" disabled={busy || active} onClick={() => void run({ type: 'chooseMerge', merge: true })} data-initial>Merge into my account</button>
          </span>
        </div>
      </>
      break
    }
    case 'manage':
      body = <>
        <p>Signed in as <strong>{account.email}</strong>.</p>
        <p className="field-hint">This account’s workspace is saved on this PC. Syncing between PCs isn’t available yet.</p>
        <div className="account-actions">
          <button className="secondary" onClick={() => go('changePassword')} data-initial><KeyRound size={16} /> Change password</button>
          <button className="secondary" disabled={busy || active} onClick={() => void run({ type: 'signOut' })}><LogOut size={16} /> Sign out</button>
          <button className="text-button danger-text" onClick={() => go('delete')}><Trash2 size={15} /> Delete account</button>
        </div>
      </>
      break
    case 'delete':
      body = <form onSubmit={submit({ type: 'delete', password })}>
        <p>This permanently deletes your Ada account. Your tasks, sessions, and town on this PC stay here as your local workspace.</p>
        <Field label="Password"><input type="password" autoComplete="current-password" value={password} required
          onChange={event => setPassword(event.target.value)} data-initial /></Field>
        <div className="dialog-actions split">{back('manage', 'Keep my account')}
          <button className="danger" disabled={busy || active || !password}><Trash2 size={15} /> Delete account</button></div>
      </form>
      break
  }

  // Leaving mid-sign-in must not keep a half-finished sign-in around.
  const dismiss = mode === 'merge' ? () => void run({ type: 'cancelMerge' }, close) : close
  return <SaveError.Provider value={error}>
    <Modal key={mode} title={titles[mode]} close={dismiss} variant="account-dialog">
      {unavailable && !['manage', 'changePassword', 'delete'].includes(mode) && <p className="account-unavailable" role="note">{unavailable}</p>}
      {notice && <p className="account-notice" role="status">{notice}</p>}
      {timerNote}
      {body}
    </Modal>
  </SaveError.Provider>
}
