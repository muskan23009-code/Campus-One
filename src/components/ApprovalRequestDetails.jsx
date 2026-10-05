import { Check, X } from 'lucide-react'

const DETAIL_FIELDS = [
  ['gender', 'Gender'],
  ['dateOfBirth', 'Date of birth'],
  ['mobile', 'Mobile'],
  ['email', 'Email'],
  ['department', 'Department'],
  ['rollNumber', 'Roll / enrollment number'],
  ['course', 'Course'],
  ['semester', 'Semester'],
  ['admissionYear', 'Admission year'],
  ['designation', 'Designation'],
  ['joiningYear', 'Joining year'],
  ['sport', 'Sport'],
  ['teamCategory', 'Team / category'],
]

export default function ApprovalRequestDetails({ request, busy, error, onClose, onReview }) {
  if (!request) return null

  return <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="feedback-modal approval-request-dialog" role="dialog" aria-modal="true" aria-labelledby="approval-request-title">
      <div className="modal-top"><span className="modal-icon"><Check size={19}/></span><button className="icon-btn" onClick={onClose} aria-label="Close request details"><X size={18}/></button></div>
      <span className="section-eyebrow">{request.role.toUpperCase()} REQUEST · {request.id}</span>
      <h2 id="approval-request-title">{request.name}</h2>
      <div className="approval-request-summary">
        <span className={`application-status application-${request.status.toLowerCase()}`}><i/>{request.status}</span>
        <span>Submitted {new Date(request.createdAt).toLocaleString()}</span>
        {request.assignedUserId && <span>Assigned ID <code className="user-id-tag">{request.assignedUserId}</code></span>}
      </div>
      <dl className="approval-request-fields">
        {DETAIL_FIELDS.filter(([key]) => request[key] !== undefined && request[key] !== '').map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{request[key]}</dd></div>)}
      </dl>
      {error && <div className="management-alert" role="alert">{error}</div>}
      {request.status === 'Pending' && <div className="approval-request-actions">
        <button className="review-accept" disabled={busy} aria-busy={busy} onClick={() => onReview('Accepted')}><Check size={13}/>{busy ? 'Accepting...' : 'ACCEPT'}</button>
        <button className="review-reject" disabled={busy} aria-busy={busy} onClick={() => onReview('Rejected')}><X size={13}/>{busy ? 'Rejecting...' : 'REJECT'}</button>
      </div>}
    </section>
  </div>
}
