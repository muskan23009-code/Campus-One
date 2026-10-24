import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Check, Search, Users, X } from 'lucide-react'
import { api } from '../api/client'

const tabs = ['Overview', 'Events', 'My Registrations', 'Clubs', 'My Clubs']
const eventCategories = ['Cultural', 'Technical', 'Academic', 'Workshop', 'Seminar', 'Competition', 'Fest', 'Orientation', 'Awareness', 'Department', 'Other']
const clubCategories = ['Technical', 'Cultural', 'Literary', 'Entrepreneurship', 'Social', 'Photography', 'Music', 'Dance', 'Drama', 'Debate', 'Coding', 'Innovation', 'Other']
const emptyEvent = { name: '', category: 'Cultural', description: '', date: '', startTime: '', endTime: '', venue: '', organizer: '', contact: '', registrationDeadline: '', department: '', course: '', semester: '', eligibility: '', maxParticipants: '', poster: '', featured: false, status: 'DRAFT' }
const emptyClub = { name: '', category: 'Technical', description: '', purpose: '', activities: '', coordinator: '', contact: '', requiresApproval: false }

function displayDate(value) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString() : 'Date to be announced'
}

export default function EventsClubs({ user, departments, onNotify }) {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('Overview')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [eventForm, setEventForm] = useState(emptyEvent)
  const [clubForm, setClubForm] = useState(emptyClub)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [editingEventId, setEditingEventId] = useState('')
  const [editingClubId, setEditingClubId] = useState('')
  const isAdmin = user.role === 'Administration'

  const load = useCallback(async () => {
    const result = await api('/api/events-clubs')
    setData(result)
  }, [])

  useEffect(() => {
    let active = true
    api('/api/events-clubs').then((result) => { if (active) setData(result) }).catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [])

  async function perform(key, action, successMessage) {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await action()
      await load()
      setNotice(successMessage)
      onNotify(successMessage)
      return true
    } catch (reason) {
      setError(reason.message)
      return false
    } finally {
      setBusy('')
    }
  }

  async function createEvent(event) {
    event.preventDefault()
    const editing = editingEventId
    await perform('event-create', async () => {
      await api(editing ? `/api/events-clubs/events/${encodeURIComponent(editing)}` : '/api/events-clubs/events', { method: editing ? 'PATCH' : 'POST', body: eventForm })
      setEventForm(emptyEvent)
      setEditingEventId('')
    }, editing ? 'Event changes saved.' : 'Event created. It will be visible to users once published.')
  }

  async function createClub(event) {
    event.preventDefault()
    const editing = editingClubId
    await perform('club-create', async () => {
      await api(editing ? `/api/events-clubs/clubs/${encodeURIComponent(editing)}` : '/api/events-clubs/clubs', { method: editing ? 'PATCH' : 'POST', body: clubForm })
      setClubForm(emptyClub)
      setEditingClubId('')
    }, editing ? 'Club changes saved.' : 'Club created.')
  }

  function editEvent(event) {
    setEditingEventId(event.id)
    setEventForm({ ...emptyEvent, ...event, maxParticipants: event.maxParticipants ?? '' })
    setTab('Events')
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  function editClub(club) {
    setEditingClubId(club.id)
    setClubForm({ ...emptyClub, ...club })
    setTab('Clubs')
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  async function updateEvent(event, patch) {
    await perform(`event-${event.id}`, () => api(`/api/events-clubs/events/${encodeURIComponent(event.id)}`, { method: 'PATCH', body: patch }), `“${event.name}” updated.`)
  }

  async function markAttendance(registration, status) {
    await perform(`attendance-${registration.id}`, () => api(`/api/events-clubs/registrations/${encodeURIComponent(registration.id)}`, { method: 'PATCH', body: { status } }), `${registration.userName || 'Participant'} marked ${status.toLowerCase()}.`)
  }

  async function addEventResult(registration, position, remarks) {
    return perform(`result-${registration.id}`, () => api('/api/events-clubs/results', { method: 'POST', body: { registrationId: registration.id, position, remarks } }), `Result recorded for ${registration.userName || registration.eventName}.`)
  }

  if (!data) return <div className="management-state"><span className="loading-spinner"/>Loading Events & Clubs…</div>

  const today = new Date().toISOString().slice(0, 10)
  const search = query.trim().toLowerCase()
  const visibleEvents = data.events.filter((event) =>
    (!search || `${event.name} ${event.description} ${event.venue} ${event.department}`.toLowerCase().includes(search))
    && (!category || event.category === category)
    && (!dateFilter || event.date === dateFilter)
    && (!statusFilter || event.status === statusFilter))
  const upcoming = visibleEvents.filter((event) => event.date >= today && !['CANCELLED', 'COMPLETED'].includes(event.status))
  const past = visibleEvents.filter((event) => event.date < today || ['CANCELLED', 'COMPLETED'].includes(event.status))
  const todaysEvents = upcoming.filter((event) => event.date === today)
  const featuredEvents = upcoming.filter((event) => event.featured)
  const visibleClubs = data.clubs.filter((club) => (!search || `${club.name} ${club.description}`.toLowerCase().includes(search)) && (!category || club.category === category))
  const myActiveClubIds = new Set(data.memberships.filter((membership) => membership.status === 'ACTIVE').map((membership) => membership.clubId))
  const activeMembership = (clubId) => data.memberships.find((membership) => membership.clubId === clubId && ['ACTIVE', 'PENDING', 'APPROVED'].includes(membership.status))
  const detailPage = (event) => setSelectedEvent(event)

  return <div className="module-page page-enter events-clubs-page">
    <div className="module-breadcrumb">CAMPUS LIFE <span>›</span> EVENTS & CLUBS</div>
    <section className="module-hero"><div className="module-title-area"><span className="module-icon"><CalendarDays size={20}/></span><span className="module-eyebrow">CAMPUS LIFE, TOGETHER</span><h1>Events & Clubs<span className="module-title-period">.</span></h1><p>Discover what's happening, register for events, and find your community.</p></div></section>
    {error && <div className="management-alert" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    {notice && <div className="food-order-confirmation" role="status"><Check size={16}/><span>{notice}</span></div>}
    <nav className="events-tabs" aria-label="Events and Clubs sections">{tabs.map((item) => <button key={item} className={tab === item ? 'events-tab-active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav>
    <div className="events-filterbar"><label><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events and clubs" aria-label="Search events and clubs"/></label><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{[...new Set([...eventCategories, ...clubCategories])].map((item) => <option key={item}>{item}</option>)}</select><input aria-label="Filter events by date" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}/><select aria-label="Filter events by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{['DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ONGOING', 'COMPLETED', 'CANCELLED'].map((item) => <option key={item}>{item}</option>)}</select></div>

    {tab === 'Overview' && <>
      {isAdmin && data.analytics && <div className="events-metrics">{[['Total events', data.analytics.totalEvents], ['Upcoming events', data.analytics.upcomingEvents], ['Registrations', data.analytics.totalRegistrations], ['Active clubs', data.analytics.activeClubs], ['Pending club applications', data.analytics.pendingClubApplications]].map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>}
      {featuredEvents.length > 0 && <><div className="events-section-heading"><h2>Featured Events</h2></div><div className="events-card-grid">{featuredEvents.slice(0, 3).map((event) => <EventCard key={event.id} event={event} registration={data.registrations.find((entry) => entry.eventId === event.id && entry.status !== 'CANCELLED')} busy={busy} onRegister={() => perform(`register-${event.id}`, () => api(`/api/events-clubs/events/${encodeURIComponent(event.id)}/register`, { method: 'POST', body: {} }), `Registered for ${event.name}.`)} onCancel={(registration) => perform(`cancel-${registration.id}`, () => api(`/api/events-clubs/registrations/${encodeURIComponent(registration.id)}`, { method: 'PATCH', body: { status: 'CANCELLED' } }), `Registration for ${event.name} cancelled.`)} onOpen={() => detailPage(event)} isAdmin={isAdmin} onEdit={editEvent} onUpdate={updateEvent}/>)}</div></>}
      {todaysEvents.length > 0 && <><div className="events-section-heading"><h2>Today's Events</h2></div><div className="events-record-list">{todaysEvents.map((event) => <article key={event.id}><div><strong>{event.name}</strong><span>{event.startTime}–{event.endTime} · {event.venue}</span></div><button onClick={() => detailPage(event)}>Details</button></article>)}</div></>}
      <div className="events-section-heading"><h2>Upcoming Events</h2><button onClick={() => setTab('Events')}>Browse events</button></div>
      <div className="events-card-grid">{upcoming.slice(0, 3).map((event) => <EventCard key={event.id} event={event} registration={data.registrations.find((entry) => entry.eventId === event.id && entry.status !== 'CANCELLED')} busy={busy} onRegister={() => perform(`register-${event.id}`, () => api(`/api/events-clubs/events/${encodeURIComponent(event.id)}/register`, { method: 'POST', body: {} }), `Registered for ${event.name}.`)} onCancel={(registration) => perform(`cancel-${registration.id}`, () => api(`/api/events-clubs/registrations/${encodeURIComponent(registration.id)}`, { method: 'PATCH', body: { status: 'CANCELLED' } }), `Registration for ${event.name} cancelled.`)} onOpen={() => detailPage(event)} isAdmin={isAdmin} onEdit={editEvent} onUpdate={updateEvent}/>)}</div>
      {!upcoming.length && <Empty>There are no upcoming events to show.</Empty>}
      <div className="events-section-heading"><h2>Available Clubs</h2><button onClick={() => setTab('Clubs')}>Browse clubs</button></div>
      <ClubGrid clubs={visibleClubs.slice(0, 3)} memberships={data.memberships} busy={busy} onJoin={(club) => perform(`join-${club.id}`, () => api(`/api/events-clubs/clubs/${encodeURIComponent(club.id)}/join`, { method: 'POST', body: {} }), `Club application sent to ${club.name}.`)} onManage={null}/>
      {data.activities.filter((activity) => activity.date >= today).length > 0 && <><div className="events-section-heading"><h2>Upcoming Club Activities</h2></div><div className="events-record-list">{data.activities.filter((activity) => activity.date >= today).slice(0, 4).map((activity) => <article key={activity.id}><div><strong>{activity.title}</strong><span>{activity.clubName} · {displayDate(activity.date)}{activity.venue ? ` · ${activity.venue}` : ''}</span></div></article>)}</div></>}
      <h2>My Registrations</h2><RegistrationList entries={data.registrations} events={data.events} onOpen={(eventId) => setSelectedEvent(data.events.find((event) => event.id === eventId))} isAdmin={isAdmin} busy={busy} onAttendance={markAttendance} onResult={addEventResult}/>
    </>}

    {tab === 'Events' && <>
      <div className="events-section-heading"><h2>Upcoming Events</h2>{isAdmin && <span>Administration management</span>}</div>
      <div className="events-card-grid">{upcoming.map((event) => <EventCard key={event.id} event={event} registration={data.registrations.find((entry) => entry.eventId === event.id && entry.status !== 'CANCELLED')} busy={busy} onRegister={() => perform(`register-${event.id}`, () => api(`/api/events-clubs/events/${encodeURIComponent(event.id)}/register`, { method: 'POST', body: {} }), `Registered for ${event.name}.`)} onCancel={(registration) => perform(`cancel-${registration.id}`, () => api(`/api/events-clubs/registrations/${encodeURIComponent(registration.id)}`, { method: 'PATCH', body: { status: 'CANCELLED' } }), `Registration for ${event.name} cancelled.`)} onOpen={() => detailPage(event)} isAdmin={isAdmin} onEdit={editEvent} onUpdate={updateEvent}/>)}</div>
      {!upcoming.length && <Empty>No upcoming events match your search.</Empty>}
      <div className="events-section-heading"><h2>Past Events</h2></div><div className="events-card-grid">{past.map((event) => <EventCard key={event.id} event={event} registration={data.registrations.find((entry) => entry.eventId === event.id)} busy={busy} onOpen={() => detailPage(event)} isAdmin={isAdmin} onEdit={editEvent} onUpdate={updateEvent}/>)}</div>
      {isAdmin && <AdminEventForm form={eventForm} setForm={setEventForm} busy={busy} onSubmit={createEvent} editing={Boolean(editingEventId)} departments={departments} onReset={() => { setEditingEventId(''); setEventForm(emptyEvent) }}/>}
    </>}

    {tab === 'My Registrations' && <><h2>{isAdmin ? 'Event Registrations & Participants' : 'My Registrations'}</h2><RegistrationList entries={data.registrations} events={data.events} onOpen={(eventId) => setSelectedEvent(data.events.find((event) => event.id === eventId))} isAdmin={isAdmin} busy={busy} onAttendance={markAttendance} onResult={addEventResult}/></>}
    {tab === 'My Registrations' && data.results.length > 0 && <section className="events-member-info"><h3>{isAdmin ? 'Event results' : 'My participation results'}</h3>{data.results.map((result) => <p key={result.id}><strong>{result.eventName}</strong> · {result.position}{result.remarks ? ` · ${result.remarks}` : ''}</p>)}</section>}

    {tab === 'Clubs' && <>
      <div className="events-section-heading"><h2>Clubs</h2>{isAdmin && <span>Administration management</span>}</div>
      <ClubGrid clubs={visibleClubs} memberships={data.memberships} busy={busy} onJoin={(club) => perform(`join-${club.id}`, () => api(`/api/events-clubs/clubs/${encodeURIComponent(club.id)}/join`, { method: 'POST', body: {} }), `Club application sent to ${club.name}.`)} onManage={(club, patch) => perform(`club-${club.id}`, () => api(`/api/events-clubs/clubs/${encodeURIComponent(club.id)}`, { method: 'PATCH', body: patch }), `${club.name} updated.`)} onEdit={editClub}/>
      {isAdmin && <AdminClubForm form={clubForm} setForm={setClubForm} busy={busy} onSubmit={createClub} editing={Boolean(editingClubId)} onReset={() => { setEditingClubId(''); setClubForm(emptyClub) }}/>}
      {isAdmin && <MembershipManagement memberships={data.memberships} busy={busy} onStatus={(entry, status) => perform(`membership-${entry.id}`, () => api(`/api/events-clubs/memberships/${encodeURIComponent(entry.id)}`, { method: 'PATCH', body: { status } }), `${entry.userName}'s membership updated.`)}/>}
      {isAdmin && <AdminClubPosts clubs={data.clubs} busy={busy} onPost={async (path, body, message) => perform('club-post', () => api(path, { method: 'POST', body }), message)}/>}
    </>}

    {tab === 'My Clubs' && <>
      <h2>My Clubs</h2>
      <ClubGrid clubs={data.clubs.filter((club) => activeMembership(club.id))} memberships={data.memberships} busy={busy} onJoin={() => {}} onManage={null}/>
      {data.clubs.filter((club) => myActiveClubIds.has(club.id)).map((club) => <section className="events-member-info" key={club.id}><h3>{club.name} · Member information</h3><h4>Activities</h4>{data.activities.filter((item) => item.clubId === club.id).map((item) => <p key={item.id}>{item.title} · {displayDate(item.date)}{item.venue && ` · ${item.venue}`}</p>)}<h4>Announcements</h4>{data.announcements.filter((item) => item.clubId === club.id).map((item) => <p key={item.id}><strong>{item.title}</strong> · {item.message}</p>)}{!data.activities.some((item) => item.clubId === club.id) && !data.announcements.some((item) => item.clubId === club.id) && <p>No upcoming activities or announcements.</p>}</section>)}
    </>}
    {selectedEvent && <div className="events-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedEvent(null) }}><section className="events-modal" role="dialog" aria-modal="true" aria-labelledby="event-detail-title"><button className="events-modal-close" aria-label="Close event details" onClick={() => setSelectedEvent(null)}><X size={18}/></button><span className="events-category">{selectedEvent.category}</span><h2 id="event-detail-title">{selectedEvent.name}</h2><p>{selectedEvent.description}</p><dl><div><dt>Date & time</dt><dd>{displayDate(selectedEvent.date)} · {selectedEvent.startTime}–{selectedEvent.endTime}</dd></div><div><dt>Venue</dt><dd>{selectedEvent.venue}</dd></div><div><dt>Organizer</dt><dd>{selectedEvent.organizer}</dd></div>{selectedEvent.contact && <div><dt>Contact</dt><dd>{selectedEvent.contact}</dd></div>}{selectedEvent.registrationDeadline && <div><dt>Registration deadline</dt><dd>{displayDate(selectedEvent.registrationDeadline)}</dd></div>}{selectedEvent.eligibility && <div><dt>Eligibility</dt><dd>{selectedEvent.eligibility}</dd></div>}{selectedEvent.maxParticipants && <div><dt>Participants</dt><dd>{selectedEvent.registrationCount || 0} / {selectedEvent.maxParticipants}</dd></div>}</dl><span className="events-status">{selectedEvent.status.replaceAll('_', ' ')}</span><div className="events-card-actions">{(() => { const registration = data.registrations.find((entry) => entry.eventId === selectedEvent.id && entry.status !== 'CANCELLED'); const closed = !['PUBLISHED', 'REGISTRATION_OPEN'].includes(selectedEvent.status) || selectedEvent.registrationDeadline && selectedEvent.registrationDeadline < today || selectedEvent.maxParticipants && selectedEvent.registrationCount >= selectedEvent.maxParticipants; if (registration) return <><span className="events-registered">Registered · {registration.status}</span>{registration.status === 'REGISTERED' && <button onClick={() => perform(`cancel-${registration.id}`, () => api(`/api/events-clubs/registrations/${encodeURIComponent(registration.id)}`, { method: 'PATCH', body: { status: 'CANCELLED' } }), `Registration for ${selectedEvent.name} cancelled.`)}>Cancel registration</button>}</>; if (closed) return <span>{selectedEvent.maxParticipants && selectedEvent.registrationCount >= selectedEvent.maxParticipants ? 'Registration Full' : 'Registration Closed'}</span>; return <button className="module-primary" onClick={() => perform(`register-${selectedEvent.id}`, () => api(`/api/events-clubs/events/${encodeURIComponent(selectedEvent.id)}/register`, { method: 'POST', body: {} }), `Registered for ${selectedEvent.name}.`)}>Register</button> })()}</div></section></div>}
  </div>
}

function EventCard({ event, registration, busy, onRegister, onCancel, onOpen, isAdmin, onEdit, onUpdate }) {
  const closed = !['PUBLISHED', 'REGISTRATION_OPEN'].includes(event.status)
    || event.registrationDeadline && event.registrationDeadline < new Date().toISOString().slice(0, 10)
    || event.maxParticipants && event.registrationCount >= event.maxParticipants
  const isFull = event.maxParticipants && event.registrationCount >= event.maxParticipants
  return <article className="events-card">
    {event.poster && <img className="events-poster" src={event.poster} alt={`${event.name} poster`}/>}
    <div className="events-card-top"><span className="events-category">{event.category}</span><span className={`events-status events-status-${event.status.toLowerCase()}`}>{event.status.replaceAll('_', ' ')}</span></div>
    <h3>{event.name}</h3><p>{event.description}</p>
    <dl><div><dt>Date</dt><dd>{displayDate(event.date)} · {event.startTime}–{event.endTime}</dd></div><div><dt>Venue</dt><dd>{event.venue}</dd></div><div><dt>Organizer</dt><dd>{event.organizer}</dd></div>{event.registrationDeadline && <div><dt>Deadline</dt><dd>{displayDate(event.registrationDeadline)}</dd></div>}{event.maxParticipants && <div><dt>Capacity</dt><dd>{event.registrationCount || 0}/{event.maxParticipants}</dd></div>}</dl>
    {event.eligibility && <small>Eligibility: {event.eligibility}</small>}{event.contact && <small>Contact: {event.contact}</small>}
    <div className="events-card-actions">
      {onOpen && <button onClick={onOpen}>View details</button>}
      {registration
        ? <><span className="events-registered">Registered · {registration.status}</span>{registration.status === 'REGISTERED' && onCancel && <button disabled={Boolean(busy)} onClick={() => onCancel(registration)}>Cancel registration</button>}</>
        : !closed && <button className="module-primary" disabled={Boolean(busy)} onClick={onRegister}>Register</button>}
      {closed && !registration && <span>{isFull ? 'Registration Full' : event.status === 'CANCELLED' ? 'Event Cancelled' : 'Registration Closed'}</span>}
    </div>
    {isAdmin && <div className="events-card-actions"><button onClick={() => onEdit(event)}>Edit</button><select aria-label={`Update ${event.name} status`} value={event.status} onChange={(change) => onUpdate(event, { status: change.target.value })}>{['DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ONGOING', 'COMPLETED', 'CANCELLED'].map((status) => <option key={status}>{status}</option>)}</select>{event.status !== 'CANCELLED' && <button disabled={Boolean(busy)} onClick={() => onUpdate(event, { status: 'CANCELLED' })}>Cancel event</button>}</div>}
  </article>
}

function RegistrationList({ entries, events, onOpen, isAdmin, busy, onAttendance, onResult }) {
  if (!entries.length) return <Empty>You have no event registrations yet.</Empty>
  return <div className="events-record-list">{entries.map((entry) => {
    const event = events.find((item) => item.id === entry.eventId)
    return <RegistrationRow key={entry.id} entry={entry} event={event} onOpen={onOpen} isAdmin={isAdmin} busy={busy} onAttendance={onAttendance} onResult={onResult}/>
  })}</div>
}

function RegistrationRow({ entry, event, onOpen, isAdmin, busy, onAttendance, onResult }) {
  const [position, setPosition] = useState('')
  const [remarks, setRemarks] = useState('')
  return <article className="events-registration-row">
    <div><strong>{entry.eventName || event?.name || 'Event'} · {entry.userName || 'You'}</strong><span>{displayDate(event?.date)}{event?.venue ? ` · ${event.venue}` : ''}</span><small>Registered {new Date(entry.registeredAt).toLocaleDateString()} · {entry.attendanceStatus || entry.status}</small></div>
    <button onClick={() => onOpen(entry.eventId)}>View event</button>
    {isAdmin && <>
      <label className="events-attendance-control">Attendance<select aria-label={`Attendance for ${entry.userName}`} value={entry.attendanceStatus || ''} disabled={Boolean(busy)} onChange={(change) => { if (change.target.value) onAttendance(entry, change.target.value) }}><option value="">Not marked</option><option value="ATTENDED">Attended</option><option value="ABSENT">Absent</option></select></label>
      <form className="events-result-control" onSubmit={(submit) => { submit.preventDefault(); if (position) onResult(entry, position, remarks).then((saved) => { if (saved) { setPosition(''); setRemarks('') } }) }}><input aria-label={`Result for ${entry.userName}`} placeholder="Position/result" value={position} onChange={(change) => setPosition(change.target.value)}/><input aria-label={`Result remarks for ${entry.userName}`} placeholder="Remarks (optional)" value={remarks} onChange={(change) => setRemarks(change.target.value)}/><button disabled={!position || Boolean(busy)}>Save result</button></form>
    </>}
  </article>
}

function ClubGrid({ clubs, memberships, busy, onJoin, onManage, onEdit }) {
  if (!clubs.length) return <Empty>No clubs match your search.</Empty>
  return <div className="events-card-grid">{clubs.map((club) => {
    const membership = memberships.find((entry) => entry.clubId === club.id)
    return <article className="events-card" key={club.id}>
      {club.logo && <img className="events-poster" src={club.logo} alt={`${club.name} logo`}/>}
      <div className="events-card-top"><span className="events-category">{club.category}</span><span className="events-status">{membership?.status || (club.active ? 'ACTIVE' : 'INACTIVE')}</span></div>
      <h3>{club.name}</h3><p>{club.description}</p>
      {club.purpose && <p><strong>Purpose:</strong> {club.purpose}</p>}
      {club.activities && <p><strong>Activities:</strong> {club.activities}</p>}
      <dl>{club.coordinator && <div><dt>Coordinator</dt><dd>{club.coordinator}</dd></div>}{club.contact && <div><dt>Contact</dt><dd>{club.contact}</dd></div>}</dl>
      <div className="events-card-actions">{membership?.status === 'ACTIVE'
        ? <span className="events-registered">Member</span>
        : membership?.status === 'PENDING'
          ? <span>Application pending</span>
          : club.active && onJoin && <button className="module-primary" disabled={Boolean(busy)} onClick={() => onJoin(club)}>{club.requiresApproval ? 'Apply to Join' : 'Join Club'}</button>}</div>
      {onManage && <div className="events-card-actions"><button onClick={() => onManage(club, { active: !club.active })}>{club.active ? 'Deactivate' : 'Activate'}</button></div>}
      {onEdit && <div className="events-card-actions"><button onClick={() => onEdit(club)}>Edit</button></div>}
    </article>
  })}</div>
}

function AdminEventForm({ form, setForm, busy, onSubmit, editing, onReset, departments }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  return <form className="events-admin-form" onSubmit={onSubmit}><h2>Create Event</h2><div className="events-form-grid">
    <label>Event name<input required value={form.name} onChange={(event) => update('name', event.target.value)}/></label>
    <label>Category<select value={form.category} onChange={(event) => update('category', event.target.value)}>{eventCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label>Date<input required type="date" value={form.date} onChange={(event) => update('date', event.target.value)}/></label>
    <label>Start time<input required type="time" value={form.startTime} onChange={(event) => update('startTime', event.target.value)}/></label>
    <label>End time<input required type="time" value={form.endTime} onChange={(event) => update('endTime', event.target.value)}/></label>
    <label>Venue<input required value={form.venue} onChange={(event) => update('venue', event.target.value)}/></label>
    <label>Organizer<input required value={form.organizer} onChange={(event) => update('organizer', event.target.value)}/></label>
    <label>Registration deadline<input type="date" value={form.registrationDeadline} onChange={(event) => update('registrationDeadline', event.target.value)}/></label>
    <label>Department (optional)<select value={form.department} onChange={(event) => update('department', event.target.value)}><option value="">All eligible departments</option>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>
    <label>Course (optional)<input value={form.course} onChange={(event) => update('course', event.target.value)}/></label>
    <label>Semester/year (optional)<input value={form.semester} onChange={(event) => update('semester', event.target.value)}/></label>
    <label>Participant limit<input type="number" min="1" value={form.maxParticipants} onChange={(event) => update('maxParticipants', event.target.value)}/></label>
    <label>Eligibility<input value={form.eligibility} onChange={(event) => update('eligibility', event.target.value)}/></label>
    <label>Contact<input value={form.contact} onChange={(event) => update('contact', event.target.value)}/></label>
    <label>Poster URL<input type="url" value={form.poster || ''} onChange={(event) => update('poster', event.target.value)}/></label>
    <label className="events-checkbox"><input type="checkbox" checked={form.featured === true} onChange={(event) => update('featured', event.target.checked)}/> Feature this event</label>
    <label className="events-form-wide">Description<textarea required rows="4" value={form.description} onChange={(event) => update('description', event.target.value)}/></label>
    <label>Status<select value={form.status} onChange={(event) => update('status', event.target.value)}><option>DRAFT</option><option>PUBLISHED</option><option>REGISTRATION_OPEN</option></select></label>
  </div><button className="module-primary" disabled={busy === 'event-create'}>{editing ? 'Save event changes' : 'Create event'}</button>{editing && <button type="button" onClick={onReset}>Cancel editing</button>}</form>
}

function AdminClubForm({ form, setForm, busy, onSubmit, editing, onReset }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  return <form className="events-admin-form" onSubmit={onSubmit}><h2>{editing ? 'Edit Club' : 'Create Club'}</h2><div className="events-form-grid"><label>Club name<input required value={form.name} onChange={(event) => update('name', event.target.value)}/></label><label>Category<select value={form.category} onChange={(event) => update('category', event.target.value)}>{clubCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Coordinator<input value={form.coordinator} onChange={(event) => update('coordinator', event.target.value)}/></label><label>Contact<input value={form.contact} onChange={(event) => update('contact', event.target.value)}/></label><label className="events-form-wide">Description<textarea required rows="3" value={form.description} onChange={(event) => update('description', event.target.value)}/></label><label>Purpose<input value={form.purpose} onChange={(event) => update('purpose', event.target.value)}/></label><label>Activities<input value={form.activities} onChange={(event) => update('activities', event.target.value)}/></label><label>Logo URL<input type="url" value={form.logo || ''} onChange={(event) => update('logo', event.target.value)}/></label><label className="events-checkbox"><input type="checkbox" checked={form.requiresApproval} onChange={(event) => update('requiresApproval', event.target.checked)}/> Membership requires approval</label></div><button className="module-primary" disabled={busy === 'club-create'}>{editing ? 'Save club changes' : 'Create club'}</button>{editing && <button type="button" onClick={onReset}>Cancel editing</button>}</form>
}

function MembershipManagement({ memberships, busy, onStatus }) {
  const pending = memberships.filter((entry) => entry.status === 'PENDING')
  const approved = memberships.filter((entry) => entry.status === 'APPROVED')
  const active = memberships.filter((entry) => entry.status === 'ACTIVE')
  return <section className="events-admin-form"><h2>Pending club applications ({pending.length})</h2>{pending.length ? pending.map((entry) => <div className="events-record-row" key={entry.id}><div><strong>{entry.userName}</strong><span>{entry.clubName} · {entry.department || entry.role}</span></div><button disabled={Boolean(busy)} onClick={() => onStatus(entry, 'APPROVED')}>Approve</button><button disabled={Boolean(busy)} onClick={() => onStatus(entry, 'REJECTED')}>Reject</button></div>) : <Empty>No pending club applications.</Empty>}<h3>Approved applications ({approved.length})</h3>{approved.map((entry) => <div className="events-record-row" key={entry.id}><div><strong>{entry.userName}</strong><span>{entry.clubName}</span></div><button disabled={Boolean(busy)} onClick={() => onStatus(entry, 'ACTIVE')}>Activate membership</button></div>)}<h3>Active members ({active.length})</h3>{active.map((entry) => <div className="events-record-row" key={entry.id}><div><strong>{entry.userName}</strong><span>{entry.clubName} · Joined {entry.joinedAt ? displayDate(entry.joinedAt) : 'date unavailable'}</span></div><button disabled={Boolean(busy)} onClick={() => onStatus(entry, 'LEFT')}>Remove member</button></div>)}</section>
}

function AdminClubPosts({ clubs, busy, onPost }) {
  const [clubId, setClubId] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [activityTitle, setActivityTitle] = useState('')
  const [activityDate, setActivityDate] = useState('')
  const [activityVenue, setActivityVenue] = useState('')
  const [activityDescription, setActivityDescription] = useState('')
  const [activityPublic, setActivityPublic] = useState(true)
  const activeClubs = clubs.filter((club) => club.active)
  return <section className="events-admin-form"><h2>Club communications</h2><label>Club<select value={clubId} onChange={(event) => setClubId(event.target.value)}><option value="">Choose club</option>{activeClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label><label>Announcement title<input value={title} onChange={(event) => setTitle(event.target.value)}/></label><label>Message<textarea value={message} onChange={(event) => setMessage(event.target.value)}/></label><button disabled={!clubId || !title || !message || Boolean(busy)} onClick={async () => { const saved = await onPost('/api/events-clubs/announcements', { clubId, title, message }, 'Club announcement posted.'); if (saved) { setTitle(''); setMessage('') } }}>Post announcement</button><hr/><label>Activity title<input value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)}/></label><label>Activity date<input type="date" value={activityDate} onChange={(event) => setActivityDate(event.target.value)}/></label><label>Venue<input value={activityVenue} onChange={(event) => setActivityVenue(event.target.value)}/></label><label>Description<textarea value={activityDescription} onChange={(event) => setActivityDescription(event.target.value)}/></label><label className="events-checkbox"><input type="checkbox" checked={activityPublic} onChange={(event) => setActivityPublic(event.target.checked)}/> Public activity</label><button disabled={!clubId || !activityTitle || !activityDate || Boolean(busy)} onClick={async () => { const saved = await onPost('/api/events-clubs/activities', { clubId, title: activityTitle, date: activityDate, venue: activityVenue, description: activityDescription, public: activityPublic }, 'Club activity added.'); if (saved) { setActivityTitle(''); setActivityDate(''); setActivityVenue(''); setActivityDescription('') } }}>Add activity</button></section>
}

function Empty({ children }) {
  return <div className="events-empty"><Users size={18}/><span>{children}</span></div>
}
