import { useEffect, useState } from 'react'
import {
  ArrowRight, Building2, CalendarDays, ChartNoAxesCombined,
  ChevronRight, Flame, GraduationCap, HeartPulse,
  Map, Megaphone, MessageCircle, MessageSquareWarning, PackageSearch,
  Settings2, ShieldAlert, Sparkles, Star, Trophy, UserRound, UsersRound, Utensils,
} from 'lucide-react'
import { api } from '../api/client'
import { campusPlaces, navigationGroups } from '../data/campusData'
import { canSeePage } from '../auth/access'

const day = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
const quickAccessFeatures = [
  { id: 'notices', name: 'Notices', description: 'Campus updates', icon: Megaphone, tone: 'gold' },
  { id: 'events', name: 'Events & Clubs', description: 'Events and groups', icon: CalendarDays, tone: 'blue' },
  { id: 'sports', name: 'Sports', description: 'Teams and wellness', icon: Trophy, tone: 'teal' },
  { id: 'hostel', name: 'Hostel', description: 'Residence services', icon: Building2, tone: 'blue' },
  { id: 'food', name: 'Dining & Mess', description: 'Menus and meals', icon: Utensils, tone: 'coral' },
  { id: 'canteen', name: 'Canteen Orders', description: 'Manage orders', icon: Utensils, tone: 'gold' },
  { id: 'complaints', name: 'Complaints', description: 'Get campus support', icon: MessageSquareWarning, tone: 'blue' },
  { id: 'lost-found', name: 'Lost & Found', description: 'Find or report items', icon: PackageSearch, tone: 'teal' },
  { id: 'campus-voice', name: 'Campus Voice', description: 'Share an idea', icon: MessageCircle, tone: 'purple' },
  { id: 'skill-exchange', name: 'Skill Exchange', description: 'Share a skill', icon: UsersRound, tone: 'teal' },
  { id: 'teacher-review', name: 'Faculty Reviews', description: 'Course feedback', icon: Star, tone: 'gold' },
  { id: 'copilot', name: 'Campus AI', description: 'Ask your campus copilot', icon: Sparkles, tone: 'purple' },
  { id: 'profile', name: 'Profile', description: 'Your account', icon: UserRound, tone: 'teal' },
  { id: 'settings', name: 'Settings', description: 'Your preferences', icon: Settings2, tone: 'blue' },
  { id: 'navigation', name: 'Campus Map', description: 'Places and directions', icon: Map, tone: 'teal' },
  { id: 'emergency', name: 'Emergency', description: 'Campus support', icon: ShieldAlert, tone: 'coral' },
  { id: 'analytics', name: 'Campus Insights', description: 'Campus operations', icon: ChartNoAxesCombined, tone: 'purple' },
  { id: 'users', name: 'User Management', description: 'Campus accounts', icon: UsersRound, tone: 'blue' },
  { id: 'campus-management', name: 'Campus Management', description: 'Campus services', icon: Settings2, tone: 'gold' },
  { id: 'sports-management', name: 'Sports Management', description: 'Teams and activities', icon: Trophy, tone: 'coral' },
  { id: 'department-requests', name: 'Student Requests', description: 'Department requests', icon: UsersRound, tone: 'teal' },
  { id: 'department-students', name: 'Department Students', description: 'Student directory', icon: GraduationCap, tone: 'purple' },
]

export default function Dashboard({ user, onNavigate, onAction, onAskCopilot = onNavigate }) {
  const [prompt, setPrompt] = useState('')
  const [weather, setWeather] = useState(null)
  const [weatherStatus, setWeatherStatus] = useState('loading')
  const [weatherRetry, setWeatherRetry] = useState(0)
  const [campusNotices, setCampusNotices] = useState([])
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [overviewDataError, setOverviewDataError] = useState('')
  const [overviewDataRetry, setOverviewDataRetry] = useState(0)

  useEffect(() => {
    let active = true
    let controller

    async function refreshWeather() {
      controller?.abort()
      const requestController = new AbortController()
      controller = requestController
      setWeatherStatus('loading')
      try {
        const result = await api('/api/weather', { signal: requestController.signal })
        if (!active || requestController.signal.aborted) return
        const temperature = result?.current?.temperatureC
        const code = result?.current?.weatherCode
        if (!Number.isFinite(temperature) || !Number.isInteger(code)) {
          setWeather(null)
          setWeatherStatus('missing')
          return
        }
        setWeather({ temperature, code })
        setWeatherStatus('ready')
      } catch (reason) {
        if (active && !requestController.signal.aborted) {
          setWeather(null)
          setWeatherStatus('error')
          if (import.meta.env.DEV) console.warn('[weather] Could not load Sonipat weather:', reason.message, reason.status ? `(HTTP ${reason.status})` : '')
        }
      }
    }

    refreshWeather()
    const interval = window.setInterval(refreshWeather, 30 * 60 * 1000)
    return () => {
      active = false
      window.clearInterval(interval)
      controller?.abort()
    }
  }, [weatherRetry])

  useEffect(() => {
    let active = true
    async function loadOverviewData() {
      const results = await Promise.allSettled([
        api('/api/notices'),
        api('/api/events-clubs'),
      ])
      if (!active) return

      const errors = []
      if (results[0].status === 'fulfilled' && Array.isArray(results[0].value.notices)) {
        setCampusNotices(results[0].value.notices)
      } else {
        setCampusNotices([])
        errors.push(results[0].status === 'rejected' ? results[0].reason.message : 'The notices response was invalid.')
      }
      if (results[1].status === 'fulfilled' && Array.isArray(results[1].value.events)) {
        setUpcomingEvents(results[1].value.events)
      } else {
        setUpcomingEvents([])
        errors.push(results[1].status === 'rejected' ? results[1].reason.message : 'The events response was invalid.')
      }
      setOverviewDataError(errors.join(' '))
    }
    loadOverviewData()
    return () => { active = false }
  }, [overviewDataRetry])

  function weatherCondition(code) {
    if (code === 0) return 'Clear'
    if (code === 1) return 'Mostly clear'
    if (code === 2) return 'Partly cloudy'
    if (code === 3) return 'Cloudy'
    if (code === 45 || code === 48) return 'Foggy'
    if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle'
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain'
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow'
    if ([95, 96, 99].includes(code)) return 'Thunderstorm'
    return 'Conditions unavailable'
  }

  function weatherMessage(code, temperature) {
    if ([95, 96, 99].includes(code)) return 'Stay indoors'
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Take umbrella'
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Keep warm'
    if (code === 45 || code === 48) return 'Mind the fog'
    if (temperature >= 35) return 'Stay hydrated'
    if (temperature <= 10) return 'Keep warm'
    if (code === 0 || code === 1) return 'Nice outdoors'
    if (temperature >= 18 && temperature <= 30) return 'Mild on campus'
    return temperature > 30 ? 'Warm on campus' : 'Cool on campus'
  }

  const weatherDisplay = weatherStatus === 'ready'
    ? { temperature: `${Math.round(weather.temperature)}°`, condition: weatherCondition(weather.code), message: weatherMessage(weather.code, weather.temperature) }
    : weatherStatus === 'loading'
      ? { temperature: '--°', condition: 'Loading…', message: 'Checking weather' }
      : weatherStatus === 'missing'
        ? { temperature: '--°', condition: 'No weather data', message: 'Tap to retry' }
        : { temperature: '--°', condition: 'Weather unavailable', message: 'Tap to retry' }
  const visibleRoutes = new Set(navigationGroups
    .filter((group) => !group.roles || group.roles.includes(user.role))
    .flatMap((group) => group.items)
    .filter((item) => item.id !== 'overview' && canSeePage(user, item.id))
    .map((item) => item.id))
  const visibleQuickAccess = quickAccessFeatures.filter((feature) => visibleRoutes.has(feature.id))
  const facultyOverview = ['Staff', 'HOD'].includes(user.role)
  const today = new Date().toISOString().slice(0, 10)
  const displayedNotices = [...campusNotices]
    .sort((left, right) => Number(Boolean(right.important || right.pinned)) - Number(Boolean(left.important || left.pinned))
      || Date.parse(right.publishAt || right.createdAt) - Date.parse(left.publishAt || left.createdAt))
    .slice(0, 4)
  const displayedEvents = upcomingEvents
    .filter((event) => event.date >= today && !['CANCELLED', 'COMPLETED', 'DRAFT'].includes(event.status))
    .filter((event) => !facultyOverview || !event.department || sameOverviewDepartment(event.department, user.department))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 3)

  return (
    <div className={`dashboard-content page-enter${facultyOverview ? ' faculty-overview' : ''}${user.role === 'HOD' ? ' hod-overview' : user.role === 'Staff' ? ' staff-overview' : ''}`}>
      <div className="welcome-row">
        <div><p className="date-line"><span className="date-dot" />{day}<span className="date-divider">·</span><span>Sonipat, Haryana</span><span className="welcome-role">{user.role}</span></p><h1>Welcome, {user.name}.</h1>{facultyOverview && user.department && <p className="faculty-department-label">{user.department}</p>}</div>
        <button className="weather-chip" disabled={weatherStatus === 'loading'} onClick={() => weatherStatus === 'ready' ? onAction('Campus weather') : setWeatherRetry((retry) => retry + 1)} aria-label={weatherStatus === 'ready' ? `Sonipat weather: ${weatherDisplay.temperature} Celsius, ${weatherDisplay.condition}. ${weatherDisplay.message}` : `Sonipat weather unavailable. ${weatherDisplay.message}`}><span className="weather-sun"><Flame size={17} /></span><span aria-live="polite"><strong>{weatherDisplay.temperature} <span>°C</span></strong><small>{weatherDisplay.condition}</small></span><span className="weather-divider" /><span><strong>{weatherDisplay.message}</strong><small>Sonipat, Haryana</small></span></button>
      </div>

      <section className="campus-welcome-hero" aria-labelledby="campus-welcome-title">
        <div className="campus-welcome-copy">
          <span className="campus-welcome-label">YOUR DIGITAL CAMPUS</span>
          <h2 id="campus-welcome-title">Everything you need, in one place.</h2>
          <p>Stay connected with your campus, discover opportunities and get things done faster.</p>
        </div>
        <div className="campus-welcome-art" aria-hidden="true">
          <span className="campus-network campus-network-one" />
          <span className="campus-network campus-network-two" />
          <span className="campus-network campus-network-three" />
          <span className="campus-network campus-network-four" />
          <span className="campus-network-line campus-network-line-one" />
          <span className="campus-network-line campus-network-line-two" />
          <span className="campus-network-line campus-network-line-three" />
          <div className="campus-welcome-icon"><Building2 size={31} strokeWidth={1.5} /><Sparkles size={14} /></div>
        </div>
      </section>

      <section className="copilot-panel dashboard-assistant"><div className="copilot-title-row"><span className="copilot-symbol"><Sparkles size={17} /></span><div><span className="section-eyebrow">CAMPUS AI ASSISTANT</span><h3>What can I help you find?</h3></div><span className="copilot-tag">✦ AI</span></div><div className="copilot-prompt"><input aria-label="Ask your campus copilot" placeholder="Ask anything about your campus..." value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), onAskCopilot(prompt.trim()))} /><button className="prompt-send" aria-label="Ask copilot" onClick={() => onAskCopilot(prompt.trim())}><ArrowRight size={16} /></button></div><div className="prompt-suggestions"><button onClick={() => onAskCopilot('Show latest notices')}>Show latest notices <ArrowRight size={11} /></button><button onClick={() => onAskCopilot('What events are coming up?')}>Upcoming events <ArrowRight size={11} /></button><button onClick={() => onAskCopilot("What's available in the canteen?")}>Canteen menu <ArrowRight size={11} /></button></div></section>

      <section className="quick-access-section" aria-labelledby="quick-access-heading">
        <div className="quick-access-heading"><div><span className="section-eyebrow">YOUR CAMPUS, ONE TAP AWAY</span><h2 id="quick-access-heading">Quick Access</h2></div></div>
        <div className="quick-access-grid">{visibleQuickAccess.map(({ id, name, description, icon: Icon, tone }) => <button className={`quick-access-card quick-access-${tone}`} key={id} onClick={() => onNavigate(id)}><span className="quick-access-icon"><Icon size={19} strokeWidth={1.9}/></span><span className="quick-access-copy"><strong>{name}</strong><small>{description}</small></span></button>)}</div>
      </section>

      {overviewDataError && <div className="faculty-overview-error" role="alert"><span>Some campus updates could not be loaded: {overviewDataError}</span><button onClick={() => setOverviewDataRetry((retry) => retry + 1)}>Retry</button></div>}
      {displayedNotices.length > 0 && <section className="section-block notices-section"><div className="section-heading"><div><span className="section-eyebrow">THE THINGS YOU SHOULD KNOW</span><h3>Important notices</h3></div><button className="text-link" onClick={() => onNavigate('notices')}>View all <ArrowRight size={14} /></button></div><div className="notice-list">{displayedNotices.map((notice) => {
        const tone = notice.important || notice.pinned ? 'notice-amber' : 'notice-blue'
        const publishedAt = notice.publishAt || notice.createdAt
        return <article className="notice-item" key={notice.id}><span className={`notice-bullet ${tone}`} /><div className="notice-content"><div className="notice-meta"><span className={`notice-category ${tone}`}>{notice.category}</span><span className="notice-dot-separator">·</span><span>{publishedAt ? formatOverviewDate(publishedAt) : 'Recently'}</span>{notice.important && <span className="action-pill">IMPORTANT</span>}</div><h4>{notice.title}</h4><p>{notice.description}</p><button className="notice-action" onClick={() => onNavigate('notices')}>Read notice <ArrowRight size={13} /></button></div></article>
      })}</div></section>}

      {displayedEvents.length > 0 && <section className="section-block faculty-events-section"><div className="section-heading"><div><span className="section-eyebrow">{facultyOverview ? `${user.department || 'YOUR'} DEPARTMENT` : 'CAMPUS LIFE'}</span><h3>Upcoming events</h3></div><button className="text-link" onClick={() => onNavigate('events')}>View events <ArrowRight size={14} /></button></div><div className="faculty-event-list">{displayedEvents.map((event) => <article key={event.id}><span className="faculty-event-date">{formatOverviewDate(event.date, true)}</span><div><h4>{event.name}</h4><p>{[event.category, event.venue].filter(Boolean).join(' · ')}</p></div></article>)}</div></section>}

      {!facultyOverview && visibleRoutes.has('navigation') && campusPlaces.length > 0 && <section className="section-block places-section"><div className="section-heading"><div><span className="section-eyebrow">ALL AROUND YOU</span><h3>Find your place</h3></div><button className="text-link" onClick={() => onNavigate('navigation')}>Open campus map <ArrowRight size={14} /></button></div><div className="place-grid">{campusPlaces.map((place) => <button className="place-card" key={place.name} onClick={() => onNavigate('navigation')}><span className={`place-icon ${place.color}`}><PlaceIcon name={place.icon} /></span><span className="place-text"><strong>{place.name}</strong><span>{place.detail}</span></span><ChevronRight className="place-arrow" size={15} /></button>)}</div></section>}
      <footer className="dashboard-footer"><span><span className="footer-status-dot" />Campus One</span><span>Good to have you here. <span>Campus One · Puran Murti Vidyapeeth</span></span></footer>
    </div>
  )
}

function formatOverviewDate(value, weekday = false) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  if (!Number.isFinite(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', ...(weekday ? { weekday: 'short' } : {}) }).format(date)
}

function sameOverviewDepartment(left, right) {
  const normalize = (value) => {
    const department = String(value || '').trim().toLowerCase()
    return ({ cse: 'computer science', cs: 'computer science', ece: 'electrical engineering' })[department] || department
  }
  return normalize(left) === normalize(right)
}

function PlaceIcon({ name }) {
  const icons = { GraduationCap: <GraduationCap size={17} />, Utensils: <Utensils size={17} />, HeartPulse: <HeartPulse size={17} /> }
  return icons[name]
}