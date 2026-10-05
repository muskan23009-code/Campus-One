import { useCallback, useEffect, useState } from 'react'
import { Check, GraduationCap, RefreshCw, UserRound, UsersRound, X } from 'lucide-react'
import { api } from '../api/client'
import ApprovalRequestDetails from './ApprovalRequestDetails.jsx'

export default function DepartmentDashboard({ user, page, requestId, onClearRequest, onNotify }) {
  const [records, setRecords] = useState([])
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const endpoint = page === 'department-requests' ? '/api/hod/requests' : '/api/hod/students'
      const result = await api(endpoint)
      const nextRecords = page === 'department-requests' ? result.requests : result.students
      setRecords(nextRecords)
      if (page === 'department-requests' && requestId) {
        const matchedRequest = nextRecords.find((item) => item.id === requestId)
        if (matchedRequest) setSelectedRequest(matchedRequest)
        else {
          const detail = await api(`/api/hod/requests/${encodeURIComponent(requestId)}`)
          setSelectedRequest(detail.request)
        }
      }
    } catch (reason) { setError(reason.message) } finally { setLoading(false) }
  }, [page, requestId])

  useEffect(() => { refresh() }, [refresh])

  async function review(application, status) {
    setBusyId(application.id)
    setError('')
    try {
      const result = await api(`/api/hod/requests/${encodeURIComponent(application.id)}`, { method: 'PATCH', body: { status } })
      setRecords((current) => current.filter((item) => item.id !== application.id))
      setSelectedRequest((current) => current?.id === application.id ? result.application : current)
      onNotify(status === 'Accepted'
        ? `${application.name} approved · new student ID ${result.userId}. The applicant can now create a password.`
        : `${application.name}’s registration was rejected.`)
    } catch (reason) { setError(reason.message) } finally { setBusyId('') }
  }

  const requestView = page === 'department-requests'

  function closeRequestDetails() {
    setSelectedRequest(null)
    onClearRequest()
    const params = new URLSearchParams(window.location.search)
    params.delete('request')
    const suffix = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${suffix ? `?${suffix}` : ''}`)
  }

  return <div className="module-page page-enter management-page department-page">
    <div className="module-breadcrumb">DEPARTMENT <span>›</span> {user.department.toUpperCase()}</div>
    <section className="module-hero"><div className="module-title-area"><span className="module-icon"><GraduationCap size={20}/></span><span className="module-eyebrow">DEPARTMENT ACCESS · {user.department.toUpperCase()}</span><h1>{requestView ? 'Student registration requests' : 'Department students'}<span className="module-title-period">.</span></h1><p>{requestView ? 'Review registrations for your department. Only the HOD for this department can approve these students.' : 'View enrolled students belonging to your assigned department.'}</p></div><button className="module-row-action" onClick={refresh} disabled={loading}><RefreshCw size={14}/> Refresh</button></section>
    <section className="module-stats"><div className="module-stat"><span className="module-stat-icon"><UsersRound size={15}/></span><span><span>Assigned department</span><strong>{user.department}</strong></span></div><div className="module-stat"><span className="module-stat-icon"><UserRound size={15}/></span><span><span>{requestView ? 'Pending student requests' : 'Department students'}</span><strong>{records.length} {requestView ? 'to review' : 'students'}</strong></span></div><div className="module-stat"><span className="module-stat-icon"><Check size={15}/></span><span><span>HOD access</span><strong>Department restricted</strong></span></div></section>
    {error && <div className="management-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
    <section className="management-section"><div className="management-heading"><div><span className="section-eyebrow">{user.department.toUpperCase()}</span><h2>{requestView ? 'Student applications' : 'Enrolled students'}</h2></div><span className="results-count">{records.length} {requestView ? 'requests' : 'students'}</span></div>
      {loading ? <div className="management-state"><span className="loading-spinner"/>Loading department records…</div> : records.length === 0 ? <div className="management-state">{requestView ? 'No student registration requests are awaiting review.' : 'There are no enrolled students in this department yet.'}</div> : <div className="department-table-wrap"><table className="user-table department-table"><thead><tr>{requestView ? <><th>STUDENT</th><th>ROLL / ENROLLMENT</th><th>COURSE</th><th>SEMESTER</th><th>ADMISSION YEAR</th><th>CONTACT</th><th>SUBMITTED</th><th>DECISION</th></> : <><th>STUDENT</th><th>USER ID</th><th>ROLL / ENROLLMENT</th><th>COURSE</th><th>SEMESTER</th><th>ADMISSION YEAR</th><th>STATUS</th></>}</tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><span className="user-cell"><span className="user-initials">{initials(record.name)}</span><span><strong>{record.name}</strong><small>{record.department}</small>{requestView && <button className="request-view-button" onClick={() => setSelectedRequest(record)}>View Request</button>}</span></span></td>{requestView ? <><td>{record.rollNumber}</td><td>{record.course}</td><td>{record.semester}</td><td>{record.admissionYear}</td><td><span className="department-contact"><span>{record.mobile}</span><span>{record.email}</span></span></td><td>{new Date(record.createdAt).toLocaleDateString()}</td><td><span className="department-review-actions"><button className="review-accept" disabled={busyId === record.id} onClick={() => review(record, 'Accepted')}><Check size={13}/>{busyId === record.id ? 'Accepting…' : 'ACCEPT'}</button><button className="review-reject" disabled={busyId === record.id} onClick={() => review(record, 'Rejected')}><X size={13}/>{busyId === record.id ? 'Rejecting…' : 'REJECT'}</button></span></td></> : <><td><code className="user-id-tag">{record.id}</code></td><td>{record.rollNumber}</td><td>{record.course}</td><td>{record.semester}</td><td>{record.admissionYear}</td><td><span className={`account-status ${record.active ? 'status-active' : 'status-inactive'}`}><i/>{record.active ? 'Active' : 'Inactive'}</span></td></>}</tr>)}</tbody></table></div>}
    </section>
    {requestView && selectedRequest && <ApprovalRequestDetails request={selectedRequest} busy={busyId === selectedRequest.id} error={error} onClose={closeRequestDetails} onReview={(status) => review(selectedRequest, status)}/>}
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Department data protected by server-side access checks</span><span>{user.role} · {user.id}</span></footer>
  </div>
}

function initials(name) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }