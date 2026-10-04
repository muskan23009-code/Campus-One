import { useState } from 'react'
import { ArrowRight, KeyRound, LogOut, ShieldCheck, X } from 'lucide-react'
import { api } from '../api/client'

export default function ProfileDialog({ user, onClose, onLogout, onUserChange, onNotify }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function changePassword(event) {
    event.preventDefault()
    if (newPassword.length < 12) { setError('Choose a password with at least 12 characters.'); return }
    if (newPassword !== confirmation) { setError('The new passwords do not match.'); return }
    setError('')
    setBusy(true)
    try {
      const result = await api('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      onUserChange(result.user)
      onNotify('Your password has been changed successfully.')
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  return <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="feedback-modal account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title"><div className="modal-top"><span className="modal-icon account-modal-icon"><span>{initials(user.name)}</span></span><button className="icon-btn" onClick={onClose} aria-label="Close profile"><X size={18}/></button></div><span className="section-eyebrow">YOUR CAMPUS ACCOUNT</span><h2 id="account-title">{user.name}</h2><div className="account-information"><span>USER ID</span><strong>{user.id}</strong><span>CAMPUS ROLE</span><strong><span className={`role-tag ${roleClass(user.role)}`}>{user.role}</span></strong>{user.email && <><span>EMAIL</span><strong>{user.email}</strong></>}</div><form className="password-change-form" onSubmit={changePassword}><div className="password-change-heading"><KeyRound size={14}/><span>Change password</span></div><label htmlFor="current-account-password">CURRENT PASSWORD</label><input id="current-account-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required/><label htmlFor="new-account-password">NEW PASSWORD</label><input id="new-account-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required/><label htmlFor="confirm-account-password">CONFIRM NEW PASSWORD</label><input id="confirm-account-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required/><span className="form-hint">At least 12 characters. Passwords are never returned to the browser.</span>{error && <span className="login-form-error" role="alert">{error}</span>}<div className="modal-actions"><button type="button" className="modal-cancel account-logout" onClick={onLogout}><LogOut size={13}/> Sign out</button><button className="module-primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'} <ArrowRight size={13}/></button></div></form><span className="modal-private"><ShieldCheck size={12}/> Session secured · Changes checked by the campus server.</span></section></div>
}

function initials(name) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }
function roleClass(role) { return { Student: 'role-student', Staff: 'role-staff', Administration: 'role-admin', 'Sports Captain': 'role-sports' }[role] || '' }