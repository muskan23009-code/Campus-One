import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, BookOpen, Check, ChevronRight, Clock3, Flag,
  HandHelping, HeartHandshake, Lightbulb, LoaderCircle, MessageCircle,
  Search, ShieldCheck, Sparkles, UserRound, UsersRound, X,
} from 'lucide-react'
import { api } from '../api/client'

const CATEGORIES = ['Technology', 'Design', 'Media', 'Academics', 'Languages', 'Sports', 'Events', 'Other']
const LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const REPORT_REASONS = ['Inappropriate content', 'Spam', 'Misleading', 'Safety concern', 'Other']

function friendlyError(reason) {
  if (reason?.message === 'Campus API route not found.') return 'Skill Exchange is temporarily unavailable. Please try again later.'
  return reason?.message || 'Skill Exchange could not complete that request. Please try again.'
}

export default function SkillExchange({ user, onNotify }) {
  const isAdmin = user.role === 'Administration'
  const [listings, setListings] = useState([])
  const [myListings, setMyListings] = useState([])
  const [connections, setConnections] = useState([])
  const [reports, setReports] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [kind, setKind] = useState('')
  const [level, setLevel] = useState('')
  const [section, setSection] = useState('browse')
  const [modal, setModal] = useState('')
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [message, setMessage] = useState('')
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0])
  const [reportDetails, setReportDetails] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    const requests = isAdmin
      ? [api('/api/skill-exchange/reports')]
      : [
          api('/api/skill-exchange/listings'),
          api('/api/skill-exchange/listings?mine=1'),
          api('/api/skill-exchange/connections'),
        ]
    const results = await Promise.all(requests)
    if (isAdmin) setReports(results[0].reports)
    else {
      setListings(results[0].listings)
      setMyListings(results[1].listings)
      setConnections(results[2].connections)
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    refresh().catch((reason) => { if (active) setError(friendlyError(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isAdmin])

  const visibleListings = useMemo(() => listings.filter((listing) => {
    const query = search.trim().toLowerCase()
    return (!query || [listing.skill, listing.description, listing.helpWith, listing.student.name, listing.student.department].join(' ').toLowerCase().includes(query))
      && (!category || listing.category === category)
      && (!kind || listing.kind === kind)
      && (!level || listing.level === level)
  }), [listings, search, category, kind, level])

  const offers = myListings.filter((listing) => listing.kind === 'OFFER')
  const requests = myListings.filter((listing) => listing.kind === 'REQUEST')
  const pendingIncoming = connections.filter((entry) => entry.incoming && entry.status === 'PENDING')
  const pendingSent = connections.filter((entry) => !entry.incoming && entry.status === 'PENDING')
  const acceptedConnections = connections.filter((entry) => entry.status === 'ACCEPTED')

  function openForm(listingKind, listing) {
    setSelected(listing || null)
    setForm(listing ? {
      kind: listing.kind,
      skill: listing.skill,
      category: listing.category,
      description: listing.description,
      level: listing.level,
      helpWith: listing.helpWith || '',
      availability: listing.availability || '',
      deadline: listing.deadline || '',
    } : { ...emptyForm(), kind: listingKind })
    setError('')
    setModal('listing')
  }

  async function saveListing(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (selected) {
        await api(`/api/skill-exchange/listings/${encodeURIComponent(selected.id)}`, { method: 'PATCH', body: form })
        onNotify('Your Skill Exchange listing was updated.')
      } else {
        await api('/api/skill-exchange/listings', { method: 'POST', body: form })
        onNotify(form.kind === 'OFFER' ? 'Your skill offer is now live.' : 'Your help request is now live.')
      }
      setModal('')
      await refresh()
    } catch (reason) { setError(friendlyError(reason)) } finally { setSaving(false) }
  }

  async function changeListing(listing, update) {
    setError('')
    try {
      if (update === 'DELETE') {
        await api(`/api/skill-exchange/listings/${encodeURIComponent(listing.id)}`, { method: 'DELETE' })
        onNotify('Your listing was deleted.')
      } else {
        await api(`/api/skill-exchange/listings/${encodeURIComponent(listing.id)}`, { method: 'PATCH', body: update })
        onNotify(listing.kind === 'REQUEST' ? (update.active ? 'Your help request was reopened.' : 'Your help request was closed.') : (update.active ? 'Your offer is active.' : 'Your offer is paused.'))
      }
      await refresh()
    } catch (reason) { setError(friendlyError(reason)) }
  }

  async function sendConnection(event) {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      await api('/api/skill-exchange/connections', { method: 'POST', body: { listingId: selected.id, message } })
      setModal('')
      setMessage('')
      await refresh()
      onNotify(selected.kind === 'REQUEST' ? 'Your offer to help was sent.' : 'Your connection request was sent.')
    } catch (reason) { setError(friendlyError(reason)) } finally { setSaving(false) }
  }

  async function updateConnection(connection, status) {
    setError('')
    try {
      await api(`/api/skill-exchange/connections/${encodeURIComponent(connection.id)}`, { method: 'PATCH', body: { status } })
      await refresh()
      onNotify(status === 'ACCEPTED' ? 'Connection accepted.' : status === 'DECLINED' ? 'Connection declined.' : 'Request cancelled.')
    } catch (reason) { setError(friendlyError(reason)) }
  }

  async function reportListing(event) {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      await api('/api/skill-exchange/reports', { method: 'POST', body: { listingId: selected.id, reason: reportReason, details: reportDetails } })
      setModal('')
      setReportDetails('')
      onNotify('Thank you. Your report was sent to Administration for review.')
    } catch (reason) { setError(friendlyError(reason)) } finally { setSaving(false) }
  }

  async function reviewReport(report, status) {
    setError('')
    try {
      await api(`/api/skill-exchange/reports/${encodeURIComponent(report.id)}`, { method: 'PATCH', body: { status } })
      await refresh()
      onNotify(status === 'REMOVE_LISTING' ? 'Listing removed from Skill Exchange.' : status === 'DISMISSED' ? 'Report dismissed.' : 'Report marked as reviewed.')
    } catch (reason) { setError(friendlyError(reason)) }
  }

  function showModal(type, listing) {
    setSelected(listing)
    setError('')
    if (type === 'connect') { setMessage(''); setModal('connect') }
    else if (type === 'report') { setReportReason(REPORT_REASONS[0]); setReportDetails(''); setModal('report') }
    else setModal('profile')
  }

  return <main className="module-page page-enter skill-exchange-page">
    <div className="module-breadcrumb">STUDENT LIFE <span>›</span> SKILL EXCHANGE</div>
    <section className="skill-exchange-hero">
      <div className="skill-hero-content"><span className="skill-eyebrow"><Sparkles size={13}/> CAMPUS SKILLS, SHARED</span><h1>SKILL EXCHANGE</h1><h2>Students helping students.</h2><p>Share your skills, find help, and collaborate with your campus community.</p>
        {!isAdmin && <div className="skill-hero-actions"><button onClick={() => openForm('OFFER')}><HandHelping size={16}/> I Can Help <ArrowRight size={14}/></button><button onClick={() => openForm('REQUEST')}><MessageCircle size={16}/> I Need Help <ArrowRight size={14}/></button></div>}
      </div>
      <div className="skill-hero-art" aria-hidden="true"><span className="skill-art-ring"/><span className="skill-art-card"><UsersRound size={32}/></span><span className="skill-art-spark skill-spark-a"/><span className="skill-art-spark skill-spark-b"/></div>
    </section>

    {error && <div className="skill-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={14}/></button></div>}

    {!isAdmin && <section className="skill-stats-grid" aria-label="My Skill Activity">
      <ActivityCard icon={<Lightbulb size={17}/>} label="My Offers" value={offers.length} tint="gold"/>
      <ActivityCard icon={<BookOpen size={17}/>} label="My Requests" value={requests.length} tint="purple"/>
      <ActivityCard icon={<Clock3 size={17}/>} label="Pending Connections" value={pendingIncoming.length + pendingSent.length} tint="teal"/>
      <ActivityCard icon={<HeartHandshake size={17}/>} label="Active Connections" value={acceptedConnections.length} tint="green"/>
    </section>}

    {isAdmin ? <section className="skill-panel">
      <SectionHeading eyebrow="COMMUNITY SAFETY" title="Reported listings" description="Review student reports and remove inappropriate listings."/>
      {loading ? <EmptyState>Loading reports…</EmptyState> : reports.length === 0 ? <EmptyState>No reports to review. Listings reported by students will appear here.</EmptyState> : <div className="skill-report-list">{reports.map((report) => <article className="skill-report-card" key={report.id}>
        <span className={`skill-report-status report-${report.status.toLowerCase()}`}>{report.status === 'PENDING' ? 'Needs review' : report.status}</span>
        <div><strong>{report.listing?.skill || 'Listing no longer available'}</strong><small>{report.listing?.category || 'Removed'} · {report.listing?.kind === 'REQUEST' ? 'Help request' : 'Skill offer'}</small></div>
        <p><b>{report.reason}</b>{report.details ? ` · ${report.details}` : ''}</p>
        {report.status === 'PENDING' && <div className="skill-card-actions"><button className="skill-secondary-button" onClick={() => reviewReport(report, 'DISMISSED')}>Dismiss</button><button className="skill-secondary-button" onClick={() => reviewReport(report, 'REVIEWED')}>Reviewed</button><button className="skill-danger-button" onClick={() => reviewReport(report, 'REMOVE_LISTING')}>Remove listing</button></div>}
      </article>)}</div>}
    </section> : <>
      <div className="skill-exchange-layout">
        <section className="skill-panel skill-browse-panel">
          <SectionHeading eyebrow="FIND YOUR PEOPLE" title="Browse Skills" description="Discover a skill, lend a hand, or learn something new."/>
          <div className="skill-search-row"><Search size={17}/><input aria-label="Search skills" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search skills, people, or topics"/></div>
          <div className="skill-filter-row">
            <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Listing</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">All listings</option><option value="OFFER">I Can Help</option><option value="REQUEST">I Need Help</option></select></label>
            <label><span>Experience</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">Any level</option>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="skill-chip-row"><button className={!category ? 'selected' : ''} onClick={() => setCategory('')}>All skills</button>{CATEGORIES.map((item) => <button className={category === item ? 'selected' : ''} key={item} onClick={() => setCategory(category === item ? '' : item)}>{item}</button>)}</div>
          {loading ? <EmptyState><LoaderCircle className="skill-spinner" size={18}/> Finding campus listings…</EmptyState> : visibleListings.length === 0 ? <EmptyState>No active listings match yet. Share a skill or ask for help to get started.</EmptyState> : <div className="skill-listing-grid">{visibleListings.map((listing) => <ListingCard key={listing.id} listing={listing} owner={listing.isMine} onProfile={() => showModal('profile', listing)} onConnect={() => showModal('connect', listing)} onReport={() => showModal('report', listing)} onEdit={() => openForm(listing.kind, listing)}/>)}</div>}
        </section>
        <aside className="skill-side-column">
          <section className="skill-panel skill-connection-panel"><SectionHeading eyebrow="MAKE A CONNECTION" title="Connection Requests" description="New collaborations start with a hello."/>
            <div className="skill-connection-tabs"><button className={section === 'connections' ? 'active' : ''} onClick={() => setSection('connections')}>Requests <span>{pendingIncoming.length + pendingSent.length}</span></button><button className={section === 'browse' ? 'active' : ''} onClick={() => setSection('browse')}>Connections <span>{acceptedConnections.length}</span></button></div>
            {loading ? <EmptyState>Loading requests…</EmptyState> : section === 'connections' ? acceptedConnections.length ? acceptedConnections.map((entry) => <ConnectionCard key={entry.id} connection={entry}/>) : <EmptyState>Your accepted connections will appear here.</EmptyState> : pendingIncoming.length + pendingSent.length ? <div className="skill-connection-list">{[...pendingIncoming, ...pendingSent].map((entry) => <ConnectionCard key={entry.id} connection={entry} onAction={(status) => updateConnection(entry, status)}/>)}</div> : <EmptyState>No pending requests right now.</EmptyState>}
          </section>
          <section className="skill-safety-note"><ShieldCheck size={19}/><div><strong>Keep it campus-safe</strong><p>Connect through Campus One. Never share passwords or sensitive details. Report anything that feels inappropriate.</p></div></section>
        </aside>
      </div>
      <section className="skill-panel skill-mine-panel"><SectionHeading eyebrow="YOUR CAMPUS CONTRIBUTIONS" title="My Skill Activity" description="Manage your offers and requests. Only you can edit your listings."/>
        <div className="skill-my-columns"><MyListingGroup title="My Offers" listings={offers} empty="You haven't shared a skill yet." onEdit={(item) => openForm(item.kind, item)} onToggle={(item) => changeListing(item, { active: !item.active })} onDelete={(item) => changeListing(item, 'DELETE')}/><MyListingGroup title="My Requests" listings={requests} empty="You haven't requested help yet." onEdit={(item) => openForm(item.kind, item)} onToggle={(item) => changeListing(item, { active: !item.active })} onDelete={(item) => changeListing(item, 'DELETE')}/></div>
      </section>
    </>}
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Share what you know · Find help · Grow together</span><span>Campus One · Skill Exchange</span></footer>

    {modal && <div className="skill-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModal('') }}><section className="skill-modal" role="dialog" aria-modal="true" aria-labelledby="skill-modal-title">
      <div className="skill-modal-heading"><span className="skill-modal-icon">{modal === 'profile' ? <UserRound size={19}/> : modal === 'report' ? <Flag size={19}/> : modal === 'connect' ? <HeartHandshake size={19}/> : form.kind === 'OFFER' ? <HandHelping size={19}/> : <Lightbulb size={19}/>}</span><div><span className="skill-eyebrow-small">{modal === 'profile' ? 'CAMPUS PROFILE' : modal === 'report' ? 'COMMUNITY SAFETY' : modal === 'connect' ? 'START A CONVERSATION' : selected ? 'UPDATE YOUR LISTING' : 'SHARE WITH YOUR CAMPUS'}</span><h2 id="skill-modal-title">{modal === 'profile' ? selected?.student.name : modal === 'report' ? 'Report this listing' : modal === 'connect' ? (selected?.kind === 'REQUEST' ? 'Offer help' : 'Connect with student') : selected ? 'Edit listing' : form.kind === 'OFFER' ? 'I Can Help' : 'I Need Help'}</h2></div><button className="skill-modal-close" onClick={() => setModal('')} aria-label="Close"><X size={18}/></button></div>
      {modal === 'listing' && <form className="skill-form" onSubmit={saveListing}>
        <label>SKILL / HELP NEEDED<input value={form.skill} onChange={(event) => setForm((current) => ({ ...current, skill: event.target.value }))} minLength={2} maxLength={100} placeholder="e.g. Python, presentation design" required/></label>
        <label>CATEGORY<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>SHORT DESCRIPTION<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} minLength={10} maxLength={1000} rows={4} placeholder="Tell students a little more…" required/></label>
        <label>{form.kind === 'OFFER' ? 'EXPERIENCE LEVEL' : 'EXPERIENCE / LEVEL NEEDED'}<select value={form.level} onChange={(event) => setForm((current) => ({ ...current, level: event.target.value }))}>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
        {form.kind === 'OFFER' ? <><label>WHAT CAN YOU HELP WITH?<textarea value={form.helpWith} onChange={(event) => setForm((current) => ({ ...current, helpWith: event.target.value }))} maxLength={500} rows={2} placeholder="Specific topics, tools, or ways you can help" required/></label><label>AVAILABILITY <small>OPTIONAL</small><input value={form.availability} onChange={(event) => setForm((current) => ({ ...current, availability: event.target.value }))} maxLength={120} placeholder="e.g. Weekday evenings"/></label></> : <label>DEADLINE <small>OPTIONAL</small><input type="date" value={form.deadline} onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))}/></label>}
        {error && <p className="skill-form-error">{error}</p>}<div className="skill-modal-actions"><button type="button" className="skill-secondary-button" onClick={() => setModal('')} disabled={saving}>Cancel</button><button className="skill-primary-button" disabled={saving}>{saving ? 'Saving…' : selected ? 'Save changes' : 'Publish listing'} <ArrowRight size={14}/></button></div>
      </form>}
      {modal === 'connect' && <form className="skill-form" onSubmit={sendConnection}><p className="skill-modal-explainer">{selected?.kind === 'REQUEST' ? 'Let this student know how you can help with their request.' : `Send a request to connect about ${selected?.skill}.`}</p><label>MESSAGE <small>OPTIONAL</small><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} rows={4} placeholder="Introduce yourself or share how you can collaborate"/></label>{error && <p className="skill-form-error">{error}</p>}<div className="skill-modal-actions"><button type="button" className="skill-secondary-button" onClick={() => setModal('')} disabled={saving}>Cancel</button><button className="skill-primary-button" disabled={saving}>{saving ? 'Sending…' : 'Send request'} <ArrowRight size={14}/></button></div></form>}
      {modal === 'report' && <form className="skill-form" onSubmit={reportListing}><p className="skill-modal-explainer">Reports are shared with Administration only. No contact details are exposed.</p><label>REASON<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>{REPORT_REASONS.map((item) => <option key={item}>{item}</option>)}</select></label><label>DETAILS <small>OPTIONAL</small><textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} rows={3} placeholder="Add helpful context"/></label>{error && <p className="skill-form-error">{error}</p>}<div className="skill-modal-actions"><button type="button" className="skill-secondary-button" onClick={() => setModal('')} disabled={saving}>Cancel</button><button className="skill-danger-button" disabled={saving}>{saving ? 'Sending…' : 'Send report'} <Flag size={14}/></button></div></form>}
      {modal === 'profile' && selected && <div className="skill-profile-content"><div className="skill-profile-avatar">{selected.student.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><strong>{selected.student.name}</strong>{selected.student.department && <span>{selected.student.department}</span>}{selected.student.semester && <span>{selected.student.semester}</span>}{selected.student.admissionYear && <span>Joined {selected.student.admissionYear}</span>}<p>Campus profile details only. Personal email and phone numbers are not shown.</p><button className="skill-primary-button" onClick={() => showModal('connect', selected)}>Connect <ArrowRight size={14}/></button></div>}
      {error && modal === 'profile' && <p className="skill-form-error">{error}</p>}
    </section></div>}
  </main>
}

function emptyForm() {
  return { kind: 'OFFER', skill: '', category: CATEGORIES[0], description: '', level: 'Beginner', helpWith: '', availability: '', deadline: '' }
}

function ActivityCard({ icon, label, value, tint }) {
  return <article className={`skill-stat-card stat-${tint}`}><span>{icon}</span><strong>{value}</strong><small>{label}</small></article>
}

function SectionHeading({ eyebrow, title, description }) {
  return <div className="skill-section-heading"><div><span className="skill-eyebrow-small">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div></div>
}

function EmptyState({ children }) {
  return <div className="skill-empty-state"><span className="skill-empty-icon"><UsersRound size={19}/></span><span>{children}</span></div>
}

function ListingCard({ listing, owner, onProfile, onConnect, onReport, onEdit }) {
  return <article className={`skill-listing-card listing-${listing.kind.toLowerCase()}`}>
    <div className="skill-listing-top"><span className={`skill-kind-pill ${listing.kind === 'OFFER' ? 'kind-offer' : 'kind-request'}`}>{listing.kind === 'OFFER' ? 'I CAN HELP' : 'I NEED HELP'}</span><span className="skill-category-pill">{listing.category}</span></div>
    <div className="skill-student-row"><span className="skill-card-avatar">{listing.student.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span><strong>{listing.student.name}</strong><small>{[listing.student.department, listing.student.semester].filter(Boolean).join(' · ') || 'Campus student'}</small></span><i className="skill-active-indicator" title="Active listing"/></div>
    <h3>{listing.skill}</h3><p className="skill-listing-description">{listing.description}</p>
    <div className="skill-listing-tags"><span>{listing.level}</span>{listing.availability && <span>{listing.availability}</span>}{listing.deadline && <span>By {listing.deadline}</span>}</div>
    {listing.helpWith && <p className="skill-help-with"><b>Can help with</b> {listing.helpWith}</p>}
    <div className="skill-listing-actions"><button className="skill-secondary-button" onClick={onProfile}>View Profile</button>{owner ? <button className="skill-primary-button" onClick={onEdit}>Edit</button> : <button className="skill-primary-button" onClick={onConnect}>{listing.kind === 'REQUEST' ? 'Offer Help' : 'Connect'} <ChevronRight size={14}/></button>}{!owner && <button className="skill-report-button" onClick={onReport} aria-label="Report listing"><Flag size={14}/></button>}</div>
  </article>
}

function ConnectionCard({ connection, onAction }) {
  return <article className="skill-connection-card"><span className="skill-connection-avatar">{connection.student.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><div className="skill-connection-copy"><strong>{connection.student.name}</strong><small>{connection.listing?.skill || 'Skill Exchange'} · {connection.kind === 'OFFER_HELP' ? 'Offer to help' : 'Connect'}</small>{connection.message && <p>{connection.message}</p>}</div>{connection.status === 'PENDING' && onAction && <div className="skill-connection-actions">{connection.incoming ? <><button className="skill-accept-button" onClick={() => onAction('ACCEPTED')}><Check size={13}/> Accept</button><button className="skill-decline-button" onClick={() => onAction('DECLINED')}>Decline</button></> : <button className="skill-decline-button" onClick={() => onAction('CANCELLED')}>Cancel</button>}</div>}{connection.status === 'ACCEPTED' && <span className="skill-connected-badge"><Check size={12}/> Connected</span>}{connection.status === 'DECLINED' && <span className="skill-connection-muted">Declined</span>}</article>
}

function MyListingGroup({ title, listings, empty, onEdit, onToggle, onDelete }) {
  return <section className="skill-my-group"><h3>{title}<span>{listings.length}</span></h3>{listings.length === 0 ? <p className="skill-my-empty">{empty}</p> : listings.map((listing) => <article className="skill-my-listing" key={listing.id}><div><strong>{listing.skill}</strong><small>{listing.category} · {listing.active ? 'Active' : 'Paused / closed'}</small></div><button onClick={() => onEdit(listing)}>Edit</button><button onClick={() => onToggle(listing)}>{listing.active ? listing.kind === 'REQUEST' ? 'Close' : 'Pause' : listing.kind === 'REQUEST' ? 'Reopen' : 'Activate'}</button><button className="skill-delete-action" onClick={() => onDelete(listing)}>Delete</button></article>)}</section>
}
