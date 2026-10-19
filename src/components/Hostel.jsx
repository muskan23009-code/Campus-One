import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Building2, Check, DoorOpen, Home, Pencil, Plus,
  UsersRound, Wrench, X, Save, UserRound, Phone, Layers3, CalendarClock,
} from 'lucide-react'
import { api } from '../api/client'
import { getStudentRoom, getStudentRoommateNames, hostelCollection, normalizeHostelResponse } from './hostelData.js'

const CATEGORIES = ['Electrical', 'Plumbing', 'Furniture', 'Other']
const STATUSES = ['SUBMITTED', 'IN_PROGRESS', 'RESOLVED']
const HOSTEL_NAMES = ['B1', 'B2', 'B3', 'B4', 'G1', 'G2']
const ROOM_TYPES = ['Single', 'Double', 'Triple', '4 Sharing', 'Shared']
const ROOMMATE_LIMITS = { Single: 0, Double: 1, Triple: 2, '4 Sharing': 3, Shared: 20 }

function emptyHostelDetails() {
  return { hostelName: 'B1', roomNumber: '', floor: '', roomType: 'Single', roomCooling: '', roommateNames: [], wardenName: '', wardenContact: '', additionalInformation: '' }
}

function normalizeDetailsText(value) {
  if (typeof value === 'string') return value.trim()
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function statusLabel(status) {
  return { SUBMITTED: 'Submitted', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', ALLOTTED: 'Current', TRANSFERRED: 'Transferred' }[status] || status
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : ''
}

function Hostel({ user, onNotify }) {
  const isAdministrator = user.role === 'Administration'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState('rooms')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Electrical')
  const [description, setDescription] = useState('')
  const [roomDraft, setRoomDraft] = useState({ hostelName: '', block: '', floor: '', roomNumber: '', capacity: '2' })
  const [editingRoom, setEditingRoom] = useState('')
  const [editingRoomDraft, setEditingRoomDraft] = useState(null)
  const [allotmentDraft, setAllotmentDraft] = useState({ studentId: '', roomId: '' })
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [detailsDraft, setDetailsDraft] = useState(emptyHostelDetails)
  const [detailsStudentId, setDetailsStudentId] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(normalizeHostelResponse(await api('/api/hostel'), isAdministrator))
    } catch (reason) {
      setError(reason.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const currentAllotment = data?.currentAllotment
  const filteredResidents = useMemo(() => hostelCollection(data?.residents)
    .filter((resident) => `${resident.name} ${resident.department} ${resident.hostelName} ${resident.block} ${resident.floor} ${resident.roomNumber}`.toLowerCase().includes(query.toLowerCase())), [data, query])
  const filteredMaintenance = useMemo(() => hostelCollection(data?.maintenance)
    .filter((request) => `${request.studentName || ''} ${request.studentId} ${request.category} ${request.description} ${request.status}`.toLowerCase().includes(query.toLowerCase())), [data, query])
  const filteredHostelDetails = useMemo(() => hostelCollection(isAdministrator ? data?.hostelDetails : null)
    .filter((details) => `${details.studentName || ''} ${details.studentId} ${details.hostelName} ${details.roomNumber} ${details.floor} ${details.roomType} ${details.roomCooling || ''} ${(details.roommateNames || []).join(' ')} ${details.wardenName} ${details.wardenContact}`.toLowerCase().includes(query.toLowerCase())), [data, query])

  function openStudentDetailsForm() {
    setDetailsStudentId('')
    setDetailsDraft(data?.hostelDetails
      ? { ...emptyHostelDetails(), ...data.hostelDetails, roommateNames: Array.isArray(data.hostelDetails.roommateNames) ? data.hostelDetails.roommateNames : [] }
      : emptyHostelDetails())
    setError('')
    setDetailsDialogOpen(true)
  }

  function openAdminDetailsForm(details) {
    setDetailsStudentId(details.studentId)
    setDetailsDraft({ ...emptyHostelDetails(), ...details, roommateNames: Array.isArray(details.roommateNames) ? details.roommateNames : [] })
    setError('')
    setDetailsDialogOpen(true)
  }

  async function saveHostelDetails(event) {
    event.preventDefault()
    const normalizedDetails = {
      ...detailsDraft,
      hostelName: normalizeDetailsText(detailsDraft.hostelName),
      roomNumber: normalizeDetailsText(detailsDraft.roomNumber),
      floor: normalizeDetailsText(detailsDraft.floor),
      roomType: normalizeDetailsText(detailsDraft.roomType),
      roomCooling: normalizeDetailsText(detailsDraft.roomCooling),
    }
    if (!HOSTEL_NAMES.includes(normalizedDetails.hostelName)) {
      setError('Choose a valid Hostel Name: B1, B2, B3, B4, G1, or G2.')
      return
    }
    if (!normalizedDetails.roomNumber) {
      setError('Enter a valid Room Number.')
      return
    }
    if (!normalizedDetails.floor) {
      setError('Enter a valid Floor.')
      return
    }
    if (!ROOM_TYPES.includes(normalizedDetails.roomType)) {
      setError('Choose a valid Room Type: Single, Double, Triple, 4 Sharing, or Shared.')
      return
    }
    if (normalizedDetails.roomCooling && !['AC', 'Non-AC'].includes(normalizedDetails.roomCooling)) {
      setError('Choose AC or Non-AC room cooling.')
      return
    }
    const roommateNames = Array.isArray(detailsDraft.roommateNames)
      ? detailsDraft.roommateNames.filter((name) => typeof name === 'string').map((name) => name.trim()).filter(Boolean)
      : []
    const roommateLimit = ROOMMATE_LIMITS[normalizedDetails.roomType]
    if (roommateLimit === undefined || roommateNames.length > roommateLimit) {
      setError(normalizedDetails.roomType === 'Single'
        ? 'Single rooms cannot have roommate names.'
        : `A ${normalizedDetails.roomType} room can have at most ${roommateLimit ?? 0} roommate${roommateLimit === 1 ? '' : 's'}.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const body = { ...normalizedDetails, roommateNames }
      const result = detailsStudentId
        ? await api(`/api/hostel/details/${encodeURIComponent(detailsStudentId)}`, { method: 'PATCH', body })
        : await api('/api/hostel/details', { method: 'POST', body })
      if (isAdministrator) {
        setData((current) => ({
          ...current,
          hostelDetails: current.hostelDetails.map((entry) => entry.studentId === detailsStudentId ? result.hostelDetails : entry),
        }))
      } else {
        setData((current) => ({ ...current, hostelDetails: result.hostelDetails }))
      }
      setDetailsDialogOpen(false)
      setDetailsStudentId('')
      onNotify(isAdministrator ? 'Student Hostel details updated.' : 'Your Hostel details have been saved.')
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitMaintenance(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/hostel/maintenance', { method: 'POST', body: { category, description } })
      setData((current) => ({ ...current, maintenance: [result.request, ...current.maintenance] }))
      setDescription('')
      onNotify('Your hostel maintenance request has been submitted.')
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveRoom(event, roomId = '') {
    event.preventDefault()
    setBusy(true)
    setError('')
    const draft = roomId ? editingRoomDraft : roomDraft
    const body = { ...draft, capacity: Number(draft.capacity) }
    try {
      const result = roomId
        ? await api(`/api/hostel/rooms/${encodeURIComponent(roomId)}`, { method: 'PATCH', body })
        : await api('/api/hostel/rooms', { method: 'POST', body })
      setData((current) => ({
        ...current,
        rooms: roomId
          ? current.rooms.map((room) => room.id === roomId ? result.room : room)
          : [result.room, ...current.rooms],
      }))
      setRoomDraft({ hostelName: '', block: '', floor: '', roomNumber: '', capacity: '2' })
      setEditingRoom('')
      setEditingRoomDraft(null)
      onNotify(roomId ? 'Hostel room details updated.' : 'Hostel room added.')
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  async function assignRoom(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/hostel/allotments', { method: 'POST', body: allotmentDraft })
      setData((current) => ({
        ...current,
        allotments: [result.allotment, ...current.allotments.map((entry) => entry.studentId === result.allotment.studentId && entry.status === 'ALLOTTED'
          ? { ...entry, status: 'TRANSFERRED', endedAt: result.allotment.createdAt }
          : entry)],
        residents: [
          ...current.residents.filter((resident) => resident.studentId !== result.allotment.studentId),
          {
            studentId: result.allotment.studentId,
            name: result.allotment.studentName,
            department: current.students.find((student) => student.id === result.allotment.studentId)?.department || '',
            hostelName: result.allotment.hostelName,
            block: result.allotment.block,
            floor: result.allotment.floor,
            roomNumber: result.allotment.roomNumber,
          },
        ],
      }))
      setAllotmentDraft({ studentId: '', roomId: '' })
      onNotify('Hostel allotment saved.')
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  async function updateMaintenance(request, status) {
    setError('')
    try {
      const result = await api(`/api/hostel/maintenance/${encodeURIComponent(request.id)}`, { method: 'PATCH', body: { status } })
      setData((current) => ({
        ...current,
        maintenance: current.maintenance.map((entry) => entry.id === request.id ? { ...entry, ...result.request } : entry),
      }))
      onNotify(`Maintenance request marked ${statusLabel(status).toLowerCase()}.`)
    } catch (reason) {
      setError(reason.message)
    }
  }

  function editRoom(room) {
    setEditingRoom(room.id)
    setEditingRoomDraft({
      hostelName: room.hostelName,
      block: room.block,
      floor: room.floor,
      roomNumber: room.roomNumber,
      capacity: String(room.capacity),
    })
  }

  return <div className="module-page page-enter hostel-page">
    <div className="module-breadcrumb">CAMPUS <span>›</span> STUDENT LIFE <span>›</span> HOSTEL</div>
    <section className="module-hero hostel-hero">
      <div className="module-title-area">
        <span className="module-icon"><Building2 size={20}/></span>
        <span className="module-eyebrow">{isAdministrator ? 'RESIDENTIAL SERVICES' : 'YOUR CAMPUS ACCOMMODATION'}</span>
        <h1>{isAdministrator ? 'Hostel management' : 'Hostel life'}<span className="module-title-period">.</span></h1>
        <p>{isAdministrator ? 'Coordinate hostel rooms, resident allotments, and maintenance requests.' : 'Your room, allotment details, and help with room maintenance.'}</p>
      </div>
      {isAdministrator && <span className="management-admin-chip"><Check size={13}/> Administration</span>}
    </section>

    {error && <div className="management-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
    {loading ? <div className="management-state"><span className="loading-spinner"/>Loading hostel information…</div> : data && isAdministrator
      ? <section className="hostel-management">
        <div className="hostel-admin-stats">
          <article><span><DoorOpen size={16}/></span><div><small>HOSTEL ROOMS</small><strong>{data.rooms.length}</strong></div></article>
          <article><span><UsersRound size={16}/></span><div><small>CURRENT RESIDENTS</small><strong>{data.residents.length}</strong></div></article>
          <article><span><Wrench size={16}/></span><div><small>OPEN MAINTENANCE</small><strong>{data.maintenance.filter((item) => item.status !== 'RESOLVED').length}</strong></div></article>
        </div>
        <nav className="hostel-admin-tabs" aria-label="Hostel management sections">
          {[
            ['rooms', 'Rooms & allotments', Building2],
            ['residents', 'Residents', UsersRound],
              ['details', 'Submitted details', Home],
              ['maintenance', 'Maintenance', Wrench],
            ].map(([id, label, Icon]) => <button key={id} className={section === id ? 'hostel-tab-active' : ''} onClick={() => { setSection(id); setQuery('') }}><Icon size={15}/>{label}</button>)}
        </nav>

        {section === 'rooms' && <>
          <section className="hostel-management-card">
            <div className="hostel-card-heading"><span className="hostel-card-icon"><Plus size={16}/></span><div><span className="section-eyebrow">ROOM INVENTORY</span><h2>Add a room</h2></div></div>
            <form className="hostel-form-grid" onSubmit={(event) => saveRoom(event)}>
              <label>Hostel name<input required maxLength={100} value={roomDraft.hostelName} onChange={(event) => setRoomDraft({ ...roomDraft, hostelName: event.target.value })}/></label>
              <label>Block<input required maxLength={80} value={roomDraft.block} onChange={(event) => setRoomDraft({ ...roomDraft, block: event.target.value })}/></label>
              <label>Floor<input required maxLength={40} value={roomDraft.floor} onChange={(event) => setRoomDraft({ ...roomDraft, floor: event.target.value })}/></label>
              <label>Room number<input required maxLength={40} value={roomDraft.roomNumber} onChange={(event) => setRoomDraft({ ...roomDraft, roomNumber: event.target.value })}/></label>
              <label>Room capacity<input required type="number" min="1" max="20" value={roomDraft.capacity} onChange={(event) => setRoomDraft({ ...roomDraft, capacity: event.target.value })}/></label>
              <button className="module-primary" disabled={busy}><Plus size={14}/> Add room</button>
            </form>
          </section>
          <section className="hostel-management-card">
            <div className="hostel-card-heading"><span className="hostel-card-icon"><UsersRound size={16}/></span><div><span className="section-eyebrow">STUDENT PLACEMENT</span><h2>Assign or update an allotment</h2></div></div>
            <form className="hostel-form-grid hostel-allotment-form" onSubmit={assignRoom}>
              <label>Student<select required value={allotmentDraft.studentId} onChange={(event) => setAllotmentDraft({ ...allotmentDraft, studentId: event.target.value })}><option value="">Choose a student</option>{data.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.id}</option>)}</select></label>
              <label>Available room<select required value={allotmentDraft.roomId} onChange={(event) => setAllotmentDraft({ ...allotmentDraft, roomId: event.target.value })}><option value="">Choose a room</option>{data.rooms.filter((room) => data.allotments.filter((entry) => entry.roomId === room.id && entry.status === 'ALLOTTED').length < room.capacity).map((room) => <option key={room.id} value={room.id}>{room.hostelName} · {room.block} · Floor {room.floor} · Room {room.roomNumber}</option>)}</select></label>
              <button className="module-primary" disabled={busy || !data.students.length || !data.rooms.length}><ArrowRight size={14}/> Save allotment</button>
            </form>
            <p className="hostel-form-hint">Reassigning a resident keeps their previous allotment in the history.</p>
          </section>
          <section className="hostel-management-card">
            <div className="hostel-card-heading"><span className="hostel-card-icon"><Building2 size={16}/></span><div><span className="section-eyebrow">ROOM INVENTORY</span><h2>Rooms</h2></div><span className="results-count">{data.rooms.length} rooms</span></div>
            {data.rooms.length ? <div className="hostel-room-list">{data.rooms.map((room) => {
              const occupancy = data.allotments.filter((entry) => entry.roomId === room.id && entry.status === 'ALLOTTED').length
              const draft = editingRoom === room.id ? editingRoomDraft : null
              return <article className="hostel-room-row" key={room.id}>
                <span className="hostel-room-icon"><DoorOpen size={16}/></span>
                {draft ? <form className="hostel-inline-room-form" onSubmit={(event) => saveRoom(event, room.id)}>
                  {['hostelName', 'block', 'floor', 'roomNumber', 'capacity'].map((field) => <label key={field}>{({ hostelName: 'Hostel', block: 'Block', floor: 'Floor', roomNumber: 'Room', capacity: 'Capacity' })[field]}<input required type={field === 'capacity' ? 'number' : 'text'} min={field === 'capacity' ? '1' : undefined} max={field === 'capacity' ? '20' : undefined} value={draft[field]} onChange={(event) => setEditingRoomDraft({ ...draft, [field]: event.target.value })}/></label>)}
                  <button className="module-primary" disabled={busy}>Save</button><button type="button" className="hostel-cancel-button" onClick={() => { setEditingRoom(''); setEditingRoomDraft(null) }}>Cancel</button>
                </form> : <><div className="hostel-room-copy"><strong>{room.hostelName} · Room {room.roomNumber}</strong><span>Block {room.block} · Floor {room.floor}</span></div><span className="hostel-occupancy">{occupancy} / {room.capacity} residents</span><button className="hostel-icon-button" aria-label={`Edit room ${room.roomNumber}`} onClick={() => editRoom(room)}><Pencil size={14}/></button></>}
              </article>
            })}</div> : <div className="hostel-empty">Add a room to start managing hostel occupancy.</div>}
          </section>
          <section className="hostel-management-card">
            <div className="hostel-card-heading"><span className="hostel-card-icon"><Home size={16}/></span><div><span className="section-eyebrow">ALLOTMENT HISTORY</span><h2>Recent allotments</h2></div></div>
            <AllotmentRows allotments={data.allotments}/>
          </section>
        </>}

        {section === 'residents' && <section className="hostel-management-card">
          <div className="hostel-card-heading"><span className="hostel-card-icon"><UsersRound size={16}/></span><div><span className="section-eyebrow">ROOM-WISE ROSTER</span><h2>Hostel residents</h2></div><span className="results-count">{filteredResidents.length} residents</span></div>
          <label className="hostel-search">Search residents<input aria-label="Search residents" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, department, hostel, block, or room"/></label>
          {filteredResidents.length ? <div className="hostel-resident-list">{filteredResidents.map((resident) => <article key={resident.studentId} className="hostel-resident-row"><span className="hostel-resident-avatar">{resident.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><div><strong>{resident.name}</strong><span>{resident.department || 'Student'}</span></div><span className="hostel-resident-room">{resident.hostelName}<small>Block {resident.block} · Floor {resident.floor} · Room {resident.roomNumber}</small></span></article>)}</div> : <div className="hostel-empty">No residents match this search.</div>}
        </section>}

        {section === 'details' && <section className="hostel-management-card">
          <div className="hostel-card-heading"><span className="hostel-card-icon"><Home size={16}/></span><div><span className="section-eyebrow">STUDENT SELF-SERVICE</span><h2>Submitted Hostel details</h2></div><span className="results-count">{filteredHostelDetails.length} students</span></div>
          <label className="hostel-search">Search students<input aria-label="Search Hostel details" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Student name, hostel, room, type, or warden"/></label>
          {filteredHostelDetails.length ? <div className="hostel-submissions-list">{filteredHostelDetails.map((details) => <article className="hostel-submission-card" key={details.studentId}>
            <div className="hostel-submission-heading"><span className="hostel-resident-avatar">{(details.studentName || 'Student').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><div><strong>{details.studentName}</strong><small>{details.studentId} · Updated {formatDateTime(details.updatedAt)}</small></div><button className="hostel-secondary-button" onClick={() => openAdminDetailsForm(details)}><Pencil size={13}/> Edit details</button></div>
            <div className="hostel-submission-facts"><span><Building2 size={13}/>{details.hostelName}</span><span><DoorOpen size={13}/>Room {details.roomNumber}</span><span><Layers3 size={13}/>Floor {details.floor}</span><span><UsersRound size={13}/>{details.roomType}</span><span>{details.roomCooling || 'Cooling not specified'}</span></div>
            {!!details.roommateNames?.length && <div className="hostel-submission-warden"><UsersRound size={13}/><strong>Roommates:</strong><span>{details.roommateNames.join(', ')}</span></div>}
            {(details.wardenName || details.wardenContact) && <div className="hostel-submission-warden"><UserRound size={13}/><strong>{details.wardenName || 'Warden'}</strong>{details.wardenContact && <span><Phone size={12}/>{details.wardenContact}</span>}</div>}
            {details.additionalInformation && <p className="hostel-submission-note">{details.additionalInformation}</p>}
          </article>)}</div> : <div className="hostel-empty">No students have submitted Hostel details yet.</div>}
        </section>}

        {section === 'maintenance' && <section className="hostel-management-card">
          <div className="hostel-card-heading"><span className="hostel-card-icon"><Wrench size={16}/></span><div><span className="section-eyebrow">REPAIR REQUESTS</span><h2>Maintenance management</h2></div><span className="results-count">{filteredMaintenance.length} requests</span></div>
          <label className="hostel-search">Search requests<input aria-label="Search maintenance requests" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Student, category, description, or status"/></label>
          <MaintenanceRows requests={filteredMaintenance} admin onUpdate={updateMaintenance}/>
        </section>}
      </section>
      : data && <StudentHostel data={data} category={category} setCategory={setCategory} description={description} setDescription={setDescription} busy={busy} onSubmit={submitMaintenance} onAddDetails={openStudentDetailsForm} onEditDetails={openStudentDetailsForm}/>}

    {!loading && data && <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Hostel services available</span><span>Campus One · Puran Murti Vidyapeeth</span></footer>}
    {detailsDialogOpen && <HostelDetailsDialog draft={detailsDraft} setDraft={setDetailsDraft} busy={busy} error={error} isAdministrator={isAdministrator} onSave={saveHostelDetails} onClose={() => { setDetailsDialogOpen(false); setDetailsStudentId(''); setError('') }}/>}
  </div>
}

function StudentHostel({ data, category, setCategory, description, setDescription, busy, onSubmit, onAddDetails, onEditDetails }) {
  const allotment = data.currentAllotment
  const details = data.hostelDetails
  const hasSubmittedRoom = Boolean(details?.hostelName && details?.roomNumber)
  const room = getStudentRoom(allotment, details)
  const roommateNames = getStudentRoommateNames(data.roommates, details)
  const roommates = roommateNames.map((name) => ({ name }))
  return <div className="hostel-student-content">
    <StudentHostelDetails details={data.hostelDetails} onAdd={onAddDetails} onEdit={onEditDetails}/>
    <section className="hostel-room-feature">
      <div className="hostel-room-feature-art"><Building2 size={62} strokeWidth={1.2}/><span><DoorOpen size={14}/> YOUR SPACE</span></div>
      <div className="hostel-room-feature-content">
        <div className="hostel-feature-title"><span className="hostel-card-icon"><Home size={16}/></span><div><span className="section-eyebrow">YOUR ROOM</span><h2>My Room</h2></div>{room && <StatusPill status={allotment?.status || 'SUBMITTED'}/>}</div>
        {room ? <>
          {!allotment && <p className="hostel-room-source-note">Student-submitted details · awaiting Administration confirmation</p>}
          <div className="hostel-location-path"><span>{room.hostelName}</span><i>→</i><span>Block {allotment?.block || 'Not confirmed'}</span><i>→</i><span>Floor {room.floor}</span><i>→</i><strong>Room {room.roomNumber}</strong></div>
          <div className="hostel-room-detail-grid">
            <div><small>HOSTEL</small><strong>{room.hostelName}</strong></div>
            <div><small>BLOCK</small><strong>{allotment?.block || 'Not confirmed'}</strong></div>
            <div><small>FLOOR</small><strong>{room.floor}</strong></div>
            <div><small>ROOM NUMBER</small><strong>{room.roomNumber}</strong></div>
          </div>
        </> : <div className="hostel-unassigned">
          <span className="hostel-unassigned-icon"><Home size={19}/></span>
          <strong>No hostel room has been allotted yet.</strong>
          <span>Your hostel details will appear here after Administration completes your allotment.</span>
        </div>}
      </div>
    </section>

    <div className="hostel-student-cards">
      <section className="hostel-student-card">
        <div className="hostel-card-heading"><span className="hostel-card-icon"><Building2 size={16}/></span><div><span className="section-eyebrow">ALLOTMENT</span><h2>Hostel allotment</h2></div></div>
        {allotment ? <div className="hostel-allotment-summary"><div className="hostel-allotment-location"><strong>{allotment.hostelName}</strong><span>Block {allotment.block} · Floor {allotment.floor} · Room {allotment.roomNumber}</span></div><StatusPill status={allotment.status}/><small>Allotted {formatDate(allotment.createdAt)}</small></div> : hasSubmittedRoom
          ? <div className="hostel-allotment-summary"><div className="hostel-allotment-location"><strong>Student-submitted details</strong><span>{details.hostelName} · Floor {details.floor} · Room {details.roomNumber}</span></div><StatusPill status="SUBMITTED"/><small>Not yet confirmed by Administration</small></div>
          : <div className="hostel-empty hostel-allotment-empty"><span className="hostel-empty-icon"><Building2 size={16}/></span><span>Your current allotment will appear here once it is confirmed.</span></div>}
        {data.allotments.length > 1 && <div className="hostel-history"><strong>Allotment history</strong>{data.allotments.filter((entry) => entry.id !== allotment?.id).map((entry) => <div key={entry.id}><span>{entry.hostelName} · Block {entry.block} · Floor {entry.floor} · Room {entry.roomNumber}</span><StatusPill status={entry.status}/></div>)}</div>}
      </section>

      <section className="hostel-student-card">
        <div className="hostel-card-heading"><span className="hostel-card-icon hostel-resident-icon"><UsersRound size={16}/></span><div><span className="section-eyebrow">ROOMMATES / RESIDENTS</span><h2>People in your room</h2></div><span className="results-count">{roommates.length}</span></div>
        {roommates.length ? <div className="hostel-roommate-list">{roommates.map((roommate, index) => <article className="hostel-roommate-row" key={`${roommate.name}-${index}`}><span className="hostel-resident-avatar">{roommate.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><div><strong>{roommate.name}</strong><span>Roommate</span></div></article>)}</div>
          : <div className="hostel-empty hostel-resident-empty"><span className="hostel-empty-icon"><UsersRound size={16}/></span><span>No roommate details added yet.</span></div>}
      </section>

      <section className="hostel-student-card hostel-maintenance-card">
        <div className="hostel-card-heading"><span className="hostel-card-icon"><Wrench size={16}/></span><div><span className="section-eyebrow">ROOM CARE</span><h2>Maintenance</h2></div><span className="results-count">{data.maintenance.length} requests</span></div>
        <div className="hostel-maintenance-intro">Something in your accommodation needs attention? Send a request to the hostel team and follow its progress here.</div>
        <form className="hostel-maintenance-form" onSubmit={onSubmit}>
          <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Description<textarea required minLength={5} maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe what needs attention in your room…"/></label>
          <button className="module-primary" disabled={busy}><Wrench size={14}/>{busy ? 'Submitting…' : 'Create maintenance request'}<ArrowRight size={13}/></button>
        </form>
        <div className="hostel-request-list-heading"><strong>Your submitted requests</strong><span>{data.maintenance.length} {data.maintenance.length === 1 ? 'request' : 'requests'}</span></div>
        <MaintenanceRows requests={data.maintenance}/>
      </section>
    </div>
  </div>
}

function StudentHostelDetails({ details, onAdd, onEdit }) {
  return <section className={`hostel-details-feature ${details ? '' : 'hostel-details-feature-empty'}`}>
    <div className="hostel-details-feature-art"><Building2 size={48} strokeWidth={1.4}/><span>YOUR RESIDENCE</span></div>
    <div className="hostel-details-feature-body">
      <div className="hostel-details-heading"><div><span className="section-eyebrow">STUDENT SELF-SERVICE</span><h2>My Hostel Details</h2></div>
        {details ? <button className="hostel-secondary-button" onClick={onEdit}><Pencil size={13}/> Edit Details</button> : <button className="module-primary" onClick={onAdd}><Plus size={14}/> Add Hostel Details</button>}
      </div>
      {details ? <>
        <div className="hostel-details-path"><span><Building2 size={14}/>{details.hostelName}</span><i>→</i><span><Layers3 size={14}/>Floor {details.floor}</span><i>→</i><strong><DoorOpen size={14}/>Room {details.roomNumber}</strong></div>
        <div className="hostel-details-info-grid">
          <article><span className="hostel-info-icon"><DoorOpen size={15}/></span><div><small>ROOM NUMBER</small><strong>{details.roomNumber}</strong></div></article>
          <article><span className="hostel-info-icon"><UsersRound size={15}/></span><div><small>ROOM TYPE</small><strong>{details.roomType}</strong></div></article>
          <article><span className="hostel-info-icon"><Building2 size={15}/></span><div><small>ROOM COOLING</small><strong>{details.roomCooling || 'Not specified'}</strong></div></article>
        </div>
        {!!details.roommateNames?.length && <div className="hostel-details-roommates"><strong>Roommate Name(s)</strong><div>{details.roommateNames.map((name, index) => <span key={`${name}-${index}`}>{name}</span>)}</div></div>}
        {(details.wardenName || details.wardenContact) && <div className="hostel-details-warden"><span className="hostel-info-icon"><UserRound size={15}/></span><div><small>WARDEN{details.wardenName && details.wardenContact ? '' : ' · OPTIONAL'}</small><strong>{details.wardenName || 'Warden contact'}</strong></div>{details.wardenContact && <a href={`tel:${details.wardenContact}`}><Phone size={13}/>{details.wardenContact}</a>}</div>}
        {details.additionalInformation && <p className="hostel-details-additional">{details.additionalInformation}</p>}
        <div className="hostel-details-updated"><CalendarClock size={12}/>Last updated {formatDateTime(details.updatedAt)}</div>
      </> : <div className="hostel-details-empty"><span className="hostel-details-empty-icon"><Home size={23}/></span><div><strong>Your residence details, all in one place.</strong><span>Add your hostel and room information to make it easy to find whenever you need it.</span></div></div>}
    </div>
  </section>
}

function HostelDetailsDialog({ draft, setDraft, busy, error, isAdministrator, onSave, onClose }) {
  const roommateLimit = ROOMMATE_LIMITS[draft.roomType] ?? ROOMMATE_LIMITS.Shared
  const roommateNames = Array.isArray(draft.roommateNames) ? draft.roommateNames : []
  const roommateCount = roommateNames.filter((name) => typeof name === 'string' && name.trim()).length
  return <div className="hostel-details-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="hostel-details-dialog" role="dialog" aria-modal="true" aria-labelledby="hostel-details-dialog-title">
      <div className="hostel-dialog-heading"><span className="hostel-card-icon"><Building2 size={17}/></span><div><span className="section-eyebrow">{isAdministrator ? 'HOSTEL MANAGEMENT' : 'YOUR ACCOMMODATION'}</span><h2 id="hostel-details-dialog-title">{isAdministrator ? 'Edit student Hostel details' : draft.updatedAt ? 'Edit Hostel Details' : 'Add Hostel Details'}</h2></div><button className="hostel-icon-button" onClick={onClose} aria-label="Close"><X size={16}/></button></div>
      <p className="hostel-dialog-intro">Keep your residence information current. Fields marked optional can be left blank.</p>
      {error && <div className="management-alert" role="alert">{error}</div>}
      <form className="hostel-details-form" onSubmit={onSave}>
        <label>Hostel Name<select required value={draft.hostelName} onChange={(event) => setDraft({ ...draft, hostelName: event.target.value })}>{HOSTEL_NAMES.map((hostel) => <option key={hostel} value={hostel}>{hostel}</option>)}</select></label>
        <label>Room Number<input required maxLength={40} value={draft.roomNumber} onChange={(event) => setDraft({ ...draft, roomNumber: event.target.value })} placeholder="e.g. 204"/></label>
        <label>Floor<input required maxLength={40} value={draft.floor} onChange={(event) => setDraft({ ...draft, floor: event.target.value })} placeholder="e.g. 2"/></label>
        <label>Room Type<select required value={draft.roomType} onChange={(event) => setDraft({ ...draft, roomType: event.target.value })}>{ROOM_TYPES.map((roomType) => <option key={roomType}>{roomType}</option>)}</select></label>
        <label>Room Cooling<select required value={draft.roomCooling || ''} onChange={(event) => setDraft({ ...draft, roomCooling: event.target.value })}><option value="">Select cooling</option><option value="AC">AC</option><option value="Non-AC">Non-AC</option></select></label>
        <div className="hostel-roommate-fields">
          <div className="hostel-roommate-fields-heading"><strong>Roommate Name(s)</strong><span>{draft.roomType === 'Single' ? 'Not required for Single rooms' : `Up to ${roommateLimit} name${roommateLimit === 1 ? '' : 's'}`}</span></div>
          {roommateNames.map((name, index) => <div className="hostel-roommate-input-row" key={index}>
            <input aria-label={`Roommate name ${index + 1}`} maxLength={100} value={name} onChange={(event) => setDraft({ ...draft, roommateNames: roommateNames.map((current, currentIndex) => currentIndex === index ? event.target.value : current) })} placeholder="Roommate name"/>
            <button type="button" className="hostel-icon-button" aria-label={`Remove roommate ${index + 1}`} onClick={() => setDraft({ ...draft, roommateNames: roommateNames.filter((_, currentIndex) => currentIndex !== index) })}><X size={14}/></button>
          </div>)}
          <button type="button" className="hostel-add-roommate" disabled={draft.roomType === 'Single' || roommateNames.length >= roommateLimit || roommateCount >= roommateLimit} onClick={() => setDraft({ ...draft, roommateNames: [...roommateNames, ''] })}><Plus size={13}/>Add roommate</button>
          {roommateCount > roommateLimit && <span className="hostel-roommate-validation">Remove names to meet the {draft.roomType} room limit of {roommateLimit}.</span>}
        </div>
        <label>Warden Name <span>Optional</span><input maxLength={100} value={draft.wardenName} onChange={(event) => setDraft({ ...draft, wardenName: event.target.value })} placeholder="Warden name"/></label>
        <label>Warden Contact <span>Optional</span><input type="tel" maxLength={40} value={draft.wardenContact} onChange={(event) => setDraft({ ...draft, wardenContact: event.target.value })} placeholder="Contact number"/></label>
        <label className="hostel-details-form-wide">Additional Room Information <span>Optional</span><textarea maxLength={1000} rows={3} value={draft.additionalInformation} onChange={(event) => setDraft({ ...draft, additionalInformation: event.target.value })} placeholder="Anything else helpful about your room…"/></label>
        <div className="hostel-details-form-actions"><button type="button" className="hostel-secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="module-primary" disabled={busy}><Save size={14}/>{busy ? 'Saving…' : 'Save details'}</button></div>
      </form>
    </section>
  </div>
}

function AllotmentRows({ allotments }) {
  if (!allotments.length) return <div className="hostel-empty">No student allotments have been recorded.</div>
  return <div className="hostel-allotment-list">{allotments.map((entry) => <article key={entry.id}><div><strong>{entry.studentName} <small>{entry.studentId}</small></strong><span>{entry.hostelName} · Block {entry.block} · Floor {entry.floor} · Room {entry.roomNumber}</span></div><StatusPill status={entry.status}/></article>)}</div>
}

function MaintenanceRows({ requests, admin = false, onUpdate }) {
  if (!requests.length) return <div className="hostel-empty">No maintenance requests to show.</div>
  return <div className="hostel-maintenance-list">{requests.map((request) => <article key={request.id}>
    <span className="hostel-maintenance-icon"><Wrench size={15}/></span>
    <div className="hostel-maintenance-copy"><strong>{request.category} issue {admin && request.studentName ? `· ${request.studentName}` : ''}</strong><span>{request.description}</span><small>{formatDate(request.createdAt)}{admin ? ` · ${request.studentId}` : ''}</small></div>
    {admin ? <select className={`hostel-status-select hostel-status-${request.status.toLowerCase()}`} aria-label={`Update ${request.category} request from ${request.studentName || request.studentId}`} value={request.status} onChange={(event) => onUpdate(request, event.target.value)}>{STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select> : <StatusPill status={request.status}/>}
  </article>)}</div>
}

function StatusPill({ status }) {
  return <span className={`hostel-status-pill hostel-status-${status.toLowerCase()}`}><i/>{statusLabel(status)}</span>
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available'
}

export default Hostel
