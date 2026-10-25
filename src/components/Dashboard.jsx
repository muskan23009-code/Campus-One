import { useEffect, useState } from 'react'
import {
  Activity, ArrowRight, Building2, CalendarDays, ChartNoAxesCombined,
  ChevronRight, ContactRound, Flame, GraduationCap,
  HeartPulse, Map, MapPin, Megaphone, PackageSearch,
  Settings2, ShieldAlert, Sparkles, Trophy, UserRound, UsersRound, Utensils,
} from 'lucide-react'
import { api } from '../api/client'
import { campusPlaces, navigationGroups, notices } from '../data/campusData'
import { canSeePage } from '../auth/access'

const day = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
const quickAccessFeatures = [
  { id: 'notices', name: 'Notices & Announcements', description: 'Official campus updates', icon: Megaphone, tone: 'gold' },
  { id: 'events', name: 'Events & Clubs', description: 'Find your campus community', icon: CalendarDays, tone: 'coral' },
  { id: 'sports', name: 'Sports & Wellness', description: 'Teams, activities and wellbeing', icon: Activity, tone: 'teal' },
  { id: 'hostel', name: 'Hostel', description: 'Room and residence services', icon: Building2, tone: 'purple' },
  { id: 'food', name: 'Canteen & College Mess', description: 'Menus and meal information', icon: Utensils, tone: 'coral' },
  { id: 'canteen', name: 'Canteen Orders', description: 'Manage incoming pre-orders', icon: Utensils, tone: 'gold' },
  { id: 'complaints', name: 'Complaint & Issue Tracker', description: 'Submit an issue and follow up', icon: MessageSquareWarning, tone: 'blue' },
  { id: 'lost-found', name: 'Lost & Found', description: 'Search or report an item', icon: PackageSearch, tone: 'teal' },
  { id: 'campus-voice', name: 'Campus Voice', description: 'Share ideas with campus', icon: Megaphone, tone: 'purple' },
  { id: 'skill-exchange', name: 'Skill Exchange', description: 'Learn and share a skill', icon: UsersRound, tone: 'gold' },
  { id: 'teacher-review', name: 'Faculty Reviews', description: 'Share course feedback', icon: GraduationCap, tone: 'blue' },
  { id: 'copilot', name: 'Campus AI', description: 'Ask your campus copilot', icon: Sparkles, tone: 'purple' },
  { id: 'profile', name: 'Profile', description: 'View your account details', icon: UserRound, tone: 'teal' },
  { id: 'settings', name: 'Settings', description: 'Manage your preferences', icon: Settings2, tone: 'blue' },
  { id: 'navigation', name: 'Campus Map', description: 'Find places and directions', icon: Map, tone: 'teal' },
  { id: 'directory', name: 'Campus Directory', description: 'Find people and services', icon: ContactRound, tone: 'blue' },
  { id: 'emergency', name: 'Emergency', description: 'Reach campus support quickly', icon: ShieldAlert, tone: 'coral' },
  { id: 'analytics', name: 'Campus Insights', description: 'Review campus operations', icon: ChartNoAxesCombined, tone: 'purple' },
  { id: 'users', name: 'User Management', description: 'Manage campus accounts', icon: UsersRound, tone: 'blue' },
  { id: 'campus-management', name: 'Campus Management', description: 'Manage campus services', icon: Settings2, tone: 'gold' },
  { id: 'sports-management', name: 'Sports Management', description: 'Manage teams and activities', icon: Trophy, tone: 'coral' },
  { id: 'department-requests', name: 'Student Requests', description: 'Review department requests', icon: UsersRound, tone: 'teal' },
  { id: 'department-students', name: 'Department Students', description: 'View your student list', icon: GraduationCap, tone: 'purple' },
]

export default function Dashboard({ user, onNavigate, onAction, adminView }) {
  const [prompt, setPrompt] = useState('')
  const [weather, setWeather] = useState(null)
  const [weatherStatus, setWeatherStatus] = useState('loading')
  const [weatherRetry, setWeatherRetry] = useState(0)

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

  return (
    <div className="dashboard-content page-enter">
      <div className="welcome-row">
        <div><p className="date-line"><span className="date-dot" />{day}<span className="date-divider">·</span><span>Sonipat, Haryana</span><span className="welcome-role">{user.role}</span></p><h1>Welcome, {user.name}.</h1><p className="welcome-description">{adminView ? 'Your operations, people and priorities, all in one place.' : user.role === 'Staff' ? 'Your campus services and assigned student requests, all in sync.' : user.role === 'HOD' ? 'Review department registrations and keep your student list in view.' : user.role === 'Sports Captain' ? 'Teams, wellness and campus sport, ready for the day.' : 'Everything happening at Puran Murti Vidyapeeth, thoughtfully in sync.'}</p></div>
        <button className="weather-chip" disabled={weatherStatus === 'loading'} onClick={() => weatherStatus === 'ready' ? onAction('Campus weather') : setWeatherRetry((retry) => retry + 1)} aria-label={weatherStatus === 'ready' ? `Sonipat weather: ${weatherDisplay.temperature} Celsius, ${weatherDisplay.condition}. ${weatherDisplay.message}` : `Sonipat weather unavailable. ${weatherDisplay.message}`}><span className="weather-sun"><Flame size={17} /></span><span aria-live="polite"><strong>{weatherDisplay.temperature} <span>°C</span></strong><small>{weatherDisplay.condition}</small></span><span className="weather-divider" /><span><strong>{weatherDisplay.message}</strong><small>Sonipat, Haryana</small></span></button>
      </div>

      <section className="hero-banner" aria-label="Campus welcome">
        <div className="hero-image" />
        <div className="hero-shading" />
        <div className="hero-content"><span className="hero-kicker"><span className="live-pill"><i />CAMPUS IS LIVE</span><span>YOUR DAY, CONNECTED</span></span><h2>A little less searching.<br />A lot more <em>living.</em></h2><p>Your classes, people and places are right where they belong.</p><button className="hero-button" onClick={() => onNavigate('navigation')}>Explore your campus <ArrowRight size={15} /></button></div>
        <div className="hero-caption"><MapPin size={12} /> PURAN MURTI VIDYAPEETH <span>·</span> SONIPAT</div>
        <div className="hero-slide"><span /><span /><span /></div>
      </section>

      <section className="copilot-panel dashboard-assistant"><div className="copilot-title-row"><span className="copilot-symbol"><Sparkles size={17} /></span><div><span className="section-eyebrow">CAMPUS AI ASSISTANT</span><h3>What can I help you find?</h3></div><span className="copilot-tag">✦ AI</span></div><div className="copilot-prompt"><input aria-label="Ask your campus copilot" placeholder="Ask anything about your campus..." value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (prompt.trim() ? onAction(prompt) : onNavigate('copilot'))} /><button className="prompt-send" aria-label="Ask copilot" onClick={() => prompt.trim() ? onAction(prompt) : onNavigate('copilot')}><ArrowRight size={16} /></button></div><div className="prompt-suggestions"><button onClick={() => onNavigate('copilot')}>Find my next class <ArrowRight size={11} /></button><button onClick={() => onNavigate('copilot')}>What’s for lunch? <ArrowRight size={11} /></button><button onClick={() => onNavigate('copilot')}>Upcoming deadlines <ArrowRight size={11} /></button></div></section>

      <section className="quick-access-section" aria-labelledby="quick-access-heading">
        <div className="quick-access-heading"><div><span className="section-eyebrow">YOUR CAMPUS, ONE TAP AWAY</span><h2 id="quick-access-heading">Quick Access</h2></div></div>
        <div className="quick-access-grid">{visibleQuickAccess.map(({ id, name, description, icon: Icon, tone }) => <button className={`quick-access-card quick-access-${tone}`} key={id} onClick={() => onNavigate(id)}><span className="quick-access-icon"><Icon size={19} strokeWidth={1.9}/></span><span className="quick-access-copy"><strong>{name}</strong><small>{description}</small></span><ArrowRight className="quick-access-arrow" size={15}/></button>)}</div>
      </section>

      <section className="section-block notices-section"><div className="section-heading"><div><span className="section-eyebrow">THE THINGS YOU SHOULD KNOW</span><h3>Notice board <span className="unread-count">3 new</span></h3></div><button className="text-link" onClick={() => onNavigate('notices')}>All notices <ArrowRight size={14} /></button></div><div className="notice-list">{notices.slice(0, 2).map((notice) => <article className="notice-item" key={notice.title}><span className={`notice-bullet ${notice.tone}`} /><div className="notice-content"><div className="notice-meta"><span className={`notice-category ${notice.tone}`}>{notice.category}</span><span className="notice-dot-separator">·</span><span>{notice.time}</span>{notice.urgent && <span className="action-pill">ACTION NEEDED</span>}</div><h4>{notice.title}</h4><p>{notice.text}</p><button className="notice-action" onClick={() => onNavigate('notices')}>{notice.action}<ArrowRight size={13} /></button></div></article>)}</div></section>

      <div className="dashboard-lower-content">
        <section className="section-block places-section"><div className="section-heading"><div><span className="section-eyebrow">ALL AROUND YOU</span><h3>Find your place</h3></div><button className="text-link" onClick={() => onNavigate('navigation')}>Open campus map <ArrowRight size={14} /></button></div><div className="place-grid">{campusPlaces.map((place) => <button className="place-card" key={place.name} onClick={() => onNavigate('navigation')}><span className={`place-icon ${place.color}`}><PlaceIcon name={place.icon} /></span><span className="place-text"><strong>{place.name}</strong><span>{place.detail}</span></span><ChevronRight className="place-arrow" size={15} /></button>)}</div></section>
        {adminView && <div className="admin-summary"><span className="section-eyebrow">OPERATIONS SNAPSHOT</span><strong>Campus services are running smoothly.</strong><span>2 requests need attention · 94% availability <ArrowRight size={12} /></span></div>}
      </div>
      <footer className="dashboard-footer"><span><span className="footer-status-dot" />All campus systems operational</span><span>Good to have you here. <span>Campus One · Puran Murti Vidyapeeth</span></span></footer>
    </div>
  )
}

function PlaceIcon({ name }) {
  const icons = { GraduationCap: <GraduationCap size={17} />, Utensils: <Utensils size={17} />, HeartPulse: <HeartPulse size={17} /> }
  return icons[name]
}