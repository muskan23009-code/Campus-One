import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Check, Clock3, ImagePlus, MapPin, PackageSearch,
  Plus, Search, Send, ShieldAlert, X,
} from 'lucide-react'
import { api } from '../api/client'

const CATEGORIES = [
  'ID Card', 'Mobile/Device', 'Books/Notes', 'Wallet/Bag', 'Keys', 'Clothing',
  'Accessories', 'Sports Equipment', 'Other',
]
const STATUSES = ['LOST', 'FOUND', 'MATCHED', 'CLAIM_REQUESTED', 'CLAIM_VERIFIED', 'RETURNED', 'CLOSED']
const STATUS_LABELS = {
  LOST: 'Lost', FOUND: 'Found', MATCHED: 'Matched', CLAIM_REQUESTED: 'Claim Requested',
  CLAIM_VERIFIED: 'Claim Verified', RETURNED: 'Returned', CLOSED: 'Closed',
  PENDING: 'Pending Review', VERIFIED: 'Verified', REJECTED: 'Rejected',
}
const MANAGER_ROLES = ['Staff', 'HOD', 'Sports Captain', 'Administration']

export default function LostFoundCenter({ user, initialReportId = '', onNotify }) {
  const [reports, setReports] = useState([])
  const [claimRequests, setClaimRequests] = useState([])
  const [counts, setCounts] = useState({})
  const [filters, setFilters] = useState({ q: '', type: '', status: '', category: '', date: '' })
  const [view, setView] = useState('search')
  const [selectedId, setSelectedId] = useState(initialReportId)
  const [selected, setSelected] = useState(null)
  const [reportType, setReportType] = useState('')
  const [itemName, setItemName] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [itemDate, setItemDate] = useState(new Date().toISOString().slice(0, 10))
  const [additionalDetails, setAdditionalDetails] = useState('')
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')
  const [claimDetails, setClaimDetails] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [categories, setCategories] = useState(CATEGORIES)
  const reportSubmissionKey = useRef('')
  const claimSubmissionKey = useRef('')

  const isManager = MANAGER_ROLES.includes(user.role)
  const query = useMemo(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
    if (view === 'mine') params.set('mine', '1')
    return params.toString()
  }, [filters, view])

  useEffect(() => {
    setSelectedId(initialReportId)
  }, [initialReportId])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api(`/api/lost-found${query ? `?${query}` : ''}`)
      .then((result) => {
        if (!active) return
        setReports(result.reports)
        setClaimRequests(result.claimRequests)
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
    api(`/api/lost-found/${encodeURIComponent(selectedId)}`)
      .then((result) => { if (active) { setSelected(result.report); setError('') } })
      .catch((reason) => { if (active) { setSelected(null); setError(reason.message) } })
    return () => { active = false }
  }, [selectedId])

  useEffect(() => {
    if (!photo) { setPreview(''); return undefined }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const myClaims = claimRequests.filter(({ claim }) => claim.claimantId === user.id)
  const visibleItems = view === 'claims'
    ? myClaims.map(({ report }) => reports.find((item) => item.id === report.id) || report).filter(Boolean)
    : reports
  const selectedCanManage = Boolean(selected && canManage(selected, user))
  const hasMyPendingClaim = selected?.claimRequests?.some((claim) => claim.claimantId === user.id && claim.status === 'PENDING')

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

  async function createReport(event) {
    event.preventDefault()
    if (!reportType) return
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const image = photo ? await readAsDataUrl(photo) : null
      if (!reportSubmissionKey.current) reportSubmissionKey.current = globalThis.crypto.randomUUID()
      const result = await api('/api/lost-found', {
        method: 'POST',
        body: {
          type: reportType, itemName, category, description, location, itemDate,
          additionalDetails, photo: image, submissionKey: reportSubmissionKey.current,
        },
      })
      reportSubmissionKey.current = ''
      setReportType('')
      setItemName('')
      setCategory(CATEGORIES[0])
      setDescription('')
      setLocation('')
      setItemDate(new Date().toISOString().slice(0, 10))
      setAdditionalDetails('')
      setPhoto(null)
      setSelectedId(result.report.id)
      setNotice(`${reportType === 'LOST' ? 'Lost' : 'Found'} item reported successfully. Report ID: ${result.report.id}`)
      await refreshReports()
      onNotify(`${reportType === 'LOST' ? 'Lost' : 'Found'} item reported · ${result.report.id}`)
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  async function refreshReports() {
    const result = await api(`/api/lost-found${query ? `?${query}` : ''}`)
    setReports(result.reports)
    setClaimRequests(result.claimRequests)
    setCounts(result.counts)
  }

  async function requestClaim(event) {
    event.preventDefault()
    if (!selected) return
    if (saving) return
    setSaving(true)
    setError('')
    try {
      if (!claimSubmissionKey.current) claimSubmissionKey.current = globalThis.crypto.randomUUID()
      const result = await api(`/api/lost-found/${encodeURIComponent(selected.id)}/claims`, {
        method: 'POST',
        body: { details: claimDetails, submissionKey: claimSubmissionKey.current },
      })
      claimSubmissionKey.current = ''
      setSelected(result.report)
      setClaimDetails('')
      await refreshReports()
      onNotify('Claim request submitted for review.')
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  async function reviewClaim(claim, decision) {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const result = await api(`/api/lost-found/${encodeURIComponent(selected.id)}/claims/${encodeURIComponent(claim.id)}`, {
        method: 'PATCH', body: { decision },
      })
      setSelected(result.report)
      await refreshReports()
      onNotify(decision === 'VERIFIED' ? 'Claim verified.' : 'Claim rejected.')
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  async function changeStatus(status) {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const result = await api(`/api/lost-found/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH', body: { status },
      })
      setSelected(result.report)
      await refreshReports()
      onNotify(status === 'RETURNED' ? 'Item marked returned.' : 'Lost & Found report closed.')
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  async function addNote(event) {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const result = await api(`/api/lost-found/${encodeURIComponent(selected.id)}/notes`, {
        method: 'POST', body: { message: note },
      })
      setSelected(result.report)
      setNote('')
      await refreshReports()
      onNotify('Official Lost & Found note added.')
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  return <div className="module-page page-enter lost-found-center">
    <div className="module-breadcrumb">CAMPUS <span>›</span> LOST & FOUND</div>
    <section className="module-hero lost-found-hero">
      <div className="module-title-area"><span className="module-icon"><PackageSearch size={20}/></span><span className="module-eyebrow">FOUND SOMETHING? LOOKING FOR IT?</span><h1>Lost & Found<span className="module-title-period">.</span></h1><p>Report missing belongings, share found items, and reunite campus community members safely.</p></div>
      {!selectedId && <div className="lost-found-report-actions"><button className="module-primary" onClick={() => { setReportType('LOST'); setNotice('') }}><Plus size={15}/> Report Lost Item</button><button className="lost-found-secondary" onClick={() => { setReportType('FOUND'); setNotice('') }}><Plus size={15}/> Report Found Item</button></div>}
    </section>

    {notice && <div className="complaint-confirmation" role="status"><Check size={15}/>{notice}</div>}
    {error && <div className="management-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}

    {reportType && !selectedId && <section className="complaint-form-card">
      <div className="management-heading"><div><span className="section-eyebrow">LINKED TO YOUR CAMPUS ACCOUNT</span><h2>{reportType === 'LOST' ? 'Report a lost item' : 'Report a found item'}</h2></div><span className="complaint-private"><ShieldAlert size={14}/> Personal contact details stay private</span></div>
      <p>Reporter: <strong>{user.name} · {user.id}</strong> · {user.role}{user.department ? ` · ${user.department}` : ''}</p>
      <form className="lost-found-form" onSubmit={createReport}>
        <label>ITEM NAME<input required minLength={2} maxLength={120} value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Describe the item"/></label>
        <label>CATEGORY<select required value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>DESCRIPTION<textarea required minLength={3} maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Share a general description. Keep unique identifying details private."/></label>
        <label>{reportType === 'LOST' ? 'LAST SEEN LOCATION' : 'FOUND LOCATION'}<input required maxLength={180} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Building, room, or campus area"/></label>
        <label>{reportType === 'LOST' ? 'DATE LOST' : 'DATE FOUND'}<input type="date" required value={itemDate} onChange={(event) => setItemDate(event.target.value)} max={new Date().toISOString().slice(0, 10)}/></label>
        <label>ADDITIONAL DETAILS (PRIVATE)<textarea maxLength={2000} rows={3} value={additionalDetails} onChange={(event) => setAdditionalDetails(event.target.value)} placeholder="Optional details visible only to you and authorized staff."/></label>
        <label className="complaint-upload">PHOTO (OPTIONAL)<span><ImagePlus size={16}/> Choose an image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectPhoto}/></span><small>PNG, JPEG or WebP · maximum 1 MB</small></label>
        {preview && <div className="complaint-preview"><img src={preview} alt="Item photo preview"/><button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo"><X size={14}/></button></div>}
        <div className="complaint-form-actions"><button type="button" className="modal-cancel" onClick={() => setReportType('')}>Cancel</button><button className="module-primary" disabled={saving}>{saving ? 'Submitting…' : `Submit ${reportType === 'LOST' ? 'Lost' : 'Found'} Report`} <ArrowRight size={14}/></button></div>
      </form>
    </section>}

    {selectedId ? <section className="lost-found-detail">
      <button className="complaint-back" onClick={() => { setSelectedId(''); setError('') }}><ArrowLeft size={15}/> Back to Lost & Found</button>
      {!selected ? <div className="management-state">Loading item…</div> : <>
        <header className="lost-found-detail-header"><div><span className="section-eyebrow">{selected.id} · {selected.category}</span><h2>{selected.itemName}</h2><span className="complaint-submitter">{selected.type === 'LOST' ? 'Last seen' : 'Found'} {selected.location} · {new Date(`${selected.itemDate}T00:00:00`).toLocaleDateString()} · Reported {new Date(selected.createdAt).toLocaleString()}</span></div><StatusBadge status={selected.status}/></header>
        <div className="lost-found-detail-grid">
          <article className="complaint-description"><div><span className="section-eyebrow">ITEM DETAILS</span><time>{selected.reporterName ? `${selected.reporterName} · ${selected.reporterId}` : 'Reporter details are private'}</time></div><p>{selected.description}</p>{selected.additionalDetails && <div className="lost-found-private-details"><strong>Private additional details</strong><p>{selected.additionalDetails}</p></div>}{selected.photoUrl && <a className="complaint-photo-link" href={selected.photoUrl} target="_blank" rel="noreferrer"><img src={selected.photoUrl} alt={`Photo of ${selected.itemName}`}/><span>View item photo</span></a>}
            {selected.matchedReportId && <p className="lost-found-match">Possible matching report: <button onClick={() => setSelectedId(selected.matchedReportId)}>{selected.matchedReportId}</button></p>}
            {!selectedCanManage && selected.type === 'FOUND' && selected.reporterId !== user.id && !['CLAIM_VERIFIED', 'RETURNED', 'CLOSED'].includes(selected.status) && !hasMyPendingClaim && <form className="lost-found-claim-form" onSubmit={requestClaim}><label htmlFor="lost-found-claim-details">REQUEST CLAIM · SHARE NON-PUBLIC IDENTIFYING DETAILS</label><p>These details are visible only to the item reporter and authorized campus staff.</p><textarea id="lost-found-claim-details" minLength={15} maxLength={2000} required rows={4} value={claimDetails} onChange={(event) => setClaimDetails(event.target.value)} placeholder="Describe identifying features, where/when you lost it, or other details not shown in the listing."/><button className="module-primary" disabled={saving || claimDetails.trim().length < 15}>{saving ? 'Submitting…' : 'Request Claim'} <Send size={13}/></button></form>}
          </article>
          <section className="complaint-activity"><div className="section-eyebrow">REPORT HISTORY</div><div className="lost-found-activity-list">{selected.activity.map((entry) => <article className="complaint-activity-item" key={entry.id}><span className={`complaint-activity-icon ${entry.type === 'note' ? 'activity-note' : ''}`}>{entry.type === 'note' ? <Send size={13}/> : <Check size={13}/>}</span><div><strong>{entry.message}</strong><span>{entry.authorName}{entry.authorRole ? ` · ${entry.authorRole}` : ''}</span><time><Clock3 size={12}/>{new Date(entry.createdAt).toLocaleString()}</time></div></article>)}</div>
            {selected.claimRequests?.length > 0 && <div className="lost-found-claims"><div className="section-eyebrow">CLAIM REQUESTS</div>{selected.claimRequests.map((claim) => <article className="lost-found-claim-card" key={claim.id}><strong>{claim.claimantName || 'Claimant'} · {claim.claimantId || ''}</strong><StatusBadge status={claim.status}/>{claim.details && <p>{claim.details}</p>}{claim.reviewedBy && <small>Reviewed by {claim.reviewedBy.name} · {claim.reviewedBy.role}</small>}{selectedCanManage && claim.status === 'PENDING' && <div className="lost-found-claim-actions"><button className="module-primary" disabled={saving} onClick={() => reviewClaim(claim, 'VERIFIED')}>Verify claim</button><button className="lost-found-secondary" disabled={saving} onClick={() => reviewClaim(claim, 'REJECTED')}>Reject claim</button></div>}</article>)}</div>}
            {selectedCanManage && <div className="lost-found-manager-actions">{selected.status === 'CLAIM_VERIFIED' && <button className="module-primary" disabled={saving} onClick={() => changeStatus('RETURNED')}>Mark item returned</button>}{selected.status !== 'CLOSED' && <button className="lost-found-secondary" disabled={saving} onClick={() => changeStatus('CLOSED')}>Close report</button>}</div>}
            {selectedCanManage && <form className="complaint-note-form" onSubmit={addNote}><label htmlFor="lost-found-official-note">OFFICIAL NOTE</label><textarea id="lost-found-official-note" minLength={2} maxLength={2000} required rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a private staff update or handover note."/><button className="module-primary" disabled={saving || !note.trim()}>Add official note <Send size={13}/></button></form>}
          </section>
        </div>
      </>}
    </section> : <>
      {isManager && <section className="lost-found-stat-grid">{STATUSES.map((status) => <div className="complaint-stat" key={status}><span>{STATUS_LABELS[status]}</span><strong>{counts[status] || 0}</strong></div>)}</section>}
      <section className="lost-found-toolbar">
        <div className="lost-found-tabs" role="tablist" aria-label="Lost and Found views">{[['search', 'Search items'], ['mine', 'My Reports'], ['claims', 'My Claim Requests']].map(([id, label]) => <button role="tab" aria-selected={view === id} className={view === id ? 'lost-found-tab-active' : ''} key={id} onClick={() => { setView(id); setSelectedId('') }}>{label}</button>)}</div>
        <div className="lost-found-filters"><label className="lost-found-search"><Search size={15}/><input aria-label="Search Lost & Found" placeholder="Search name, category, or location" value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}/></label>
          <select aria-label="Filter by type" value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}><option value="">Lost & Found</option><option value="LOST">Lost items</option><option value="FOUND">Found items</option></select>
          <select aria-label="Filter by status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select>
          <select aria-label="Filter by category" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
          <label className="lost-found-date-filter">Date<input type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}/></label>
        </div>
      </section>
      {view === 'claims' && <section className="complaint-list-section"><div className="management-heading"><div><span className="section-eyebrow">YOUR CLAIM ACTIVITY</span><h2>My Claim Requests</h2></div><span className="results-count">{myClaims.length} requests</span></div>{myClaims.length ? <div className="lost-found-claim-list">{myClaims.map(({ report, claim }) => <article className="lost-found-claim-card" key={claim.id}><div><strong>{report.itemName} · {report.id}</strong><span>{report.category} · Submitted {new Date(claim.createdAt).toLocaleString()}</span></div><StatusBadge status={claim.status}/><p>{claim.details}</p><button className="complaint-view-button" onClick={() => setSelectedId(report.id)}>View item <ArrowRight size={13}/></button></article>)}</div> : <div className="management-state">You have not requested a claim yet.</div>}</section>}
      {view !== 'claims' && <section className="complaint-list-section"><div className="management-heading"><div><span className="section-eyebrow">{view === 'mine' ? 'REPORTS LINKED TO YOUR ACCOUNT' : 'CAMPUS ITEM SEARCH'}</span><h2>{view === 'mine' ? 'My Reports' : 'Search Lost & Found'}</h2></div><span className="results-count">{visibleItems.length} items</span></div>
        {loading ? <div className="management-state"><span className="loading-spinner"/>Searching items…</div> : visibleItems.length ? <div className="lost-found-card-list">{visibleItems.map((report) => <article className="lost-found-card" key={report.id}>{report.photoUrl ? <img src={report.photoUrl} alt={`Photo of ${report.itemName}`}/> : <span className="lost-found-card-placeholder"><PackageSearch size={20}/></span>}<div className="lost-found-card-copy"><span className="section-eyebrow">{report.id} · {report.category}</span><h3>{report.itemName}</h3><p><MapPin size={12}/>{report.location} · {report.type === 'LOST' ? 'Lost' : 'Found'} {new Date(`${report.itemDate}T00:00:00`).toLocaleDateString()}</p><small>Updated {new Date(report.lastUpdatedAt).toLocaleString()}</small></div><div className="lost-found-card-actions"><StatusBadge status={report.status}/><button className="complaint-view-button" onClick={() => setSelectedId(report.id)}>View details <ArrowRight size={13}/></button></div></article>)}</div> : <div className="management-state">{view === 'mine' ? 'You have not reported any items.' : 'No items match your search.'}</div>}
      </section>}
    </>}
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Item claim details are shared only with authorized people</span><span>Campus One · Lost & Found</span></footer>
  </div>
}

function canManage(report, user) {
  if (user.role === 'Administration' || user.role === 'Staff') return true
  if (user.role === 'HOD') return Boolean(user.department) && report.department === user.department
  if (user.role === 'Sports Captain') return report.category === 'Sports Equipment'
  return false
}

function StatusBadge({ status }) {
  return <span className={`complaint-status-badge lost-found-status-${status?.toLowerCase().replaceAll('_', '-')}`}><i/>{STATUS_LABELS[status] || status}</span>
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The selected image could not be read.'))
    reader.onerror = () => reject(new Error('The selected image could not be read.'))
    reader.readAsDataURL(file)
  })
}
