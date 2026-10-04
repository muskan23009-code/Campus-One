import { useState } from 'react'
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react'
import { api } from '../api/client'

export default function PasswordChangeView({ user, onChanged }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (newPassword.length < 12) { setError('Choose a password with at least 12 characters.'); return }
    if (newPassword !== confirmation) { setError('The new passwords do not match.'); return }
    setBusy(true)
    try {
      const result = await api('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      onChanged(result.user)
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  return <main className="login-shell page-enter"><section className="login-photo"><div className="login-photo-background"/><div className="login-image-shade"/><a className="login-brand" href="#home" onClick={(event) => event.preventDefault()}><span className="brand-mark"><span/><span/><span/><span/></span><span className="brand-name">campus<span>one</span></span></a><div className="login-story"><span className="login-kicker"><span/> ACCOUNT SECURITY</span><h1>One safe<br/><em>first step.</em></h1><p>Choose a private password before<br/>continuing to your campus account.</p></div></section><section className="login-form-side"><div className="login-form-wrap"><span className="login-welcome-label">WELCOME, {user.name.toUpperCase()}</span><h2>Change your password.</h2><p className="login-description">An administrator has assigned a temporary password. Set your own to continue.</p><div className="bootstrap-id-preview"><span>YOUR USER ID · {user.role.toUpperCase()}</span><strong>{user.id}</strong><small>This change will protect your campus account.</small></div><form className="login-form setup-form" onSubmit={submit}><label htmlFor="current-password">TEMPORARY PASSWORD</label><span className="login-input"><KeyRound size={15}/><input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required/></span><label htmlFor="new-password">NEW PASSWORD</label><span className="login-input"><input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 12 characters" required/></span><label htmlFor="confirm-new-password">CONFIRM NEW PASSWORD</label><span className="login-input"><input id="confirm-new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Enter your new password again" required/></span>{error && <span className="login-form-error" role="alert">{error}</span>}<button className="login-submit" disabled={busy}>{busy ? 'Securing your account…' : 'Set new password'} {!busy && <ArrowRight size={16}/>}</button></form><div className="login-security"><ShieldCheck size={15}/><span>Verified on your campus server<small>Your password is never stored or shared in plain text.</small></span></div></div></section></main>
}