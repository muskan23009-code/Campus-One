import { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, ExternalLink, FileText, Megaphone, Pin, Search, ShieldAlert, X } from 'lucide-react'
import { api } from '../api/client'

const priorityOptions = ['Normal', 'Important', 'Urgent']
const audienceOptions = {
  Administration: [
    ['EVERYONE', 'Everyone'], ['STUDENTS', 'Students'], ['STAFF', 'Staff'], ['HODS', 'HODs'],
    ['ROLE', 'Specific role'], ['DEPARTMENT', 'Specific department'], ['COURSE', 'Specific course'],
    ['SEMESTER', 'Specific semester / year'], ['PROFILE', 'Course + department + semester'],
    ['SPORTS', 'Sports students'], ['SPORT', 'Specific sport'], ['TEAM', 'Specific team'],
    ['EVENT', 'Specific event / trial'], ['HOSTEL', 'Specific hostel'],
  ],
  HOD: [['DEPARTMENT', 'My department'], ['COURSE', 'Course in my department'], ['SEMESTER', 'Semester in my department'], ['PROFILE', 'Course + department + semester']],
  Staff: [['DEPARTMENT', 'My department'], ['COURSE', 'Course in my department'], ['SEMESTER', 'Semester in my department'], ['PROFILE', 'Course + department + semester']],
  'Sports Captain': [['SPORTS', 'Sports students'], ['SPORT', 'Specific sport'], ['TEAM', 'Specific team'], ['EVENT', 'Specific event / trial'], ['ACTIVE', 'Selected / active participants']],
}
const roleOptions = ['Student', 'Staff', 'HOD', 'Sports Captain', 'Administration']
const categoryOptions = {
  Administration: ['Academic', 'Examination', 'Department', 'Events', 'Sports', 'Hostel', 'Transport', 'Canteen', 'Library', 'Emergency', 'General', 'Other'],
  HOD: ['Academic', 'Examination', 'Department'],
  Staff: ['Academic', 'Examination', 'Department'],
  'Sports Captain': ['Sports'],
}

function emptyDraft(user) {
  return {
    title: '', description: '', category: user.role === 'Sports Captain' ? 'Sports' : 'Academic',
    priority: 'Normal', pinned: false,
    target: { type: user.role === 'Administration' ? 'EVERYONE' : user.role === 'Sports Captain' ? 'SPORTS' : 'DEPARTMENT', department: user.department || '', course: '', semester: '', role: '', sportId: '', teamId: '', eventId: '', hostel: '' },
    publishAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    expiresAt: '', attachmentUrl: '', attachmentName: '',
  }
}

export default function NoticeBoard({ user, onNotify }) {
  const [notices, setNotices] = useState([])
  const [options, setOptions] = useState(null)
  const [draft, setDraft] = useState(() => emptyDraft(user))
  const [filter, setFilter] = useState('All')
  const [category, setCategory] = useState('All categories')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState(null)
  const [issuing, setIssuing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const result = await api('/api/notices')
    setNotices(result.notices)
  }

  useEffect(() => {
    let active = true
    Promise.all([
      api('/api/notices'),
      ['Administration', 'HOD', 'Staff', 'Sports Captain'].includes(user.role) ? api('/api/notices/options') : Promise.resolve(null),
    ]).then(([result, optionResult]) => {
      if (!active) return
      setNotices(result.notices)
      setOptions(optionResult?.options || null)
    }).catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [user.role])

  const filtered = useMemo(() => notices
    .filter((notice) => category === 'All categories' || notice.category === category)
    .filter((notice) => filter === 'All' || filter === 'Important' && (notice.important || notice.pinned) || filter === 'Unread' && !notice.isRead)
    .filter((notice) => `${notice.title} ${notice.description} ${notice.category} ${notice.issuerName} ${notice.issuerRole}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => Number(Boolean(right.pinned || right.important)) - Number(Boolean(left.pinned || left.important)) || Date.parse(right.publishAt || right.createdAt) - Date.parse(left.publishAt || left.createdAt)), [notices, category, filter, query])

  function updateTarget(key, value) {
    setDraft((current) => ({ ...current, target: { ...current.target, [key]: value } }))
  }

  async function openNotice(notice) {
    setError('')
    try {
      const result = await api(`/api/notices/${encodeURIComponent(notice.id)}`)
      setDetail(result.notice)
      if (!result.notice.isRead) {
        const read = await api(`/api/notices/${encodeURIComponent(notice.id)}/read`, { method: 'POST', body: {} })
        setDetail(read.notice)
        setNotices((current) => current.map((item) => item.id === notice.id ? { ...item, isRead: true, readAt: read.notice.readAt } : item))
      }
    } catch (reason) { setError(reason.message) }
  }

  async function issueNotice(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload = { ...draft, publishAt: new Date(draft.publishAt).toISOString(), expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : '' }
      const result = await api('/api/notices', { method: 'POST', body: payload })
      setNotices((current) => [result.notice, ...current])
      setDraft(emptyDraft(user))
      setIssuing(false)
      onNotify(`Notice published to ${result.recipientCount} matching campus user${result.recipientCount === 1 ? '' : 's'}.`)
      await load()
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  const isIssuer = ['Administration', 'HOD', 'Staff', 'Sports Captain'].includes(user.role)
  const categories = categoryOptions[user.role] || options?.categories || []
  const allowedAudiences = audienceOptions[user.role] || []
  const targetType = draft.target.type
  const targetSport = targetType === 'SPORT' || targetType === 'ACTIVE'
  const targetTeam = targetType === 'TEAM'
  const targetEvent = targetType === 'EVENT'
  const lockedDepartment = ['HOD', 'Staff'].includes(user.role)

  return <div className="module-page page-enter notice-board-page">
    <div className="module-breadcrumb">CAMPUS <span>›</span> NOTICES & ANNOUNCEMENTS</div>
    <section className="module-hero"><div className="module-title-area"><span className="module-icon"><Megaphone size={20}/></span><span className="module-eyebrow">CAMPUS INFORMATION</span><h1>Notices & Announcements<span className="module-title-period">.</span></h1><p>Official updates relevant to your campus role, department, and selected audiences.</p></div>{isIssuer && <button className="module-primary" onClick={() => { setIssuing(!issuing); setError('') }}>{issuing ? <X size={15}/> : <Megaphone size={15}/>} {issuing ? 'Close' : 'Issue Notice'}</button>}</section>
    {error && <div className="management-alert" role="alert"><ShieldAlert size={15}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
    {issuing && isIssuer && <form className="notice-compose-panel" onSubmit={issueNotice}>
      <div className="management-heading"><div><span className="section-eyebrow">AUTHORIZED PUBLISHING</span><h2>Issue a notice</h2></div></div>
      <div className="sports-form-grid">
        <label className="sports-field"><span>Notice title</span><input required minLength={3} maxLength={180} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/></label>
        <label className="sports-field"><span>Category</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value, target: event.target.value === 'Emergency' ? { ...draft.target, type: 'EVERYONE' } : draft.target })}>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="sports-field"><span>Priority</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>{priorityOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="sports-field"><span>Target audience</span><select value={targetType} onChange={(event) => setDraft({ ...draft, target: { ...draft.target, type: event.target.value, department: lockedDepartment ? user.department || '' : '' } })}>{allowedAudiences.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {['DEPARTMENT', 'COURSE', 'SEMESTER', 'PROFILE'].includes(targetType) && <label className="sports-field"><span>Department</span>{lockedDepartment ? <input value={user.department || ''} readOnly aria-label="Your department"/> : <select required value={draft.target.department} onChange={(event) => updateTarget('department', event.target.value)}><option value="">Select department</option>{(options?.departments || []).map((value) => <option key={value}>{value}</option>)}</select>}</label>}
        {['COURSE', 'PROFILE'].includes(targetType) && <label className="sports-field"><span>Course</span><input required={targetType === 'COURSE' || targetType === 'PROFILE'} value={draft.target.course} onChange={(event) => updateTarget('course', event.target.value)} placeholder="e.g. B.Tech"/></label>}
        {['SEMESTER', 'PROFILE'].includes(targetType) && <label className="sports-field"><span>Semester / year</span><input required value={draft.target.semester} onChange={(event) => updateTarget('semester', event.target.value)} placeholder="e.g. Semester 3"/></label>}
        {targetType === 'ROLE' && <label className="sports-field"><span>Role</span><select required value={draft.target.role} onChange={(event) => updateTarget('role', event.target.value)}><option value="">Select role</option>{roleOptions.map((value) => <option key={value}>{value}</option>)}</select></label>}
        {targetSport && <label className="sports-field"><span>Sport</span><select required value={draft.target.sportId} onChange={(event) => updateTarget('sportId', event.target.value)}><option value="">Select sport</option>{(options?.sports || []).map((sport) => <option key={sport.id} value={sport.id}>{sport.title}</option>)}</select></label>}
        {targetTeam && <label className="sports-field"><span>Team</span><select required value={draft.target.teamId} onChange={(event) => updateTarget('teamId', event.target.value)}><option value="">Select team</option>{(options?.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
        {targetEvent && <label className="sports-field"><span>Event / trial</span><select required value={draft.target.eventId} onChange={(event) => updateTarget('eventId', event.target.value)}><option value="">Select event</option>{(options?.events || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {targetType === 'HOSTEL' && <label className="sports-field"><span>Hostel name</span><input required value={draft.target.hostel} onChange={(event) => updateTarget('hostel', event.target.value)}/></label>}
        <label className="sports-field"><span>Publish date & time</span><input type="datetime-local" required value={draft.publishAt} onChange={(event) => setDraft({ ...draft, publishAt: event.target.value })}/></label>
        <label className="sports-field"><span>Expiry date & time (optional)</span><input type="datetime-local" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })}/></label>
        <label className="sports-field"><span>Attachment PDF URL (optional)</span><input type="url" placeholder="https://…" value={draft.attachmentUrl} onChange={(event) => setDraft({ ...draft, attachmentUrl: event.target.value })}/></label>
        {draft.attachmentUrl && <label className="sports-field"><span>Attachment name</span><input value={draft.attachmentName} onChange={(event) => setDraft({ ...draft, attachmentName: event.target.value })}/></label>}
        <label className="sports-field notice-description-field"><span>Description / content</span><textarea required minLength={3} maxLength={10000} rows="5" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })}/></label>
        <label className="notice-pin-option"><input type="checkbox" checked={draft.pinned} onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })}/> Pin as an important notice</label>
        <button className="module-primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish notice'}</button>
      </div>
      {['HOD', 'Staff'].includes(user.role) && <p className="sports-empty">Your audience is restricted to {user.department || 'your assigned department'}; broader campus audiences are not available.</p>}
      {user.role === 'Sports Captain' && <p className="sports-empty">Sports notices are delivered only to relevant sports applicants or active participants.</p>}
    </form>}
    <section className="notice-toolbar">
      <label className="notice-search"><Search size={16}/><input aria-label="Search notices" placeholder="Search notices…" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
      <label className="notice-category-filter"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{[...new Set(notices.map((notice) => notice.category).filter(Boolean))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
      <div className="sports-tabs" aria-label="Notice filters">{['All', 'Important', 'Unread'].map((value) => <button key={value} className={filter === value ? 'sports-tab-active' : ''} onClick={() => setFilter(value)}>{value}{value === 'Unread' ? ` (${notices.filter((notice) => !notice.isRead).length})` : ''}</button>)}</div>
    </section>
    {filtered.length ? <section className="notice-list">{filtered.map((notice) => <button className={`notice-card ${notice.isRead ? 'notice-read' : 'notice-unread'}`} key={notice.id} onClick={() => openNotice(notice)}>
      <span className={`notice-priority-mark ${notice.priority?.toLowerCase() || 'normal'}`}>{notice.pinned || notice.important ? <Pin size={15}/> : <Bell size={15}/>}</span>
      <span className="notice-card-main"><span className="notice-card-meta"><b>{notice.category || 'General'}</b><span>{notice.priority || 'Normal'}</span>{!notice.isRead && <i>UNREAD</i>}</span><strong>{notice.title}</strong><span className="notice-card-preview">{notice.description}</span><small><CalendarDays size={13}/>{new Date(notice.publishAt || notice.createdAt).toLocaleString()} · {notice.issuerName || 'Campus One'} · {notice.issuerRole || 'Administration'}</small></span>
    </button>)}</section> : <div className="management-state">{notices.length ? 'No notices match your search or filters.' : 'No notices are currently available to you.'}</div>}
    {detail && <div className="modal-backdrop notice-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null) }}><article className="notice-detail-modal" role="dialog" aria-modal="true" aria-labelledby="notice-detail-title"><header><div><span className="section-eyebrow">{detail.category} · {detail.priority}</span><h2 id="notice-detail-title">{detail.title}</h2></div><button className="icon-btn" aria-label="Close notice" onClick={() => setDetail(null)}><X size={18}/></button></header><p className="notice-issuer-line">Issued by {detail.issuerName} · {detail.issuerRole} · {new Date(detail.publishAt || detail.createdAt).toLocaleString()}</p><div className="notice-detail-content">{detail.description}</div>{detail.attachmentUrl && <a className="notice-attachment" href={detail.attachmentUrl} target="_blank" rel="noreferrer"><FileText size={16}/>{detail.attachmentName || 'View attached PDF'}<ExternalLink size={13}/></a>}<button className="module-primary" onClick={() => setDetail(null)}>Done</button></article></div>}
  </div>
}
