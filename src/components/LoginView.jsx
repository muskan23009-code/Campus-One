import { useRef, useState } from 'react'
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'

export default function LoginView({ onLogin, error, loading, onSetup, canSetup }) {
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [help, setHelp] = useState('')
  const idInput = useRef(null)

  function submit(event) {
    event.preventDefault()
    if (userId.trim() && password) onLogin({ userId: userId.trim().toUpperCase(), password })
  }

  return (
    <main className="login-shell page-enter">
      <section className="login-photo" aria-label="Campus life at Puran Murti Vidyapeeth">
        <div className="login-photo-background" />
        <div className="login-image-shade" />
        <a className="login-brand" href="#home" onClick={(event) => event.preventDefault()}><span className="brand-mark"><span /><span /><span /><span /></span><span className="brand-name">campus<span>one</span></span></a>
        <div className="login-story"><span className="login-kicker"><span /> CAMPUS, CONNECTED</span><h1>One place.<br />A <em>whole campus.</em></h1><p>Your classes, community and campus services.<br />Just where you need them.</p><span className="login-campus-label"><span className="institution-mark">P</span><span>Puran Murti Vidyapeeth<small>Sonipat, Haryana</small></span></span></div>
        <span className="login-image-credit">PURAN MURTI VIDYAPEETH · YOUR CAMPUS, CLOSER</span>
      </section>
      <section className="login-form-side"><div className="login-form-wrap"><span className="login-welcome-label">GOOD TO HAVE YOU HERE</span><h2>Welcome back.</h2><p className="login-description">Sign in with your institutional account to make this place yours.</p>
        <span className="login-id-note">Your role and dashboard are identified automatically from your campus ID. Example IDs: Student PM-S1047 · Staff PM-ST12 · Administration PM-AD01 · Sports Captain PM-SC01.</span>
        <form className="login-form" onSubmit={submit}><label htmlFor="campus-user-id">CAMPUS USER ID</label><span className="login-input"><KeyRound size={15} /><input ref={idInput} id="campus-user-id" type="text" placeholder="e.g. PM-S1047" autoCapitalize="characters" autoComplete="username" spellCheck="false" value={userId} onChange={(event) => setUserId(event.target.value.toUpperCase())} required /></span><div className="password-label-row"><label htmlFor="campus-password">PASSWORD</label><button type="button" onClick={() => { setHelp('Contact campus administration to securely reset your password.'); if (!userId) idInput.current?.focus() }}>Forgot password?</button></div><span className="login-input"><LockKeyhole size={15} /><input id="campus-password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button className="password-visibility" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></span><label className="remember-login"><input type="checkbox" defaultChecked /><span>Keep me signed in on this device</span></label>{error && <span className="login-form-error" role="alert">{error}</span>}<button className="login-submit" type="submit" disabled={loading}>{loading ? 'Signing you in…' : 'Sign in to your campus'} {!loading && <ArrowRight size={16} />}</button></form>
        {help && <div className="login-help-notice" role="status">{help}</div>}
        <div className="login-security"><ShieldCheck size={15} /><span>Your campus account is protected.<br /><small>Only your institution can access your student information.</small></span></div>
        <span className="login-help"><KeyRound size={12} /> Having trouble signing in? <button type="button" onClick={() => setHelp('Visit the student services office at Puran Murti Vidyapeeth for help with your institutional account.')}>Contact student support</button></span>
        {canSetup && <button type="button" className="first-admin-link" onClick={onSetup}>Set up campus administration</button>}
        <span className="login-setup-note">Institutional sign-in ready to connect to your campus identity provider.</span>
      </div></section>
    </main>
  )
}

export function AdminSetupView({ onCreate, loading, error, onBack }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (password.length < 12) return setFormError('Choose a password with at least 12 characters.')
    if (password !== confirmation) return setFormError('The passwords do not match.')
    setFormError('')
    await onCreate({ name, email, password })
  }

  return <main className="login-shell page-enter"><section className="login-photo"><div className="login-photo-background"/><div className="login-image-shade"/><a className="login-brand" href="#home" onClick={(event) => event.preventDefault()}><span className="brand-mark"><span/><span/><span/><span/></span><span className="brand-name">campus<span>one</span></span></a><div className="login-story"><span className="login-kicker"><span/> CAMPUS, CONNECTED</span><h1>Start with<br/><em>your campus.</em></h1><p>Set up the first administrator account<br/>to begin managing your campus.</p><span className="login-campus-label"><span className="institution-mark">P</span><span>Puran Murti Vidyapeeth<small>Sonipat, Haryana</small></span></span></div></section><section className="login-form-side"><div className="login-form-wrap"><span className="login-welcome-label">ONE-TIME CAMPUS SETUP</span><h2>Meet your administrator.</h2><p className="login-description">The first account is securely assigned Administration permissions.</p><div className="bootstrap-id-preview"><span>YOUR ADMINISTRATION USER ID</span><strong>PM-AD01</strong><small>Generated automatically · Cannot be changed</small></div><form className="login-form setup-form" onSubmit={submit}><label htmlFor="setup-name">FULL NAME</label><span className="login-input"><input id="setup-name" autoComplete="name" placeholder="Campus administrator" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100}/></span><label htmlFor="setup-email">INSTITUTIONAL EMAIL <span className="optional-label">OPTIONAL</span></label><span className="login-input"><input id="setup-email" type="email" autoComplete="email" placeholder="you@puranmurti.edu.in" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254}/></span><label htmlFor="setup-password">CHOOSE A PASSWORD</label><span className="login-input"><LockKeyhole size={15}/><input id="setup-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} placeholder="At least 12 characters" value={password} onChange={(event) => setPassword(event.target.value)} required/><button className="password-visibility" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={15}/> : <Eye size={15}/>}</button></span><label htmlFor="setup-confirm">CONFIRM PASSWORD</label><span className="login-input"><LockKeyhole size={15}/><input id="setup-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} placeholder="Enter your password again" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required/></span>{(formError || error) && <span className="login-form-error" role="alert">{formError || error}</span>}<button className="login-submit" type="submit" disabled={loading}>{loading ? 'Setting up campus…' : 'Create administrator account'} {!loading && <ArrowRight size={16}/>}</button></form><button type="button" className="first-admin-link" onClick={onBack}>Already have an account? Sign in</button><div className="login-security"><ShieldCheck size={15}/><span>One-time secure setup<small>Only the first account can set up campus administration.</small></span></div></div></section></main>
}