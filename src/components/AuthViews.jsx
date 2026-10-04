import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, Check,
  GraduationCap, KeyRound, LockKeyhole, ShieldCheck, Trophy,
} from 'lucide-react'
import { api } from '../api/client'
import { APP_ROLES, LOGIN_ROLES } from '../auth/access'

const ROLE_ICONS = { GraduationCap, BriefcaseBusiness, Building2, ShieldCheck, Trophy }
const GENDERS = ['Female', 'Male', 'Non-binary', 'Prefer not to say']

export function RoleChooser({ onChoose }) {
  return <AuthLayout story="A campus that feels like yours." storyLine="Your community, services and campus life. Just where you need them.">
    <span className="login-welcome-label">PURAN MURTI VIDYAPEETH</span>
    <h2>Welcome to campus.</h2>
    <p className="login-description">Choose your campus account to continue.</p>
    <div className="auth-role-options">{LOGIN_ROLES.map(({ role, label, icon }) => {
      const Icon = ROLE_ICONS[icon]
      return <button className="auth-role-option" key={role} onClick={() => onChoose(role)}><span className="auth-role-icon"><Icon size={17}/></span><span>{label}</span><ArrowRight size={15}/></button>
    })}</div>
    <span className="login-security"><ShieldCheck size={15}/><span>Protected campus accounts<small>Selecting a role only opens its sign-in form. It does not create an account.</small></span></span>
  </AuthLayout>
}

export function RoleLoginView({ role, onBack, onRegister, onSubmit, busy, error }) {
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const account = LOGIN_ROLES.find((item) => item.role === role)
  const Icon = ROLE_ICONS[account.icon]

  async function submit(event) {
    event.preventDefault()
    await onSubmit({ userId: userId.trim().toUpperCase(), password })
  }

  return <AuthLayout story="One account. Your campus, closer." storyLine="Your verified campus role connects you to the services you need.">
    <button className="auth-back-link" onClick={onBack}><ArrowLeft size={14}/> All login options</button>
    <span className="auth-selected-role"><Icon size={16}/>{account.label}</span>
    <h2>Welcome back.</h2>
    <p className="login-description">Sign in with the User ID assigned to your campus account.</p>
    <form className="login-form auth-form" onSubmit={submit}>
      <label htmlFor="role-user-id">CAMPUS USER ID</label>
      <span className="login-input"><KeyRound size={15}/><input id="role-user-id" autoComplete="username" autoCapitalize="characters" spellCheck="false" placeholder={idExample(role)} value={userId} onChange={(event) => setUserId(event.target.value.toUpperCase())} required/></span>
      <div className="password-label-row"><label htmlFor="role-password">PASSWORD</label><span>Role verified securely</span></div>
      <span className="login-input"><LockKeyhole size={15}/><input id="role-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button className="password-visibility" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></span>
      {error && <span className="login-form-error" role="alert">{error}</span>}
      <button className="login-submit" disabled={busy}>{busy ? 'Verifying your account…' : 'Sign in securely'}{!busy && <ArrowRight size={16}/>}</button>
    </form>
    <div className="auth-register-prompt"><span>{role === APP_ROLES.ADMIN ? 'Administrator registration requires a protected access code.' : 'New to this campus account?'}</span><button onClick={onRegister}>{role === APP_ROLES.ADMIN ? 'Register Administration' : role === APP_ROLES.STUDENT ? 'Register as a student' : 'Request role access'} <ArrowRight size={13}/></button></div>
    <span className="login-security"><ShieldCheck size={15}/><span>Verified on your campus server<small>Changing the selected login role cannot change account permissions.</small></span></span>
  </AuthLayout>
}

export function RegistrationView({ role, departments, adminAccessConfigured, onBack, onAdminCreated, onSubmitted, initialStep = 0 }) {
  const [fields, setFields] = useState({ gender: '', department: '', photo: '' })
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [step, setStep] = useState(initialStep)
  const [adminCodeVerified, setAdminCodeVerified] = useState(false)
  const [adminCode, setAdminCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const fileInput = useRef(null)
  const admin = role === APP_ROLES.ADMIN
  const student = role === APP_ROLES.STUDENT
  const totalSteps = admin ? 2 : 3
  const account = LOGIN_ROLES.find((item) => item.role === role)

  function update(name, value) { setFields((current) => ({ ...current, [name]: value })) }

  function uploadPhoto(event) {
    const file = event.target.files?.[0]
    setPhotoError('')
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) {
      setPhotoError('Choose a PNG, JPEG or WebP photo under 1 MB.')
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => update('profilePhoto', String(reader.result))
    reader.onerror = () => setPhotoError('That photo could not be read. Choose another file.')
    reader.readAsDataURL(file)
  }

  async function continueStep(event) {
    event.preventDefault()
    setError('')
    if (admin && !adminCodeVerified) {
      if (!adminAccessConfigured) { setError('Administration registration is not configured on this server.'); return }
      setBusy(true)
      try {
        await api('/api/admin/registration-code/verify', { method: 'POST', body: { accessCode: adminCode } })
        setFields((current) => ({ ...current, accessCode: adminCode }))
        setAdminCode('')
        setAdminCodeVerified(true)
        setStep(0)
      } catch (reason) { setError(reason.message) } finally { setBusy(false) }
      return
    }
    if (step < totalSteps - 1) {
      setStep((current) => current + 1)
      return
    }
    if (password.length < 12) { setError('Choose a password with at least 12 characters.'); return }
    if (password !== confirmation) { setError('Your passwords do not match.'); return }
    setBusy(true)
    const { confirmation: ignored, ...profile } = fields
    try {
      const result = await api('/api/registrations', { method: 'POST', body: { ...profile, role, password } })
      if (admin) onAdminCreated(result.user)
      else onSubmitted({ application: result.application, requestToken: result.requestToken })
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  function identityFields() {
    return <>
      <label className="auth-field-wide">FULL NAME<input name="name" autoComplete="name" maxLength={100} value={fields.name || ''} onChange={(event) => update('name', event.target.value)} required/></label>
      {student && <label>DATE OF BIRTH<input name="dateOfBirth" type="date" value={fields.dateOfBirth || ''} onChange={(event) => update('dateOfBirth', event.target.value)} required/></label>}
      <label>GENDER<select name="gender" value={fields.gender} onChange={(event) => update('gender', event.target.value)} required><option value="">Select…</option>{GENDERS.map((gender) => <option key={gender}>{gender}</option>)}</select></label>
      {admin && <label className="auth-field-wide">DESIGNATION / ROLE<input name="designation" maxLength={100} value={fields.designation || ''} onChange={(event) => update('designation', event.target.value)} required/></label>}
      <label className="auth-field-wide auth-photo-field">PROFILE PHOTO <span className="optional-label">OPTIONAL · PNG, JPEG OR WEBP · MAX 1 MB</span><input ref={fileInput} name="profilePhoto" type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadPhoto}/>{photoError && <span className="login-form-error">{photoError}</span>}</label>
      {fields.profilePhoto && <img className="auth-photo-preview" src={fields.profilePhoto} alt="Profile photo preview"/>}
    </>
  }

  function detailFields() {
    if (student) return <>
      <label className="auth-field-wide">ROLL / ENROLLMENT NUMBER<input name="rollNumber" maxLength={64} value={fields.rollNumber || ''} onChange={(event) => update('rollNumber', event.target.value)} required/></label>
      <label>COURSE<input name="course" maxLength={100} value={fields.course || ''} onChange={(event) => update('course', event.target.value)} required/></label>
      <label>DEPARTMENT<select name="department" value={fields.department} onChange={(event) => update('department', event.target.value)} required><option value="">Select…</option>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>
      <label>SEMESTER / YEAR<input name="semester" maxLength={40} value={fields.semester || ''} onChange={(event) => update('semester', event.target.value)} placeholder="e.g. Semester 3" required/></label>
      <label>ADMISSION YEAR<input name="admissionYear" type="number" min="1980" max={new Date().getFullYear() + 1} value={fields.admissionYear || ''} onChange={(event) => update('admissionYear', event.target.value)} required/></label>
    </>
    if ([APP_ROLES.HOD, APP_ROLES.STAFF].includes(role)) return <>
      <label className="auth-field-wide">DEPARTMENT<select name="department" value={fields.department} onChange={(event) => update('department', event.target.value)} required><option value="">Select…</option>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>
      <label className="auth-field-wide">DESIGNATION<input name="designation" maxLength={100} value={fields.designation || ''} onChange={(event) => update('designation', event.target.value)} required/></label>
      <label>JOINING YEAR<input name="joiningYear" type="number" min="1980" max={new Date().getFullYear() + 1} value={fields.joiningYear || ''} onChange={(event) => update('joiningYear', event.target.value)} required/></label>
    </>
    if (role === APP_ROLES.SPORTS) return <>
      <label className="auth-field-wide">DEPARTMENT <span className="optional-label">OPTIONAL</span><select name="department" value={fields.department} onChange={(event) => update('department', event.target.value)}><option value="">Not applicable</option>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>
      <label>SPORT<input name="sport" maxLength={80} value={fields.sport || ''} onChange={(event) => update('sport', event.target.value)} required/></label>
      <label>TEAM / CATEGORY<input name="teamCategory" maxLength={100} value={fields.teamCategory || ''} onChange={(event) => update('teamCategory', event.target.value)} required/></label>
    </>
    return null
  }

  function contactFields() {
    return <>
      <label className="auth-field-wide">MOBILE NUMBER<input name="mobile" autoComplete="tel" inputMode="tel" maxLength={24} value={fields.mobile || ''} onChange={(event) => update('mobile', event.target.value)} required/></label>
      <label className="auth-field-wide">{student || role === APP_ROLES.SPORTS ? 'COLLEGE EMAIL / EMAIL' : 'OFFICIAL EMAIL'}<input name="email" type="email" autoComplete="email" maxLength={254} value={fields.email || ''} onChange={(event) => update('email', event.target.value)} required/></label>
      <label className="auth-field-wide">PASSWORD<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required/></label>
      <label className="auth-field-wide">CONFIRM PASSWORD<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required/></label>
      <p className="auth-password-note auth-field-wide"><LockKeyhole size={12}/> You create this password. Campus One never shares or returns it.</p>
    </>
  }

  const wizardStepNames = admin ? ['ADMIN DETAILS', 'CONTACT & PASSWORD'] : ['PERSONAL DETAILS', student ? 'ENROLLMENT DETAILS' : 'ROLE DETAILS', 'CONTACT & PASSWORD']
  const stepLabel = admin && !adminCodeVerified ? 'ADMINISTRATION ACCESS CODE' : `STEP ${step + 1} OF ${totalSteps} · ${wizardStepNames[step]}`

  return <AuthLayout story={admin ? 'Your campus. Built with care.' : 'Your place in the campus.'} storyLine={admin ? 'Securely establish the first Administration account.' : 'Share your details and set your own private password.'}>
    <button className="auth-back-link" onClick={onBack}><ArrowLeft size={14}/> Back to {admin ? 'Administration Login' : `${account.label}`}</button>
    <span className="login-welcome-label">{admin ? 'PROTECTED ADMINISTRATION SETUP' : `${account.label.toUpperCase()} · APPLICATION`}</span>
    <h2>{admin ? 'Register Administration.' : student ? 'Start your student registration.' : 'Request campus access.'}</h2>
    <p className="login-description">{student ? 'Your department HOD reviews your request. You create your own password.' : admin ? 'Verify the private Administration Access Code before creating your own account.' : 'Administration reviews your request. Set your own password; it will be activated after approval.'}</p>
    {admin && !adminAccessConfigured && <span className="login-form-error" role="status">Administration registration is not configured on this server. Ask the campus operator to set its private access-code environment variable.</span>}
    {!(admin && !adminCodeVerified) && <div className="registration-stepper" aria-label={stepLabel}><span>STEP {step + 1} OF {totalSteps}</span><div>{Array.from({ length: totalSteps }, (_, index) => <i className={index <= step ? 'registration-step-active' : ''} key={index}/>)}</div><strong>{wizardStepNames[step]}</strong></div>}
    <form className="login-form auth-registration-form" onSubmit={continueStep}>
      {admin && !adminCodeVerified ? <div className="auth-form-grid"><label className="auth-field-wide">ADMINISTRATION ACCESS CODE<input name="accessCode" type="password" autoComplete="off" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} required/></label></div> : <div className="auth-form-grid">{step === 0 ? identityFields() : admin || step === 2 ? contactFields() : detailFields()}</div>}
      {admin && !adminCodeVerified && <p className="auth-password-note"><LockKeyhole size={12}/> The code is checked by the server and is never displayed in the interface.</p>}
      {error && <span className="login-form-error" role="alert">{error}</span>}
      <div className="registration-navigation">{!(admin && !adminCodeVerified) && step > 0 && <button type="button" className="modal-cancel" onClick={() => { setStep((current) => current - 1); setError('') }}>BACK</button>}<button className="login-submit" disabled={busy || (admin && !adminAccessConfigured)}>{busy ? admin && !adminCodeVerified ? 'Verifying code…' : step === totalSteps - 1 ? 'Submitting securely…' : 'Checking this step…' : admin && !adminCodeVerified ? 'CONTINUE' : step < totalSteps - 1 ? 'NEXT' : student ? 'SUBMIT REGISTRATION REQUEST' : role === APP_ROLES.ADMIN ? 'SET UP ADMINISTRATION' : 'REQUEST ACCESS'} {!busy && <ArrowRight size={16}/>}</button></div>
    </form>
  </AuthLayout>
}

export function RegistrationStatus({ status, onBack, onCheck }) {
  const [requestId, setRequestId] = useState(status.application.id)
  const [requestToken, setRequestToken] = useState(status.requestToken)
  const [result, setResult] = useState(status.application)
  const [notifications, setNotifications] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function refreshStatus() {
      try {
        const response = await api('/api/registrations/status', { method: 'POST', body: { requestId, requestToken } })
        if (active) { setResult(response.application); setNotifications(response.notifications || []) }
      } catch { /* Manual status checks provide visible retry errors. */ }
    }
    refreshStatus()
    const interval = window.setInterval(refreshStatus, 5000)
    return () => { active = false; window.clearInterval(interval) }
  }, [requestId, requestToken])

  async function checkStatus() {
    setBusy(true)
    setError('')
    try {
      const statusResult = await api('/api/registrations/status', { method: 'POST', body: { requestId, requestToken } })
      setResult(statusResult.application)
      setNotifications(statusResult.notifications || [])
    }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  async function markNotificationRead(notification) {
    setError('')
    try {
      await api('/api/registrations/notifications/read', { method: 'POST', body: { requestId, requestToken, notificationId: notification.id } })
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item))
    } catch (reason) { setError(reason.message) }
  }

  const accepted = result.status === 'Accepted'
  return <AuthLayout story="Your campus account, underway." storyLine="Your application is private and reviewed by the right campus team.">
    <span className="login-welcome-label">APPLICATION STATUS</span><h2>{accepted ? 'Your request is approved.' : result.status === 'Rejected' ? 'Your request was reviewed.' : 'Your request is with campus.'}</h2>
    <p className="login-description">{accepted && result.userId ? `Your User ID is ${result.userId}. Sign in with the password you created.` : result.status === 'Rejected' ? 'This account cannot sign in. Contact campus administration for next steps.' : `Your ${result.role} request has been sent for review.`}</p>
    <div className="application-tracker"><span className={`application-status application-${result.status.toLowerCase()}`}><i/>{result.status}</span><span>APPLICATION REFERENCE</span><code>{requestId}</code><span>PRIVATE STATUS TOKEN</span><code>{requestToken}</code><small>Save this reference and token to check your application status later.</small></div>
    {notifications.length > 0 && <section className="application-notifications"><span className="section-eyebrow">CAMPUS NOTIFICATIONS</span>{notifications.map((notification) => <article key={notification.id}><strong>{notification.title}</strong><span>{notification.message}</span><small>{new Date(notification.createdAt).toLocaleString()}</small>{!notification.readAt && <button type="button" onClick={() => markNotificationRead(notification)}>Mark as read</button>}</article>)}</section>}
    <button className="login-submit application-refresh" onClick={checkStatus} disabled={busy}>{busy ? 'Checking…' : 'Check application status'} {!busy && <Check size={15}/>}</button>
    {error && <span className="login-form-error" role="alert">{error}</span>}
    <button className="first-admin-link" onClick={onBack}>Back to campus login <ArrowRight size={13}/></button>
  </AuthLayout>
}

function AuthLayout({ children, story, storyLine }) {
  return <main className="login-shell page-enter"><section className="login-photo" aria-label="Puran Murti Vidyapeeth campus"><div className="login-photo-background"/><div className="login-image-shade"/><div className="login-brand"><span className="brand-mark"><span/><span/><span/><span/></span><span className="brand-name">campus<span>one</span></span></div><div className="login-story"><span className="login-kicker"><span/> CAMPUS, CONNECTED</span><h1>{story}</h1><p>{storyLine}</p><span className="login-campus-label"><span className="institution-mark">P</span><span>Puran Murti Vidyapeeth<small>Sonipat, Haryana</small></span></span></div><span className="login-image-credit">PURAN MURTI VIDYAPEETH · YOUR CAMPUS, CLOSER</span></section><section className="login-form-side"><div className="login-form-wrap auth-panel">{children}</div></section></main>
}

function idExample(role) {
  return { Student: 'e.g. PM-S1001', Staff: 'e.g. PM-ST001', HOD: 'e.g. PM-HOD001', 'Sports Captain': 'e.g. PM-SC001', Administration: 'e.g. PM-AD001' }[role]
}