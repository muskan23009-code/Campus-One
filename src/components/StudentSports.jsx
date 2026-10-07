import { useEffect, useState } from 'react'
import { Activity, CalendarDays, Medal } from 'lucide-react'
import { api } from '../api/client'

const sections = ['Sports Home', 'Events & Trials', 'My Applications', 'My Sports']
const sportSections = ['Team', 'Schedule', 'Attendance', 'Results', 'Achievements', 'Notices']

export default function StudentSports({ user, onNotify }) {
  const [data, setData] = useState(null)
  const [section, setSection] = useState('Sports Home')
  const [selectedSportId, setSelectedSportId] = useState('')
  const [sportSection, setSportSection] = useState('Team')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const result = await api('/api/sports/student')
    setData(result)
    if (!selectedSportId && result.mySports.length) setSelectedSportId(result.mySports[0].sportId)
  }

  useEffect(() => {
    let active = true
    api('/api/sports/student').then((result) => {
      if (!active) return
      setData(result)
      if (result.mySports.length) setSelectedSportId(result.mySports[0].sportId)
    }).catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [])

  async function register(event) {
    setBusy(event.id)
    setError('')
    try {
      await api(`/api/sports/events/${encodeURIComponent(event.id)}/register`, { method: 'POST', body: {} })
      await load()
      onNotify(`Applied for ${event.name}.`)
    } catch (reason) { setError(reason.message) } finally { setBusy('') }
  }

  async function cancel(application) {
    setBusy(application.id)
    setError('')
    try {
      await api(`/api/sports/applications/${encodeURIComponent(application.id)}`, { method: 'PATCH', body: { status: 'CANCELLED' } })
      await load()
      onNotify(`Application for ${application.eventName} cancelled.`)
    } catch (reason) { setError(reason.message) } finally { setBusy('') }
  }

  if (!data) return <div className="management-state"><span className="loading-spinner"/>Loading Sports…</div>
  const appliedEvents = new Set(data.registrations.filter((entry) => !['REJECTED', 'CANCELLED'].includes(entry.status)).map((entry) => entry.eventId))
  const futureEvents = data.events.filter((event) => new Date(`${event.date}T${event.time || '23:59'}`) >= new Date() && event.status === 'OPEN')
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
      {section === 'Sports Home' && <>
        <div className="sports-student-metrics">
          <article><Activity/><span><b>{futureEvents.length}</b>Upcoming events & trials</span></article>
          <article><CalendarDays/><span><b>{data.registrations.length}</b>My applications</span></article>
          <article><Medal/><span><b>{data.mySports.length}</b>My sports</span></article>
        </div>
        <h2>Available sports</h2>
        <div className="sports-record-list">{data.sports.filter((sport) => sport.active !== false && ['Sport', 'Team'].includes(sport.kind)).map((sport) => <article className="sports-record-row" key={sport.id}><div className="module-row-body"><span className="sports-record-kind">SPORT · ACTIVE</span><strong>{sport.title}</strong><span>{sport.description}</span>{sport.rules && <small>Rules: {sport.rules}</small>}</div></article>)}</div>
        <h2>Upcoming events & trials</h2>
        <EventList events={futureEvents.slice(0, 4)} appliedEvents={appliedEvents} busy={busy} onRegister={register}/>
        <h2>Sports notices</h2>
        <RecordList records={data.notices.filter((notice) => !notice.sportId)} empty="No general sports notices have been sent to you."/>
      </>}
      {section === 'Events & Trials' && <>
        <h2>Events & trials</h2>
        <EventList events={data.events.filter((event) => !['CANCELLED', 'COMPLETED'].includes(event.status) && new Date(`${event.date}T${event.time || '23:59'}`) >= new Date())} appliedEvents={appliedEvents} busy={busy} onRegister={register} registrations={data.registrations}/>
      </>}
      {section === 'My Applications' && <>
        <h2>My applications</h2>
        {!data.registrations.length && <p className="sports-empty">You have not applied for any sports events or trials.</p>}
        <div className="sports-record-list">{data.registrations.map((application) => <article className="sports-record-row" key={application.id}><div className="module-row-body"><span className="sports-record-kind">{application.sportName} · {application.status}</span><strong>{application.eventName}</strong><span>Applied {new Date(application.createdAt).toLocaleString()}</span></div>{['APPLIED', 'REGISTERED', 'SHORTLISTED'].includes(application.status) && <button disabled={busy === application.id} onClick={() => cancel(application)}>{busy === application.id ? 'Cancelling…' : 'Cancel application'}</button>}</article>)}</div>
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
    </section>
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Sports information for {user.role}</span><span>Sports Management controls are restricted to authorized roles.</span></footer>
  </div>
}

function EventList({ events, appliedEvents, busy, onRegister, registrations = [] }) {
  if (!events.length) return <p className="sports-empty">No events or trials to show right now.</p>
  return <div className="sports-card-grid">{events.map((event) => {
    const application = registrations.find((entry) => entry.eventId === event.id && !['CANCELLED', 'REJECTED'].includes(entry.status))
    const deadlinePassed = event.registrationDeadline < new Date().toISOString().slice(0, 10)
    return <article className="sports-event-card" key={event.id}><span className="section-eyebrow">{event.kind} · {event.sportName}</span><h3>{event.name}</h3><p>{event.description}</p><div className="sports-event-meta"><span><CalendarDays size={14}/>{event.date} · {event.time}</span><span>{event.venue}</span><span>Register by {event.registrationDeadline}</span><span>{event.eligibleDepartments?.length ? `Eligible: ${event.eligibleDepartments.join(', ')}` : event.eligibility || 'Open eligibility'}</span><span>Maximum participants: {event.maxParticipants || 'Unlimited'}</span></div>{application && <strong className="sports-status">{application.status}</strong>}{event.status === 'OPEN' && !deadlinePassed && <button className="module-primary" disabled={appliedEvents.has(event.id) || busy === event.id} onClick={() => onRegister(event)}>{appliedEvents.has(event.id) ? 'Application submitted' : busy === event.id ? 'Applying…' : 'Apply / Register'}</button>}</article>
  })}</div>
}

function TeamList({ teams }) {
  if (!teams.length) return <p className="sports-empty">You are not currently assigned to a team in this sport.</p>
  return <div className="sports-card-grid">{teams.map(({ id, name, sportName, category, teamType, captain, viceCaptain, members }) => <article className="sports-team-card" key={id}><span className="section-eyebrow">{sportName} · {category} · {teamType}</span><h3>{name}</h3><p>Captain: {captain?.name || '—'} · Vice-Captain: {viceCaptain?.name || '—'}</p><strong>{members.filter((member) => member.status === 'ACTIVE').length} active team members</strong><div className="sports-team-member-list">{members.filter((member) => member.status === 'ACTIVE').map((member) => <span key={member.studentId}>{member.name} · {member.studentId} · {member.position}</span>)}</div></article>)}</div>
}

function RecordList({ records, empty }) {
  if (!records?.length) return <p className="sports-empty">{empty}</p>
  return <div className="sports-record-list">{records.map((record) => <article className="sports-record-row" key={record.id}><div className="module-row-body"><span className="sports-record-kind">{record.kind || record.status || record.competition || record.audienceType || 'Sports update'}</span><strong>{record.title || record.name || record.eventName || record.competition || record.sportName || record.subjectName}</strong><span>{[record.date, record.time, record.venue, record.instructions, record.description, record.achievement, record.score && `Score: ${record.score}`, record.status].filter(Boolean).join(' · ')}</span></div></article>)}</div>
}
