import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, CalendarDays, Check, Medal, Plus, ShieldAlert, Trophy, UsersRound, X } from 'lucide-react'
import { api } from '../api/client'
import {
  ALL_DEPARTMENTS, SPORTS_DEPARTMENT_OPTIONS, SPORTS_EVENT_DEFAULT_AUDIENCE,
  SPORTS_EVENT_DEFAULT_STATUS, SPORTS_EVENT_DEFAULT_TYPE, SPORTS_EVENT_REGISTRATION_STATUS,
  SPORTS_EVENT_STATUSES, SPORTS_EVENT_STATUS, SPORTS_EVENT_STATUS_LABELS, SPORTS_EVENT_TYPES,
  SPORTS_NOTIFICATION_AUDIENCES, SPORTS_NOTIFICATION_AUDIENCE_LABELS,
  SPORTS_TIME_MINUTES, formatSportsTime,
  normalizeSportsDepartments, normalizeSportsEventContract, normalizeSportsTime,
} from '../../shared/sports-time.js'

const sections = ['Dashboard', 'Sports', 'Applications/Participants', 'Sports / Team Applications', 'Sports Event Registrations', 'Teams', 'Sports Events', 'Schedule', 'Attendance', 'Results', 'Achievements', 'Sports Notices', 'Notices']
const today = new Date().toISOString().slice(0, 10)
const emptyEvent = { name: '', sportId: '', kind: SPORTS_EVENT_DEFAULT_TYPE, date: '', startTime: '', endTime: '', venue: '', registrationRequired: true, registrationDeadline: '', maxParticipants: '', eligibility: 'All active students', eligibleDepartments: [], description: '', instructions: '', eventImage: '', audienceType: SPORTS_EVENT_DEFAULT_AUDIENCE, audienceId: '', status: SPORTS_EVENT_DEFAULT_STATUS }
const emptyTeam = { name: '', sportId: '', category: 'Mixed', teamType: 'College Team', description: '', captainId: '', viceCaptainId: '' }

export default function SportsManagement({ onNotify, user }) {
  const [data, setData] = useState(null)
  const [section, setSection] = useState('Dashboard')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sportForm, setSportForm] = useState({ title: '', description: '', rules: '' })
  const [teamForm, setTeamForm] = useState({ ...emptyTeam })
  const [scheduleForm, setScheduleForm] = useState({ title: '', sportId: '', teamId: '', eventId: '', kind: 'PRACTICE', date: '', time: '', venue: '', opponent: '', instructions: '' })
  const [attendanceForm, setAttendanceForm] = useState({ subjectId: '', studentId: '', status: 'PRESENT', subjectType: 'event' })
  const [resultForm, setResultForm] = useState({ eventId: '', sportId: '', winner: '', score: '', date: today, venue: '', remarks: '', teamIds: [], playerIds: [] })
  const [achievementForm, setAchievementForm] = useState({ studentId: '', teamId: '', sportId: '', competition: '', position: '', year: String(new Date().getFullYear()), achievement: '', certificateUrl: '', published: false })
  const [noticeForm, setNoticeForm] = useState({ title: '', message: '', audienceType: 'ALL', audienceId: '' })
  const [studentSearch, setStudentSearch] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [newPlayerId, setNewPlayerId] = useState('')
  const [newPlayerPosition, setNewPlayerPosition] = useState('Player')
  const [editingSport, setEditingSport] = useState('')
  const [editingTeam, setEditingTeam] = useState(false)

  const load = useCallback(async () => {
    const result = await api('/api/sports/management')
    setData(result)
  }, [])

  useEffect(() => {
    let active = true
    api('/api/sports/management').then((result) => { if (active) setData(result) }).catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [])

  const sports = useMemo(() => (data?.sports || []).filter((entry) => entry.active !== false && ['Sport', 'Team'].includes(entry.kind)), [data])
  const students = useMemo(() => (data?.students || []).filter((student) => `${student.name} ${student.id} ${student.department} ${student.semester}`.toLowerCase().includes(studentSearch.toLowerCase())), [data, studentSearch])
  const selectedTeam = data?.teams.find((team) => team.id === selectedTeamId)
  const eventById = useMemo(() => new Map((data?.events || []).map((event) => [event.id, event])), [data])

  async function run(action, successMessage) {
    setBusy(true)
    setError('')
    try {
      await action()
      await load()
      if (successMessage) onNotify(successMessage)
      return true
    } catch (reason) { setError(reason.message); return false } finally { setBusy(false) }
  }

  async function createSport(event) {
    event.preventDefault()
    await run(async () => {
      await api('/api/sports', { method: 'POST', body: { kind: 'Sport', ...sportForm } })
      setSportForm({ title: '', description: '', rules: '' })
    }, 'Sport added.')
  }

  async function saveSport(sport, patch) {
    if (await run(() => api(`/api/sports/${encodeURIComponent(sport.id)}`, { method: 'PATCH', body: { ...sport, ...patch } }), `${sport.title} updated.`)) setEditingSport('')
  }

  async function createTeam(event) {
    event.preventDefault()
    await run(async () => {
      const result = await api('/api/sports/teams', { method: 'POST', body: teamForm })
      setTeamForm({ ...emptyTeam })
      setSelectedTeamId(result.team.id)
      setSection('Teams')
    }, 'Team created with captain and vice-captain members.')
  }

  async function createSchedule(event) {
    event.preventDefault()
    await run(async () => {
      await api('/api/sports/schedules', { method: 'POST', body: scheduleForm })
      setScheduleForm({ title: '', sportId: '', teamId: '', eventId: '', kind: 'PRACTICE', date: '', time: '', venue: '', opponent: '', instructions: '' })
    }, 'Schedule saved.')
  }

  async function saveAttendance(event) {
    event.preventDefault()
    await run(async () => {
      await api('/api/sports/attendance', { method: 'POST', body: { [attendanceForm.subjectType === 'event' ? 'eventId' : 'scheduleId']: attendanceForm.subjectId, records: [{ studentId: attendanceForm.studentId, status: attendanceForm.status }] } })
    }, 'Attendance updated.')
  }

  async function createResult(event) {
    event.preventDefault()
    await run(async () => {
      await api('/api/sports/results', { method: 'POST', body: resultForm })
      setResultForm({ eventId: '', sportId: '', winner: '', score: '', date: today, venue: '', remarks: '', teamIds: [], playerIds: [] })
    }, 'Sports result recorded.')
  }

  async function createAchievement(event) {
    event.preventDefault()
    await run(async () => {
      await api('/api/sports/achievements', { method: 'POST', body: achievementForm })
      setAchievementForm({ studentId: '', teamId: '', sportId: '', competition: '', position: '', year: String(new Date().getFullYear()), achievement: '', certificateUrl: '', published: false })
    }, 'Achievement recorded.')
  }

  async function createNotice(event) {
    event.preventDefault()
    await run(async () => {
      if (noticeForm.audienceType === 'CAMPUS') {
        const result = await api('/api/notices', { method: 'POST', body: {
          title: noticeForm.title,
          description: noticeForm.message,
          category: 'Sports',
          priority: 'Normal',
          target: { type: 'EVERYONE' },
          publishAt: new Date().toISOString(),
        } })
        setNoticeForm({ title: '', message: '', audienceType: 'ALL', audienceId: '' })
        onNotify(`Campus Sports announcement published in Notices & Announcements for ${result.recipientCount} recipients.`)
        return
      }
      const result = await api('/api/sports/notices', { method: 'POST', body: noticeForm })
      setNoticeForm({ title: '', message: '', audienceType: 'ALL', audienceId: '' })
      onNotify(`Sports notice sent to ${result.recipientCount} matching participant${result.recipientCount === 1 ? '' : 's'}.`)
    })
  }

  async function addPlayer(event) {
    event.preventDefault()
    await run(async () => {
      await api(`/api/sports/teams/${encodeURIComponent(selectedTeam.id)}/members`, { method: 'POST', body: { studentId: newPlayerId, position: newPlayerPosition } })
      setNewPlayerId('')
      setNewPlayerPosition('Player')
    }, 'Player added to team.')
  }

  if (![ 'Sports Captain', 'Administration' ].includes(user.role)) return <div className="management-alert" role="alert">Sports Captain or Administration access is required.</div>
  if (!data) return <div className="management-state"><span className="loading-spinner"/>Loading Sports Management…</div>

  return <div className="module-page page-enter management-page sports-management-page">
    <div className="module-breadcrumb">CAMPUS OPERATIONS <span>›</span> SPORTS MANAGEMENT</div>
    <section className="module-hero"><div className="module-title-area"><span className="module-icon"><Trophy size={20}/></span><span className="module-eyebrow">CAMPUS ATHLETICS</span><h1>Sports Management<span className="module-title-period">.</span></h1><p>Manage sports, events, selections, teams and student participation in one place.</p></div><span className="sports-captain-chip"><span/>Authorized manager<strong>{user.role}</strong></span></section>
    <nav className="sports-tabs" aria-label="Sports management sections">{sections.map((item) => <button key={item} className={section === item ? 'sports-tab-active' : ''} onClick={() => setSection(item)}>{item}</button>)}</nav>
    {error && <div className="management-alert" role="alert"><ShieldAlert size={15}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
    {section === 'Dashboard' && <Dashboard data={data} onOpen={setSection}/>}
    {section === 'Sports' && <section className="sports-management-panel"><Heading title="Sports" detail="Maintain the active campus sports directory. Existing sports records are retained."/><form className="sports-form-grid" onSubmit={createSport}><Field label="Sport name" value={sportForm.title} onChange={(title) => setSportForm({ ...sportForm, title })} required/><Field label="Description" value={sportForm.description} onChange={(description) => setSportForm({ ...sportForm, description })} required/><Field label="Rules / instructions" value={sportForm.rules} onChange={(rules) => setSportForm({ ...sportForm, rules })}/><button className="module-primary" disabled={busy}><Plus size={14}/> Add sport</button></form><div className="sports-card-grid">{sports.map((sport) => <article className="sports-record-row" key={sport.id}><div className="module-row-body"><strong>{sport.title}</strong>{editingSport === sport.id ? <SportEditor sport={sport} busy={busy} onSave={(patch) => saveSport(sport, patch)} onCancel={() => setEditingSport('')}/> : <><span>{sport.description}</span>{sport.rules && <small>Rules: {sport.rules}</small>}<span className="sports-status">{sport.active === false ? 'INACTIVE' : 'ACTIVE'}</span></>}</div>{editingSport !== sport.id && <div className="sports-action-row"><button onClick={() => setEditingSport(sport.id)}>Edit</button><button onClick={() => saveSport(sport, { active: sport.active === false })}>{sport.active === false ? 'Activate' : 'Deactivate'}</button></div>}</article>)}</div></section>}
    {section === 'Sports Events' && <SportsEventsSection data={data} sports={sports} busy={busy} onCreate={(event) => run(() => api('/api/sports/events', { method: 'POST', body: event }), 'Sports event saved.')} onSave={(event, patch) => run(() => api(`/api/sports/events/${encodeURIComponent(event.id)}`, { method: 'PATCH', body: patch }), `${event.name} updated.`)}/>}
    {section === 'Applications/Participants' && <section className="sports-management-panel"><Heading title="Applications & participants" detail="Review each sport application through Submitted → Shortlisted → Selected / Rejected. Only selected users become active participants."/><div className="sports-record-list">{data.registrations.filter((registration) => registration.applicationType !== 'SPORTS_EVENT').map((registration) => { const eligibleTeams = data.teams.filter((team) => team.sportId === registration.sportId && team.status === 'ACTIVE'); return <article className="sports-record-row" key={registration.id}><div className="module-row-body"><span className="sports-record-kind">{registration.applicationType === 'SPORT' ? 'Sport application' : registration.eventName} · {registration.sportName}</span><strong>{registration.studentName} · {registration.studentId}</strong><span>{registration.department} · {registration.semester} · {registration.mobile || 'No contact on file'}</span>{registration.position && <span>Position/role: {registration.position}</span>}{registration.details && <span>{registration.details}</span>}<span>Applied {new Date(registration.createdAt).toLocaleString()} · {registration.status}</span></div><div className="sports-action-row">{['SUBMITTED', 'APPLIED', 'REGISTERED'].includes(registration.status) && <button disabled={busy} onClick={() => run(() => api(`/api/sports/registrations/${encodeURIComponent(registration.id)}`, { method: 'PATCH', body: { status: 'SHORTLISTED' } }), 'Applicant shortlisted.')}>Shortlist</button>}{['SUBMITTED', 'APPLIED', 'REGISTERED', 'SHORTLISTED'].includes(registration.status) && <button disabled={busy} onClick={() => run(() => api(`/api/sports/registrations/${encodeURIComponent(registration.id)}`, { method: 'PATCH', body: { status: 'REJECTED' } }), 'Applicant rejected.')}>Reject</button>}{registration.status === 'SHORTLISTED' && <button disabled={busy} onClick={() => run(() => api(`/api/sports/registrations/${encodeURIComponent(registration.id)}`, { method: 'PATCH', body: { status: 'SELECTED' } }), 'Applicant selected and activated for this sport.')}>Select</button>}{registration.status === 'SELECTED' && eligibleTeams.length > 0 && <Select label={`Add ${registration.studentName} to team`} value="" onChange={(teamId) => run(() => api(`/api/sports/teams/${encodeURIComponent(teamId)}/members`, { method: 'POST', body: { studentId: registration.studentId, registrationId: registration.id } }), 'Selected player added to team.')} options={eligibleTeams.map((team) => [team.id, `Add to ${team.name}`])}/>}</div></article>})}{!data.registrations.length && <p className="sports-empty">No applications yet.</p>}</div></section>}
    {section === 'Sports / Team Applications' && <section className="sports-management-panel"><Heading title="Sports / Team Applications" detail="Review membership requests separately from event and trial registrations. Approving a team request adds the student to its active roster."/><div className="sports-record-list">{(data.membershipApplications || []).map((application) => <article className="sports-record-row" key={application.id}><div className="module-row-body"><span className="sports-record-kind">{application.type === 'TEAM' ? 'TEAM APPLICATION' : 'SPORT APPLICATION'} · {application.sportName}</span><strong>{application.studentName} · {application.studentId}</strong><span>{application.teamName || application.sportName} · {application.department} · {application.semester}</span><span>Applied {new Date(application.createdAt).toLocaleString()} · {application.status}</span></div>{application.status === 'APPLIED' && <div className="sports-action-row"><button disabled={busy} onClick={() => run(() => api(`/api/sports/membership-applications/${encodeURIComponent(application.id)}`, { method: 'PATCH', body: { status: 'APPROVED' } }), 'Sports membership application approved.')}>Approve</button><button disabled={busy} onClick={() => run(() => api(`/api/sports/membership-applications/${encodeURIComponent(application.id)}`, { method: 'PATCH', body: { status: 'REJECTED' } }), 'Sports membership application rejected.')}>Reject</button></div>}</article>)}{!data.membershipApplications?.length && <p className="sports-empty">No sports or team applications yet.</p>}</div></section>}
    {section === 'Teams' && <section className="sports-management-panel"><Heading title="Teams" detail="Create college or practice teams. Captains and vice-captains are real, active Student accounts and are members automatically."/><form className="sports-form-grid" onSubmit={createTeam}><Field label="Team name" value={teamForm.name} onChange={(name) => setTeamForm({ ...teamForm, name })} required/><Select label="Sport" value={teamForm.sportId} onChange={(sportId) => setTeamForm({ ...teamForm, sportId })} options={sports.map((sport) => [sport.id, sport.title])} required/><Select label="Category" value={teamForm.category} onChange={(category) => setTeamForm({ ...teamForm, category })} options={['Men', 'Women', 'Mixed', 'Other'].map((value) => [value, value])}/><Select label="Team type" value={teamForm.teamType} onChange={(teamType) => setTeamForm({ ...teamForm, teamType })} options={['College Team', 'Practice Team'].map((value) => [value, value])}/><Field label="Description" value={teamForm.description} onChange={(description) => setTeamForm({ ...teamForm, description })} required/><StudentSelect label="Captain" value={teamForm.captainId} onChange={(captainId) => setTeamForm({ ...teamForm, captainId })} students={students} search={studentSearch} onSearch={setStudentSearch} required/><StudentSelect label="Vice-captain" value={teamForm.viceCaptainId} onChange={(viceCaptainId) => setTeamForm({ ...teamForm, viceCaptainId })} students={students} search={studentSearch} onSearch={setStudentSearch} required/><button className="module-primary" disabled={busy}><Plus size={14}/> Create team</button></form><div className="sports-team-overview">{data.teams.map((team) => <button className={`sports-team-summary ${selectedTeamId === team.id ? 'sports-team-selected' : ''}`} key={team.id} onClick={() => { setSelectedTeamId(team.id); setEditingTeam(false) }}><span className="section-eyebrow">{team.sportName} · {team.category}</span><strong>{team.name}</strong><span>{team.playerCount} active players · {team.status}</span><span>Captain: {team.captain?.name || '—'}</span></button>)}</div>{selectedTeam && <TeamDetails team={selectedTeam} sports={sports} students={students} search={studentSearch} onSearch={setStudentSearch} newPlayerId={newPlayerId} setNewPlayerId={setNewPlayerId} position={newPlayerPosition} setPosition={setNewPlayerPosition} onAddPlayer={addPlayer} busy={busy} editing={editingTeam} setEditing={setEditingTeam} onSave={(patch) => run(() => api(`/api/sports/teams/${encodeURIComponent(selectedTeam.id)}`, { method: 'PATCH', body: patch }), 'Team updated.')} onMemberStatus={(member, status) => run(() => api(`/api/sports/teams/${encodeURIComponent(selectedTeam.id)}/members/${encodeURIComponent(member.studentId)}`, { method: 'PATCH', body: { status } }), 'Team player status updated.')} onRemovePlayer={(member) => run(() => api(`/api/sports/teams/${encodeURIComponent(selectedTeam.id)}/members/${encodeURIComponent(member.studentId)}`, { method: 'DELETE' }), 'Player removed from team.')}/>}</section>}
    {section === 'Schedule' && <section className="sports-management-panel"><Heading title="Matches & practice schedule" detail="Schedules connect to sports events and teams without reserving venues."/><form className="sports-form-grid" onSubmit={createSchedule}><Field label="Schedule name" value={scheduleForm.title} onChange={(title) => setScheduleForm({ ...scheduleForm, title })} required/><Select label="Sport" value={scheduleForm.sportId} onChange={(sportId) => setScheduleForm({ ...scheduleForm, sportId, teamId: '' })} options={sports.map((sport) => [sport.id, sport.title])} required/><Select label="Type" value={scheduleForm.kind} onChange={(kind) => setScheduleForm({ ...scheduleForm, kind })} options={['MATCH', 'PRACTICE', 'EVENT'].map((value) => [value, value])}/><Select label="Team (optional)" value={scheduleForm.teamId} onChange={(teamId) => setScheduleForm({ ...scheduleForm, teamId })} options={data.teams.filter((team) => team.sportId === scheduleForm.sportId).map((team) => [team.id, team.name])}/><Select label="Linked event (optional)" value={scheduleForm.eventId} onChange={(eventId) => setScheduleForm({ ...scheduleForm, eventId })} options={data.events.filter((event) => event.sportId === scheduleForm.sportId).map((event) => [event.id, event.name])}/><Field label="Opponent" value={scheduleForm.opponent} onChange={(opponent) => setScheduleForm({ ...scheduleForm, opponent })}/><Field label="Date" type="date" value={scheduleForm.date} onChange={(date) => setScheduleForm({ ...scheduleForm, date })} required/><Field label="Time" type="time" value={scheduleForm.time} onChange={(time) => setScheduleForm({ ...scheduleForm, time })} required/><Field label="Venue" value={scheduleForm.venue} onChange={(venue) => setScheduleForm({ ...scheduleForm, venue })} required/><Field label="Instructions" value={scheduleForm.instructions} onChange={(instructions) => setScheduleForm({ ...scheduleForm, instructions })}/><button className="module-primary" disabled={busy}>Save schedule</button></form><ScheduleList schedules={data.schedules} sports={sports} teams={data.teams} events={data.events} onSave={(schedule, patch) => run(() => api(`/api/sports/schedules/${encodeURIComponent(schedule.id)}`, { method: 'PATCH', body: patch }), `${schedule.title} updated.`)}/></section>}
    {section === 'Attendance' && <section className="sports-management-panel"><Heading title="Attendance" detail="Mark students Present or Absent for events, trials, matches or practice sessions."/><form className="sports-form-grid" onSubmit={saveAttendance}><Select label="Record type" value={attendanceForm.subjectType} onChange={(subjectType) => setAttendanceForm({ ...attendanceForm, subjectType, subjectId: '' })} options={[['event', 'Event / trial'], ['schedule', 'Match / practice']]}/><Select label="Event or schedule" value={attendanceForm.subjectId} onChange={(subjectId) => setAttendanceForm({ ...attendanceForm, subjectId })} options={(attendanceForm.subjectType === 'event' ? data.events.map((entry) => [entry.id, entry.name]) : data.schedules.map((entry) => [entry.id, entry.title])).filter(Boolean)} required/><StudentSelect label="Student" value={attendanceForm.studentId} onChange={(studentId) => setAttendanceForm({ ...attendanceForm, studentId })} students={students} search={studentSearch} onSearch={setStudentSearch} required/><Select label="Attendance" value={attendanceForm.status} onChange={(status) => setAttendanceForm({ ...attendanceForm, status })} options={['PRESENT', 'ABSENT'].map((value) => [value, value])}/><button className="module-primary" disabled={busy}>Save attendance</button></form><RecordList records={data.attendance} empty="No attendance recorded."/></section>}
    {section === 'Results' && <section className="sports-management-panel"><Heading title="Results" detail="Keep event, team and player results connected as historical records."/><form className="sports-form-grid" onSubmit={createResult}><Select label="Event / match (optional)" value={resultForm.eventId} onChange={(eventId) => { const event = eventById.get(eventId); setResultForm({ ...resultForm, eventId, sportId: event?.sportId || resultForm.sportId }) }} options={data.events.map((event) => [event.id, event.name])}/><Select label="Sport" value={resultForm.sportId} onChange={(sportId) => setResultForm({ ...resultForm, sportId })} options={sports.map((sport) => [sport.id, sport.title])} required/><Select label="Teams" multiple value={resultForm.teamIds} onChange={(teamIds) => setResultForm({ ...resultForm, teamIds })} options={data.teams.map((team) => [team.id, team.name])}/><Select label="Players (optional)" multiple value={resultForm.playerIds} onChange={(playerIds) => setResultForm({ ...resultForm, playerIds })} options={(data.students || []).map((student) => [student.id, `${student.name} · ${student.id}`])}/><Field label="Winner" value={resultForm.winner} onChange={(winner) => setResultForm({ ...resultForm, winner })} required/><Field label="Score / result" value={resultForm.score} onChange={(score) => setResultForm({ ...resultForm, score })} required/><Field label="Date" type="date" value={resultForm.date} onChange={(date) => setResultForm({ ...resultForm, date })} required/><Field label="Venue" value={resultForm.venue} onChange={(venue) => setResultForm({ ...resultForm, venue })}/><Field label="Remarks" value={resultForm.remarks} onChange={(remarks) => setResultForm({ ...resultForm, remarks })}/><button className="module-primary" disabled={busy}>Record result</button></form><RecordList records={data.results} empty="No results recorded."/></section>}
    {section === 'Achievements' && <section className="sports-management-panel"><Heading title="Achievements" detail="Records are linked to existing active student accounts and optional teams. Published records are visible to active participants in that sport."/><form className="sports-form-grid" onSubmit={createAchievement}><StudentSelect label="Student" value={achievementForm.studentId} onChange={(studentId) => setAchievementForm({ ...achievementForm, studentId })} students={students} search={studentSearch} onSearch={setStudentSearch} required/><Select label="Sport" value={achievementForm.sportId} onChange={(sportId) => setAchievementForm({ ...achievementForm, sportId })} options={sports.map((sport) => [sport.id, sport.title])} required/><Select label="Team (optional)" value={achievementForm.teamId} onChange={(teamId) => setAchievementForm({ ...achievementForm, teamId })} options={data.teams.map((team) => [team.id, team.name])}/><Field label="Competition" value={achievementForm.competition} onChange={(competition) => setAchievementForm({ ...achievementForm, competition })} required/><Field label="Position" value={achievementForm.position} onChange={(position) => setAchievementForm({ ...achievementForm, position })} required/><Field label="Year" type="number" min="1900" max="2100" value={achievementForm.year} onChange={(year) => setAchievementForm({ ...achievementForm, year })} required/><Field label="Achievement" value={achievementForm.achievement} onChange={(achievement) => setAchievementForm({ ...achievementForm, achievement })} required/><Field label="Certificate URL (HTTPS)" value={achievementForm.certificateUrl} onChange={(certificateUrl) => setAchievementForm({ ...achievementForm, certificateUrl })}/><label className="sports-publish-option"><input type="checkbox" checked={achievementForm.published} onChange={(event) => setAchievementForm({ ...achievementForm, published: event.target.checked })}/> Publish to active participants in this sport</label><button className="module-primary" disabled={busy}>Add achievement</button></form><AchievementList achievements={data.achievements} sports={sports} teams={data.teams} students={students} search={studentSearch} onSearch={setStudentSearch} onSave={(achievement, patch) => run(() => api(`/api/sports/achievements/${encodeURIComponent(achievement.id)}`, { method: 'PATCH', body: patch }), 'Achievement updated.')}/></section>}
    {section === 'Sports Notices' && <section className="sports-management-panel"><Heading title="Targeted sports notices" detail="Notices are delivered only to the selected sports audience."/><form className="sports-form-grid" onSubmit={createNotice}><Field label="Title" value={noticeForm.title} onChange={(title) => setNoticeForm({ ...noticeForm, title })} required/><Field label="Message" value={noticeForm.message} onChange={(message) => setNoticeForm({ ...noticeForm, message })} required/><Select label="Audience" value={noticeForm.audienceType} onChange={(audienceType) => setNoticeForm({ ...noticeForm, audienceType, audienceId: '' })} options={ [['ALL', 'All Sports Users'], ['SPORT', 'Selected / active users in a sport'], ['TEAM', 'Specific Team'], ['EVENT', 'Specific Event / Trial applicants'], ['ACTIVE', 'Selected / active participants']] }/><Select label="Target" value={noticeForm.audienceId} onChange={(audienceId) => setNoticeForm({ ...noticeForm, audienceId })} disabled={noticeForm.audienceType === 'ALL'} options={['SPORT', 'ACTIVE'].includes(noticeForm.audienceType) ? sports.map((sport) => [sport.id, sport.title]) : noticeForm.audienceType === 'TEAM' ? data.teams.map((team) => [team.id, team.name]) : data.events.map((event) => [event.id, event.name])}/><button className="module-primary" disabled={busy}>Send notice</button></form><RecordList records={data.notices} empty="No sports notices yet."/></section>}
    {section === 'Sports Event Registrations' && <SportsEventRegistrationPanel registrations={data.registrations} busy={busy} onReview={(registration, status) => run(() => api(`/api/sports/registrations/${encodeURIComponent(registration.id)}`, { method: 'PATCH', body: { status } }), `Sports Event registration ${status.toLowerCase()}.`)}/>}
    {section === 'Notices' && <section className="sports-management-panel"><Heading title="Sports notices & announcements" detail="Target sports notices to active participants. Administration can publish campus-wide Sports announcements in the existing Notices & Announcements section."/><form className="sports-form-grid" onSubmit={createNotice}><Field label="Title" value={noticeForm.title} onChange={(title) => setNoticeForm({ ...noticeForm, title })} required/><Field label="Message" value={noticeForm.message} onChange={(message) => setNoticeForm({ ...noticeForm, message })} required/><Select label="Audience" value={noticeForm.audienceType} onChange={(audienceType) => setNoticeForm({ ...noticeForm, audienceType, audienceId: '' })} options={ [['ALL', 'All active Sports participants'], ['SPORT', 'Active participants in a sport'], ['TEAM', 'Specific Team'], ['EVENT', 'Specific Event / Trial applicants'], ['ACTIVE', 'Selected / active participants'], ...(user.role === 'Administration' ? [['CAMPUS', 'Campus-wide Sports announcement']] : [])] }/><Select label="Target" value={noticeForm.audienceId} onChange={(audienceId) => setNoticeForm({ ...noticeForm, audienceId })} disabled={['ALL', 'CAMPUS'].includes(noticeForm.audienceType)} options={['SPORT', 'ACTIVE'].includes(noticeForm.audienceType) ? sports.map((sport) => [sport.id, sport.title]) : noticeForm.audienceType === 'TEAM' ? data.teams.map((team) => [team.id, team.name]) : data.events.map((event) => [event.id, event.name])}/><button className="module-primary" disabled={busy}>Send notice</button></form><RecordList records={data.notices} empty="No targeted sports notices yet."/></section>}
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Sports Management · {user.id}</span><span>All changes are retained in campus records.</span></footer>
  </div>
}

function SportsEventRegistrationPanel({ registrations, busy, onReview }) {
  const eventRegistrations = registrations.filter((registration) => registration.applicationType === 'SPORTS_EVENT')
  return <section className="sports-management-panel"><Heading title="Sports Event Registrations" detail="Review registrations submitted for published Sports Events."/>
    {!eventRegistrations.length && <p className="sports-empty">No Sports Event registrations yet.</p>}
    <div className="sports-record-list">{eventRegistrations.map((registration) => <article className="sports-record-row" key={registration.id}>
      <div className="module-row-body"><span className="sports-record-kind">{registration.eventName} · {registration.sportName}</span><strong>{registration.studentName} · {registration.studentId}</strong><span>Department: {registration.department || '—'} · Course/Program: {registration.course || '—'} · Semester/Year: {registration.semester || '—'} · Mobile: {registration.mobile || '—'}</span><span>Registered {new Date(registration.registrationDateTime || registration.createdAt).toLocaleString()} · {registration.status}</span></div>
      {registration.status === SPORTS_EVENT_REGISTRATION_STATUS.PENDING && <div className="sports-action-row"><button disabled={busy} onClick={() => onReview(registration, SPORTS_EVENT_REGISTRATION_STATUS.ACCEPTED)}>Accept</button><button disabled={busy} onClick={() => onReview(registration, SPORTS_EVENT_REGISTRATION_STATUS.REJECTED)}>Reject</button></div>}
    </article>)}</div>
  </section>
}

function Dashboard({ data, onOpen }) {
  const stats = data.dashboard
  return <><section className="sports-management-stats">{[['Total Sports', stats.totalSports, Activity, 'Sports'], ['Total Players', stats.totalPlayers, UsersRound, 'Sports'], ['Total Teams', stats.totalTeams, Trophy, 'Teams'], ['Upcoming Events / Matches', stats.upcomingEvents, CalendarDays, 'Sports Events'], ['Pending Applications', stats.pendingRegistrations, Medal, 'Applications/Participants'], ['Membership Requests', stats.pendingMembershipApplications || 0, Medal, 'Sports / Team Applications'], ['Active Teams', stats.activeTeams, Check, 'Teams']].map(([label, count, Icon, page]) => <button key={label} onClick={() => onOpen(page)}><Icon size={17}/><span>{label}</span><strong>{count}</strong></button>)}</section><section className="sports-management-panel"><Heading title="Recent sports activities" detail="Recent applications and event updates."/><RecordList records={stats.recentActivities} empty="No recent sports activity."/></section></>}

function TeamDetails({ team, sports, students, search, onSearch, newPlayerId, setNewPlayerId, position, setPosition, onAddPlayer, busy, editing, setEditing, onSave, onMemberStatus, onRemovePlayer }) {
  const [fields, setFields] = useState({ name: team.name, category: team.category, teamType: team.teamType, description: team.description, captainId: team.captainId, viceCaptainId: team.viceCaptainId || '' })
  useEffect(() => setFields({ name: team.name, category: team.category, teamType: team.teamType, description: team.description, captainId: team.captainId, viceCaptainId: team.viceCaptainId || '' }), [team])
  return <article className="sports-team-details"><div className="management-heading"><div><span className="section-eyebrow">{team.sportName} · {team.category} · {team.teamType}</span><h2>{team.name}</h2></div><div className="sports-action-row"><button onClick={() => setEditing(!editing)}>{editing ? 'Cancel edit' : 'Edit team'}</button><TeamStatus value={team.status} onChange={(status) => onSave({ status })}/></div></div>
    <p>{team.description}</p><p>Captain: {team.captain?.name || '—'} · Vice-captain: {team.viceCaptain?.name || '—'} · {team.playerCount} active players</p>
    {editing && <form className="sports-form-grid" onSubmit={(event) => { event.preventDefault(); onSave(fields).then((saved) => { if (saved) setEditing(false) }) }}><Field label="Team name" value={fields.name} onChange={(name) => setFields({ ...fields, name })} required/><Select label="Sport" value={team.sportId} onChange={(sportId) => onSave({ sportId })} options={sports.map((sport) => [sport.id, sport.title])}/><Select label="Category" value={fields.category} onChange={(category) => setFields({ ...fields, category })} options={['Men', 'Women', 'Mixed', 'Other'].map((value) => [value, value])}/><Select label="Type" value={fields.teamType} onChange={(teamType) => setFields({ ...fields, teamType })} options={['College Team', 'Practice Team'].map((value) => [value, value])}/><Field label="Description" value={fields.description} onChange={(description) => setFields({ ...fields, description })}/><StudentSelect label="Captain" value={fields.captainId} onChange={(captainId) => setFields({ ...fields, captainId })} students={students} search={search} onSearch={onSearch} required/><StudentSelect label="Vice-captain" value={fields.viceCaptainId} onChange={(viceCaptainId) => setFields({ ...fields, viceCaptainId })} students={students} search={search} onSearch={onSearch} required/><button className="module-primary">Save changes</button></form>}
    <h3>Manage players</h3><form className="sports-inline-form" onSubmit={onAddPlayer}><StudentSelect label="Add active student" value={newPlayerId} onChange={setNewPlayerId} students={students} search={search} onSearch={onSearch}/><Field label="Position / role" value={position} onChange={setPosition}/><button className="module-primary" disabled={busy}><Plus size={14}/> Add player</button></form>
    <div className="sports-record-list">{team.members.map((member) => <article className="sports-record-row" key={member.studentId}><div className="module-row-body"><strong>{member.name} · {member.studentId}</strong><span>{member.department} · {member.semester} · {member.course}</span><span>{member.position} · {member.status} · Added {new Date(member.dateAdded).toLocaleDateString()}</span></div><PlayerStatus member={member} onChange={(status) => onMemberStatus(member, status)}/>{!['Captain', 'Vice-Captain'].includes(member.position) && <button onClick={() => onRemovePlayer(member)}>Remove</button>}</article>)}</div>
  </article>
}

function SportEditor({ sport, busy, onSave, onCancel }) {
  const [fields, setFields] = useState({ title: sport.title, description: sport.description, rules: sport.rules || '' })
  return <form className="sports-inline-form" onSubmit={(event) => { event.preventDefault(); onSave(fields) }}><Field label="Name" value={fields.title} onChange={(title) => setFields({ ...fields, title })} required/><Field label="Description" value={fields.description} onChange={(description) => setFields({ ...fields, description })} required/><Field label="Rules" value={fields.rules} onChange={(rules) => setFields({ ...fields, rules })}/><button disabled={busy}>Save</button><button type="button" onClick={onCancel}>Cancel</button></form>
}

function SportsEventsSection({ data, sports, busy, onCreate, onSave }) {
  const [fields, setFields] = useState({ ...emptyEvent })
  const [timeError, setTimeError] = useState('')
  async function choosePoster(file, update) {
    if (!file) return update((current) => ({ ...current, eventImage: '' }))
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) {
      return update((current) => ({ ...current, posterError: 'Choose a PNG, JPEG, or WebP event poster under 1 MB.' }))
    }
    try {
      const eventImage = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('The event poster could not be read.'))
        reader.readAsDataURL(file)
      })
      update((current) => ({ ...current, eventImage, posterError: '' }))
    } catch (reason) { update((current) => ({ ...current, posterError: reason.message })) }
  }
  async function create(event) {
    event.preventDefault()
    const { posterError, ...eventFields } = fields
    if (posterError) return
    let payload
    try { payload = normalizeSportsEventContract(eventFields) } catch (reason) {
      setTimeError(reason.message)
      return
    }
    setTimeError('')
    if (await onCreate({ ...payload, maxParticipants: Number(eventFields.maxParticipants) || 0 })) setFields({ ...emptyEvent })
  }
  const update = (key, value) => setFields((current) => ({ ...current, [key]: value }))
  const typeLabel = (value) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
  return <section className="sports-management-panel">
    <Heading title="Sports Events" detail="Create, publish, and manage sports tournaments, matches, trials, and training sessions."/>
    <form className="sports-form-grid" onSubmit={create}>
      <Field label="Event name" value={fields.name} onChange={(value) => update('name', value)} required/>
      <Select label="Sport" value={fields.sportId} onChange={(value) => setFields((current) => ({ ...current, sportId: value, audienceId: '' }))} options={sports.map((sport) => [sport.id, sport.title])} required/>
      <Select label="Event type" value={fields.kind} onChange={(value) => update('kind', value)} options={SPORTS_EVENT_TYPES.map((value) => [value, typeLabel(value)])}/>
      <Field label="Date" type="date" value={fields.date} onChange={(value) => update('date', value)} required/>
      <TimePicker label="Start time" value={fields.startTime} onChange={(value) => update('startTime', value)} required/>
      <TimePicker label="End time" value={fields.endTime} onChange={(value) => update('endTime', value)} required/>
      <Field label="Venue" value={fields.venue} onChange={(value) => update('venue', value)} required/>
      <Select label="Registration Required?" value={String(fields.registrationRequired !== false)} onChange={(value) => update('registrationRequired', value === 'true')} options={ [['true', 'Yes'], ['false', 'No']] }/>
      <Field label="Registration deadline" type="date" value={fields.registrationDeadline} onChange={(value) => update('registrationDeadline', value)} required={fields.registrationRequired !== false} disabled={fields.registrationRequired === false}/>
      <Field label="Maximum participants (optional)" type="number" min="0" value={fields.maxParticipants} onChange={(value) => update('maxParticipants', value)}/>
      <Field label="Eligibility" value={fields.eligibility} onChange={(value) => update('eligibility', value)} required/>
      <DepartmentPicker value={fields.eligibleDepartments} onChange={(value) => update('eligibleDepartments', value)}/>
      <Field label="Description" value={fields.description} onChange={(value) => update('description', value)} required/>
      <Field label="Instructions" value={fields.instructions} onChange={(value) => update('instructions', value)}/>
      <label className="sports-field">Event image / poster (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => choosePoster(event.target.files?.[0], setFields)}/>{fields.posterError && <small role="alert">{fields.posterError}</small>}{fields.eventImage && <img className="sports-event-poster-preview" src={fields.eventImage} alt="Sports event poster preview"/>}</label>
      <Select label="Notification audience" value={fields.audienceType} onChange={(value) => setFields((current) => ({ ...current, audienceType: value, audienceId: '' }))} options={SPORTS_NOTIFICATION_AUDIENCES.map((value) => [value, SPORTS_NOTIFICATION_AUDIENCE_LABELS[value]])}/>
      {fields.audienceType === 'TEAM' && <Select label="Audience team" value={fields.audienceId} onChange={(value) => update('audienceId', value)} options={data.teams.filter((team) => team.status === 'ACTIVE' && team.sportId === fields.sportId).map((team) => [team.id, team.name])} required/>}
      <Select label="Status" value={fields.status} onChange={(value) => update('status', value)} options={SPORTS_EVENT_STATUSES.map((value) => [value, SPORTS_EVENT_STATUS_LABELS[value]])}/>
      {timeError && <p className="sports-form-error" role="alert">{timeError}</p>}
      <button className="module-primary" disabled={busy || Boolean(fields.posterError)}><Plus size={14}/> Create Sports Event</button>
    </form>
    <div className="sports-record-list">{data.events.map((event) => <EventRow key={event.id} event={event} sports={sports} teams={data.teams} registrations={data.registrations.filter((registration) => registration.eventId === event.id)} busy={busy} onSave={(patch) => onSave(event, patch)} onPoster={(file, updateFields) => choosePoster(file, updateFields)}/>)}</div>
  </section>
}

function EventRow({ event, sports, teams, registrations, busy, onSave, onPoster }) {
  const [editing, setEditing] = useState(false)
  const [timeError, setTimeError] = useState('')
  const [fields, setFields] = useState(() => eventFormFields(event))
  useEffect(() => {
    if (!editing) setFields(eventFormFields(event))
  }, [editing, event])
  const update = (key, value) => setFields((current) => ({ ...current, [key]: value }))
  async function save(submitEvent) {
    submitEvent.preventDefault()
    let payload
    try { payload = normalizeSportsEventContract(fields) } catch (reason) {
      setTimeError(reason.message)
      return
    }
    setTimeError('')
    if (await onSave(payload)) setEditing(false)
  }
  return <article className="sports-record-row">
    <div className="module-row-body">
      <span className="sports-record-kind">{event.kind} · {event.sportName} · {SPORTS_EVENT_STATUS_LABELS[event.status] || event.status}</span>
      <strong>{event.name}</strong>
      <span>{event.date} · {formatSportsTime(event.startTime || event.time)}{event.endTime && `–${formatSportsTime(event.endTime)}`} · {event.venue} · Deadline {event.registrationDeadline}</span>
      <span>{event.description}</span>
      <span>{registrations.length} registration{registrations.length === 1 ? '' : 's'}</span>
      {registrations.map((registration) => <small key={registration.id}>{registration.studentName} · {registration.studentId} · {registration.status}</small>)}
      {event.eventImage && <img className="sports-event-poster-preview" src={event.eventImage} alt={`${event.name} poster`}/>}
    </div>
    {editing ? <form className="sports-inline-form" onSubmit={save}>
      <Field label="Event name" value={fields.name} onChange={(value) => update('name', value)} required/>
      <Select label="Sport" value={fields.sportId} onChange={(value) => update('sportId', value)} options={sports.map((sport) => [sport.id, sport.title])}/>
      <Select label="Type" value={fields.kind} onChange={(value) => update('kind', value)} options={SPORTS_EVENT_TYPES.map((value) => [value, value.replaceAll('_', ' ')])}/>
      <Field label="Date" type="date" value={fields.date} onChange={(value) => update('date', value)} required/>
      <TimePicker label="Start time" value={fields.startTime} onChange={(value) => update('startTime', value)} required/>
      <TimePicker label="End time" value={fields.endTime} onChange={(value) => update('endTime', value)} required/>
      <Field label="Venue" value={fields.venue} onChange={(value) => update('venue', value)} required/>
      <Select label="Registration Required?" value={String(fields.registrationRequired !== false)} onChange={(value) => update('registrationRequired', value === 'true')} options={ [['true', 'Yes'], ['false', 'No']] }/>
      <Field label="Registration deadline" type="date" value={fields.registrationDeadline} onChange={(value) => update('registrationDeadline', value)} required={fields.registrationRequired !== false} disabled={fields.registrationRequired === false}/>
      <Field label="Maximum participants" type="number" min="0" value={fields.maxParticipants} onChange={(value) => update('maxParticipants', Number(value))}/>
      <Field label="Eligibility" value={fields.eligibility} onChange={(value) => update('eligibility', value)} required/>
      <DepartmentPicker value={fields.eligibleDepartments} onChange={(value) => update('eligibleDepartments', value)}/>
      <Field label="Description" value={fields.description} onChange={(value) => update('description', value)} required/>
      <Field label="Instructions" value={fields.instructions || ''} onChange={(value) => update('instructions', value)}/>
      <label className="sports-field">Event image / poster<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(input) => onPoster(input.target.files?.[0], setFields)}/></label>
      <Select label="Notification audience" value={fields.audienceType} onChange={(value) => update('audienceType', value)} options={SPORTS_NOTIFICATION_AUDIENCES.map((value) => [value, SPORTS_NOTIFICATION_AUDIENCE_LABELS[value]])}/>
      {fields.audienceType === 'TEAM' && <Select label="Audience team" value={fields.audienceId} onChange={(value) => update('audienceId', value)} options={teams.filter((team) => team.status === 'ACTIVE' && team.sportId === fields.sportId).map((team) => [team.id, team.name])}/>}
      {timeError && <p className="sports-form-error" role="alert">{timeError}</p>}
      <button className="module-primary" disabled={busy}>Save event</button><button type="button" onClick={() => setEditing(false)}>Cancel</button>
    </form> : <div className="sports-action-row">
      <button onClick={() => setEditing(true)}>Edit details</button>
      {!SPORTS_EVENT_STATUSES.slice(1).includes(event.status) && <button disabled={busy} onClick={() => onSave({ status: SPORTS_EVENT_STATUS.PUBLISHED })}>Publish</button>}
      {event.status !== SPORTS_EVENT_STATUS.CANCELLED && <button disabled={busy} onClick={() => onSave({ status: SPORTS_EVENT_STATUS.CANCELLED })}>Cancel event</button>}
      <Select label={`Status for ${event.name}`} value={event.status} onChange={(status) => onSave({ status })} options={SPORTS_EVENT_STATUSES.map((status) => [status, SPORTS_EVENT_STATUS_LABELS[status]])}/>
    </div>}
  </article>
}

function eventFormFields(event) {
  return {
    ...emptyEvent,
    ...event,
    startTime: event.startTime || event.time || '',
    endTime: event.endTime || '',
    maxParticipants: event.maxParticipants || '',
    eligibleDepartments: event.eligibleDepartments || [],
    audienceType: event.audienceType || SPORTS_EVENT_DEFAULT_AUDIENCE,
    audienceId: event.audienceId || '',
  }
}

export function SportsEventFields({ values, onChange, sports }) {
  const update = (key, value) => onChange({ [key]: value })
  const departments = SPORTS_DEPARTMENT_OPTIONS.map((department) => [
    department,
    department === 'B.Tech' ? 'BTech' : department,
  ])
  return <>
    <Field label="Event name" value={values.name} onChange={(name) => update('name', name)} required/>
    <Select label="Sport" value={values.sportId} onChange={(sportId) => update('sportId', sportId)} options={sports.map((sport) => [sport.id, sport.title])} required/>
    <Select label="Type" value={values.kind} onChange={(kind) => update('kind', kind)} options={SPORTS_EVENT_TYPES.map((kind) => [kind, kind])}/>
    <Field label="Date" type="date" value={values.date} onChange={(date) => update('date', date)} required/>
    <label className="sports-field">Time<input type="time" step="60" lang="en-GB" required value={values.startTime || values.time || ''} onChange={(event) => update('time', event.target.value)}/></label>
    <p className="sports-empty">Dates and times are stored without automatic timezone conversion.</p>
    <Field label="Venue" value={values.venue} onChange={(venue) => update('venue', venue)} required/>
    <Select label="Registration Required?" value={String(values.registrationRequired !== false)} onChange={(required) => update('registrationRequired', required === 'true')} options={ [['true', 'Yes'], ['false', 'No']] }/>
    <label className="sports-field">Registration deadline<input type="date" disabled={values.registrationRequired === false} required={values.registrationRequired !== false} value={values.registrationDeadline || ''} onChange={(event) => update('registrationDeadline', event.target.value)}/></label>
    <Field label="Maximum participants (0 = unlimited)" type="number" min="0" value={values.maxParticipants} onChange={(maxParticipants) => update('maxParticipants', maxParticipants)}/>
    <Field label="Eligibility" value={values.eligibility} onChange={(eligibility) => update('eligibility', eligibility)}/>
    <Select label="Eligible departments (optional)" value={values.eligibleDepartments || []} onChange={(eligibleDepartments) => update('eligibleDepartments', eligibleDepartments)} options={departments} multiple/>
    <Field label="Description" value={values.description} onChange={(description) => update('description', description)} required/>
  </>
}

function ScheduleList({ schedules, sports, teams, events, onSave }) {
  if (!schedules.length) return <p className="sports-empty">No schedules yet.</p>
  return <div className="sports-record-list">{schedules.map((schedule) => <ScheduleRow key={schedule.id} schedule={schedule} sports={sports} teams={teams} events={events} onSave={(patch) => onSave(schedule, patch)}/>)}</div>
}

function ScheduleRow({ schedule, sports, teams, events, onSave }) {
  const [editing, setEditing] = useState(false)
  const [fields, setFields] = useState({ title: schedule.title, sportId: schedule.sportId, teamId: schedule.teamId || '', eventId: schedule.eventId || '', kind: schedule.kind, date: schedule.date, time: schedule.time, venue: schedule.venue, opponent: schedule.opponent || '', instructions: schedule.instructions || '' })
  return <article className="sports-record-row"><div className="module-row-body"><span className="sports-record-kind">{schedule.kind} · {schedule.sportName}</span><strong>{schedule.title}</strong><span>{schedule.date} · {schedule.time} · {schedule.venue}{schedule.opponent && ` · vs ${schedule.opponent}`}</span><span>{schedule.instructions}</span></div>{editing ? <form className="sports-inline-form" onSubmit={async (event) => { event.preventDefault(); if (await onSave(fields)) setEditing(false) }}><Field label="Schedule name" value={fields.title} onChange={(title) => setFields({ ...fields, title })} required/><Select label="Sport" value={fields.sportId} onChange={(sportId) => setFields({ ...fields, sportId, teamId: '', eventId: '' })} options={sports.map((sport) => [sport.id, sport.title])}/><Select label="Type" value={fields.kind} onChange={(kind) => setFields({ ...fields, kind })} options={['MATCH', 'PRACTICE', 'EVENT'].map((value) => [value, value])}/><Select label="Team" value={fields.teamId} onChange={(teamId) => setFields({ ...fields, teamId })} options={teams.filter((team) => team.sportId === fields.sportId).map((team) => [team.id, team.name])}/><Select label="Linked event" value={fields.eventId} onChange={(eventId) => setFields({ ...fields, eventId })} options={events.filter((entry) => entry.sportId === fields.sportId).map((entry) => [entry.id, entry.name])}/><Field label="Opponent" value={fields.opponent} onChange={(opponent) => setFields({ ...fields, opponent })}/><Field label="Date" type="date" value={fields.date} onChange={(date) => setFields({ ...fields, date })} required/><Field label="Time" type="time" value={fields.time} onChange={(time) => setFields({ ...fields, time })} required/><Field label="Venue" value={fields.venue} onChange={(venue) => setFields({ ...fields, venue })} required/><Field label="Instructions" value={fields.instructions} onChange={(instructions) => setFields({ ...fields, instructions })}/><button className="module-primary">Save schedule</button></form> : <button onClick={() => setEditing(true)}>Edit schedule</button>}</article>
}

function AchievementList({ achievements, sports, teams, students, search, onSearch, onSave }) {
  if (!achievements.length) return <p className="sports-empty">No achievements recorded.</p>
  return <div className="sports-record-list">{achievements.map((achievement) => <AchievementRow key={achievement.id} achievement={achievement} sports={sports} teams={teams} students={students} search={search} onSearch={onSearch} onSave={(patch) => onSave(achievement, patch)}/>)}</div>
}

function AchievementRow({ achievement, sports, teams, students, search, onSearch, onSave }) {
  const [editing, setEditing] = useState(false)
  const [fields, setFields] = useState({ studentId: achievement.studentId, teamId: achievement.teamId || '', sportId: achievement.sportId, competition: achievement.competition, position: achievement.position, year: String(achievement.year), achievement: achievement.achievement, certificateUrl: achievement.certificateUrl || '' })
  return <article className="sports-record-row"><div className="module-row-body"><span className="sports-record-kind">{achievement.sportName} · {achievement.year}</span><strong>{achievement.studentName} · {achievement.competition}</strong><span>{achievement.position} · {achievement.achievement}</span></div>{editing ? <form className="sports-inline-form" onSubmit={async (event) => { event.preventDefault(); if (await onSave({ ...fields, year: Number(fields.year) })) setEditing(false) }}><StudentSelect label="Student" value={fields.studentId} onChange={(studentId) => setFields({ ...fields, studentId })} students={students} search={search} onSearch={onSearch} required/><Select label="Sport" value={fields.sportId} onChange={(sportId) => setFields({ ...fields, sportId })} options={sports.map((sport) => [sport.id, sport.title])}/><Select label="Team" value={fields.teamId} onChange={(teamId) => setFields({ ...fields, teamId })} options={teams.map((team) => [team.id, team.name])}/><Field label="Competition" value={fields.competition} onChange={(competition) => setFields({ ...fields, competition })} required/><Field label="Position" value={fields.position} onChange={(position) => setFields({ ...fields, position })} required/><Field label="Year" type="number" min="1900" max="2100" value={fields.year} onChange={(year) => setFields({ ...fields, year })} required/><Field label="Achievement" value={fields.achievement} onChange={(achievement) => setFields({ ...fields, achievement })} required/><Field label="Certificate URL" value={fields.certificateUrl} onChange={(certificateUrl) => setFields({ ...fields, certificateUrl })}/><button className="module-primary">Save achievement</button></form> : <button onClick={() => setEditing(true)}>Edit achievement</button>}</article>
}

function StudentSelect({ label, value, onChange, students, search, onSearch, required }) {
  return <label className="sports-field">{label}<input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search name, ID, department or semester" autoComplete="off"/><select value={value} onChange={(event) => onChange(event.target.value)} required={required}><option value="">Choose an active student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.id} · {student.department} · {student.semester}</option>)}</select></label>
}

function TimePicker({ label, value, onChange, required = false }) {
  const [parts, setParts] = useState(() => sportsTimeParts(value))
  useEffect(() => setParts(sportsTimeParts(value)), [value])
  function updatePart(key, partValue) {
    const next = { ...parts, [key]: partValue }
    setParts(next)
    if (next.hour && next.minute && next.period) {
      const hour = Number(next.hour) % 12 + (next.period === 'PM' ? 12 : 0)
      onChange(normalizeSportsTime(`${String(hour).padStart(2, '0')}:${next.minute}`))
    } else onChange('')
  }
  return <fieldset className="sports-field sports-time-picker">
    <legend>{label}</legend>
    <div className="sports-time-picker-controls">
      <select aria-label={`${label} hour`} value={parts.hour} onChange={(event) => updatePart('hour', event.target.value)} required={required}>
        <option value="">Hour</option>{Array.from({ length: 12 }, (_, index) => String(index + 1)).map((hour) => <option key={hour} value={hour}>{hour}</option>)}
      </select><span aria-hidden="true">:</span>
      <select aria-label={`${label} minute`} value={parts.minute} onChange={(event) => updatePart('minute', event.target.value)} required={required}>
        <option value="">Minute</option>{SPORTS_TIME_MINUTES.map((minute) => <option key={minute} value={minute}>{minute}</option>)}
      </select>
      <select aria-label={`${label} AM or PM`} value={parts.period} onChange={(event) => updatePart('period', event.target.value)} required={required}>
        <option value="">AM/PM</option><option value="AM">AM</option><option value="PM">PM</option>
      </select>
    </div>
  </fieldset>
}

function sportsTimeParts(value) {
  if (!value) return { hour: '', minute: '', period: '' }
  const normalized = normalizeSportsTime(value)
  const match24 = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (match24) {
    const hour = Number(match24[1])
    return { hour: String((hour + 11) % 12 + 1), minute: match24[2], period: hour >= 12 ? 'PM' : 'AM' }
  }
  return { hour: '', minute: '', period: '' }
}

function DepartmentPicker({ value = [], onChange }) {
  const selected = normalizeSportsDepartments(value)
  const invalidDepartments = Array.isArray(value) ? value.filter((entry) => !normalizeSportsDepartments([entry]).length) : []
  const allSelected = !Array.isArray(value) || value.length === 0 || value.includes(ALL_DEPARTMENTS)
  function toggle(department) {
    onChange(selected.includes(department)
      ? selected.filter((entry) => entry !== department)
      : [...selected, department])
  }
  return <fieldset className="sports-field sports-department-picker">
    <legend>Eligible departments</legend>
    {SPORTS_DEPARTMENT_OPTIONS.map((department) => department === ALL_DEPARTMENTS
      ? <label key={department}><input type="checkbox" checked={allSelected} onChange={() => onChange([])}/> {department}</label>
      : <label key={department}>
        <input type="checkbox" checked={selected.includes(department)} onChange={() => toggle(department)}/>
        {department}
      </label>)}
    {invalidDepartments.length > 0 && <small role="alert">This saved event has legacy department values ({invalidDepartments.join(', ')}). Select the intended departments or {ALL_DEPARTMENTS} before saving.</small>}
  </fieldset>
}

function Field({ label, value, onChange, type = 'text', ...props }) {
  return <label className="sports-field">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} {...props}/></label>
}

function Select({ label, value, onChange, options, multiple = false, disabled = false, ...props }) {
  return <label className="sports-field">{label}<select value={value} multiple={multiple} disabled={disabled} onChange={(event) => onChange(multiple ? [...event.target.selectedOptions].map((option) => option.value) : event.target.value)} {...props}>{!multiple && <option value="">Choose…</option>}{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
}

function Heading({ title, detail }) { return <div className="management-heading"><div><span className="section-eyebrow">SPORTS MANAGEMENT</span><h2>{title}</h2><p>{detail}</p></div></div> }

function RecordList({ records, empty }) {
  if (!records.length) return <p className="sports-empty">{empty}</p>
  return <div className="sports-record-list">{records.map((record) => <article className="sports-record-row" key={record.id}><div className="module-row-body"><span className="sports-record-kind">{record.type || record.kind || record.status || record.competition || record.audienceType || 'Sports update'}</span><strong>{record.title || record.name || record.eventName || record.competition || record.studentName}</strong><span>{[record.createdAt && new Date(record.createdAt).toLocaleString(), record.date, record.time, record.venue, record.instructions, record.description, record.achievement, record.score && `Score: ${record.score}`, record.status].filter(Boolean).join(' · ')}</span></div></article>)}</div>
}

function PlayerStatus({ member, onChange }) { return <select aria-label={`${member.name} player status`} value={member.status} disabled={['Captain', 'Vice-Captain'].includes(member.position)} onChange={(event) => onChange(event.target.value)}><option>ACTIVE</option><option>INACTIVE</option></select> }
function TeamStatus({ value, onChange }) { return <select aria-label="Team status" value={value} onChange={(event) => onChange({ status: event.target.value })}><option>ACTIVE</option><option>INACTIVE</option><option>ARCHIVED</option></select> }
