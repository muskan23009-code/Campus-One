import {
  BellRing, Building2, Check, Laptop, Layers3, LoaderCircle, LogOut, Moon,
  PanelsTopLeft, Palette, ShieldCheck, Sun, UserRound, UsersRound, Waves,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import packageJson from '../../package.json'

const themeOptions = [
  { id: 'system', label: 'System Default', description: 'Follow your device appearance', Icon: Laptop },
  { id: 'light', label: 'Light', description: 'A bright campus workspace', Icon: Sun },
  { id: 'dark', label: 'Dark', description: 'A comfortable low-light view', Icon: Moon },
]

export default function SettingsPage({ preferences, storageAvailable, onUpdatePreferences, onNavigate, onLogout }) {
  const [rememberedLogin, setRememberedLogin] = useState(null)
  const [sessionPreferenceLoading, setSessionPreferenceLoading] = useState(true)
  const [sessionPreferenceSaving, setSessionPreferenceSaving] = useState(false)
  const [sessionPreferenceError, setSessionPreferenceError] = useState('')

  useEffect(() => {
    let active = true
    api('/api/auth/session-preference').then((result) => {
      if (active) setRememberedLogin(result.enabled)
    }).catch((reason) => {
      if (active) setSessionPreferenceError(reason.message)
    }).finally(() => {
      if (active) setSessionPreferenceLoading(false)
    })
    return () => { active = false }
  }, [])

  function updatePreference(key, value) {
    onUpdatePreferences({ ...preferences, [key]: value })
  }

  async function updateRememberedLogin(enabled) {
    setSessionPreferenceSaving(true)
    setSessionPreferenceError('')
    try {
      const result = await api('/api/auth/session-preference', { method: 'POST', body: { enabled } })
      setRememberedLogin(result.enabled)
    } catch (reason) {
      setSessionPreferenceError(reason.message)
    } finally {
      setSessionPreferenceSaving(false)
    }
  }

  return <section className="settings-page page-enter">
    <header className="settings-page-heading">
      <span className="settings-eyebrow"><Waves size={14}/> YOUR CAMPUS, YOUR WAY</span>
      <h1>Settings</h1>
      <p>Customize your Campus One experience</p>
    </header>

    {!storageAvailable && <p className="settings-storage-notice" role="status">
      Browser storage is unavailable. Preferences will apply for this session only and cannot be saved on this device.
    </p>}

    <div className="settings-sections">
      <section className="settings-card settings-appearance-card">
        <div className="settings-card-heading">
          <span className="settings-icon settings-icon-blue"><Palette size={19}/></span>
          <div><h2>Appearance</h2><p>Choose how Campus One looks on this device</p></div>
        </div>
        <div className="settings-theme-options" role="radiogroup" aria-label="Appearance theme">
          {themeOptions.map(({ id, label, description, Icon }) => <label
            key={id}
            className={`settings-theme-option ${preferences.theme === id ? 'settings-theme-selected' : ''}`}
          >
            <input type="radio" name="campus-theme" value={id} checked={preferences.theme === id} onChange={() => updatePreference('theme', id)}/>
            <span className={`settings-theme-icon settings-theme-icon-${id}`}><Icon size={17}/></span>
            <span className="settings-theme-copy"><strong>{label}</strong><small>{description}</small></span>
            <span className="settings-theme-check" aria-hidden="true">{preferences.theme === id && <Check size={13}/>}</span>
          </label>)}
        </div>
        <fieldset className="density-setting">
          <legend>Layout Density</legend>
          <div className="density-options" role="radiogroup" aria-label="Layout density">
            {[
              { value: 'comfortable', label: 'Comfortable', description: 'Normal spacing, larger cards and easier reading.' },
              { value: 'compact', label: 'Compact', description: 'Reduced spacing and more information visible on screen.' },
            ].map((option) => <label
              key={option.value}
              className={`density-option${preferences.layoutDensity === option.value ? ' density-option-selected' : ''}`}
            >
              <span className="density-option-top"><strong>{option.label}</strong><span className="density-radio" aria-hidden="true"><input type="radio" name="layout-density" value={option.value} checked={preferences.layoutDensity === option.value} onChange={() => updatePreference('layoutDensity', option.value)}/></span></span>
              <span className="density-option-description">{option.description}</span>
            </label>)}
          </div>
        </fieldset>
      </section>

      <section className="settings-card settings-notifications-card">
        <div className="settings-card-heading">
          <span className="settings-icon settings-icon-teal"><BellRing size={19}/></span>
          <div><h2>Notifications</h2><p>Campus updates delivered to your account</p></div>
        </div>
        <div className="settings-notification-info">
          <span className="settings-notification-indicator"><BellRing size={16}/></span>
          <p>In-app notifications are available in the notification center and are delivered according to your account role and campus activity.</p>
        </div>
        <p className="settings-notification-note">Category-specific notification preferences are not supported yet, so no non-functional switches are shown.</p>
      </section>

      <section className="settings-card settings-accessibility-card">
        <div className="settings-card-heading">
          <span className="settings-icon settings-icon-purple"><Waves size={19}/></span>
          <div><h2>Accessibility</h2><p>Adjust motion for a more comfortable experience</p></div>
        </div>
        <label className="settings-switch-row">
          <span className="settings-switch-copy"><strong>Reduce motion</strong><small>Limit animations and transitions throughout Campus One</small></span>
          <input type="checkbox" role="switch" checked={preferences.reduceMotion} onChange={(event) => updatePreference('reduceMotion', event.target.checked)}/>
          <span className="settings-switch-track" aria-hidden="true"><i/></span>
        </label>
      </section>

      <section className="settings-card settings-security-card">
        <div className="settings-card-heading">
          <span className="settings-icon settings-icon-gold"><ShieldCheck size={19}/></span>
          <div><h2>Security</h2><p>Manage your campus account security</p></div>
        </div>
        <div className="settings-action-row">
          <div className="settings-action-copy"><strong>Change Password</strong><small>Update your password securely</small></div>
          <button type="button" className="settings-action-button settings-action-password" onClick={() => onNavigate('profile')}>Change Password <span>→</span></button>
        </div>
      </section>

      <section className="settings-card settings-account-card">
        <div className="settings-card-heading">
          <span className="settings-icon settings-icon-navy"><UserRound size={19}/></span>
          <div><h2>Account &amp; Session</h2><p>Profile and sign-in options</p></div>
        </div>
        <div className="settings-account-actions">
          <div className="settings-action-row">
            <div className="settings-action-copy"><strong>View Profile</strong><small>Personal information and account details</small></div>
            <button type="button" className="settings-action-button" onClick={() => onNavigate('profile')}>Open Profile <span>→</span></button>
          </div>
          <div className="settings-save-login-row">
            <div className="settings-switch-copy">
              <strong>Save Login on This Device</strong>
              <small>Stay signed in on this device so you don't need to enter your password every time.</small>
            </div>
            <label className="settings-switch-control">
              <span className={`settings-save-login-status ${rememberedLogin === true ? 'settings-status-on' : ''}`}>
                {sessionPreferenceLoading ? 'Loading' : rememberedLogin === null ? 'Unavailable' : rememberedLogin ? 'ON' : 'OFF'}
              </span>
              {sessionPreferenceLoading || sessionPreferenceSaving
                ? <LoaderCircle className="settings-session-spinner" size={18} aria-label={sessionPreferenceSaving ? 'Saving login preference' : 'Loading login preference'}/>
                : <span className="settings-switch-row settings-save-login-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Save Login on This Device"
                    checked={rememberedLogin === true}
                    disabled={rememberedLogin === null}
                    onChange={(event) => updateRememberedLogin(event.target.checked)}
                  />
                  <span className="settings-switch-track" aria-hidden="true"><i/></span>
                </span>}
            </label>
          </div>
          {sessionPreferenceError && <p className="settings-session-error" role="alert">{sessionPreferenceError}</p>}
          <p className="settings-session-note"><ShieldCheck size={13}/>Uses a secure, HttpOnly device session for up to 30 days. Your password is never saved in browser storage.</p>
          <div className="settings-action-row settings-signout-row">
            <div className="settings-action-copy"><strong>Sign Out</strong><small>End your current Campus One session</small></div>
            <button type="button" className="settings-signout-button" onClick={onLogout}><LogOut size={15}/>Sign Out</button>
          </div>
        </div>
      </section>

      <section className="settings-card settings-about-card" aria-labelledby="about-campus-one-title">
        <div className="about-brand-block">
          <span className="about-brand-icon"><PanelsTopLeft size={22}/></span>
          <div>
            <span className="about-kicker">SMART CAMPUS MANAGEMENT PLATFORM</span>
            <h2 id="about-campus-one-title">Campus One</h2>
          </div>
        </div>
        <p className="about-description">A unified digital campus platform connecting students, faculty, campus services, activities and communication in one place.</p>
        <div className="about-details">
          <div className="about-detail"><span className="about-detail-icon about-icon-teal"><Building2 size={15}/></span><span><small>INSTITUTION</small><strong>Puran Murti Vidyapeeth</strong></span></div>
          <div className="about-detail"><span className="about-detail-icon about-icon-purple"><UsersRound size={15}/></span><span><small>TEAM</small><strong>THE SUQADNEX</strong></span></div>
          <div className="about-detail"><span className="about-detail-icon about-icon-gold"><Layers3 size={15}/></span><span><small>APPLICATION VERSION</small><strong>v{packageJson.version}</strong></span></div>
        </div>
      </section>
    </div>
    <p className="settings-local-note"><ShieldCheck size={14}/>Appearance and motion preferences are stored on this device only. Passwords and account credentials are never stored in Settings.</p>
  </section>
}
