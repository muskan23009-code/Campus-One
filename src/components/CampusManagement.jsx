import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BriefcaseBusiness, Check, ChevronDown, CircleAlert, ClipboardList, Plus, Trash2, Utensils, X } from 'lucide-react'
import { api } from '../api/client'
import { STAFF_DEFAULT_MODULES } from '../auth/access'

const SECTIONS = [
  ['food', 'Food & dining'], ['events', 'Events & clubs'],
  ['hostel', 'Hostel'], ['directory', 'Campus database'],
  ['emergency', 'Emergency contacts'],
]

const EMERGENCY_CATEGORIES = [
  ['HOSTEL_WARDEN', 'Hostel Warden'],
  ['HOSTEL_IN_CHARGE', 'Hostel In-Charge'],
  ['HOSTEL_SECURITY', 'Hostel Security'],
  ['MAIN_GATE_GUARD', 'Main Gate Guard'],
  ['CAMPUS_SECURITY', 'Campus Security'],
  ['SECURITY_OFFICE', 'Security Office'],
  ['MEDICAL_EMERGENCY', 'Medical Emergency'],
  ['AMBULANCE', 'Ambulance'],
  ['FIRE_EMERGENCY', 'Fire Emergency'],
  ['POLICE', 'Police'],
  ['WOMEN_SAFETY', 'Women Safety'],
  ['ANTI_RAGGING', 'Anti-Ragging'],
  ['TRANSPORT_EMERGENCY', 'Transport Emergency'],
  ['ADMINISTRATION_EMERGENCY', 'Administration Emergency'],
  ['OTHER_EMERGENCY', 'Other Emergency'],
]

const EMPTY_EMERGENCY_DRAFT = {
  name: '',
  category: 'MEDICAL_EMERGENCY',
  phone_number: '',
  alternate_phone: '',
  designation: '',
  description: '',
  location: '',
  hostel_name: '',
  location_url: '',
  available_24x7: true,
  is_primary: false,
  is_active: true,
  display_order: '1',
}

export default function CampusManagement({ onNotify }) {
  const [section, setSection] = useState(SECTIONS[0][0])
  const [records, setRecords] = useState([])
  const [complaints, setComplaints] = useState([])
  const [foodOrders, setFoodOrders] = useState([])
  const [staff, setStaff] = useState([])
  const [draft, setDraft] = useState({ title: '', description: '' })
  const [emergencyDraft, setEmergencyDraft] = useState(EMPTY_EMERGENCY_DRAFT)
  const [emergencyEditId, setEmergencyEditId] = useState('')
  const [emergencySearch, setEmergencySearch] = useState('')
  const [emergencyCategoryFilter, setEmergencyCategoryFilter] = useState('ALL')
  const [emergencyStatusFilter, setEmergencyStatusFilter] = useState('ALL')
  const [editId, setEditId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const emergencyFiltered = useMemo(() => {
    const query = emergencySearch.trim().toLowerCase()
    return records.filter((contact) => {
      const matchesQuery = !query || [contact.name, contact.category, contact.designation, contact.location, contact.hostel_name, contact.description, contact.phone_number].join(' ').toLowerCase().includes(query)
      const matchesCategory = emergencyCategoryFilter === 'ALL' || contact.category === emergencyCategoryFilter
      const isActive = contact.is_active !== false && contact.active !== false
      const matchesStatus = emergencyStatusFilter === 'ALL' || (emergencyStatusFilter === 'ACTIVE' ? isActive : !isActive)
      return matchesQuery && matchesCategory && matchesStatus
    })
  }, [emergencyCategoryFilter, emergencySearch, emergencyStatusFilter, records])

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
      if (editId) {
        const result = await api(`/api/campus/${section}/${encodeURIComponent(editId)}`, { method: 'PATCH', body: draft })
        setRecords((current) => current.map((item) => item.id === editId ? result.record : item))
      } else {
        const result = await api(`/api/campus/${section}`, { method: 'POST', body: draft })
        setRecords((current) => [result.record, ...current])
      }
      onNotify(`${sectionLabel(section)} updated.`)
      setEditId('')
      setDraft({ title: '', description: '' })
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  async function saveEmergencyContact(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload = {
        ...emergencyDraft,
        display_order: Number(emergencyDraft.display_order) || 1,
        priority: Number(emergencyDraft.display_order) || 1,
        hostel_name: emergencyDraft.hostel_name?.trim(),
        location_url: emergencyDraft.location_url?.trim(),
        available_24x7: Boolean(emergencyDraft.available_24x7),
        is_primary: Boolean(emergencyDraft.is_primary),
        is_active: Boolean(emergencyDraft.is_active),
      }
      let result
      if (emergencyEditId) {
        result = await api(`/api/campus/emergency/${encodeURIComponent(emergencyEditId)}`, { method: 'PATCH', body: payload })
        setRecords((current) => current.map((item) => item.id === emergencyEditId ? result.record : item))
      } else {
        result = await api('/api/campus/emergency', { method: 'POST', body: payload })
        setRecords((current) => [result.record, ...current])
      }
      onNotify('Emergency contact saved.')
      setEmergencyEditId('')
      setEmergencyDraft(EMPTY_EMERGENCY_DRAFT)
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

  async function deleteEmergencyContact(record) {
    if (!window.confirm(`Delete ${record.name}? This will remove the emergency contact from the active list.`)) return
    setError('')
    try {
      await api(`/api/campus/emergency/${encodeURIComponent(record.id)}`, { method: 'DELETE' })
      setRecords((current) => current.filter((item) => item.id !== record.id))
      onNotify(`${record.name} removed from emergency contacts.`)
      if (emergencyEditId === record.id) {
        setEmergencyEditId('')
        setEmergencyDraft(EMPTY_EMERGENCY_DRAFT)
      }
    } catch (reason) { setError(reason.message) }
  }

  async function toggleEmergencyRecord(record, field) {
    setError('')
    try {
      const nextValue = !record[field]
      const result = await api(`/api/campus/emergency/${encodeURIComponent(record.id)}`, { method: 'PATCH', body: { [field]: nextValue } })
      setRecords((current) => current.map((item) => item.id === record.id ? result.record : item))
      onNotify(`${record.name} ${nextValue ? 'activated' : 'deactivated'}.`)
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

  function beginEmergencyEdit(contact) {
    setEmergencyEditId(contact.id)
    setEmergencyDraft({
      name: contact.name || '',
      category: contact.category || 'MEDICAL_EMERGENCY',
      phone_number: contact.phone_number || '',
      alternate_phone: contact.alternate_phone || '',
      designation: contact.designation || '',
      description: contact.description || '',
      location: contact.location || '',
      hostel_name: contact.hostel_name || contact.hostelName || '',
      location_url: contact.location_url || contact.map_url || '',
      available_24x7: contact.available_24x7 !== false,
      is_primary: Boolean(contact.is_primary),
      is_active: contact.is_active !== false && contact.active !== false,
      display_order: String(contact.display_order ?? contact.priority ?? 1),
    })
  }

  return (
    <div className="module-page page-enter management-page campus-management-page">
      <div className="module-breadcrumb">CAMPUS <span>›</span> ADMINISTRATION</div>
      <section className="module-hero">
        <div className="module-title-area">
          <span className="module-icon"><BriefcaseBusiness size={20}/></span>
          <span className="module-eyebrow">CAMPUS LIFE, CAREFULLY COORDINATED</span>
          <h1>Campus management<span className="module-title-period">.</span></h1>
          <p>Manage published service information and handle student requests.</p>
        </div>
        <span className="management-admin-chip"><Check size={13}/> Administration</span>
      </section>

      <section className="module-stats">
        <div className="module-stat">
          <span className="module-stat-icon"><ClipboardList size={15}/></span>
          <span><span>Active records</span><strong>{section === 'complaints' ? complaints.length : records.length} {section === 'complaints' ? 'requests' : 'items'}</strong></span>
        </div>
        <div className="module-stat">
          <span className="module-stat-icon"><CircleAlert size={15}/></span>
          <span><span>Needs attention</span><strong>{complaints.filter((item) => item.status !== 'Resolved').length} open requests</strong></span>
        </div>
        <div className="module-stat">
          <span className="module-stat-icon"><Check size={15}/></span>
          <span><span>Published service</span><strong>{section === 'complaints' ? 'Request management' : sectionLabel(section)}</strong></span>
        </div>
      </section>

      <div className="campus-manager-toolbar">
        <label className="campus-section-select">
          <span className="section-eyebrow">MANAGE A CAMPUS SERVICE</span>
          <span>
            <select aria-label="Select campus service" value={section} onChange={(event) => {
              setSection(event.target.value)
              setEditId('')
              setDraft({ title: '', description: '' })
              setEmergencySearch('')
              setEmergencyEditId('')
              setEmergencyDraft(EMPTY_EMERGENCY_DRAFT)
            }}>
              <option value="complaints">Complaints & suggestions</option>
              <option value="food-orders">Canteen pre-orders</option>
              {SECTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <ChevronDown size={14}/>
          </span>
        </label>
        {section !== 'complaints' && <span className="results-count">{section === 'food-orders' ? 'Order status is visible to the ordering student' : section === 'food' ? 'Crowd levels and wait times are manual estimates' : 'Published to authorized campus members'}</span>}
      </div>

      {error && <div className="management-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}

      {section === 'food-orders' ? (
        <section className="management-section">
          <div className="management-heading">
            <div><span className="section-eyebrow">STUDENT CANTEEN</span><h2>Canteen pre-orders</h2></div>
            <span className="results-count">{foodOrders.length} orders</span>
          </div>
          {loading ? (
            <div className="management-state"><span className="loading-spinner"/>Loading canteen orders…</div>
          ) : foodOrders.length === 0 ? (
            <div className="management-state">No canteen pre-orders have been placed.</div>
          ) : (
            <div className="sports-record-list">
              {foodOrders.map((order) => (
                <article className="sports-record-row" key={order.id}>
                  <span className="sports-record-icon record-amber"><Utensils size={16}/></span>
                  <div className="module-row-body">
                    <strong>{order.item}</strong>
                    <span>{order.meal} · {order.orderNumber} · Placed {new Date(order.createdAt).toLocaleString()}</span>
                    <span className="complaint-request-meta">Student · {order.userId}</span>
                  </div>
                  <select className="complaint-status-select" aria-label={`Update ${order.orderNumber}`} value={order.status} onChange={(event) => updateFoodOrder(order, event.target.value)}>
                    {['Placed', 'Preparing', 'Ready', 'Collected', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}
                  </select>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : section === 'complaints' ? (
        <section className="management-section">
          <div className="management-heading">
            <div><span className="section-eyebrow">STUDENT SUPPORT</span><h2>Complaints & suggestions</h2></div>
            <span className="results-count">{complaints.length} requests</span>
          </div>
          {loading ? (
            <div className="management-state">Loading student requests…</div>
          ) : complaints.length === 0 ? (
            <div className="management-state">No requests are waiting for review.</div>
          ) : (
            <div className="sports-record-list">
              {complaints.map((record) => (
                <article className="sports-record-row" key={record.id}>
                  <span className="sports-record-icon record-sky"><ClipboardList size={16}/></span>
                  <div className="module-row-body">
                    <strong>{record.title}</strong>
                    <span>{record.description}</span>
                    <span className="complaint-request-meta">{record.status} · Student · {record.userId}{record.assignedTo ? ` · Assigned to ${record.assignedTo}` : ''}</span>
                  </div>
                  <select className="complaint-status-select" aria-label={`Update ${record.title}`} value={record.status} onChange={(event) => updateComplaint(record, { status: event.target.value })}>
                    {['Open', 'In progress', 'Resolved'].map((status) => <option key={status}>{status}</option>)}
                  </select>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : section === 'emergency' ? (
        <section className="management-section">
          <div className="management-heading">
            <div><span className="section-eyebrow">EMERGENCY MANAGEMENT</span><h2>Emergency contacts</h2></div>
            <span className="results-count">{records.length} active contacts</span>
          </div>

          <div className="emergency-manager-panel">
            <div className="emergency-toolbar">
              <input aria-label="Search emergency contacts" value={emergencySearch} onChange={(event) => setEmergencySearch(event.target.value)} placeholder="Search contacts..." />
              <div className="emergency-filter-group">
                <select value={emergencyCategoryFilter} onChange={(event) => setEmergencyCategoryFilter(event.target.value)}>
                  <option value="ALL">All categories</option>
                  {EMERGENCY_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select value={emergencyStatusFilter} onChange={(event) => setEmergencyStatusFilter(event.target.value)}>
                  <option value="ALL">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
              <button type="button" className="module-primary" onClick={() => { setEmergencyEditId(''); setEmergencyDraft(EMPTY_EMERGENCY_DRAFT) }}>+ Add contact</button>
            </div>

            {loading ? (
              <div className="management-state">Loading emergency contacts…</div>
            ) : (
              <div className="emergency-contact-table">
                <div className="emergency-table-head">
                  <span>Category</span>
                  <span>Contact</span>
                  <span>Phone</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>

                {emergencyFiltered.length === 0 ? (
                  <div className="management-state">No emergency contacts match your search.</div>
                ) : emergencyFiltered.map((contact) => (
                  <div className="emergency-table-row" key={contact.id}>
                    <span>{categoryLabel(contact.category)}</span>
                    <span>
                      <strong>{contact.name}</strong>
                      {contact.designation && <small>{contact.designation}</small>}
                      {contact.hostel_name && <small>{contact.hostel_name}</small>}
                      {contact.location && <small>{contact.location}</small>}
                    </span>
                    <span>
                      <strong>{contact.phone_number}</strong>
                      {contact.alternate_phone && <small>{contact.alternate_phone}</small>}
                    </span>
                    <span>
                      {contact.is_active !== false && contact.active !== false ? (
                        <span className="emergency-status-badge active">Active</span>
                      ) : (
                        <span className="emergency-status-badge inactive">Inactive</span>
                      )}
                      {contact.is_primary && <span className="emergency-primary-badge">Primary</span>}
                    </span>
                    <span className="emergency-action-group">
                      <button type="button" className="module-link" onClick={() => beginEmergencyEdit(contact)}>Edit</button>
                      <button type="button" className="module-link" onClick={() => toggleEmergencyRecord(contact, 'is_active')}>{contact.is_active !== false && contact.active !== false ? 'Deactivate' : 'Activate'}</button>
                      <button type="button" className="module-link danger" onClick={() => deleteEmergencyContact(contact)}>Delete</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <section className="sports-create-section">
            <span className="sports-create-icon"><Plus size={16}/></span>
            <span className="section-eyebrow">EMERGENCY CONTACTS</span>
            <h2>{emergencyEditId ? 'Edit contact' : 'Add emergency contact'}</h2>
            <p>Maintain campus response teams, medical support, and emergency scenes with a single source of truth.</p>
            <form className="user-form" onSubmit={saveEmergencyContact}>
              <div className="emergency-form-grid">
                <label>
                  Contact Name
                  <input value={emergencyDraft.name} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, name: event.target.value })} required />
                </label>
                <label>
                  Category
                  <select value={emergencyDraft.category} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, category: event.target.value })}>
                    {EMERGENCY_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Phone Number
                  <input value={emergencyDraft.phone_number} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, phone_number: event.target.value })} required />
                </label>
                <label>
                  Alternate Phone
                  <input value={emergencyDraft.alternate_phone} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, alternate_phone: event.target.value })} />
                </label>
                <label>
                  Designation
                  <input value={emergencyDraft.designation} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, designation: event.target.value })} />
                </label>
                <label>
                  Display order
                  <input type="number" min="1" value={emergencyDraft.display_order} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, display_order: event.target.value })} />
                </label>
                <label>
                  Location
                  <input value={emergencyDraft.location} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, location: event.target.value })} />
                </label>
                <label>
                  Hostel Name / Block
                  <input value={emergencyDraft.hostel_name} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, hostel_name: event.target.value })} placeholder="Hostel A, Boys Hostel, etc." />
                </label>
                <label>
                  Map / Location URL
                  <input value={emergencyDraft.location_url} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, location_url: event.target.value })} placeholder="https://maps.google.com/..." />
                </label>
                <label>
                  Description
                  <textarea rows={3} value={emergencyDraft.description} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, description: event.target.value })} />
                </label>
              </div>

              <div className="emergency-form-checkboxes">
                <label><input type="checkbox" checked={emergencyDraft.available_24x7} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, available_24x7: event.target.checked })} /> Available 24x7</label>
                <label><input type="checkbox" checked={emergencyDraft.is_primary} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, is_primary: event.target.checked })} /> Primary contact</label>
                <label><input type="checkbox" checked={emergencyDraft.is_active} onChange={(event) => setEmergencyDraft({ ...emergencyDraft, is_active: event.target.checked })} /> Active</label>
              </div>

              {emergencyEditId && <button type="button" className="modal-cancel" onClick={() => { setEmergencyEditId(''); setEmergencyDraft(EMPTY_EMERGENCY_DRAFT) }}>Cancel edit</button>}
              <button className="module-primary" disabled={busy}>{busy ? 'Saving…' : 'Save contact'} <ArrowRight size={13}/></button>
            </form>
          </section>
        </section>
      ) : (
        <section className="campus-content-grid">
          <div className="sports-entry-section">
            <div className="management-heading">
              <div><span className="section-eyebrow">PUBLISHED CAMPUS INFORMATION</span><h2>{sectionLabel(section)}</h2></div>
              <span className="results-count">{records.length} active records</span>
            </div>
            {loading ? (
              <div className="management-state"><span className="loading-spinner"/>Loading campus data…</div>
            ) : records.length === 0 ? (
              <div className="management-state">No active records in this service.</div>
            ) : (
              <div className="sports-record-list">
                {records.map((record) => (
                  <article className="sports-record-row" key={record.id}>
                    <span className="sports-record-icon"><ClipboardList size={16}/></span>
                    <div className="module-row-body">
                      <strong>{record.title}</strong>
                      <span>{record.description}</span>
                    </div>
                    <button className="user-action" aria-label={`Edit ${record.title}`} onClick={() => {
                      setEditId(record.id)
                      setDraft({ title: record.title, description: record.description })
                    }}><BriefcaseBusiness size={14}/></button>
                    <button className="user-action deactivate-action" aria-label={`Remove ${record.title}`} onClick={() => archiveRecord(record)}><Trash2 size={14}/></button>
                  </article>
                ))}
              </div>
            )}
          </div>

          <section className="sports-create-section">
            <span className="sports-create-icon"><Plus size={16}/></span>
            <span className="section-eyebrow">CAMPUS CONTENT</span>
            <h2>{editId ? 'Edit an item' : `Add to ${sectionLabel(section).toLowerCase()}`}</h2>
            <p>Updates appear in this service for authorized members of the campus community.</p>
            <form className="user-form" onSubmit={saveRecord}>
              <label htmlFor="campus-record-title">TITLE</label>
              <input id="campus-record-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} minLength={2} maxLength={120} required />
              <label htmlFor="campus-record-description">DETAILS</label>
              <textarea id="campus-record-description" rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} minLength={3} maxLength={1200} required />

              {editId && <button type="button" className="modal-cancel" onClick={() => { setEditId(''); setDraft({ title: '', description: '' }) }}>Cancel edit</button>}
              <button className="module-primary" disabled={busy}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Publish'} <ArrowRight size={13}/></button>
            </form>
          </section>
        </section>
      )}

      <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Changes are saved securely</span><span>Administration access</span></footer>
    </div>
  )
  return <div className="module-page page-enter management-page campus-management-page">
    <div className="module-breadcrumb">CAMPUS <span>›</span> ADMINISTRATION</div>
    <section className="module-hero"><div className="module-title-area"><span className="module-icon"><BriefcaseBusiness size={20}/></span><span className="module-eyebrow">CAMPUS LIFE, CAREFULLY COORDINATED</span><h1>Campus management<span className="module-title-period">.</span></h1><p>Manage published campus service information.</p></div><span className="management-admin-chip"><Check size={13}/> Administration</span></section>
    <section className="module-stats"><div className="module-stat"><span className="module-stat-icon"><ClipboardList size={15}/></span><span><span>Active records</span><strong>{section === 'complaints' ? complaints.length : records.length} {section === 'complaints' ? 'requests' : 'items'}</strong></span></div><div className="module-stat"><span className="module-stat-icon"><CircleAlert size={15}/></span><span><span>Needs attention</span><strong>{complaints.filter((item) => item.status !== 'Resolved').length} open requests</strong></span></div><div className="module-stat"><span className="module-stat-icon"><Check size={15}/></span><span><span>Published service</span><strong>{section === 'complaints' ? 'Request management' : sectionLabel(section)}</strong></span></div></section>
    <div className="campus-manager-toolbar"><label className="campus-section-select"><span className="section-eyebrow">MANAGE A CAMPUS SERVICE</span><span><select aria-label="Select campus service" value={section} onChange={(event) => { setSection(event.target.value); setEditId(''); setDraft({ title: '', description: '' }) }}>{SECTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><ChevronDown size={14}/></span></label><span className="results-count">Published to authorized campus members</span></div>
    {error && <div className="management-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
    {section === 'food-orders' ? <section className="management-section"><div className="management-heading"><div><span className="section-eyebrow">STUDENT CANTEEN</span><h2>Canteen pre-orders</h2></div><span className="results-count">{foodOrders.length} orders</span></div>{loading ? <div className="management-state"><span className="loading-spinner"/>Loading canteen orders…</div> : foodOrders.length === 0 ? <div className="management-state">No canteen pre-orders have been placed.</div> : <div className="sports-record-list">{foodOrders.map((order) => <article className="sports-record-row" key={order.id}><span className="sports-record-icon record-amber"><Utensils size={16}/></span><div className="module-row-body"><strong>{order.item}</strong><span>{order.meal} · {order.orderNumber} · Placed {new Date(order.createdAt).toLocaleString()}</span><span className="complaint-request-meta">Student · {order.userId}</span></div><select className="complaint-status-select" aria-label={`Update ${order.orderNumber}`} value={order.status} onChange={(event) => updateFoodOrder(order, event.target.value)}>{['Placed', 'Preparing', 'Ready', 'Collected', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</select></article>)}</div>}</section> : section === 'complaints' ? <section className="management-section"><div className="management-heading"><div><span className="section-eyebrow">STUDENT SUPPORT</span><h2>Complaints & suggestions</h2></div><span className="results-count">{complaints.length} requests</span></div>{loading ? <div className="management-state">Loading student requests…</div> : complaints.length === 0 ? <div className="management-state">There are no student requests to review.</div> : <div className="sports-record-list">{complaints.map((complaint) => <article className="sports-record-row complaint-admin-row" key={complaint.id}><span className="sports-record-icon record-blue"><ClipboardList size={16}/></span><div className="module-row-body"><strong>{complaint.title}</strong><span>{complaint.description}</span><span className="complaint-request-meta">From {complaint.userId} · {new Date(complaint.createdAt).toLocaleDateString()}</span></div><div className="complaint-admin-controls"><select aria-label={`Assign ${complaint.title}`} value={complaint.assignedTo} onChange={(event) => updateComplaint(complaint, { assignedTo: event.target.value })}><option value="">Unassigned</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.id}</option>)}</select><select aria-label={`Update status of ${complaint.title}`} value={complaint.status} onChange={(event) => updateComplaint(complaint, { status: event.target.value })}>{['Open', 'In progress', 'Resolved'].map((status) => <option key={status}>{status}</option>)}</select></div></article>)}</div>}</section> : <section className="campus-content-grid"><div className="sports-entry-section"><div className="management-heading"><div><span className="section-eyebrow">PUBLISHED CAMPUS INFORMATION</span><h2>{sectionLabel(section)}</h2></div><span className="results-count">{records.length} active records</span></div>{loading ? <div className="management-state"><span className="loading-spinner"/>Loading campus data…</div> : records.length === 0 ? <div className="management-state">No active records in this service.</div> : <div className="sports-record-list">{records.map((record) => <article className="sports-record-row" key={record.id}><span className="sports-record-icon"><ClipboardList size={16}/></span><div className="module-row-body"><strong>{record.title}</strong><span>{record.description}</span></div><button className="user-action" aria-label={`Edit ${record.title}`} onClick={() => { setEditId(record.id); setDraft({ title: record.title, description: record.description }) }}><BriefcaseBusiness size={14}/></button><button className="user-action deactivate-action" aria-label={`Remove ${record.title}`} onClick={() => archiveRecord(record)}><Trash2 size={14}/></button></article>)}</div>}</div>
        <section className="sports-create-section"><span className="sports-create-icon"><Plus size={16}/></span><span className="section-eyebrow">CAMPUS CONTENT</span><h2>{editId ? 'Edit an item' : `Add to ${sectionLabel(section).toLowerCase()}`}</h2><p>Updates appear in this service for authorized members of the campus community.</p><form className="user-form" onSubmit={saveRecord}><label htmlFor="campus-record-title">TITLE</label><input id="campus-record-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} minLength={2} maxLength={120} required/><label htmlFor="campus-record-description">DETAILS</label><textarea id="campus-record-description" rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} minLength={3} maxLength={1200} required/>{editId && <button type="button" className="modal-cancel" onClick={() => { setEditId(''); setDraft({ title: '', description: '' }) }}>Cancel edit</button>}<button className="module-primary" disabled={busy}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Publish'} <ArrowRight size={13}/></button></form></section></section>}
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Changes are saved securely</span><span>Administration access</span></footer>
  </div>
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

function sectionLabel(id) { return SECTIONS.find(([key]) => key === id)?.[1] || 'Complaints & suggestions' }
