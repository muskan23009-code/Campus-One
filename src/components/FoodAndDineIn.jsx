import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Bell, Check, Clock3, Megaphone, ShieldAlert, Utensils } from 'lucide-react'
import { api } from '../api/client'
import Canteen from './Canteen.jsx'

const MEALS = ['Breakfast', 'Lunch', 'Dinner']
const CROWD_LEVELS = ['Low', 'Medium', 'High']
const MESS_ROLES = ['Student', 'Staff', 'Sports Captain', 'Administration']

function emptySettings() {
  return {
    status: 'Closed',
    timings: Object.fromEntries(MEALS.map((meal) => [meal, { start: '', end: '' }])),
    crowdSchedule: Object.fromEntries(MEALS.map((meal) => [meal, { start: '', end: '', level: '' }])),
  }
}

function formatTime(value) {
  if (!value) return ''
  const [hour, minute] = value.split(':').map(Number)
  return new Date(Date.UTC(2020, 0, 1, hour, minute)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}

export default function FoodAndDineIn({ user, onNotify, onMessFeedback, onNavigate, initialSection = 'home' }) {
  const canViewMess = MESS_ROLES.includes(user.role)
  const canManage = user.role === 'Administration'
  const [section, setSection] = useState(initialSection)
  const [mess, setMess] = useState(null)
  const [settingsDraft, setSettingsDraft] = useState(emptySettings)
  const [noticeDraft, setNoticeDraft] = useState(null)
  const [loading, setLoading] = useState(canViewMess)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setSection(initialSection), [initialSection])

  useEffect(() => {
    if (!canViewMess) return undefined
    let active = true
    api('/api/mess').then((result) => {
      if (!active) return
      setMess(result)
      setSettingsDraft(result.settings)
    }).catch((reason) => { if (active) setError(reason.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [canViewMess])

  function updateWindow(group, meal, key, value) {
    setSettingsDraft((current) => ({
      ...current,
      [group]: { ...current[group], [meal]: { ...current[group][meal], [key]: value } },
    }))
  }

  async function saveSettings(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/mess/settings', { method: 'PATCH', body: settingsDraft })
      setSettingsDraft(result.settings)
      setMess((current) => ({ ...current, settings: result.settings }))
      onNotify('College Mess settings saved.')
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  async function saveNotice(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = noticeDraft.id
        ? await api(`/api/mess/notices/${encodeURIComponent(noticeDraft.id)}`, { method: 'PATCH', body: { title: noticeDraft.title, description: noticeDraft.description } })
        : await api('/api/mess/notices', { method: 'POST', body: { title: noticeDraft.title, description: noticeDraft.description } })
      setMess((current) => ({ ...current, notices: [result.notice, ...current.notices.filter((notice) => notice.id !== result.notice.id)] }))
      setNoticeDraft(null)
      onNotify(noticeDraft.id ? 'Mess notice updated.' : 'Mess notice published.')
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  async function deactivateNotice(notice) {
    setBusy(true)
    setError('')
    try {
      const result = await api(`/api/mess/notices/${encodeURIComponent(notice.id)}`, { method: 'PATCH', body: { active: false } })
      setMess((current) => ({ ...current, notices: current.notices.map((item) => item.id === notice.id ? result.notice : item) }))
      onNotify('Mess notice deactivated.')
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  if (section === 'canteen') return <Canteen user={user} onNotify={onNotify} onBack={() => onNavigate ? onNavigate('food') : setSection('home')} />

  if (section === 'mess') return <div className="module-page page-enter food-dine-page">
    <div className="module-breadcrumb">CAMPUS <span>›</span> FOOD & DINE IN <span>›</span> COLLEGE MESS</div>
    <section className="module-hero food-dine-hero">
      <div className="module-title-area"><span className="module-icon mess-module-icon"><Utensils size={20}/></span><span className="module-eyebrow">COLLEGE MESS</span><h1>Mess information<span className="module-title-period">.</span></h1><p>Service status, announced meal timings, scheduled crowd levels, notices, and a direct route for your feedback.</p></div>
      <button className="food-dine-back" onClick={() => setSection('home')}><ArrowLeft size={14}/> Food & Dine In</button>
    </section>
    {error && <div className="management-alert" role="alert"><ShieldAlert size={15}/>{error}</div>}
    {loading ? <div className="management-state"><span className="loading-spinner"/>Loading College Mess information…</div> : <>
      <section className="mess-status-band" aria-label="College Mess status">
        <div><span className="section-eyebrow">CURRENT SERVICE STATUS</span><strong className={`mess-status-pill ${mess?.settings.status === 'Open' ? 'mess-status-open' : 'mess-status-closed'}`}><i/>{mess?.settings.status || 'Closed'}</strong></div>
        {canManage && <div className="mess-status-actions" aria-label="Set College Mess status">{['Open', 'Closed'].map((status) => <button key={status} type="button" className={settingsDraft.status === status ? 'mess-choice-active' : ''} aria-pressed={settingsDraft.status === status} onClick={() => setSettingsDraft((current) => ({ ...current, status }))}>{status}</button>)}</div>}
      </section>

      {canManage && <form className="mess-settings-panel" onSubmit={saveSettings}>
        <div className="food-dine-section-heading"><div><span className="section-eyebrow">ADMINISTRATION</span><h2>Service configuration</h2></div></div>
        <div className="mess-meal-settings">{MEALS.map((meal) => <div className="mess-meal-setting" key={meal}>
          <strong>{meal}</strong>
          <label>MEAL START<input type="time" value={settingsDraft.timings[meal].start} onChange={(event) => updateWindow('timings', meal, 'start', event.target.value)}/></label>
          <label>MEAL END<input type="time" value={settingsDraft.timings[meal].end} onChange={(event) => updateWindow('timings', meal, 'end', event.target.value)}/></label>
          <label>CROWD START<input type="time" value={settingsDraft.crowdSchedule[meal].start} onChange={(event) => updateWindow('crowdSchedule', meal, 'start', event.target.value)}/></label>
          <label>CROWD END<input type="time" value={settingsDraft.crowdSchedule[meal].end} onChange={(event) => updateWindow('crowdSchedule', meal, 'end', event.target.value)}/></label>
          <label>CROWD LEVEL<select value={settingsDraft.crowdSchedule[meal].level} onChange={(event) => updateWindow('crowdSchedule', meal, 'level', event.target.value)}><option value="">Not scheduled</option>{CROWD_LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label>
        </div>)}</div>
        <div className="mess-config-footer"><p>Crowd levels are fixed schedules, not live measurements. No cameras or camera-based detection are used.</p><button className="module-primary" disabled={busy}>{busy ? 'Saving…' : 'Save mess settings'} <Check size={14}/></button></div>
      </form>}

      <div className="mess-info-grid">
        <section className="mess-info-panel">
          <div className="food-dine-section-heading"><div><span className="section-eyebrow">ANNOUNCED SERVICE WINDOWS</span><h2>Meal timings</h2></div><Clock3 size={17}/></div>
          <div className="mess-meal-list">{MEALS.map((meal) => {
            const timing = mess?.settings.timings[meal]
            const announced = timing?.start && timing?.end
            return <article className="mess-meal-row" key={meal}><span>{meal}</span><strong>{announced ? `${formatTime(timing.start)} – ${formatTime(timing.end)}` : 'Timings not announced'}</strong></article>
          })}</div>
        </section>
        <section className="mess-info-panel mess-crowd-panel">
          <div className="food-dine-section-heading"><div><span className="section-eyebrow">FIXED TIME-BASED SCHEDULE</span><h2>Mess crowd status</h2></div><span className="mess-schedule-mark">SCHEDULE</span></div>
          <div className="mess-meal-list">{MEALS.map((meal) => {
            const crowd = mess?.settings.crowdSchedule[meal]
            const scheduled = crowd?.start && crowd?.end && crowd?.level
            return <article className="mess-meal-row" key={meal}><span>{meal}</span><strong>{scheduled ? <>{crowd.level}<small> · {formatTime(crowd.start)}–{formatTime(crowd.end)}</small></> : 'No crowd status scheduled'}</strong></article>
          })}</div>
          <p className="mess-schedule-note">Schedule-based, not live crowd measurement.</p>
        </section>
      </div>

      <section className="mess-feedback-panel"><span className="mess-feedback-icon"><Bell size={17}/></span><div><span className="section-eyebrow">MESS FEEDBACK & COMPLAINTS</span><h2>Something about the mess to report?</h2><p>Share a food-quality, cleanliness, hygiene, or other mess-related issue. Updates stay in your existing complaint tracker.</p></div>{user.role === 'Student' && <button className="module-primary" onClick={onMessFeedback}>Submit feedback <ArrowRight size={14}/></button>}</section>

      <section className="mess-notices-section">
        <div className="food-dine-section-heading"><div><span className="section-eyebrow">OFFICIAL UPDATES</span><h2>Mess notices</h2></div>{canManage && <button className="module-primary" onClick={() => setNoticeDraft({ id: '', title: '', description: '' })}><Megaphone size={14}/> New notice</button>}</div>
        {noticeDraft && <form className="mess-notice-form" onSubmit={saveNotice}><label>NOTICE TITLE<input required minLength={3} maxLength={120} value={noticeDraft.title} onChange={(event) => setNoticeDraft({ ...noticeDraft, title: event.target.value })}/></label><label>DETAILS<textarea required minLength={3} maxLength={5000} rows={3} value={noticeDraft.description} onChange={(event) => setNoticeDraft({ ...noticeDraft, description: event.target.value })}/></label><div className="approval-request-actions"><button type="button" className="modal-cancel" onClick={() => setNoticeDraft(null)}>Cancel</button><button className="module-primary" disabled={busy}>{busy ? 'Saving…' : noticeDraft.id ? 'Save changes' : 'Publish notice'}</button></div></form>}
        {mess?.notices?.length ? <div className="mess-notice-list">{mess.notices.map((notice) => <article className={`mess-notice ${notice.active ? '' : 'mess-notice-inactive'}`} key={notice.id}><span className="mess-notice-mark"><Megaphone size={15}/></span><div><strong>{notice.title}</strong><p>{notice.description}</p><small>{notice.active ? 'Active' : 'Inactive'} · {new Date(notice.updatedAt || notice.createdAt).toLocaleString()}</small></div>{canManage && <div className="mess-notice-actions"><button type="button" onClick={() => setNoticeDraft({ id: notice.id, title: notice.title, description: notice.description })}>Edit</button>{notice.active && <button type="button" disabled={busy} onClick={() => deactivateNotice(notice)}>Deactivate</button>}</div>}</article>)}</div> : <div className="management-state">No mess notices have been published.</div>}
      </section>
    </>}
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>College Mess information</span><span>Campus One · Food & Dine In</span></footer>
  </div>

  return <div className="module-page page-enter food-dine-page">
    <div className="module-breadcrumb">CAMPUS <span>›</span> FOOD & DINE IN</div>
    <section className="module-hero food-dine-hero"><div className="module-title-area"><span className="module-icon"><Utensils size={20}/></span><span className="module-eyebrow">CAMPUS DINING</span><h1>Food & Dine In<span className="module-title-period">.</span></h1><p>Choose the canteen’s configured menu and ordering tools, or view fixed College Mess information.</p></div></section>
    {error && <div className="management-alert" role="alert"><ShieldAlert size={15}/>{error}</div>}
    <div className={`food-dine-options ${canViewMess ? '' : 'food-dine-options-single'}`}>
      <button className="food-dine-option canteen-option" onClick={() => onNavigate ? onNavigate('canteen') : setSection('canteen')}><span className="food-dine-option-icon"><Utensils size={19}/></span><span className="section-eyebrow">MENU & ORDERS</span><strong>Canteen</strong><span>Browse configured food items, prices, Half/Full options, and track your orders.</span><i><ArrowRight size={15}/></i></button>
      {canViewMess && <button className="food-dine-option mess-option" onClick={() => setSection('mess')}><span className="food-dine-option-icon"><Clock3 size={19}/></span><span className="section-eyebrow">FIXED MEALS · NO PRE-ORDER</span><strong>College Mess</strong><span>View service status, announced timings, scheduled crowd levels, and notices.</span><i><ArrowRight size={15}/></i></button>}
    </div>
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Canteen orders use the existing campus service</span><span>Campus One · Food & Dine In</span></footer>
  </div>
}