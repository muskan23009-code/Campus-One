import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Clock3, CookingPot, Megaphone, ShieldAlert, Utensils } from 'lucide-react'
import { api } from '../api/client'
import Canteen from './Canteen.jsx'

const MEALS = ['Breakfast', 'Brunch', 'Lunch', 'Dinner']
const MESS_ROLES = ['Student', 'Staff', 'Sports Captain', 'Administration']

function emptySettings() {
  return { timings: Object.fromEntries(MEALS.map((meal) => [meal, { start: '', end: '' }])) }
}

function timeParts(value) {
  if (!value) return { hour: '', minute: '', period: '' }
  const [hour, minute] = value.split(':').map(Number)
  return {
    hour: String(hour % 12 || 12),
    minute: String(minute).padStart(2, '0'),
    period: hour < 12 ? 'AM' : 'PM',
  }
}

function storedTime({ hour, minute, period }) {
  if (!hour || !minute || !period) return ''
  const hour24 = Number(hour) % 12 + (period === 'PM' ? 12 : 0)
  return `${String(hour24).padStart(2, '0')}:${minute}`
}

function TimePicker({ meal, edge, value, onChange, onIncompleteChange }) {
  const [parts, setParts] = useState(() => timeParts(value))

  useEffect(() => setParts(timeParts(value)), [value])

  function updatePart(key, nextValue) {
    const nextParts = { ...parts, [key]: nextValue }
    setParts(nextParts)
    onChange(storedTime(nextParts))
    const hasAnyPart = Object.values(nextParts).some(Boolean)
    const hasAllParts = Object.values(nextParts).every(Boolean)
    onIncompleteChange(hasAnyPart && !hasAllParts)
  }

  const label = `${meal} ${edge.toLowerCase()} time`
  return <div className="mess-time-field">
    <span>{edge} time</span>
    <div className="mess-time-picker" role="group" aria-label={label}>
      <select aria-label={`${label} hour`} value={parts.hour} onChange={(event) => updatePart('hour', event.target.value)}>
        <option value="">HH</option>
        {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((hour) => <option key={hour} value={hour}>{hour}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select aria-label={`${label} minute`} value={parts.minute} onChange={(event) => updatePart('minute', event.target.value)}>
        <option value="">MM</option>
        {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map((minute) => <option key={minute}>{minute}</option>)}
      </select>
      <select aria-label={`${label} AM or PM`} value={parts.period} onChange={(event) => updatePart('period', event.target.value)}>
        <option value="">AM/PM</option>
        <option>AM</option>
        <option>PM</option>
      </select>
    </div>
  </div>
}

function formatTime(value) {
  if (!value) return ''
  const [hour, minute] = value.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

function announcedWindow(timing) {
  const start = formatTime(timing?.start || '')
  const end = formatTime(timing?.end || '')
  if (!start || !end) return 'Timings not announced'
  return `${start} – ${end}${timing.end < timing.start ? ' · next day' : ''}`
}

export default function FoodAndDineIn({ user, onNotify, onNavigate, initialSection = 'home' }) {
  const canViewMess = MESS_ROLES.includes(user.role)
  const canManage = user.role === 'Administration'
  const [section, setSection] = useState(initialSection)
  const [mess, setMess] = useState(null)
  const [settingsDraft, setSettingsDraft] = useState(emptySettings)
  const [incompleteTimes, setIncompleteTimes] = useState({})
  const [noticeDraft, setNoticeDraft] = useState({ title: '', description: '' })
  const [issuingNotice, setIssuingNotice] = useState(false)
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

  function updateWindow(meal, edge, value) {
    setSettingsDraft((current) => ({
      ...current,
      timings: { ...current.timings, [meal]: { ...current.timings[meal], [edge]: value } },
    }))
  }

  async function saveSettings(event) {
    event.preventDefault()
    if (Object.values(incompleteTimes).some(Boolean)) {
      setError('Complete each selected time with an hour, minute, and AM/PM, or clear it to leave the meal unannounced.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/mess/settings', { method: 'PATCH', body: settingsDraft })
      setSettingsDraft(result.settings)
      setMess((current) => ({ ...current, settings: result.settings }))
      onNotify('College Mess meal timings saved.')
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  async function saveNotice(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/notices', {
        method: 'POST',
        body: {
          title: noticeDraft.title,
          description: noticeDraft.description,
          category: 'Canteen',
          priority: 'Normal',
          pinned: false,
          target: { type: 'ROLE', role: 'Student' },
          publishAt: new Date().toISOString(),
          expiresAt: '',
          attachmentUrl: '',
          attachmentName: '',
        },
      })
      setIssuingNotice(false)
      setNoticeDraft({ title: '', description: '' })
      onNotify(`Mess announcement published to ${result.recipientCount} student${result.recipientCount === 1 ? '' : 's'} in Notices & Announcements.`)
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  if (section === 'canteen') return <Canteen user={user} onNotify={onNotify} onBack={() => onNavigate ? onNavigate('food') : setSection('home')} />

  if (section === 'mess') return <div className="module-page page-enter food-dine-page mess-page">
    <div className="module-breadcrumb">CAMPUS <span>›</span> FOOD & DINE IN <span>›</span> COLLEGE MESS</div>
    <section className="food-dine-hero mess-hero">
      <div className="food-dine-hero-copy"><span className="food-dine-kicker">COLLEGE MESS</span><h1>Good meals, <em>good days.</em></h1><p>Everything you need to know about the meals served on campus.</p></div>
      <div className="food-dine-hero-art mess-hero-art" aria-hidden="true"><span className="food-dine-art-orbit"/><span className="food-dine-art-plate"><CookingPot size={60}/></span><span className="food-dine-art-spark">✦</span></div>
      <button className="food-dine-back" onClick={() => setSection('home')}><ArrowLeft size={15}/> Food & Dine In</button>
    </section>
    {error && <div className="management-alert" role="alert"><ShieldAlert size={15}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><span aria-hidden="true">×</span></button></div>}
    {loading ? <div className="management-state"><span className="loading-spinner"/>Loading College Mess information…</div> : <>
      <section className="mess-timings-panel">
        <div className="food-dine-section-heading"><div><span className="food-dine-kicker">ON THE MENU TODAY</span><h2>Meal timings</h2></div><span className="mess-timings-heading-icon"><Clock3 size={19}/></span></div>
        <div className="mess-meal-list">{MEALS.map((meal, index) => {
          const timing = mess?.settings.timings[meal]
          const announced = Boolean(timing?.start && timing?.end)
          return <article className={`mess-meal-row ${announced ? 'mess-meal-announced' : 'mess-meal-unannounced'}`} key={meal}>
            <span className="mess-meal-number">0{index + 1}</span>
            <span className="mess-meal-name">{meal}</span>
            <strong>{announced ? announcedWindow(timing) : 'Timings not announced yet'}</strong>
          </article>
        })}</div>
        <p className="mess-timings-note">Meal times are shared by the campus administration and may be updated during the term.</p>
      </section>

      {canManage && <form className="mess-settings-panel" onSubmit={saveSettings}>
        <div className="food-dine-section-heading"><div><span className="food-dine-kicker">ADMINISTRATION ONLY</span><h2>Configure meal timings</h2><p>Choose the announced start and end time for each meal. Leave both unset until a time is announced.</p></div></div>
        <div className="mess-meal-settings">{MEALS.map((meal, index) => <fieldset className="mess-meal-setting" key={meal}>
          <legend><span>0{index + 1}</span>{meal}</legend>
          <TimePicker meal={meal} edge="Start" value={settingsDraft.timings[meal].start} onChange={(value) => updateWindow(meal, 'start', value)} onIncompleteChange={(incomplete) => setIncompleteTimes((current) => ({ ...current, [`${meal}-start`]: incomplete }))} />
          <TimePicker meal={meal} edge="End" value={settingsDraft.timings[meal].end} onChange={(value) => updateWindow(meal, 'end', value)} onIncompleteChange={(incomplete) => setIncompleteTimes((current) => ({ ...current, [`${meal}-end`]: incomplete }))} />
        </fieldset>)}</div>
        <div className="mess-config-footer"><p>Times use a 12-hour AM/PM clock. An end time earlier than its start is treated as the following day.</p><button className="module-primary" disabled={busy}>{busy ? 'Saving…' : 'Save meal timings'} <Check size={15}/></button></div>
      </form>}

      {canManage && <section className="mess-announcement-panel">
        <div className="food-dine-section-heading"><div><span className="food-dine-kicker">CAMPUS UPDATES</span><h2>Share a Mess announcement</h2><p>Announcements are published in Notices & Announcements and delivered to students.</p></div><span className="mess-announcement-icon"><Megaphone size={19}/></span></div>
        {!issuingNotice ? <button type="button" className="module-primary" onClick={() => { setIssuingNotice(true); setError('') }}><Megaphone size={15}/> Write an announcement</button> : <form className="mess-notice-form" onSubmit={saveNotice}>
          <label>ANNOUNCEMENT TITLE<input required minLength={3} maxLength={180} value={noticeDraft.title} onChange={(event) => setNoticeDraft({ ...noticeDraft, title: event.target.value })}/></label>
          <label>DETAILS<textarea required minLength={3} maxLength={10000} rows={4} value={noticeDraft.description} onChange={(event) => setNoticeDraft({ ...noticeDraft, description: event.target.value })}/></label>
          <div className="mess-announcement-actions"><button type="button" className="modal-cancel" onClick={() => setIssuingNotice(false)}>Cancel</button><button className="module-primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish to student notices'} <ArrowRight size={14}/></button></div>
        </form>}
      </section>}
    </>}
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>College Mess · meal information</span><span>Campus One · Food & Dine In</span></footer>
  </div>

  return <div className="module-page page-enter food-dine-page">
    <div className="module-breadcrumb">CAMPUS <span>›</span> FOOD & DINE IN</div>
    <section className="food-dine-hero food-dine-home-hero">
      <div className="food-dine-hero-copy"><span className="food-dine-kicker">CAMPUS DINING</span><h1>Good food, <em>right here.</em></h1><p>Find your canteen favourites or check the day’s College Mess schedule.</p></div>
      <div className="food-dine-hero-art" aria-hidden="true"><span className="food-dine-art-orbit"/><span className="food-dine-art-plate"><Utensils size={56}/></span><span className="food-dine-art-spark">✦</span></div>
    </section>
    {error && <div className="management-alert" role="alert"><ShieldAlert size={15}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><span aria-hidden="true">×</span></button></div>}
    <div className={`food-dine-options ${canViewMess ? '' : 'food-dine-options-single'}`}>
      <button type="button" className="food-dine-option canteen-option" onClick={() => onNavigate ? onNavigate('canteen') : setSection('canteen')}>
        <span className="food-dine-option-art canteen-option-art" aria-hidden="true"><Utensils size={42}/></span>
        <span className="food-dine-kicker">MADE FRESH ON CAMPUS</span><strong>Canteen</strong>
        <span>Browse the menu, compare Half and Full prices, check availability, and place or track an order.</span>
        <i>Explore the menu <ArrowRight size={16}/></i>
      </button>
      {canViewMess && <button type="button" className="food-dine-option mess-option" onClick={() => setSection('mess')}>
        <span className="food-dine-option-art mess-option-art" aria-hidden="true"><CookingPot size={42}/></span>
        <span className="food-dine-kicker">DAILY MEAL SCHEDULE</span><strong>College Mess</strong>
        <span>See the announced timings for Breakfast, Brunch, Lunch, and Dinner.</span>
        <i>View meal timings <ArrowRight size={16}/></i>
      </button>}
    </div>
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Canteen orders use the existing campus service</span><span>Campus One · Food & Dine In</span></footer>
  </div>
}
