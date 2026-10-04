import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Search, ShieldCheck, UsersRound, X } from 'lucide-react'
import { api } from '../api/client'
import { APP_ROLES, LOGIN_ROLES } from '../auth/access'

const CATEGORIES = [APP_ROLES.STUDENT, APP_ROLES.STAFF, APP_ROLES.HOD, APP_ROLES.SPORTS, APP_ROLES.ADMIN]

export default function AdministrationUsers({ currentUser, onNotify }) {
  const [users, setUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get('view') === 'requests' ? 'requests' : 'accounts')
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('request') || '')
  const [roleFilter, setRoleFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(window.location.search).get('view') === 'requests' ? 'pending' : '')
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [userResult, requestResult, setupResult] = await Promise.all([
        api('/api/users'), api('/api/admin/requests'), api('/api/auth/bootstrap-status'),
      ])
      setUsers(userResult.users)
      setRequests(requestResult.requests)
      setDepartments(setupResult.departments || [])
    } catch (reason) { setError(reason.message) } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map((role) => [role, users.filter((user) => user.role === role).length])), [users])
  const pendingCount = requests.filter((request) => request.status === 'Pending').length
  const searched = (record) => `${record.id || ''} ${record.name} ${record.email || ''} ${record.role} ${record.department || ''} ${record.designation || ''} ${record.course || ''} ${record.sport || ''}`.toLowerCase().includes(query.toLowerCase())
  const visibleUsers = useMemo(() => users.filter((user) => searched(user) && (!roleFilter || user.role === roleFilter) && (!departmentFilter || user.department === departmentFilter) && (!statusFilter || (statusFilter === 'active' ? user.active : !user.active))), [users, query, roleFilter, departmentFilter, statusFilter])
  const visibleRequests = useMemo(() => requests.filter((request) => searched(request) && (!roleFilter || request.role === roleFilter) && (!departmentFilter || request.department === departmentFilter) && (!statusFilter || request.status.toLowerCase() === statusFilter)), [requests, query, roleFilter, departmentFilter, statusFilter])

  async function reviewRequest(application, status) {
    setBusyId(application.id)
    setError('')
    try {
      const result = await api(`/api/admin/requests/${encodeURIComponent(application.id)}`, { method: 'PATCH', body: { status } })
      setRequests((current) => current.map((request) => request.id === application.id ? result.request : request))
      if (result.userId) setUsers((current) => [...current, result.request && { ...application, ...result.request, id: result.userId, active: true }])
      onNotify(status === 'Accepted' ? `${application.name} approved · ${result.userId}` : `${application.name}’s request rejected.`)
    } catch (reason) { setError(reason.message) } finally { setBusyId('') }
  }

  async function toggleActive(user) {
    setError('')
    try {
      const result = await api(`/api/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: { active: !user.active } })
      setUsers((current) => current.map((item) => item.id === user.id ? result.user : item))
      onNotify(`${result.user.id} ${result.user.active ? 'activated' : 'deactivated'}.`)
    } catch (reason) { setError(reason.message) }
  }

  async function saveEdit(event) {
    event.preventDefault()
    if (!editing) return
    setBusyId(editing.id)
    setError('')
    try {
      const result = await api(`/api/users/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: { name: editing.name, email: editing.email } })
      setUsers((current) => current.map((item) => item.id === result.user.id ? result.user : item))
      setEditing(null)
      onNotify(`Account details updated for ${result.user.id}.`)
    } catch (reason) { setError(reason.message) } finally { setBusyId('') }
  }

  return <div className="module-page page-enter management-page">
    <div className="module-breadcrumb">CAMPUS <span>›</span> ADMINISTRATION</div>
    <section className="module-hero"><div className="module-title-area"><span className="module-icon"><UsersRound size={20}/></span><span className="module-eyebrow">CAMPUS ACCOUNTS · REQUESTS · ACCESS</span><h1>User management<span className="module-title-period">.</span></h1><p>Review access requests and manage approved campus accounts. Applicants create their own passwords.</p></div><span className="management-admin-chip"><ShieldCheck size={13}/> Administration</span></section>
    <section className="category-count-grid">{CATEGORIES.map((role) => <button className={`category-count ${roleFilter === role ? 'category-count-active' : ''}`} key={role} onClick={() => { setRoleFilter(roleFilter === role ? '' : role); setView('accounts') }}><span>{roleLabel(role)}</span><strong>{counts[role] || 0}</strong><small>{(counts[role] || 0) === 1 ? 'account' : 'accounts'}</small></button>)}</section>
    {error && <div className="management-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
    <section className="management-section">
      <div className="admin-user-tabs" role="tablist"><button role="tab" aria-selected={view === 'accounts'} className={view === 'accounts' ? 'admin-user-tab-active' : ''} onClick={() => { setView('accounts'); setStatusFilter('') }}>Accounts <span>{users.length}</span></button><button role="tab" aria-selected={view === 'requests'} className={view === 'requests' ? 'admin-user-tab-active' : ''} onClick={() => { setView('requests'); setRoleFilter(''); setStatusFilter('pending') }}>Pending requests <span>{pendingCount}</span></button></div>
      <div className="management-heading"><div><span className="section-eyebrow">{view === 'accounts' ? 'APPROVED CAMPUS MEMBERS' : 'STAFF · HODS · SPORTS CAPTAINS'}</span><h2>{view === 'accounts' ? `${visibleUsers.length} campus accounts` : 'Access requests'}</h2></div><label className="module-search user-search"><Search size={15}/><input aria-label="Search users and requests" placeholder="Search name, ID, course or sport…" value={query} onChange={(event) => setQuery(event.target.value)}/></label></div>
      <div className="admin-filter-row"><label><span>ROLE</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option>{CATEGORIES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label><label><span>DEPARTMENT</span><select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department}>{department}</option>)}</select></label><label><span>STATUS</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{view === 'requests' ? <><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="">All statuses</option></> : <><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></>}</select></label><button className="filter-reset" onClick={() => { setQuery(''); setRoleFilter(''); setDepartmentFilter(''); setStatusFilter(view === 'requests' ? 'pending' : '') }}>Clear filters</button></div>
      {loading ? <div className="management-state"><span className="loading-spinner"/>Loading campus accounts…</div> : view === 'accounts' ? visibleUsers.length === 0 ? <div className="management-state">No accounts match the selected filters.</div> : <div className="user-table-wrap"><table className="user-table admin-accounts-table"><thead><tr><th>NAME</th><th>USER ID</th><th>ROLE</th><th>COURSE / SPORT</th><th>DEPARTMENT / DESIGNATION</th><th>STATUS</th><th>MANAGE</th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}><td><span className="user-cell"><span className="user-initials">{initials(user.name)}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></span></td><td><code className="user-id-tag">{user.id}</code></td><td><span className={`role-tag ${roleClass(user.role)}`}>{roleLabel(user.role)}</span></td><td>{studentCourse(user)}</td><td>{user.department || user.designation || '—'}{user.department && user.designation && <small className="table-secondary">{user.designation}</small>}</td><td><span className={`account-status ${user.active ? 'status-active' : 'status-inactive'}`}><i/>{user.active ? 'Active' : 'Inactive'}</span></td><td><span className="user-row-actions"><button className="user-action" aria-label={`Edit ${user.name}`} title="Edit name and email" onClick={() => setEditing({ id: user.id, name: user.name, email: user.email || '' })}>Edit</button>{user.id !== currentUser.id && <button className={`user-action ${user.active ? 'deactivate-action' : 'activate-action'}`} aria-label={`${user.active ? 'Deactivate' : 'Activate'} ${user.name}`} title={user.active ? 'Deactivate account' : 'Reactivate account'} onClick={() => toggleActive(user)}>{user.active ? <X size={14}/> : <Check size={14}/>}</button>}</span></td></tr>)}</tbody></table></div> : visibleRequests.length === 0 ? <div className="management-state">No requests match the selected filters.</div> : <div className="admin-request-list">{visibleRequests.map((request) => <article className="admin-request-card" key={request.id}><span className={`sports-record-icon ${roleClassBg(request.role)}`}><RequestIcon role={request.role}/></span><div className="admin-request-details"><div className="admin-request-heading"><strong>{request.name}</strong><span className={`role-tag ${roleClass(request.role)}`}>{roleLabel(request.role)}</span><span className={`application-status application-${request.status.toLowerCase()}`}><i/>{request.status}</span></div><div className="admin-request-fields">{request.gender} · {request.mobile} · {request.email}{request.department && ` · ${request.department}`}{request.designation && ` · ${request.designation}`}{request.joiningYear && ` · Joined ${request.joiningYear}`}{request.sport && ` · ${request.sport} · ${request.teamCategory}`}</div><small>Submitted {new Date(request.createdAt).toLocaleDateString()}</small>{request.status === 'Accepted' && <code className="user-id-tag">{request.assignedUserId}</code>}</div>{request.status === 'Pending' && <div className="department-review-actions"><button className="review-accept" disabled={busyId === request.id} onClick={() => reviewRequest(request, 'Accepted')}><Check size={13}/> Allow / Accept</button><button className="review-reject" disabled={busyId === request.id} onClick={() => reviewRequest(request, 'Rejected')}><X size={13}/> Reject</button></div>}</article>)}</div>}
    </section>
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Only approved accounts can sign in</span><span>Administration · {currentUser.id}</span></footer>
    {editing && <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && setEditing(null)}><section className="feedback-modal user-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-edit-title"><div className="modal-top"><span className="modal-icon"><UsersRound size={19}/></span><button className="icon-btn" onClick={() => setEditing(null)} aria-label="Close"><X size={18}/></button></div><span className="section-eyebrow">ACCOUNT DETAILS · {editing.id}</span><h2 id="admin-edit-title">Update contact details.</h2><form className="user-form" onSubmit={saveEdit}><label htmlFor="edit-user-name">FULL NAME</label><input id="edit-user-name" minLength={2} maxLength={100} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} required/><label htmlFor="edit-user-email">EMAIL</label><input id="edit-user-email" type="email" maxLength={254} value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })}/><p className="form-hint">Role and User ID are immutable. Passwords are changed by each user in their own account.</p>{error && <span className="login-form-error">{error}</span>}<div className="modal-actions"><button type="button" className="modal-cancel" onClick={() => setEditing(null)}>Cancel</button><button className="module-primary" disabled={busyId === editing.id}>{busyId === editing.id ? 'Saving…' : 'Save changes'} <ArrowRight size={13}/></button></div></form></section></div>}
  </div>
}

function roleLabel(role) { return role === APP_ROLES.ADMIN ? 'Administration' : role === APP_ROLES.SPORTS ? 'Sports Captain' : role }
function roleClass(role) { return { Student: 'role-student', Staff: 'role-staff', HOD: 'role-admin', Administration: 'role-admin', 'Sports Captain': 'role-sports' }[role] || '' }
function roleClassBg(role) { return role === APP_ROLES.HOD ? 'record-amber' : role === APP_ROLES.SPORTS ? 'record-blue' : '' }
function initials(name) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }
function studentCourse(user) { return user.role === APP_ROLES.STUDENT ? `${user.course || '—'} · ${user.semester || '—'}` : user.sport ? `${user.sport} · ${user.teamCategory}` : '—' }
function RequestIcon({ role }) { if (role === APP_ROLES.HOD) return <ShieldCheck size={16}/>; if (role === APP_ROLES.SPORTS) return <Check size={16}/>; return <UsersRound size={16}/> }