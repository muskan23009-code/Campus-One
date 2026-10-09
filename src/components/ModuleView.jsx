import { useEffect, useState } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, Bell, BookOpen, Building2,
  Bus, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, Clock3,
  ContactRound, HeartPulse, LibraryBig, Map, MapPin, Megaphone,
  MessageCircle, PackageSearch, Phone, Search, ShieldAlert, Sparkles,
  Utensils,
} from 'lucide-react'
import { moduleDetails } from '../data/campusData'
import { api } from '../api/client'

const icons = { Activity, ArrowRight, Bell, BookOpen, Building2, Bus, CalendarDays, ChartNoAxesCombined, ContactRound, HeartPulse, LibraryBig, Map, MapPin, Megaphone, MessageCircle, PackageSearch, Phone, Search, ShieldAlert, Sparkles, Utensils }

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
  const isValidPhoneNumber = (value) => {
    const candidate = String(value || '').trim()
    if (!candidate) return false
    if (!/^\+?[\d\s().-]{7,20}$/.test(candidate)) return false
    return candidate.replace(/\D/g, '').length >= 7 && candidate.replace(/\D/g, '').length <= 15
  }
  const getEmergencyLocationUrl = (value) => {
    const candidate = String(value || '').trim()
    if (!candidate) return ''
    try {
      const parsed = new URL(candidate)
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : ''
    } catch {
      return ''
    }
  }
  const HOSTEL_CATEGORIES = new Set(['HOSTEL_WARDEN', 'HOSTEL_IN_CHARGE', 'HOSTEL_SECURITY'])
  const CAMPUS_SECURITY_CATEGORIES = new Set(['MAIN_GATE_GUARD', 'CAMPUS_SECURITY', 'SECURITY_OFFICE'])
  const quickActionCategories = ['MAIN_GATE_GUARD', 'CAMPUS_SECURITY', 'HOSTEL_WARDEN', 'HOSTEL_IN_CHARGE', 'MEDICAL_EMERGENCY', 'AMBULANCE', 'FIRE_EMERGENCY']
  const emergencyContacts = page === 'emergency' && liveRecords ? liveRecords.filter((record) => record.is_active !== false && record.active !== false && isValidPhoneNumber(String(record.phone_number || record.phone || ''))).sort((left, right) => (Number(left.display_order ?? left.priority ?? 999) - Number(right.display_order ?? right.priority ?? 999)) || String(left.name || left.title).localeCompare(String(right.name || right.title))).map((record) => {
    const name = record.name || record.title || 'Emergency contact'
    const category = String(record.category || 'OTHER_EMERGENCY').toUpperCase()
    const phone = String(record.phone_number || record.phone || '').trim()
    const validPhone = isValidPhoneNumber(phone)
    const locationUrl = getEmergencyLocationUrl(record.location_url || record.map_url || '')
    return {
      id: record.id,
      name,
      category,
      phone,
      validPhone,
      hostelName: record.hostel_name || record.hostelName || '',
      location: record.location || 'Campus support',
      description: [record.designation, record.location, record.description].filter(Boolean).join(' · ') || 'Campus assistance',
      locationUrl,
      available24x7: record.available_24x7 !== false,
      priority: Number(record.priority ?? record.display_order ?? 999),
    }
  }) : []
  const hostelEmergencyGroups = emergencyContacts.filter((contact) => HOSTEL_CATEGORIES.has(contact.category)).reduce((groups, contact) => {
    const groupName = contact.hostelName || 'Hostel Emergency'
    const bucket = groups.find((entry) => entry.name === groupName)
    if (bucket) bucket.contacts.push(contact)
    else groups.push({ name: groupName, contacts: [contact] })
    return groups
  }, []).sort((left, right) => left.name.localeCompare(right.name))
  const campusSecurityContacts = emergencyContacts.filter((contact) => CAMPUS_SECURITY_CATEGORIES.has(contact.category) || (contact.category === 'OTHER_EMERGENCY' && /security|guard|gate/i.test(contact.name)))
  const otherEmergencyContacts = emergencyContacts.filter((contact) => !HOSTEL_CATEGORIES.has(contact.category) && !CAMPUS_SECURITY_CATEGORIES.has(contact.category) && !(contact.category === 'OTHER_EMERGENCY' && /security|guard|gate/i.test(contact.name)))
  const quickActions = quickActionCategories.map((category) => emergencyContacts.find((contact) => contact.category === category && contact.validPhone)).filter(Boolean)
  const emergencyLocations = page === 'emergency' && emergencyContacts.length > 0 ? emergencyContacts.map((contact) => ({
    id: contact.id,
    name: contact.location || `${contact.name} location`,
    description: contact.description,
    url: contact.locationUrl,
  })).filter((item) => item.name && (item.url || item.description)) : []
  const rows = page === 'emergency' ? emergencyContacts.map((contact) => [contact.name, `${categoryLabel(contact.category)} · ${contact.description} · ${contact.phone || 'No number available'}`, contact.validPhone ? 'Call now' : 'Unavailable', contact.phone || '']) : liveRecords ? liveRecords.map((record) => [record.title, record.description, 'View details']) : detail.rows
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
    const collections = { notices: 'notices', food: 'food', events: 'events', library: 'library', hostel: 'hostel', transport: 'transport', 'lost-found': 'lost-found', directory: 'directory', emergency: 'emergency' }
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

      <section className="module-stats">{(page === 'emergency' ? [['24/7', 'Campus coverage'], ['Critical', 'Fast support'], ['Safety first', 'Trusted teams']] : detail.stats).map(([label, value], index) => <div className="module-stat" key={`${page}-${label}`}><span className="module-stat-icon"><StatIcon index={index} /></span><span><span>{label}</span><strong>{value}</strong></span>{index === 0 && <ArrowUpRight className="module-stat-trend" size={15} />}</div>)}</section>

      {page === 'emergency' && <section className="emergency-center-shell"><div className="emergency-header"><span className="module-icon emergency-icon"><ShieldAlert size={22} strokeWidth={1.8} /></span><div><span className="section-eyebrow">EMERGENCY RESPONSE</span><h2>Campus Emergency Center</h2><p>Reach the right support quickly and safely. Call for campus security, medical help, ambulance, or urgent campus assistance.</p></div></div>
        {recordsError ? <div className="module-no-results">{recordsError}</div> : !liveRecords ? <div className="module-no-results">Loading emergency contacts…</div> : (
          <>
            {quickActions.length > 0 && <div className="emergency-quick-actions">{quickActions.map((contact) => <a key={contact.id} className="emergency-quick-button" href={contact.validPhone ? `tel:${String(contact.phone).replace(/[^\d+]/g, '')}` : undefined} onClick={(event) => { if (!contact.validPhone) event.preventDefault(); else runAction(contact.name) }}><span>{contact.category === 'MAIN_GATE_GUARD' ? '🛡️' : contact.category === 'HOSTEL_WARDEN' ? '🏠' : contact.category === 'MEDICAL_EMERGENCY' ? '🏥' : contact.category === 'AMBULANCE' ? '🚑' : contact.category === 'FIRE_EMERGENCY' ? '🔥' : '📞'}</span>{contact.category === 'MAIN_GATE_GUARD' ? 'Security' : contact.category === 'HOSTEL_WARDEN' ? 'Hostel' : contact.category === 'MEDICAL_EMERGENCY' ? 'Medical' : contact.category === 'AMBULANCE' ? 'Ambulance' : contact.category === 'FIRE_EMERGENCY' ? 'Fire' : 'Emergency'}</a>)}</div>}
            {hostelEmergencyGroups.length > 0 && <div className="emergency-section-block"><div className="module-list-header"><div><span className="section-eyebrow">HOSTEL EMERGENCY</span><h2>Hostel emergency contacts</h2></div></div><div className="emergency-hostel-groups">{hostelEmergencyGroups.map((group) => <div className="emergency-hostel-group" key={group.name}><h3>{group.name}</h3><div className="emergency-contact-grid">{group.contacts.map((contact) => {
              const telHref = contact.validPhone ? `tel:${String(contact.phone).replace(/[^\d+]/g, '')}` : undefined
              return <article className="emergency-contact-card" key={contact.id}><div className="emergency-card-header"><span className="emergency-card-badge">{categoryLabel(contact.category)}</span>{contact.available24x7 && <span className="emergency-card-status">24/7</span>}</div><h3>{contact.name}</h3><p>{contact.description}</p><div className="emergency-card-meta"><span>{contact.hostelName || contact.location}</span>{contact.phone && <span>{contact.phone}</span>}</div><div className="emergency-card-actions"><a className={`emergency-call-button${contact.validPhone ? '' : ' disabled'}`} href={telHref} aria-disabled={!contact.validPhone} onClick={(event) => { if (!contact.validPhone) event.preventDefault(); else runAction(contact.name) }}>Call now</a>{contact.locationUrl && <a className="emergency-map-link" href={contact.locationUrl} target="_blank" rel="noreferrer">View location</a>}</div>{!contact.validPhone && <small className="emergency-instruction">Phone number unavailable or invalid.</small>}</article>
            })}</div></div>)}</div></div>}
            {campusSecurityContacts.length > 0 && <div className="emergency-section-block"><div className="module-list-header"><div><span className="section-eyebrow">CAMPUS SECURITY</span><h2>Campus security contacts</h2></div></div><div className="emergency-contact-grid">{campusSecurityContacts.map((contact) => {
              const telHref = contact.validPhone ? `tel:${String(contact.phone).replace(/[^\d+]/g, '')}` : undefined
              return <article className="emergency-contact-card" key={contact.id}><div className="emergency-card-header"><span className="emergency-card-badge">{categoryLabel(contact.category)}</span>{contact.available24x7 && <span className="emergency-card-status">24/7</span>}</div><h3>{contact.name}</h3><p>{contact.description}</p><div className="emergency-card-meta"><span>{contact.location}</span>{contact.phone && <span>{contact.phone}</span>}</div><div className="emergency-card-actions"><a className={`emergency-call-button${contact.validPhone ? '' : ' disabled'}`} href={telHref} aria-disabled={!contact.validPhone} onClick={(event) => { if (!contact.validPhone) event.preventDefault(); else runAction(contact.name) }}>Call now</a>{contact.locationUrl && <a className="emergency-map-link" href={contact.locationUrl} target="_blank" rel="noreferrer">View location</a>}</div>{!contact.validPhone && <small className="emergency-instruction">Phone number unavailable or invalid.</small>}</article>
            })}</div></div>}
            {otherEmergencyContacts.length > 0 && <div className="emergency-section-block"><div className="module-list-header"><div><span className="section-eyebrow">EMERGENCY SUPPORT</span><h2>Additional emergency services</h2></div></div><div className="emergency-contact-grid">{otherEmergencyContacts.map((contact) => {
              const telHref = contact.validPhone ? `tel:${String(contact.phone).replace(/[^\d+]/g, '')}` : undefined
              return <article className="emergency-contact-card" key={contact.id}><div className="emergency-card-header"><span className="emergency-card-badge">{categoryLabel(contact.category)}</span>{contact.available24x7 && <span className="emergency-card-status">24/7</span>}</div><h3>{contact.name}</h3><p>{contact.description}</p><div className="emergency-card-meta"><span>{contact.location}</span>{contact.phone && <span>{contact.phone}</span>}</div><div className="emergency-card-actions"><a className={`emergency-call-button${contact.validPhone ? '' : ' disabled'}`} href={telHref} aria-disabled={!contact.validPhone} onClick={(event) => { if (!contact.validPhone) event.preventDefault(); else runAction(contact.name) }}>Call now</a>{contact.locationUrl && <a className="emergency-map-link" href={contact.locationUrl} target="_blank" rel="noreferrer">View location</a>}</div>{!contact.validPhone && <small className="emergency-instruction">Phone number unavailable or invalid.</small>}</article>
            })}</div></div>}
            {emergencyContacts.length === 0 && <div className="module-no-results">No emergency contacts have been added yet.</div>}
          </>
        )}
        <div className="emergency-location-panel"><div className="module-list-header"><div><span className="section-eyebrow">SAFETY LOCATIONS</span><h2>Campus Emergency Locations</h2></div></div>{emergencyLocations.length === 0 ? <div className="module-no-results">No emergency locations are configured yet.</div> : <div className="emergency-location-grid">{emergencyLocations.map((location) => <article className="emergency-location-card" key={location.id}><strong>{location.name}</strong><span>{location.description}</span>{location.url && <a href={location.url} target="_blank" rel="noreferrer">View Location</a>}</article>)}</div>}</div>
      </section>}

      {page === 'copilot' && <section className="copilot-chat"><div className="copilot-chat-heading"><span className="chat-spark"><Sparkles size={16} /></span><div><strong>What can I help you with?</strong><span>Ask away. Your campus copilot is listening.</span></div></div><form className="copilot-chat-form" onSubmit={(event) => { event.preventDefault(); if (copilotQuestion.trim()) runAction(copilotQuestion); else runAction('Ask about your campus') }}><input aria-label="Ask your campus copilot" placeholder="e.g. When does the library close tonight?" value={copilotQuestion} onChange={(event) => setCopilotQuestion(event.target.value)} /><button aria-label="Send message"><ArrowRight size={16} /></button></form><div className="chat-suggestions">{detail.suggestions.map((suggestion) => <button key={suggestion} onClick={() => setCopilotQuestion(suggestion)}>{suggestion}<ArrowUpRight size={12} /></button>)}</div><div className="copilot-privacy"><ShieldAlert size={12} /> Campus-trained assistance. Your conversations stay private.</div></section>}

      {page === 'navigation' && <section className="map-preview"><div className="map-canvas"><div className="map-roads road-one"/><div className="map-roads road-two"/><div className="map-roads road-three"/><div className="map-park park-one"/><div className="map-park park-two"/><span className="map-building building-one"><Building2 size={18}/><span>ACADEMIC BLOCK A</span></span><span className="map-building building-two"><LibraryBig size={17}/><span>MAIN LIBRARY</span></span><span className="map-building building-three"><Utensils size={16}/><span>NORTH MESS</span></span><span className="map-building building-four"><HeartPulse size={16}/><span>HEALTH CENTRE</span></span><span className="map-pin pin-current"><span /></span><span className="map-pin pin-destination"><MapPin size={14} /></span><span className="map-map-label">PURAN MURTI VIDYAPEETH · SONIPAT</span></div><div className="map-controls"><div><span>4 places</span><span>Across campus</span></div><button onClick={() => runAction('Get directions to Main library')}><Map size={15} /> Plan a route</button></div></section>}

      {page === 'food' && <><section className="dining-feature"><div className="dining-feature-top"><span className="dining-feature-icon"><Utensils size={18}/></span><span className="dining-live"><span/> MANUAL CAMPUS ESTIMATE</span></div><strong>{messEstimate?.title || 'North student mess'}</strong><span className="dining-subtitle">{messEstimate?.description || 'Lunch · 12:00–2:30 pm · Campus-provided manual estimate'}</span><div className="dining-occupancy"><div><strong>{messEstimate?.occupancyPercent ?? 68}<span>%</span></strong><span>estimated occupancy</span></div><span className="occupancy-meter"><i style={{ right: `${100 - (messEstimate?.occupancyPercent ?? 68)}%` }}/></span><div className="dining-wait"><strong>{messEstimate?.estimatedWaitMinutes ?? 8}<span> min</span></strong><span>estimated wait</span></div></div><div className="dining-note"><Check size={13}/>{messEstimate?.crowdLevel || 'Moderate'} crowd · Manual estimate, not camera detection{messEstimate?.crowdUpdatedAt ? ` · Updated ${new Date(messEstimate.crowdUpdatedAt).toLocaleString()}` : ''}</div></section><section className="food-order-panel"><div className="section-eyebrow">PLACE A CAMPUS CANTEEN PRE-ORDER</div><h2>Choose from today’s menu</h2><form className="food-order-form" onSubmit={placeFoodOrder}><label>MEAL<select value={foodMeal} onChange={(event) => { setFoodMeal(event.target.value); setFoodItem(foodMenus[event.target.value][0]) }}>{Object.keys(foodMenus).map((meal) => <option key={meal}>{meal}</option>)}</select></label><label>MENU ITEM<select value={foodItem} onChange={(event) => setFoodItem(event.target.value)}>{foodMenus[foodMeal].map((item) => <option key={item}>{item}</option>)}</select></label><button className="module-primary" disabled={orderBusy || user.role !== 'Student'}>{orderBusy ? 'Placing order…' : 'Place pre-order'} <ArrowRight size={13}/></button></form>{foodNotice && <div className="food-order-confirmation" role="status"><Check size={13}/>{foodNotice}</div>}</section>{user.role === 'Student' && foodOrders.length > 0 && <section className="student-orders-section"><div className="module-list-header"><div><span className="section-eyebrow">STUDENT ACCOUNT</span><h2>Your canteen orders</h2></div></div><div className="sports-record-list">{foodOrders.map((order) => <article className="sports-record-row" key={order.id}><span className="sports-record-icon record-amber"><Utensils size={15}/></span><div className="module-row-body"><strong>{order.item}</strong><span>{order.meal} · {order.orderNumber} · {new Date(order.createdAt).toLocaleString()}</span></div><span className={`application-status application-${order.status.toLowerCase()}`}><i/>{order.status}</span></article>)}</div></section>}</>}

      {page !== 'emergency' && page !== 'navigation' && page !== 'food' && page !== 'copilot' && <div className="module-search"><Search size={16} /><input aria-label={`Search ${detail.title}`} placeholder={`Find something in ${detail.title.toLowerCase()}...`} value={filter} onChange={(event) => setFilter(event.target.value)} />{filter && <button onClick={() => setFilter('')}>Clear</button>}</div>}

      {page !== 'emergency' && <section className="module-entries"><div className="module-list-header"><div><span className="section-eyebrow">{page === 'complaints' ? 'YOUR SECURE CAMPUS REQUESTS' : page === 'notices' ? 'THE LATEST FROM ACROSS CAMPUS' : page === 'copilot' ? 'GOOD PLACES TO START' : page === 'food' ? 'ON YOUR CAMPUS MENU' : page === 'navigation' ? 'POPULAR PLACES' : 'A FEW PLACES TO START'}</span><h2>{page === 'complaints' ? user.role === 'Staff' ? 'Assigned student requests' : 'Your requests' : page === 'notices' ? 'Your campus updates' : page === 'copilot' ? 'Your campus, in your corner' : page === 'food' ? 'Today at a glance' : page === 'navigation' ? 'Find your destination' : `Explore ${detail.title.toLowerCase()}`}</h2></div><span className="results-count">{visibleComplaints ? visibleComplaints.length : filtered.length} {visibleComplaints ? 'requests' : filtered.length === 1 ? 'item' : 'items'}</span></div>
        {recordsError && <div className="management-alert" role="alert">{recordsError}</div>}
        <div className="module-row-list">{visibleComplaints ? visibleComplaints.map((record, index) => <article className="module-row" key={record.id}><span className="module-row-index">{String(index + 1).padStart(2, '0')}</span><div className="module-row-body"><strong>{record.title}</strong><span>{record.details}</span></div>{user.role === 'Staff' && <select className="complaint-status-select" aria-label={`Update ${record.title}`} value={record.status} onChange={(event) => updateComplaint(record, event.target.value)}>{['Open', 'In progress', 'Resolved'].map((status) => <option key={status}>{status}</option>)}</select>}</article>) : filtered.map((row, index) => { const [title, description, action, phoneNumber] = row; const telHref = page === 'emergency' && phoneNumber ? `tel:${String(phoneNumber).replace(/\D+/g, '')}` : 'tel:112'; return <article className="module-row" key={`${title}-${index}`}><span className="module-row-index">{String(index + 1).padStart(2, '0')}</span><div className="module-row-body"><strong>{title}</strong><span>{description}</span></div>{page === 'emergency' && <a className="emergency-direct" href={telHref} aria-label={`Call ${title}`} onClick={(event) => { event.preventDefault(); runAction(action) }}><Phone size={15} /></a>}<button className="module-row-action" onClick={() => runAction(action)}>{page === 'emergency' ? 'Call now' : action}<ArrowRight size={13} /></button></article> })}{visibleComplaints && visibleComplaints.length === 0 && <div className="module-no-results">{user.role === 'Student' ? 'You have not sent any requests yet.' : 'There are no requests assigned to your account.'}</div>}{!visibleComplaints && filtered.length === 0 && <div className="module-no-results">Nothing here just yet. Try a different search.</div>}</div>
      </section>}

      {page === 'analytics' && <section className="analytics-chart-section"><div className="module-list-header"><div><span className="section-eyebrow">A QUIETER LUNCH RUSH</span><h2>Dining wait times</h2></div><span className="analytics-change"><ArrowUpRight size={13} /> 18% this month</span></div><div className="chart-bars" aria-label="Dining wait times this week">{[['M',40],['T',65],['W',49],['T',76],['F',38],['S',27],['S',32]].map(([label, height], index) => <div className="chart-column" key={`${label}-${index}`}><span style={{ height: `${height}%` }} className={index === 4 ? 'chart-highlight' : ''}/><span>{label}</span></div>)}</div></section>}

      <footer className="dashboard-footer"><span><span className="footer-status-dot" />Campus services available</span><span>Campus One · Puran Murti Vidyapeeth</span></footer>
    </div>
  )
}

function categoryLabel(category) {
  return {
    HOSTEL_WARDEN: 'Hostel Warden',
    HOSTEL_IN_CHARGE: 'Hostel In-Charge',
    HOSTEL_SECURITY: 'Hostel Security',
    MAIN_GATE_GUARD: 'Main Gate Guard',
    CAMPUS_SECURITY: 'Campus Security',
    SECURITY_OFFICE: 'Security Office',
    MEDICAL_EMERGENCY: 'Medical Emergency',
    AMBULANCE: 'Ambulance',
    FIRE_EMERGENCY: 'Fire Emergency',
    POLICE: 'Police',
    WOMEN_SAFETY: 'Women Safety',
    ANTI_RAGGING: 'Anti-Ragging',
    TRANSPORT_EMERGENCY: 'Transport Emergency',
    ADMINISTRATION_EMERGENCY: 'Administration Emergency',
    OTHER_EMERGENCY: 'Other Emergency',
    MEDICAL: 'Medical Emergency',
    SECURITY: 'Campus Security',
    FIRE: 'Fire Emergency',
    STUDENT_SUPPORT: 'Anti-Ragging',
    ADMIN: 'Administration Emergency',
    OTHER: 'Other Emergency',
  }[category] || String(category || '').replace(/_/g, ' ')
}

function StatIcon({ index }) {
  const stats = [<Clock3 size={15}/>, <Activity size={15}/>, <Check size={15}/>]
  return stats[index % stats.length]
}