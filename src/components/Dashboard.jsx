import { useEffect, useState } from 'react'
import {
  ArrowDownRight, ArrowRight, CalendarDays, Check,
  ChevronRight, Clock3, Flame, GraduationCap,
  HeartPulse, MapPin, MessageSquareWarning, PackageSearch, Sparkles, Utensils,
} from 'lucide-react'
import { api } from '../api/client'
import { campusPlaces, notices } from '../data/campusData'

const day = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

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

  return (
    <div className="dashboard-content page-enter">
      <div className="welcome-row">
        <div><p className="date-line"><span className="date-dot" />{day}<span className="date-divider">·</span><span>Sonipat, Haryana</span></p><h1>{adminView ? 'Campus, at a glance.' : user.role === 'Staff' ? `Good morning, ${user.name.split(' ')[0]}.` : user.role === 'HOD' ? `Your department, ${user.department}.` : user.role === 'Sports Captain' ? 'Your campus, in play.' : 'A good day to make yours.'}</h1><p className="welcome-description">{adminView ? 'Your operations, people and priorities, all in one place.' : user.role === 'Staff' ? 'Your campus services and assigned student requests, all in sync.' : user.role === 'HOD' ? 'Review department registrations and keep your student list in view.' : user.role === 'Sports Captain' ? 'Teams, wellness and campus sport, ready for the day.' : 'Everything happening at Puran Murti Vidyapeeth, thoughtfully in sync.'}</p></div>
        <button className="weather-chip" disabled={weatherStatus === 'loading'} onClick={() => weatherStatus === 'ready' ? onAction('Campus weather') : setWeatherRetry((retry) => retry + 1)} aria-label={weatherStatus === 'ready' ? `Sonipat weather: ${weatherDisplay.temperature} Celsius, ${weatherDisplay.condition}. ${weatherDisplay.message}` : `Sonipat weather unavailable. ${weatherDisplay.message}`}><span className="weather-sun"><Flame size={17} /></span><span aria-live="polite"><strong>{weatherDisplay.temperature} <span>°C</span></strong><small>{weatherDisplay.condition}</small></span><span className="weather-divider" /><span><strong>{weatherDisplay.message}</strong><small>Sonipat, Haryana</small></span></button>
      </div>

      <section className="hero-banner" aria-label="Campus welcome">
        <div className="hero-image" />
        <div className="hero-shading" />
        <div className="hero-content"><span className="hero-kicker"><span className="live-pill"><i />CAMPUS IS LIVE</span><span>YOUR DAY, CONNECTED</span></span><h2>A little less searching.<br />A lot more <em>living.</em></h2><p>Your classes, people and places are right where they belong.</p><button className="hero-button" onClick={() => onNavigate('navigation')}>Explore your campus <ArrowRight size={15} /></button></div>
        <div className="hero-caption"><MapPin size={12} /> PURAN MURTI VIDYAPEETH <span>·</span> SONIPAT</div>
        <div className="hero-slide"><span /><span /><span /></div>
      </section>

      <section className="metrics-row" aria-label="Campus snapshot">
        <div className="metric-card"><span className="metric-icon icon-rust"><CalendarDays size={17} /></span><div className="metric-copy"><span className="metric-label">YOUR NEXT CLASS</span><strong>Data structures</strong><span className="metric-sub">10:30 am · Block A, Room 204</span></div><span className="metric-indicator indicator-rust"><Clock3 size={13} /> IN 24 MIN</span></div>
        <button type="button" className="metric-card dining-shortcut" onClick={() => onNavigate('food')}><span className="metric-icon icon-leaf"><Utensils size={17} /></span><span className="metric-copy"><span className="metric-label">CAMPUS DINING</span><strong>Canteen & College Mess</strong><span className="metric-sub">Menus, orders, and meal timings</span></span><ArrowRight size={15} /></button>
      </section>

      <section className="main-dashboard-grid">
        <div className="main-column">
          <section className="copilot-panel"><div className="copilot-title-row"><span className="copilot-symbol"><Sparkles size={17} /></span><div><span className="section-eyebrow">A LITTLE HELP, ALREADY KNOWS THE WAY</span><h3>Your campus copilot</h3></div><span className="copilot-tag">✦ AI</span></div><div className="copilot-prompt"><input aria-label="Ask your campus copilot" placeholder="Ask anything about your campus..." value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (prompt.trim() ? onAction(prompt) : onNavigate('copilot'))} /><button className="prompt-send" aria-label="Ask copilot" onClick={() => prompt.trim() ? onAction(prompt) : onNavigate('copilot')}><ArrowRight size={16} /></button></div><div className="prompt-suggestions"><button onClick={() => onNavigate('copilot')}>Find my next class <ArrowRight size={11} /></button><button onClick={() => onNavigate('copilot')}>What’s for lunch? <ArrowRight size={11} /></button><button onClick={() => onNavigate('copilot')}>Upcoming deadlines <ArrowRight size={11} /></button></div></section>

          <section className="section-block notices-section"><div className="section-heading"><div><span className="section-eyebrow">THE THINGS YOU SHOULD KNOW</span><h3>Notice board <span className="unread-count">3 new</span></h3></div><button className="text-link" onClick={() => onNavigate('notices')}>All notices <ArrowRight size={14} /></button></div><div className="notice-list">{notices.slice(0, 2).map((notice) => <article className="notice-item" key={notice.title}><span className={`notice-bullet ${notice.tone}`} /><div className="notice-content"><div className="notice-meta"><span className={`notice-category ${notice.tone}`}>{notice.category}</span><span className="notice-dot-separator">·</span><span>{notice.time}</span>{notice.urgent && <span className="action-pill">ACTION NEEDED</span>}</div><h4>{notice.title}</h4><p>{notice.text}</p><button className="notice-action" onClick={() => onNavigate('notices')}>{notice.action}<ArrowRight size={13} /></button></div></article>)}</div></section>

          <section className="section-block places-section"><div className="section-heading"><div><span className="section-eyebrow">ALL AROUND YOU</span><h3>Find your place</h3></div><button className="text-link" onClick={() => onNavigate('navigation')}>Open campus map <ArrowRight size={14} /></button></div><div className="place-grid">{campusPlaces.map((place) => <button className="place-card" key={place.name} onClick={() => onNavigate('navigation')}><span className={`place-icon ${place.color}`}><PlaceIcon name={place.icon} /></span><span className="place-text"><strong>{place.name}</strong><span>{place.detail}</span></span><ChevronRight className="place-arrow" size={15} /></button>)}</div></section>
        </div>

        <aside className="side-column">
          <button className="feedback-panel lost-found-dashboard-link" onClick={() => onNavigate('lost-found')}><span className="feedback-icon"><PackageSearch size={18} /></span><span className="feedback-text"><strong>Lost & Found</strong><span>Report or search for a campus item.</span></span><ArrowDownRight className="feedback-arrow" size={15} /></button>
          <button className="feedback-panel" onClick={() => onNavigate('complaints')}><span className="feedback-icon"><MessageSquareWarning size={18} /></span><span className="feedback-text"><strong>Complaint & Issue Tracker</strong><span>Submit an issue and track updates.</span></span><ArrowDownRight className="feedback-arrow" size={15} /></button>

          {adminView && <div className="admin-summary"><span className="section-eyebrow">OPERATIONS SNAPSHOT</span><strong>Campus services are running smoothly.</strong><span>2 requests need attention · 94% availability <ArrowRight size={12} /></span></div>}
        </aside>
      </section>
      <footer className="dashboard-footer"><span><span className="footer-status-dot" />All campus systems operational</span><span>Good to have you here. <span>Campus One · Puran Murti Vidyapeeth</span></span></footer>
    </div>
  )
}

function PlaceIcon({ name }) {
  const icons = { GraduationCap: <GraduationCap size={17} />, Utensils: <Utensils size={17} />, HeartPulse: <HeartPulse size={17} /> }
  return icons[name]
}