import { useEffect, useState } from 'react'
import { ArrowRight, BriefcaseBusiness, Check, ChevronDown, CircleAlert, ClipboardList, Plus, Trash2, Utensils, X } from 'lucide-react'
import { api } from '../api/client'
import { STAFF_DEFAULT_MODULES } from '../auth/access'

const SECTIONS = [
  ['food', 'Food & dining'], ['events', 'Events & clubs'],
  ['hostel', 'Hostel'],
  ['directory', 'Campus database'], ['emergency', 'Emergency contacts'],
]

export default function CampusManagement({ onNotify }) {
  const [section, setSection] = useState(SECTIONS[0][0])
  const [records, setRecords] = useState([])
  const [complaints, setComplaints] = useState([])
  const [foodOrders, setFoodOrders] = useState([])
  const [staff, setStaff] = useState([])
  const [draft, setDraft] = useState({ title: '', description: '' })
  const [crowd, setCrowd] = useState({ crowdLevel: 'Moderate', occupancyPercent: '68', estimatedWaitMinutes: '8' })
  const [editId, setEditId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    const request = section === 'complaints' ? Promise.all([api('/api/complaints'), api('/api/users')]) : section === 'food-orders' ? api('/api/food/orders') : api(`/api/campus/${encodeURIComponent(section)}`)
    request.then((result) => {
      if (section === 'complaints') {
        setComplaints(result[0].complaints)
        setStaff(result[1].users.filter((user) => user.role === 'Staff' && user.active && [...STAFF_DEFAULT_MODULES, ...user.modules].includes('complaints')))
      } else if (section === 'food-orders') setFoodOrders(result.orders)
      else setRecords(result.records)
    }).catch((reason) => setError(reason.message)).finally(() => setLoading(false))
  }, [section])

  async function saveRecord(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const editManualEstimate = section === 'food' && draft.title.toLowerCase().includes('mess')
      const payload = editManualEstimate ? { ...draft, ...crowd } : draft
      if (editId) {
        const result = await api(`/api/campus/${section}/${encodeURIComponent(editId)}`, { method: 'PATCH', body: payload })
        setRecords((current) => current.map((item) => item.id === editId ? result.record : item))
      } else {
        const result = await api(`/api/campus/${section}`, { method: 'POST', body: payload })
        setRecords((current) => [result.record, ...current])
      }
      onNotify(`${sectionLabel(section)} updated.`)
      setEditId('')
      setDraft({ title: '', description: '' })
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  async function archiveRecord(record) {
    setError('')
    try {
      await api(`/api/campus/${section}/${encodeURIComponent(record.id)}`, { method: 'DELETE' })
      setRecords((current) => current.filter((item) => item.id !== record.id))
      onNotify(`${record.title} removed from the active campus information.`)
    } catch (reason) { setError(reason.message) }
  }

  async function updateComplaint(complaint, change) {
    setError('')
    try {
      const result = await api(`/api/complaints/${encodeURIComponent(complaint.id)}`, { method: 'PATCH', body: change })
      setComplaints((current) => current.map((item) => item.id === complaint.id ? result.complaint : item))
      onNotify(`Request “${complaint.title}” updated.`)
    } catch (reason) { setError(reason.message) }
  }

  async function updateFoodOrder(order, status) {
    setError('')
    try {
      const result = await api(`/api/food/orders/${encodeURIComponent(order.id)}`, { method: 'PATCH', body: { status } })
      setFoodOrders((current) => current.map((item) => item.id === order.id ? result.order : item))
      onNotify(`${order.orderNumber} · ${status}.`)
    } catch (reason) { setError(reason.message) }
  }

  return <div className="module-page page-enter management-page campus-management-page">
    <div className="module-breadcrumb">CAMPUS <span>›</span> ADMINISTRATION</div>
    <section className="module-hero"><div className="module-title-area"><span className="module-icon"><BriefcaseBusiness size={20}/></span><span className="module-eyebrow">CAMPUS LIFE, CAREFULLY COORDINATED</span><h1>Campus management<span className="module-title-period">.</span></h1><p>Manage published campus service information.</p></div><span className="management-admin-chip"><Check size={13}/> Administration</span></section>
    <section className="module-stats"><div className="module-stat"><span className="module-stat-icon"><ClipboardList size={15}/></span><span><span>Active records</span><strong>{section === 'complaints' ? complaints.length : records.length} {section === 'complaints' ? 'requests' : 'items'}</strong></span></div><div className="module-stat"><span className="module-stat-icon"><CircleAlert size={15}/></span><span><span>Needs attention</span><strong>{complaints.filter((item) => item.status !== 'Resolved').length} open requests</strong></span></div><div className="module-stat"><span className="module-stat-icon"><Check size={15}/></span><span><span>Published service</span><strong>{section === 'complaints' ? 'Request management' : sectionLabel(section)}</strong></span></div></section>
    <div className="campus-manager-toolbar"><label className="campus-section-select"><span className="section-eyebrow">MANAGE A CAMPUS SERVICE</span><span><select aria-label="Select campus service" value={section} onChange={(event) => { setSection(event.target.value); setEditId(''); setDraft({ title: '', description: '' }); setCrowd({ crowdLevel: 'Moderate', occupancyPercent: '68', estimatedWaitMinutes: '8' }) }}>{SECTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><ChevronDown size={14}/></span></label><span className="results-count">{section === 'food' ? 'Crowd levels and wait times are manual estimates' : 'Published to authorized campus members'}</span></div>
    {error && <div className="management-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
    {section === 'food-orders' ? <section className="management-section"><div className="management-heading"><div><span className="section-eyebrow">STUDENT CANTEEN</span><h2>Canteen pre-orders</h2></div><span className="results-count">{foodOrders.length} orders</span></div>{loading ? <div className="management-state"><span className="loading-spinner"/>Loading canteen orders…</div> : foodOrders.length === 0 ? <div className="management-state">No canteen pre-orders have been placed.</div> : <div className="sports-record-list">{foodOrders.map((order) => <article className="sports-record-row" key={order.id}><span className="sports-record-icon record-amber"><Utensils size={16}/></span><div className="module-row-body"><strong>{order.item}</strong><span>{order.meal} · {order.orderNumber} · Placed {new Date(order.createdAt).toLocaleString()}</span><span className="complaint-request-meta">Student · {order.userId}</span></div><select className="complaint-status-select" aria-label={`Update ${order.orderNumber}`} value={order.status} onChange={(event) => updateFoodOrder(order, event.target.value)}>{['Placed', 'Preparing', 'Ready', 'Collected', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</select></article>)}</div>}</section> : section === 'complaints' ? <section className="management-section"><div className="management-heading"><div><span className="section-eyebrow">STUDENT SUPPORT</span><h2>Complaints & suggestions</h2></div><span className="results-count">{complaints.length} requests</span></div>{loading ? <div className="management-state">Loading student requests…</div> : complaints.length === 0 ? <div className="management-state">There are no student requests to review.</div> : <div className="sports-record-list">{complaints.map((complaint) => <article className="sports-record-row complaint-admin-row" key={complaint.id}><span className="sports-record-icon record-blue"><ClipboardList size={16}/></span><div className="module-row-body"><strong>{complaint.title}</strong><span>{complaint.description}</span><span className="complaint-request-meta">From {complaint.userId} · {new Date(complaint.createdAt).toLocaleDateString()}</span></div><div className="complaint-admin-controls"><select aria-label={`Assign ${complaint.title}`} value={complaint.assignedTo} onChange={(event) => updateComplaint(complaint, { assignedTo: event.target.value })}><option value="">Unassigned</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.id}</option>)}</select><select aria-label={`Update status of ${complaint.title}`} value={complaint.status} onChange={(event) => updateComplaint(complaint, { status: event.target.value })}>{['Open', 'In progress', 'Resolved'].map((status) => <option key={status}>{status}</option>)}</select></div></article>)}</div>}</section> : <section className="campus-content-grid"><div className="sports-entry-section"><div className="management-heading"><div><span className="section-eyebrow">PUBLISHED CAMPUS INFORMATION</span><h2>{sectionLabel(section)}</h2></div><span className="results-count">{records.length} active records</span></div>{loading ? <div className="management-state"><span className="loading-spinner"/>Loading campus data…</div> : records.length === 0 ? <div className="management-state">No active records in this service.</div> : <div className="sports-record-list">{records.map((record) => <article className="sports-record-row" key={record.id}><span className="sports-record-icon"><ClipboardList size={16}/></span><div className="module-row-body"><strong>{record.title}</strong><span>{record.description}</span>{section === 'food' && record.estimatedWaitMinutes !== undefined && <span className="complaint-request-meta">Manual estimate · {record.crowdLevel} crowd · {record.occupancyPercent}% occupancy · {record.estimatedWaitMinutes} min wait · Updated {record.crowdUpdatedAt}</span>}</div><button className="user-action" aria-label={`Edit ${record.title}`} onClick={() => { setEditId(record.id); setDraft({ title: record.title, description: record.description }); setCrowd({ crowdLevel: record.crowdLevel || 'Moderate', occupancyPercent: String(record.occupancyPercent ?? 68), estimatedWaitMinutes: String(record.estimatedWaitMinutes ?? 8) }) }}><BriefcaseBusiness size={14}/></button><button className="user-action deactivate-action" aria-label={`Remove ${record.title}`} onClick={() => archiveRecord(record)}><Trash2 size={14}/></button></article>)}</div>}</div>
        <section className="sports-create-section"><span className="sports-create-icon"><Plus size={16}/></span><span className="section-eyebrow">CAMPUS CONTENT</span><h2>{editId ? 'Edit an item' : `Add to ${sectionLabel(section).toLowerCase()}`}</h2><p>Updates appear in this service for authorized members of the campus community.</p><form className="user-form" onSubmit={saveRecord}><label htmlFor="campus-record-title">TITLE</label><input id="campus-record-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} minLength={2} maxLength={120} required/><label htmlFor="campus-record-description">DETAILS</label><textarea id="campus-record-description" rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} minLength={3} maxLength={1200} required/>{section === 'food' && draft.title.toLowerCase().includes('mess') && <fieldset className="module-permission-list"><legend>MANUAL MESS ESTIMATE · NOT CAMERA DETECTION</legend><label>Estimated crowd<select value={crowd.crowdLevel} onChange={(event) => setCrowd({ ...crowd, crowdLevel: event.target.value })}>{['Low', 'Moderate', 'Busy'].map((level) => <option key={level}>{level}</option>)}</select></label><label>Estimated occupancy (%)<input type="number" min="0" max="100" value={crowd.occupancyPercent} onChange={(event) => setCrowd({ ...crowd, occupancyPercent: event.target.value })}/></label><label>Estimated wait (minutes)<input type="number" min="0" max="180" value={crowd.estimatedWaitMinutes} onChange={(event) => setCrowd({ ...crowd, estimatedWaitMinutes: event.target.value })}/></label></fieldset>}{editId && <button type="button" className="modal-cancel" onClick={() => { setEditId(''); setDraft({ title: '', description: '' }) }}>Cancel edit</button>}<button className="module-primary" disabled={busy}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Publish'} <ArrowRight size={13}/></button></form></section></section>}
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Changes are saved securely</span><span>Administration access</span></footer>
  </div>
}

function sectionLabel(id) { return SECTIONS.find(([key]) => key === id)?.[1] || 'Complaints & suggestions' }