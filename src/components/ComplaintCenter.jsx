import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ClipboardList, Clock3, ImagePlus, MessageCircle, Plus, Send, ShieldAlert, X } from 'lucide-react'
import { api } from '../api/client'

const CATEGORIES = [
  'Cleanliness', 'Electrical', 'Water', 'Hostel', 'Classroom', 'Canteen/Mess',
  'Sports', 'Transport', 'Infrastructure', 'Security', 'IT/Technical', 'Other',
]
const STATUSES = ['SUBMITTED', 'ACCEPTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED']
const MANAGER_ROLES = ['Staff', 'HOD', 'Sports Captain', 'Administration']
const LABELS = {
  SUBMITTED: 'Submitted', ACCEPTED: 'Accepted', IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved', REJECTED: 'Rejected',
}

export default function ComplaintCenter({ user, initialComplaintId = '', initialCategory = '', initialOpen = false, onNotify }) {
  const [complaints, setComplaints] = useState([])
  const [counts, setCounts] = useState({})
  const [categories, setCategories] = useState(CATEGORIES)
  const [staffUsers, setStaffUsers] = useState([])
  const [selectedId, setSelectedId] = useState(initialComplaintId)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({ status: '', category: '', department: '', role: '', date: '' })
  const [formOpen, setFormOpen] = useState(initialOpen)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(initialCategory || CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const submissionKey = useRef('')
  const isManager = MANAGER_ROLES.includes(user.role)

  useEffect(() => {
    setSelectedId(initialComplaintId)
  }, [initialComplaintId])

  useEffect(() => {
    if (!initialCategory) return
    if (CATEGORIES.includes(initialCategory)) setCategory(initialCategory)
    setFormOpen(initialOpen)
  }, [initialCategory, initialOpen])

  useEffect(() => {
    if (user.role !== 'Administration') return undefined
    let active = true
    api('/api/users')
      .then((result) => { if (active) setStaffUsers(result.users.filter((candidate) => candidate.role === 'Staff' && candidate.active)) })
      .catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [user.role])

  useEffect(() => {
    if (!photo) { setPreview(''); return undefined }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const query = useMemo(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
    return params.toString()
  }, [filters])

  async function loadComplaints() {
    const result = await api(`/api/complaints${query ? `?${query}` : ''}`)
    setComplaints(result.complaints)
    setCounts(result.counts)
    setCategories(result.categories?.length ? result.categories : CATEGORIES)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api(`/api/complaints${query ? `?${query}` : ''}`)
      .then((result) => {
        if (!active) return
        setComplaints(result.complaints)
        setCounts(result.counts)
        setCategories(result.categories?.length ? result.categories : CATEGORIES)
      })
      .catch((reason) => { if (active) setError(reason.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [query])

  useEffect(() => {
    if (!selectedId) { setSelected(null); return undefined }
    let active = true
    api(`/api/complaints/${encodeURIComponent(selectedId)}`)
      .then((result) => { if (active) { setSelected(result.complaint); setError('') } })
      .catch((reason) => { if (active) { setSelected(null); setError(reason.message) } })
    return () => { active = false }
  }, [selectedId])

  function selectPhoto(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) {
      setError('Choose a PNG, JPEG, or WebP image under 1 MB.')
      event.target.value = ''
      return
    }
    setError('')
    setPhoto(file)
  }

  async function submitComplaint(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setConfirmation('')
    if (!submissionKey.current) submissionKey.current = globalThis.crypto.randomUUID()
    try {
      const image = photo ? await readAsDataUrl(photo) : null
      const result = await api('/api/complaints', {
        method: 'POST',
        body: { title, category, description, photo: image, submissionKey: submissionKey.current },
      })
      setTitle('')
      setCategory(CATEGORIES[0])
      setDescription('')
      setPhoto(null)
      submissionKey.current = ''
      setFormOpen(false)
      setConfirmation('Complaint submitted successfully.')
      setSelectedId(result.complaint.id)
      await loadComplaints()
      onNotify('Complaint submitted successfully.')
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  async function changeStatus(status) {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const result = await api(`/api/complaints/${encodeURIComponent(selected.id)}`, { method: 'PATCH', body: { status } })
      setSelected(result.complaint)
      await loadComplaints()
      onNotify(`Complaint ${selected.id} · ${LABELS[status]}.`)
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  async function addNote(event) {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const result = await api(`/api/complaints/${encodeURIComponent(selected.id)}/notes`, { method: 'POST', body: { message: note } })
      setSelected(result.complaint)
      setNote('')
      await loadComplaints()
      onNotify('Official complaint update added.')
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  async function assignComplaint(assignedTo) {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const result = await api(`/api/complaints/${encodeURIComponent(selected.id)}`, { method: 'PATCH', body: { assignedTo } })
      setSelected(result.complaint)
      await loadComplaints()
      onNotify(assignedTo ? 'Complaint assigned to Staff.' : 'Complaint assignment removed.')
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  function canManage(complaint) {
    if (!isManager) return false
    if (user.role === 'Administration') return true
    if (user.role === 'HOD') return Boolean(user.department) && complaint.department === user.department
    if (user.role === 'Sports Captain') return complaint.category === 'Sports'
    if (user.role === 'Staff') {
      if (complaint.assignedTo && complaint.assignedTo.id !== user.id) return false
      return complaint.assignedTo?.id === user.id || Boolean(user.department) && complaint.department === user.department
    }
    return false
  }

  const selectedCanManage = selected ? canManage(selected) : false
  const nextActions = selectedCanManage ? ({
    SUBMITTED: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: ['IN_PROGRESS'],
    IN_PROGRESS: ['RESOLVED'],
  }[selected?.status] || []) : []

  return <div className="module-page page-enter complaint-center">
    <div className="module-breadcrumb">CAMPUS <span>›</span> SUPPORT & ISSUE TRACKING</div>
    <section className="module-hero complaint-hero">
      <div className="module-title-area"><span className="module-icon"><MessageCircle size={20}/></span><span className="module-eyebrow">A BETTER CAMPUS STARTS WITH YOUR VOICE</span><h1>Complaint & Issue Tracker<span className="module-title-period">.</span></h1><p>Submit an issue, follow its progress, and see official updates from campus teams.</p></div>
      {!selected && <button className="module-primary" onClick={() => { setFormOpen((open) => !open); setConfirmation(''); setError('') }}><Plus size={15}/>{formOpen ? 'Close form' : 'New Complaint'}</button>}
    </section>

    {confirmation && <div className="complaint-confirmation" role="status"><Check size={15}/>{confirmation}</div>}
    {error && <div className="management-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}

    {formOpen && !selected && <section className="complaint-form-card">
      <div className="management-heading"><div><span className="section-eyebrow">LINKED TO YOUR CAMPUS ACCOUNT</span><h2>Report a campus issue</h2></div><span className="complaint-private"><ShieldAlert size={14}/> Not anonymous</span></div>
      <p>Your official ID and department are attached automatically: <strong>{user.id}</strong> · {user.role}{user.department ? ` · ${user.department}` : ''}</p>
      <form className="complaint-form" onSubmit={submitComplaint}>
        <label>CATEGORY<select value={category} onChange={(event) => setCategory(event.target.value)} required>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>TITLE<input value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={120} placeholder="Briefly describe the issue" required/></label>
        <label>DESCRIPTION<textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={10} maxLength={5000} rows={5} placeholder="Share the details needed to investigate this issue" required/></label>
        <label className="complaint-upload">PHOTO (OPTIONAL)<span><ImagePlus size={16}/> Choose an image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectPhoto}/></span><small>PNG, JPEG or WebP · maximum 1 MB</small></label>
        {preview && <div className="complaint-preview"><img src={preview} alt="Complaint attachment preview"/><button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo"><X size={14}/></button></div>}
        <div className="complaint-form-actions"><button type="button" className="modal-cancel" onClick={() => setFormOpen(false)}>Cancel</button><button className="module-primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit Complaint'} <ArrowRight size={14}/></button></div>
      </form>
    </section>}

    {selected ? <section className="complaint-detail">
      <button className="complaint-back" onClick={() => { setSelectedId(''); setError('') }}><ArrowLeft size={15}/> My Complaints</button>
      <div className="complaint-detail-header"><div><span className="section-eyebrow">{selected.id} · {selected.category}</span><h2>{selected.title}</h2><span className="complaint-submitter">Submitted by {selected.submitterName} · {selected.submitterId} · {selected.submitterRole}{selected.department ? ` · ${selected.department}` : ''}</span></div><StatusBadge status={selected.status}/></div>
      <div className="complaint-detail-grid"><article className="complaint-description"><div><span className="section-eyebrow">COMPLAINT DETAILS</span><time>{new Date(selected.createdAt).toLocaleString()}</time></div><p>{selected.description}</p>{selected.photoUrl && <a className="complaint-photo-link" href={selected.photoUrl} target="_blank" rel="noreferrer"><img src={selected.photoUrl} alt={`Attachment for ${selected.id}`}/><span>View full-size attachment</span></a>}
        <div className="complaint-assignment"><span>Assigned to</span>{user.role === 'Administration' ? <select aria-label="Assign complaint to Staff" value={selected.assignedTo?.id || ''} disabled={saving} onChange={(event) => assignComplaint(event.target.value)}><option value="">Not assigned</option>{staffUsers.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.id}</option>)}</select> : <strong>{selected.assignedTo ? `${selected.assignedTo.name} · ${selected.assignedTo.id}` : 'Not assigned'}</strong>}{selected.handledBy && <><span>Last handled by</span><strong>{selected.handledBy.name} · {selected.handledBy.role}</strong></>}</div>
      </article>
      <section className="complaint-activity"><div className="section-eyebrow">STATUS TIMELINE & OFFICIAL UPDATES</div><div className="complaint-status-track">{STATUSES.filter((status) => status !== 'REJECTED').map((status) => <span className={`complaint-track-step ${isStatusComplete(selected, status) ? 'step-complete' : ''} ${selected.status === status ? 'step-current' : ''}`} key={status}><i>{isStatusComplete(selected, status) ? '✓' : ''}</i>{LABELS[status]}</span>)}{selected.status === 'REJECTED' && <span className="complaint-track-step step-rejected"><i>×</i>Rejected</span>}</div>
        <div className="complaint-activity-list">{selected.activity.map((entry) => <article className="complaint-activity-item" key={entry.id}><span className={`complaint-activity-icon ${entry.type === 'note' ? 'activity-note' : ''}`}>{entry.type === 'note' ? <MessageCircle size={13}/> : entry.type === 'status' ? <Check size={13}/> : <ClipboardList size={13}/>}</span><div><strong>{entry.message}</strong><span>{entry.authorName} · {entry.authorId} · {entry.authorRole}</span><time><Clock3 size={12}/>{new Date(entry.createdAt).toLocaleString()}</time></div></article>)}</div>
        {nextActions.length > 0 && <div className="complaint-manager-actions">{nextActions.map((status) => <button className={status === 'REJECTED' ? 'complaint-reject' : 'module-primary'} key={status} disabled={saving} onClick={() => changeStatus(status)}>{status === 'ACCEPTED' ? 'Accept complaint' : status === 'REJECTED' ? 'Reject' : status === 'IN_PROGRESS' ? 'Mark In Progress' : 'Mark Resolved'}</button>)}</div>}
        {selectedCanManage && <form className="complaint-note-form" onSubmit={addNote}><label htmlFor="official-complaint-note">OFFICIAL REPLY / PROGRESS UPDATE</label><textarea id="official-complaint-note" value={note} onChange={(event) => setNote(event.target.value)} minLength={2} maxLength={2000} rows={3} placeholder="Share an official reply or work-progress update…" required/><button className="module-primary" disabled={saving || !note.trim()}>{saving ? 'Saving…' : 'Add official update'} <Send size={13}/></button></form>}
      </section></div>
    </section> : <>
      {isManager && <section className="complaint-stat-grid">{STATUSES.map((status) => <div className="complaint-stat" key={status}><span>{LABELS[status]}</span><strong>{counts[status] || 0}</strong></div>)}</section>}
      {isManager && <section className="complaint-filters">
        <label>Status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option>{STATUSES.map((status) => <option value={status} key={status}>{LABELS[status]}</option>)}</select></label>
        <label>Category<select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Date<input type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}/></label>
        {user.role === 'Administration' && <><label>Department<select value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}><option value="">All departments</option>{['Computer Science', 'Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering', 'Business Administration', 'Pharmacy'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Submitter role<select value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))}><option value="">All roles</option>{['Student', 'Staff', 'HOD', 'Sports Captain', 'Administration'].map((item) => <option key={item}>{item}</option>)}</select></label></>}
      </section>}
      <section className="complaint-list-section"><div className="management-heading"><div><span className="section-eyebrow">{isManager ? 'AUTHORIZED COMPLAINT QUEUE' : 'PRIVATE TO YOUR ACCOUNT'}</span><h2>My Complaints</h2></div><span className="results-count">{complaints.length} {complaints.length === 1 ? 'complaint' : 'complaints'}</span></div>
        {loading ? <div className="management-state"><span className="loading-spinner"/>Loading complaints…</div> : complaints.length ? <div className="complaint-card-list">{complaints.map((complaint) => <article className="complaint-card" key={complaint.id}>
          {complaint.photoUrl && <img className="complaint-card-photo" src={complaint.photoUrl} alt="Complaint attachment"/>}
          <div className="complaint-card-main"><span className="section-eyebrow">{complaint.id} · {complaint.category}</span><h3>{complaint.title}</h3><p>{complaint.description}</p><span className="complaint-card-meta">{complaint.submitterId} · {new Date(complaint.createdAt).toLocaleString()} · Updated {new Date(complaint.lastUpdatedAt).toLocaleString()}</span></div>
          <div className="complaint-card-actions"><StatusBadge status={complaint.status}/><button className="complaint-view-button" onClick={() => setSelectedId(complaint.id)}>View Details <ArrowRight size={13}/></button></div>
        </article>)}</div> : <div className="management-state">{isManager ? 'There are no complaints in your authorized scope.' : 'You have not submitted a complaint yet.'}</div>}
      </section>
    </>}
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Updates are recorded in your campus activity history</span><span>Campus One · Complaint tracking</span></footer>
  </div>
}

function StatusBadge({ status }) {
  return <span className={`complaint-status-badge complaint-status-${status.toLowerCase().replaceAll('_', '-')}`}><i/>{LABELS[status] || status}</span>
}

function isStatusComplete(complaint, status) {
  return complaint.activity.some((entry) => entry.type === 'status' && entry.status === status)
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The selected image could not be read.'))
    reader.onerror = () => reject(new Error('The selected image could not be read.'))
    reader.readAsDataURL(file)
  })
}
