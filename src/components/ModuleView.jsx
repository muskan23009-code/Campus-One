import { useEffect, useState } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, Bell, Building2,
  CalendarDays, ChartNoAxesCombined, Check, ChevronRight, Clock3,
  ContactRound, HeartPulse, Map, MapPin, Megaphone,
  MessageCircle, PackageSearch, Phone, Search, ShieldAlert, Sparkles,
  Utensils,
} from 'lucide-react'
import { moduleDetails } from '../data/campusData'
import { api } from '../api/client'

const icons = { Activity, ArrowRight, Bell, Building2, CalendarDays, ChartNoAxesCombined, ContactRound, HeartPulse, Map, MapPin, Megaphone, MessageCircle, PackageSearch, Phone, Search, ShieldAlert, Sparkles, Utensils }

export default function ModuleView({ page, user, onAction }) {
  const [filter, setFilter] = useState('')
  const [copilotQuestion, setCopilotQuestion] = useState('')
  const [liveRecords, setLiveRecords] = useState(null)
  const [complaintRecords, setComplaintRecords] = useState(null)
  const [foodOrders, setFoodOrders] = useState([])
  const [foodMeal, setFoodMeal] = useState('Lunch')
  const [foodItem, setFoodItem] = useState('Dal makhani & jeera rice')
  const [foodNotice, setFoodNotice] = useState('')
  const [orderBusy, setOrderBusy] = useState(false)
  const [recordsError, setRecordsError] = useState('')
  const detail = moduleDetails[page]
  const Icon = icons[detail.icon] || Sparkles
  const rows = liveRecords ? liveRecords.map((record) => [record.title, record.description, 'View details']) : detail.rows
  const filtered = rows.filter((row) => row.join(' ').toLowerCase().includes(filter.toLowerCase()))
  const messEstimate = liveRecords?.find((record) => record.id === 'food-mess') || liveRecords?.find((record) => record.title.toLowerCase().includes('mess'))
  const foodMenus = {
    Breakfast: ['Idli with sambhar', 'Aloo paratha', 'Masala omelette'],
    Lunch: ['Dal makhani & jeera rice', 'Paneer tikka wrap', 'Seasonal fruit bowl'],
    Dinner: ['Matar paneer & roti', 'Veg noodles', 'Kadhi chawal'],
  }

  useEffect(() => {
    let active = true
    setLiveRecords(null)
    setComplaintRecords(null)
    const collections = { notices: 'notices', food: 'food', events: 'events', hostel: 'hostel', directory: 'directory', emergency: 'emergency' }
    const request = page === 'complaints' ? api('/api/complaints') : page === 'food' ? Promise.all([api('/api/campus/food'), user.role === 'Student' ? api('/api/food/orders') : Promise.resolve({ orders: [] })]) : collections[page] ? api(`/api/campus/${collections[page]}`) : page === 'sports' ? api('/api/sports') : null
    if (!request) { setLiveRecords(null); setComplaintRecords(null); setRecordsError(''); return () => { active = false } }
    setRecordsError('')
    request.then((result) => {
      if (!active) return
      if (page === 'complaints') setComplaintRecords(result.complaints)
      else if (page === 'food') { setLiveRecords(result[0].records); setFoodOrders(result[1].orders) }
      else setLiveRecords(page === 'sports' ? result.records.filter((record) => record.active) : result.records)
    }).catch((reason) => { if (active) setRecordsError(reason.message) })
    return () => { active = false }
  }, [page, user.role])

  async function placeFoodOrder(event) {
    event.preventDefault()
    setOrderBusy(true)
    setRecordsError('')
    try {
      const result = await api('/api/food/orders', { method: 'POST', body: { meal: foodMeal, item: foodItem } })
      setFoodOrders((current) => [result.order, ...current])
      setFoodNotice(`${result.order.orderNumber} · Placed`)
      onAction(`Canteen order ${result.order.orderNumber} placed.`)
    } catch (reason) { setRecordsError(reason.message) } finally { setOrderBusy(false) }
  }

  async function updateComplaint(record, status) {
    try {
      const result = await api(`/api/complaints/${encodeURIComponent(record.id)}`, { method: 'PATCH', body: { status } })
      setComplaintRecords((current) => current.map((item) => item.id === record.id ? result.complaint : item))
      onAction(`Request “${record.title}” is now ${status.toLowerCase()}.`)
    } catch (reason) { setRecordsError(reason.message) }
  }

  const visibleComplaints = page === 'complaints' && complaintRecords
    ? complaintRecords.map((record) => ({ ...record, details: `${record.status} · ${new Date(record.createdAt).toLocaleDateString()}${record.assignedTo ? ` · Assigned to ${record.assignedTo}` : ''}` }))
    : null

  function runAction(label) {
    if (page === 'complaints' && label.toLowerCase().includes('request')) {
      onAction('Tell us what is on your mind')
      return
    }
    if (page === 'copilot' && (label.startsWith('Ask about') || label.includes('Find a service') || label.includes('Explore campus'))) {
      setCopilotQuestion(label)
      return
    }
    if (page === 'navigation') { onAction(`Directions to ${label.replace('Get directions', '').trim() || 'selected campus location'}`); return }
    if (page === 'emergency') { onAction(`Calling ${label.toLowerCase().includes('112') ? '112' : 'campus emergency contact'}`); return }
    onAction(label)
  }

  return (
    <div className={`module-page module-accent-${detail.accent} page-enter`}>
      <div className="module-breadcrumb">YOUR CAMPUS <ChevronRight size={12} /> CAMPUS SERVICES</div>
      <section className="module-hero"><div className="module-title-area"><span className="module-icon"><Icon size={20} strokeWidth={1.8} /></span><span className="module-eyebrow">{detail.eyebrow}</span><h1>{detail.title}<span className="module-title-period">.</span></h1><p>{detail.description}</p></div>{page === 'complaints' && <button className="module-primary" onClick={() => onAction('Tell us what is on your mind')}><MessageCircle size={15} /> Make a request</button>}{page === 'copilot' && <span className="module-available"><span /> READY WHEN YOU ARE</span>}</section>

      <section className="module-stats">{detail.stats.map(([label, value], index) => <div className="module-stat" key={label}><span className="module-stat-icon"><StatIcon index={index} /></span><span><span>{label}</span><strong>{value}</strong></span>{index === 0 && <ArrowUpRight className="module-stat-trend" size={15} />}</div>)}</section>

      {page === 'copilot' && <section className="copilot-chat"><div className="copilot-chat-heading"><span className="chat-spark"><Sparkles size={16} /></span><div><strong>What can I help you with?</strong><span>Ask away. Your campus copilot is listening.</span></div></div><form className="copilot-chat-form" onSubmit={(event) => { event.preventDefault(); if (copilotQuestion.trim()) runAction(copilotQuestion); else runAction('Ask about your campus') }}><input aria-label="Ask your campus copilot" placeholder="e.g. What’s happening on campus this week?" value={copilotQuestion} onChange={(event) => setCopilotQuestion(event.target.value)} /><button aria-label="Send message"><ArrowRight size={16} /></button></form><div className="chat-suggestions">{detail.suggestions.map((suggestion) => <button key={suggestion} onClick={() => setCopilotQuestion(suggestion)}>{suggestion}<ArrowUpRight size={12} /></button>)}</div><div className="copilot-privacy"><ShieldAlert size={12} /> Campus-trained assistance. Your conversations stay private.</div></section>}

      {page === 'navigation' && <section className="map-preview"><div className="map-canvas"><div className="map-roads road-one"/><div className="map-roads road-two"/><div className="map-roads road-three"/><div className="map-park park-one"/><div className="map-park park-two"/><span className="map-building building-one"><Building2 size={18}/><span>ACADEMIC BLOCK A</span></span><span className="map-building building-two"><Utensils size={16}/><span>NORTH MESS</span></span><span className="map-building building-three"><HeartPulse size={16}/><span>HEALTH CENTRE</span></span><span className="map-pin pin-current"><span /></span><span className="map-pin pin-destination"><MapPin size={14} /></span><span className="map-map-label">PURAN MURTI VIDYAPEETH · SONIPAT</span></div><div className="map-controls"><div><span>3 places</span><span>Across campus</span></div><button onClick={() => runAction('Plan a campus route')}><Map size={15} /> Plan a route</button></div></section>}

      {page === 'food' && <><section className="dining-feature"><div className="dining-feature-top"><span className="dining-feature-icon"><Utensils size={18}/></span><span className="dining-live"><span/> MANUAL CAMPUS ESTIMATE</span></div><strong>{messEstimate?.title || 'North student mess'}</strong><span className="dining-subtitle">{messEstimate?.description || 'Lunch · 12:00–2:30 pm · Campus-provided manual estimate'}</span><div className="dining-occupancy"><div><strong>{messEstimate?.occupancyPercent ?? 68}<span>%</span></strong><span>estimated occupancy</span></div><span className="occupancy-meter"><i style={{ right: `${100 - (messEstimate?.occupancyPercent ?? 68)}%` }}/></span><div className="dining-wait"><strong>{messEstimate?.estimatedWaitMinutes ?? 8}<span> min</span></strong><span>estimated wait</span></div></div><div className="dining-note"><Check size={13}/>{messEstimate?.crowdLevel || 'Moderate'} crowd · Manual estimate, not camera detection{messEstimate?.crowdUpdatedAt ? ` · Updated ${new Date(messEstimate.crowdUpdatedAt).toLocaleString()}` : ''}</div></section><section className="food-order-panel"><div className="section-eyebrow">PLACE A CAMPUS CANTEEN PRE-ORDER</div><h2>Choose from today’s menu</h2><form className="food-order-form" onSubmit={placeFoodOrder}><label>MEAL<select value={foodMeal} onChange={(event) => { setFoodMeal(event.target.value); setFoodItem(foodMenus[event.target.value][0]) }}>{Object.keys(foodMenus).map((meal) => <option key={meal}>{meal}</option>)}</select></label><label>MENU ITEM<select value={foodItem} onChange={(event) => setFoodItem(event.target.value)}>{foodMenus[foodMeal].map((item) => <option key={item}>{item}</option>)}</select></label><button className="module-primary" disabled={orderBusy || user.role !== 'Student'}>{orderBusy ? 'Placing order…' : 'Place pre-order'} <ArrowRight size={13}/></button></form>{foodNotice && <div className="food-order-confirmation" role="status"><Check size={13}/>{foodNotice}</div>}</section>{user.role === 'Student' && foodOrders.length > 0 && <section className="student-orders-section"><div className="module-list-header"><div><span className="section-eyebrow">STUDENT ACCOUNT</span><h2>Your canteen orders</h2></div></div><div className="sports-record-list">{foodOrders.map((order) => <article className="sports-record-row" key={order.id}><span className="sports-record-icon record-amber"><Utensils size={15}/></span><div className="module-row-body"><strong>{order.item}</strong><span>{order.meal} · {order.orderNumber} · {new Date(order.createdAt).toLocaleString()}</span></div><span className={`application-status application-${order.status.toLowerCase()}`}><i/>{order.status}</span></article>)}</div></section>}</>}

      {page !== 'navigation' && page !== 'food' && page !== 'copilot' && <div className="module-search"><Search size={16} /><input aria-label={`Search ${detail.title}`} placeholder={`Find something in ${detail.title.toLowerCase()}...`} value={filter} onChange={(event) => setFilter(event.target.value)} />{filter && <button onClick={() => setFilter('')}>Clear</button>}</div>}

      <section className="module-entries"><div className="module-list-header"><div><span className="section-eyebrow">{page === 'complaints' ? 'YOUR SECURE CAMPUS REQUESTS' : page === 'notices' ? 'THE LATEST FROM ACROSS CAMPUS' : page === 'emergency' ? 'QUICK ACCESS, WHEN IT MATTERS' : page === 'copilot' ? 'GOOD PLACES TO START' : page === 'food' ? 'ON YOUR CAMPUS MENU' : page === 'navigation' ? 'POPULAR PLACES' : 'A FEW PLACES TO START'}</span><h2>{page === 'complaints' ? user.role === 'Staff' ? 'Assigned student requests' : 'Your requests' : page === 'notices' ? 'Your campus updates' : page === 'emergency' ? 'Get in touch' : page === 'copilot' ? 'Your campus, in your corner' : page === 'food' ? 'Today at a glance' : page === 'navigation' ? 'Find your destination' : `Explore ${detail.title.toLowerCase()}`}</h2></div><span className="results-count">{visibleComplaints ? visibleComplaints.length : filtered.length} {visibleComplaints ? 'requests' : filtered.length === 1 ? 'item' : 'items'}</span></div>
        {recordsError && <div className="management-alert" role="alert">{recordsError}</div>}
        <div className="module-row-list">{visibleComplaints ? visibleComplaints.map((record, index) => <article className="module-row" key={record.id}><span className="module-row-index">{String(index + 1).padStart(2, '0')}</span><div className="module-row-body"><strong>{record.title}</strong><span>{record.details}</span></div>{user.role === 'Staff' && <select className="complaint-status-select" aria-label={`Update ${record.title}`} value={record.status} onChange={(event) => updateComplaint(record, event.target.value)}>{['Open', 'In progress', 'Resolved'].map((status) => <option key={status}>{status}</option>)}</select>}</article>) : filtered.map(([title, description, action], index) => <article className="module-row" key={title}><span className="module-row-index">{String(index + 1).padStart(2, '0')}</span><div className="module-row-body"><strong>{title}</strong><span>{description}</span></div>{page === 'emergency' && <a className="emergency-direct" href="tel:112" aria-label={`Call ${title}`} onClick={(event) => { event.preventDefault(); runAction(action) }}><Phone size={15} /></a>}<button className="module-row-action" onClick={() => runAction(action)}>{action}<ArrowRight size={13} /></button></article>)}{visibleComplaints && visibleComplaints.length === 0 && <div className="module-no-results">{user.role === 'Student' ? 'You have not sent any requests yet.' : 'There are no requests assigned to your account.'}</div>}{!visibleComplaints && filtered.length === 0 && <div className="module-no-results">Nothing here just yet. Try a different search.</div>}</div>
      </section>

      {page === 'analytics' && <section className="analytics-chart-section"><div className="module-list-header"><div><span className="section-eyebrow">A QUIETER LUNCH RUSH</span><h2>Dining wait times</h2></div><span className="analytics-change"><ArrowUpRight size={13} /> 18% this month</span></div><div className="chart-bars" aria-label="Dining wait times this week">{[['M',40],['T',65],['W',49],['T',76],['F',38],['S',27],['S',32]].map(([label, height], index) => <div className="chart-column" key={`${label}-${index}`}><span style={{ height: `${height}%` }} className={index === 4 ? 'chart-highlight' : ''}/><span>{label}</span></div>)}</div></section>}

      <footer className="dashboard-footer"><span><span className="footer-status-dot" />Campus services available</span><span>Campus One · Puran Murti Vidyapeeth</span></footer>
    </div>
  )
}

function StatIcon({ index }) {
  const stats = [<Clock3 size={15}/>, <Activity size={15}/>, <Check size={15}/>]
  return stats[index % stats.length]
}