import { useEffect, useState } from 'react'
import { Activity, CalendarDays, Medal } from 'lucide-react'
import { api } from '../api/client'
import {
  ALL_DEPARTMENTS, formatSportsTime, SPORTS_EVENT_REGISTRATION_STATUS,
  SPORTS_EVENT_STATUS_LABELS, SPORTS_EVENT_VISIBLE_STATUSES, normalizeSportsDepartment,
} from '../../shared/sports-time.js'

const sections = ['Sports', 'Upcoming Sports Events', 'Apply for Sports', 'My Applications', 'My Sports', 'My Sports Event Registrations', 'Schedule', 'Results', 'Achievements', 'Sports Notices', 'Notifications']
const sportSections = ['Team', 'Schedule', 'Attendance', 'Results', 'Achievements', 'Notices']

export default function StudentSports({ user, onNotify }) {
  const [data, setData] = useState(null)
  const [section, setSection] = useState('Sports')
  const [selectedSportId, setSelectedSportId] = useState('')
  const [sportSection, setSportSection] = useState('Team')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [applicationForm, setApplicationForm] = useState({ sportId: '', position: '', details: '' })
  const [applicationNotice, setApplicationNotice] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [registrationNotice, setRegistrationNotice] = useState('')
  const [sportsNotifications, setSportsNotifications] = useState([])

  async function load() {
    const [result, notifications] = await Promise.all([
      api('/api/sports/student'),
      api('/api/notifications'),
    ])
    setData(result)
    setSportsNotifications(notifications.notifications.filter((notification) => notification.target === 'sports'))
    if (!selectedSportId && result.mySports.length) setSelectedSportId(result.mySports[0].sportId)
  }

  useEffect(() => {
    let active = true
    Promise.all([api('/api/sports/student'), api('/api/notifications')]).then(([result, notifications]) => {
      if (!active) return
      setData(result)
      setSportsNotifications(notifications.notifications.filter((notification) => notification.target === 'sports'))
      if (result.mySports.length) setSelectedSportId(result.mySports[0].sportId)
    }).catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [])

  function register(event) {
    setRegistrationNotice('')
    setSelectedEvent(event)
  }

  async function submitEventRegistration(event) {
    event.preventDefault()
    if (!selectedEvent) return
    setBusy(selectedEvent.id)
    setError('')
    try {
      await api(`/api/sports/events/${encodeURIComponent(selectedEvent.id)}/register`, { method: 'POST', body: {} })
      await load()
      setSection('My Sports Event Registrations')
      setRegistrationNotice('Registration submitted successfully. Waiting for approval.')
      setSelectedEvent(null)
      onNotify('Registration submitted successfully. Waiting for approval.')
    } catch (reason) { setError(reason.message) } finally { setBusy('') }
  }

  async function applyForSport(event) {
    event.preventDefault()
    setBusy('sport-application')
    setError('')
    setApplicationNotice('')
    try {
      const result = await api('/api/sports/applications', {
        method: 'POST',
        body: applicationForm,
      })
      await load()
      setApplicationForm({ sportId: '', position: '', details: '' })
      setApplicationNotice(`Your application for ${result.application.sportName} was submitted.`)
      onNotify(`Sports application submitted for ${result.application.sportName}.`)
    } catch (reason) { setError(reason.message) } finally { setBusy('') }
  }

  async function cancel(application) {
    setBusy(application.id)
    setError('')
    try {
      await api(`/api/sports/applications/${encodeURIComponent(application.id)}`, { method: 'PATCH', body: { status: SPORTS_EVENT_REGISTRATION_STATUS.CANCELLED } })
      await load()
      onNotify(`Application for ${application.eventName} cancelled.`)
    } catch (reason) { setError(reason.message) } finally { setBusy('') }
  }

  if (!data) return <div className="management-state"><span className="loading-spinner"/>Loading Sports…</div>
  const appliedEvents = new Set(data.registrations.filter((entry) => !['REJECTED', 'CANCELLED'].includes(entry.status)).map((entry) => entry.eventId))
  const eventRegistrations = data.sportsEventRegistrations || data.registrations.filter((entry) => entry.applicationType === 'SPORTS_EVENT')
  const futureEvents = data.events.filter((event) =>
    SPORTS_EVENT_VISIBLE_STATUSES.includes(event.status) &&
    new Date(`${event.date}T${event.startTime || event.time || '23:59'}:00`) >= new Date())
  const selectedSport = data.mySports.find((sport) => sport.sportId === selectedSportId)
  const selectedSportTeams = data.teams.filter((team) => team.sportId === selectedSportId)
  const selectedSportSchedules = data.schedules.filter((entry) => entry.sportId === selectedSportId)
  const selectedSportResults = data.results.filter((entry) => entry.sportId === selectedSportId)
  const selectedSportAttendance = data.attendance.filter((entry) => entry.sportId === selectedSportId)
  const selectedSportAchievements = data.achievements.filter((entry) => entry.sportId === selectedSportId)
  const selectedSportNotices = data.notices.filter((entry) => entry.sportId === selectedSportId)

  return <div className="module-page page-enter sports-student-page">
    <div className="module-breadcrumb">CAMPUS LIFE <span>›</span> SPORTS</div>
    <section className="module-hero"><div className="module-title-area"><span className="module-icon"><Activity size={20}/></span><span className="module-eyebrow">YOUR CAMPUS, IN PLAY</span><h1>Sports<span className="module-title-period">.</span></h1><p>Discover sports, apply for trials, and follow your selected sports.</p></div><span className="sports-captain-chip"><span/>{user.role === 'Sports Captain' ? 'Student sports access' : `${user.role} access`}</span></section>
    <nav className="sports-tabs" aria-label="Sports sections">{sections.map((item) => <button key={item} className={section === item ? 'sports-tab-active' : ''} onClick={() => setSection(item)}>{item}</button>)}</nav>
    {error && <div className="management-alert" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    <section className="sports-student-content">
      {section === 'Sports' && <>
        <div className="sports-student-metrics">
          <article><Activity/><span><b>{futureEvents.length}</b>Upcoming events & trials</span></article>
          <article><CalendarDays/><span><b>{data.registrations.length}</b>My applications</span></article>
          <article><Medal/><span><b>{data.mySports.length}</b>My sports</span></article>
        </div>
        <h2>Available sports</h2>
        <div className="sports-record-list">{data.sports.filter((sport) => sport.active !== false && ['Sport', 'Team'].includes(sport.kind)).map((sport) => <article className="sports-record-row" key={sport.id}><div className="module-row-body"><span className="sports-record-kind">SPORT · ACTIVE</span><strong>{sport.title}</strong><span>{sport.description}</span>{sport.rules && <small>Rules: {sport.rules}</small>}</div></article>)}</div>
        <button className="module-primary" onClick={() => setSection('Apply for Sports')}>Apply for Sports</button>
        <h2>Upcoming Sports Events</h2>
        <EventList events={futureEvents.slice(0, 4)} appliedEvents={appliedEvents} busy={busy} onRegister={register}/>
        <h2>Sports notices</h2>
        <RecordList records={data.notices.filter((notice) => !notice.sportId)} empty="No general sports notices have been sent to you."/>
      </>}
      {section === 'Apply for Sports' && <>
        <h2>Apply for Sports</h2>
        <p className="sports-empty">Choose an active sport and tell the Sports Captain a little about your experience and interest. Applying does not make you an active participant; selection is required.</p>
        {applicationNotice && <div className="food-order-confirmation" role="status"><span>{applicationNotice}</span></div>}
        <form className="sports-form-grid" onSubmit={applyForSport}>
          <label className="sports-field">Student/User Name<input value={user.name} readOnly/></label>
          <label className="sports-field">User ID<input value={user.id} readOnly/></label>
          <label className="sports-field">Department<input value={normalizeSportsDepartment(user.department) || user.department || ''} readOnly/></label>
          <label className="sports-field">Semester/Year<input value={user.semester || user.admissionYear || ''} readOnly/></label>
          <label className="sports-field">Sport<select required value={applicationForm.sportId} onChange={(event) => setApplicationForm({ ...applicationForm, sportId: event.target.value })}>
            <option value="">Choose an active sport…</option>
            {data.sports.filter((sport) => sport.active !== false && ['Sport', 'Team'].includes(sport.kind)).map((sport) => <option key={sport.id} value={sport.id}>{sport.title}</option>)}
          </select></label>
          <label className="sports-field">Position/Role (optional)<input maxLength={80} value={applicationForm.position} onChange={(event) => setApplicationForm({ ...applicationForm, position: event.target.value })} placeholder="e.g. Forward, Singles, Goalkeeper"/></label>
          <label className="sports-field">Relevant details<textarea required minLength={10} maxLength={2000} rows={4} value={applicationForm.details} onChange={(event) => setApplicationForm({ ...applicationForm, details: event.target.value })} placeholder="Share relevant experience, skills, availability, or why you want to join."/></label>
          <button className="module-primary" disabled={busy === 'sport-application' || !data.sports.some((sport) => sport.active !== false && ['Sport', 'Team'].includes(sport.kind))}>{busy === 'sport-application' ? 'Submitting…' : 'Submit Application'}</button>
        </form>
      </>}
      {section === 'Upcoming Sports Events' && <>
        <h2>Upcoming Sports Events</h2>
        <EventList events={futureEvents} appliedEvents={appliedEvents} busy={busy} onRegister={register} registrations={data.registrations}/>
      </>}
      {section === 'My Sports Event Registrations' && <>
        <h2>My Sports Event Registrations</h2>
        {eventRegistrations.length === 0 && <p className="sports-empty">You have no Sports Event registrations yet.</p>}
        <div className="sports-record-list">{eventRegistrations.map((registration) => {
          const event = data.events.find((entry) => entry.id === registration.eventId)
          const statusMessage = registration.status === SPORTS_EVENT_REGISTRATION_STATUS.ACCEPTED
            ? 'Your registration was accepted.'
            : registration.status === SPORTS_EVENT_REGISTRATION_STATUS.REJECTED
              ? 'Your registration was not accepted.'
              : registration.status === SPORTS_EVENT_REGISTRATION_STATUS.CANCELLED
                ? 'This registration was cancelled.'
                : 'Waiting for approval.'
          return <article className="sports-record-row" key={registration.id}><div className="module-row-body"><span className="sports-record-kind">{registration.sportName} · {registration.status}</span><strong>{registration.eventName}</strong>{event?.date && <span>Event date: {event.date}</span>}<span>Registered {new Date(registration.registrationDateTime || registration.createdAt).toLocaleString()}</span><span>Status: {registration.status} · {statusMessage}</span></div>{registration.status === SPORTS_EVENT_REGISTRATION_STATUS.PENDING && <button disabled={busy === registration.id} onClick={() => cancel(registration)}>{busy === registration.id ? 'Cancelling…' : 'Cancel registration'}</button>}</article>
        })}</div>
      </>}
      {section === 'My Applications' && <>
        <h2>My applications</h2>
        {!data.registrations.length && <p className="sports-empty">You have not submitted any sports applications or event registrations.</p>}
        <h3>Sports applications</h3>
        <div className="sports-record-list">{data.registrations.filter((application) => application.applicationType === 'SPORT').map((application) => <article className="sports-record-row" key={application.id}><div className="module-row-body"><span className="sports-record-kind">{application.sportName} · {application.status}</span><strong>{application.status === 'SELECTED' ? `Selected for ${application.sportName}` : `${application.sportName} application`}</strong><span>Applied {new Date(application.createdAt).toLocaleString()}</span>{application.position && <span>Position/role: {application.position}</span>}{application.status === 'SELECTED' && <span>You are now an active participant in this sport.</span>}</div></article>)}</div>
        <h3>Event and trial applications</h3>
        <div className="sports-record-list">{data.registrations.filter((application) => !['SPORT', 'SPORTS_EVENT'].includes(application.applicationType)).map((application) => <article className="sports-record-row" key={application.id}><div className="module-row-body"><span className="sports-record-kind">{application.sportName} · {application.status}</span><strong>{application.eventName}</strong><span>Applied {new Date(application.createdAt).toLocaleString()}</span></div>{['APPLIED', 'REGISTERED', 'SHORTLISTED'].includes(application.status) && <button disabled={busy === application.id} onClick={() => cancel(application)}>{busy === application.id ? 'Cancelling…' : 'Cancel application'}</button>}</article>)}</div>
        <h3>Event and trial notices</h3>
        <RecordList records={data.notices.filter((notice) => notice.audienceType === 'EVENT' && data.registrations.some((application) => application.eventId === notice.audienceId))} empty="No event or trial notices have been sent to your applications."/>
      </>}
      {section === 'My Sports' && <>
        <h2>My sports</h2>
        {!data.mySports.length && <p className="sports-empty">You are not currently selected for any sport.</p>}
        {data.mySports.length > 0 && <>
          <nav className="sports-tabs" aria-label="Selected sports">{data.mySports.map((sport) => <button key={sport.sportId} className={selectedSportId === sport.sportId ? 'sports-tab-active' : ''} onClick={() => setSelectedSportId(sport.sportId)}>{sport.sportName}</button>)}</nav>
          <nav className="sports-tabs" aria-label="Selected sport information">{sportSections.map((item) => <button key={item} className={sportSection === item ? 'sports-tab-active' : ''} onClick={() => setSportSection(item)}>{item}</button>)}</nav>
          {selectedSport && <div className="sports-sport-details"><h3>{selectedSport.sportName}</h3>
            {sportSection === 'Team' && <TeamList teams={selectedSportTeams}/>}
            {sportSection === 'Schedule' && <RecordList records={selectedSportSchedules} empty="No practice, match, or event schedule is available for this sport."/>}
            {sportSection === 'Attendance' && <RecordList records={selectedSportAttendance} empty="Your attendance for this sport will appear here."/>}
            {sportSection === 'Results' && <RecordList records={selectedSportResults} empty="No results are available for this sport yet."/>}
            {sportSection === 'Achievements' && <RecordList records={selectedSportAchievements} empty="No achievements are available for this sport yet."/>}
            {sportSection === 'Notices' && <RecordList records={selectedSportNotices} empty="No notices have been sent to your selected sports audience."/>}
          </div>}
        </>}
      </>}
      {section === 'Schedule' && <><h2>My Schedule</h2><RecordList records={data.schedules} empty="No sports schedule is available for your selected sports."/></>}
      {section === 'Results' && <><h2>Results</h2><RecordList records={data.results} empty="No sports results are available for your selected sports."/></>}
      {section === 'Achievements' && <><h2>Achievements</h2><RecordList records={data.achievements} empty="No sports achievements are available yet."/></>}
      {section === 'Sports Notices' && <><h2>Sports Notices</h2><RecordList records={data.notices} empty="No Sports & Wellness notices have been sent to you."/></>}
      {section === 'Notifications' && <><h2>Sports Notifications</h2><RecordList records={sportsNotifications} empty="No Sports notifications yet."/></>}
    </section>
    {selectedEvent && <EventRegistrationDialog
      event={selectedEvent}
      user={user}
      busy={busy === selectedEvent.id}
      error={error}
      onClose={() => { setSelectedEvent(null); setError('') }}
      onSubmit={submitEventRegistration}
    />}
    {registrationNotice && <div className="sports-registration-confirmation" role="status">{registrationNotice}<button onClick={() => setRegistrationNotice('')} aria-label="Dismiss registration confirmation">Dismiss</button></div>}
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Sports information for {user.role}</span><span>Sports Management controls are restricted to authorized roles.</span></footer>
  </div>
}

function EventList({ events, appliedEvents, busy, onRegister, registrations = [] }) {
  if (!events.length) return <p className="sports-empty">No events or trials to show right now.</p>
  return <div className="sports-card-grid">{events.map((event) => {
    const application = registrations.find((entry) => entry.eventId === event.id)
    const registrationOpen = event.registrationAvailable === true
    const eventType = (event.kind || 'OTHER').replaceAll('_', ' ')
    const registrationStatus = application?.status || event.registrationStatus
    const capacityLabel = event.maxParticipants > 0
      ? `${Math.max(0, event.maxParticipants - (event.registrationCount || 0))} available / ${event.maxParticipants} seats`
      : ''
    return <article className="sports-event-card" key={event.id}>
      {event.eventImage && <img className="sports-event-poster" src={event.eventImage} alt={`${event.name} poster`}/>}
      <span className="section-eyebrow">{eventType} · {event.sportName}</span><h3>{event.name}</h3>
      <p>{event.description}</p>
      <div className="sports-event-meta">
        <span><CalendarDays size={14}/>{event.date} · {formatSportsTime(event.startTime || event.time)}{event.endTime ? `–${formatSportsTime(event.endTime)}` : ''}</span>
        <span>Venue: {event.venue}</span><span>Registration deadline: {event.registrationDeadline}</span>
        <span>Eligible departments: {event.eligibleDepartments?.length ? event.eligibleDepartments.join(', ') : ALL_DEPARTMENTS}</span>
        <span>Eligibility: {event.eligibility || 'All active students'}</span>
        {capacityLabel && <span>{capacityLabel}</span>}
        <span>Registration status: {registrationStatus || (registrationOpen ? 'Open' : SPORTS_EVENT_STATUS_LABELS[event.status] || event.status)}</span>
      </div>
      {event.instructions && <p><strong>Instructions:</strong> {event.instructions}</p>}
      {registrationStatus && <strong className="sports-status">Registration {registrationStatus}</strong>}
      {registrationOpen && !registrationStatus && <button className="module-primary" disabled={!event.registrationAvailable || busy === event.id} onClick={() => onRegister(event)}>{busy === event.id ? 'Opening…' : 'Register for Event'}</button>}
    </article>
  })}</div>
}

function EventRegistrationDialog({ event, user, busy, error, onClose, onSubmit }) {
  return <div className="sports-registration-backdrop" role="presentation" onMouseDown={(click) => { if (click.target === click.currentTarget) onClose() }}>
    <section className="sports-registration-dialog" role="dialog" aria-modal="true" aria-labelledby="sports-registration-title">
      <div className="sports-registration-heading"><div><span className="section-eyebrow">SPORTS EVENT REGISTRATION</span><h2 id="sports-registration-title">Register for Event</h2></div><button type="button" onClick={onClose} aria-label="Close registration">×</button></div>
      <div className="sports-registration-event"><strong>{event.name}</strong><span>{event.sportName} · {(event.kind || 'OTHER').replaceAll('_', ' ')}</span><span>{event.date} · {formatSportsTime(event.startTime || event.time)}{event.endTime ? `–${formatSportsTime(event.endTime)}` : ''} · {event.venue}</span><span>{event.description}</span>{event.instructions && <span>Instructions: {event.instructions}</span>}</div>
      <form className="sports-form-grid" onSubmit={onSubmit}>
        <label className="sports-field">Name<input value={user.name || ''} readOnly/></label>
        <label className="sports-field">User ID<input value={user.id || ''} readOnly/></label>
        <label className="sports-field">Department<input value={normalizeSportsDepartment(user.department) || user.department || ''} readOnly/></label>
        <label className="sports-field">Course/Program<input value={user.course || ''} readOnly/></label>
        <label className="sports-field">Semester/Year<input value={user.semester || user.admissionYear || ''} readOnly/></label>
        <label className="sports-field">Mobile Number<input value={user.mobile || ''} readOnly/></label>
        {error && <p className="sports-form-error" role="alert">{error}</p>}
        <button className="module-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit Registration'}</button>
      </form>
    </section>
  </div>
}

function TeamList({ teams }) {
  if (!teams.length) return <p className="sports-empty">You are not currently assigned to a team in this sport.</p>
  return <div className="sports-card-grid">{teams.map(({ id, name, sportName, category, teamType, captain, viceCaptain, members }) => <article className="sports-team-card" key={id}><span className="section-eyebrow">{sportName} · {category} · {teamType}</span><h3>{name}</h3><p>Captain: {captain?.name || '—'} · Vice-Captain: {viceCaptain?.name || '—'}</p><strong>{members.filter((member) => member.status === 'ACTIVE').length} active team members</strong><div className="sports-team-member-list">{members.filter((member) => member.status === 'ACTIVE').map((member) => <span key={member.studentId}>{member.name} · {member.studentId} · {member.position}</span>)}</div></article>)}</div>
}

function RecordList({ records, empty }) {
  if (!records?.length) return <p className="sports-empty">{empty}</p>
  return <div className="sports-record-list">{records.map((record) => <article className="sports-record-row" key={record.id}><div className="module-row-body"><span className="sports-record-kind">{record.kind || record.status || record.competition || record.audienceType || 'Sports update'}</span><strong>{record.title || record.name || record.eventName || record.competition || record.sportName || record.subjectName}</strong><span>{[record.date, record.time, record.venue, record.instructions, record.description, record.achievement, record.score && `Score: ${record.score}`, record.status].filter(Boolean).join(' · ')}</span></div></article>)}</div>
}
