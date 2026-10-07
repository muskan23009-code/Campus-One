import { useEffect, useState } from 'react'
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Check,
  ChevronRight, Clock3, Compass, Flame, GraduationCap,
  HeartPulse, MapPin, MessageSquareWarning, PackageSearch, Sparkles, Utensils, Waves,
} from 'lucide-react'
import { campusPlaces, notices } from '../data/campusData'
import { api } from '../api/client'

const day = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

export default function Dashboard({ user, onNavigate, onAction, adminView }) {
  const [selectedMeal, setSelectedMeal] = useState('Lunch')
  const [selectedItem, setSelectedItem] = useState('Dal makhani & jeera rice')
  const [prompt, setPrompt] = useState('')
  const [currentOrder, setCurrentOrder] = useState(null)
  const [orderBusy, setOrderBusy] = useState(false)
  const [messEstimate, setMessEstimate] = useState(null)
  const mealMenus = {
    Breakfast: [['Idli with sambhar', 'South Indian · Vegetarian'], ['Aloo paratha', 'North Indian · Vegetarian'], ['Masala omelette', 'Protein-rich · Contains egg']],
    Lunch: [['Dal makhani & jeera rice', 'North Indian · Vegetarian'], ['Paneer tikka wrap', 'Chef’s special · Vegetarian'], ['Seasonal fruit bowl', 'Fresh today · Vegan']],
    Dinner: [['Matar paneer & roti', 'North Indian · Vegetarian'], ['Veg noodles', 'Indo-Chinese · Vegetarian'], ['Kadhi chawal', 'Home-style · Vegetarian']],
  }

  useEffect(() => {
    let active = true
    if (!['Student', 'Staff', 'Administration'].includes(user.role)) return () => { active = false }
    api('/api/campus/food').then((result) => {
      if (active) setMessEstimate(result.records.find((record) => record.id === 'food-mess') || result.records.find((record) => record.title.toLowerCase().includes('mess')) || null)
    }).catch(() => {})
    if (user.role === 'Student') api('/api/food/orders').then((result) => {
      if (active && result.orders.length) setCurrentOrder(result.orders[0])
    }).catch(() => {})
    return () => { active = false }
  }, [user.role])

  async function preorder() {
    if (currentOrder?.status === 'Placed' || currentOrder?.status === 'Preparing') {
      onAction(`${currentOrder.orderNumber} is ${currentOrder.status.toLowerCase()}. Track it at Food & Dining.`)
      return
    }
    setOrderBusy(true)
    try {
      const result = await api('/api/food/orders', { method: 'POST', body: { meal: selectedMeal, item: selectedItem } })
      setCurrentOrder(result.order)
      onAction(`Order ${result.order.orderNumber} placed. Its current status is Placed.`)
    } catch (reason) { onAction(`Canteen pre-order failed: ${reason.message}`) } finally { setOrderBusy(false) }
  }

  return (
    <div className="dashboard-content page-enter">
      <div className="welcome-row">
        <div><p className="date-line"><span className="date-dot" />{day}<span className="date-divider">·</span><span>Sonipat, Haryana</span></p><h1>{adminView ? 'Campus, at a glance.' : user.role === 'Staff' ? `Good morning, ${user.name.split(' ')[0]}.` : user.role === 'HOD' ? `Your department, ${user.department}.` : user.role === 'Sports Captain' ? 'Your campus, in play.' : 'A good day to make yours.'}</h1><p className="welcome-description">{adminView ? 'Your operations, people and priorities, all in one place.' : user.role === 'Staff' ? 'Your campus services and assigned student requests, all in sync.' : user.role === 'HOD' ? 'Review department registrations and keep your student list in view.' : user.role === 'Sports Captain' ? 'Teams, wellness and campus sport, ready for the day.' : 'Everything happening at Puran Murti Vidyapeeth, thoughtfully in sync.'}</p></div>
        <button className="weather-chip" onClick={() => onAction('Campus weather')}><span className="weather-sun"><Flame size={17} /></span><span><strong>28° <span>°C</span></strong><small>Clear skies</small></span><span className="weather-divider" /><span><strong>Good day</strong><small>to be outside</small></span></button>
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
        <div className="metric-card"><span className="metric-icon icon-leaf"><Waves size={18} /></span><div className="metric-copy"><span className="metric-label">NORTH MESS · MANUAL ESTIMATE</span><strong>{messEstimate?.crowdLevel ? `${messEstimate.crowdLevel} crowd` : 'Moderately busy'}</strong><span className="metric-sub">{messEstimate ? `${messEstimate.occupancyPercent ?? 68}% occupancy · ${messEstimate.estimatedWaitMinutes ?? 8} min wait` : '68% occupancy · 8 min wait'}</span></div><span className="occupancy-indicator"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></span></div>
        <div className="metric-card"><span className="metric-icon icon-blue"><Compass size={17} /></span><div className="metric-copy"><span className="metric-label">CAMPUS SHUTTLE</span><strong>Route S-04 · Gate 2</strong><span className="metric-sub">Next pickup in 8 minutes</span></div><span className="metric-direction">ON TIME <ArrowUpRight size={12} /></span></div>
      </section>

      <section className="main-dashboard-grid">
        <div className="main-column">
          <section className="copilot-panel"><div className="copilot-title-row"><span className="copilot-symbol"><Sparkles size={17} /></span><div><span className="section-eyebrow">A LITTLE HELP, ALREADY KNOWS THE WAY</span><h3>Your campus copilot</h3></div><span className="copilot-tag">✦ AI</span></div><div className="copilot-prompt"><input aria-label="Ask your campus copilot" placeholder="Ask anything about your campus..." value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (prompt.trim() ? onAction(prompt) : onNavigate('copilot'))} /><button className="prompt-send" aria-label="Ask copilot" onClick={() => prompt.trim() ? onAction(prompt) : onNavigate('copilot')}><ArrowRight size={16} /></button></div><div className="prompt-suggestions"><button onClick={() => onNavigate('copilot')}>Find my next class <ArrowRight size={11} /></button><button onClick={() => onNavigate('copilot')}>What’s for lunch? <ArrowRight size={11} /></button><button onClick={() => onNavigate('copilot')}>Upcoming deadlines <ArrowRight size={11} /></button></div></section>

          <section className="section-block notices-section"><div className="section-heading"><div><span className="section-eyebrow">THE THINGS YOU SHOULD KNOW</span><h3>Notice board <span className="unread-count">3 new</span></h3></div><button className="text-link" onClick={() => onNavigate('notices')}>All notices <ArrowRight size={14} /></button></div><div className="notice-list">{notices.slice(0, 2).map((notice) => <article className="notice-item" key={notice.title}><span className={`notice-bullet ${notice.tone}`} /><div className="notice-content"><div className="notice-meta"><span className={`notice-category ${notice.tone}`}>{notice.category}</span><span className="notice-dot-separator">·</span><span>{notice.time}</span>{notice.urgent && <span className="action-pill">ACTION NEEDED</span>}</div><h4>{notice.title}</h4><p>{notice.text}</p><button className="notice-action" onClick={() => onNavigate('notices')}>{notice.action}<ArrowRight size={13} /></button></div></article>)}</div></section>

          <section className="section-block places-section"><div className="section-heading"><div><span className="section-eyebrow">ALL AROUND YOU</span><h3>Find your place</h3></div><button className="text-link" onClick={() => onNavigate('navigation')}>Open campus map <ArrowRight size={14} /></button></div><div className="place-grid">{campusPlaces.map((place) => <button className="place-card" key={place.name} onClick={() => onNavigate('navigation')}><span className={`place-icon ${place.color}`}><PlaceIcon name={place.icon} /></span><span className="place-text"><strong>{place.name}</strong><span>{place.detail}</span></span><ChevronRight className="place-arrow" size={15} /></button>)}</div></section>
        </div>

        <aside className="side-column">
          <section className="meal-panel"><div className="meal-header"><div><span className="section-eyebrow">FRESH FROM THE MESS</span><h3>On today’s menu</h3></div><span className="meal-icon"><Utensils size={17} /></span></div><div className="meal-tabs" role="tablist" aria-label="Meal time">{['Breakfast', 'Lunch', 'Dinner'].map((meal) => <button key={meal} role="tab" aria-selected={selectedMeal === meal} className={selectedMeal === meal ? 'meal-tab-active' : ''} onClick={() => { setSelectedMeal(meal); setSelectedItem(mealMenus[meal][0][0]) }}>{meal}</button>)}</div><div className="menu-list">{mealMenus[selectedMeal].map(([name, detail], index) => <button type="button" className={`menu-item ${selectedItem === name ? 'menu-item-selected' : ''}`} aria-pressed={selectedItem === name} key={name} onClick={() => setSelectedItem(name)}><span className={`menu-index ${index === 0 ? 'menu-index-featured' : ''}`}>{String(index + 1).padStart(2, '0')}</span><span className="menu-item-copy"><strong>{name}</strong><span>{detail}</span></span>{index === 0 && <span className="chef-pick">TODAY’S PICK</span>}</button>)}</div><div className="order-row"><div className="menu-service"><span className="service-dot" />{currentOrder ? `${currentOrder.orderNumber} · ${currentOrder.status}` : `Serving until 2:30 pm · ${selectedItem}`}</div><button className={`order-button ${orderBusy ? 'order-complete' : ''}`} disabled={orderBusy || user.role !== 'Student'} onClick={preorder}>{orderBusy ? 'Placing…' : currentOrder?.status === 'Placed' || currentOrder?.status === 'Preparing' ? <>Track order <ArrowRight size={13}/></> : <>Pre-order <ArrowRight size={13} /></>}</button></div></section>

          <button className="event-panel" onClick={() => onNavigate('events')}><div className="event-image" /><div className="event-info"><span className="event-label"><CalendarDays size={12} /> COMING UP ON CAMPUS</span><strong>Ideas look better<br />when shared.</strong><span className="event-name">Design week · Opening night</span><span className="event-time">THU, OCT 8 <i /> 5:00 PM <i /> MAIN AUDITORIUM</span></div><span className="event-arrow"><ArrowUpRight size={15} /></span></button>

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
  const icons = { GraduationCap: <GraduationCap size={17} />, LibraryBig: <Compass size={17} />, Utensils: <Utensils size={17} />, HeartPulse: <HeartPulse size={17} /> }
  return icons[name]
}