import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Award, Check, Dumbbell, Medal, Plus, Trash2, Trophy, UsersRound, X } from 'lucide-react'
import { api } from '../api/client'

const KINDS = ['Team', 'Player', 'Sports event', 'Participation', 'Equipment', 'Announcement', 'Information']

export default function SportsManagement({ onNotify, user }) {
  const [records, setRecords] = useState([])
  const [kind, setKind] = useState('Team')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/sports').then((result) => setRecords(result.records)).catch((reason) => setError(reason.message)).finally(() => setLoading(false))
  }, [])

  async function addRecord(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await api('/api/sports', { method: 'POST', body: { kind, title, description } })
      setRecords((current) => [result.record, ...current])
      setTitle('')
      setDescription('')
      onNotify(`${kind} added to sports & wellness.`)
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  async function removeRecord(record) {
    setError('')
    try {
      await api(`/api/sports/${encodeURIComponent(record.id)}`, { method: 'DELETE' })
      setRecords((current) => current.filter((entry) => entry.id !== record.id))
      onNotify(`${record.title} removed.`)
    } catch (reason) { setError(reason.message) }
  }

  return <div className="module-page page-enter management-page sports-management-page">
    <div className="module-breadcrumb">STUDENT LIFE <span>›</span> SPORTS & WELLNESS</div>
    <section className="module-hero"><div className="module-title-area"><span className="module-icon"><Trophy size={20}/></span><span className="module-eyebrow">A CAMPUS THAT PLAYS TOGETHER</span><h1>Sports & wellness<span className="module-title-period">.</span></h1><p>Manage teams, participants, events, announcements and equipment for the campus community.</p></div><span className="sports-captain-chip"><span/><span>Your role<strong>{user.role}</strong></span></span></section>
    <section className="module-stats"><div className="module-stat"><span className="module-stat-icon"><UsersRound size={15}/></span><span><span>Teams & players</span><strong>{records.filter((item) => ['Team', 'Player'].includes(item.kind)).length} records</strong></span></div><div className="module-stat"><span className="module-stat-icon"><CalendarDaysIcon/></span><span><span>Activities & events</span><strong>{records.filter((item) => ['Sports event', 'Participation'].includes(item.kind)).length} records</strong></span></div><div className="module-stat"><span className="module-stat-icon"><Dumbbell size={15}/></span><span><span>Equipment & updates</span><strong>{records.filter((item) => ['Equipment', 'Announcement', 'Information'].includes(item.kind)).length} records</strong></span></div></section>
    {error && <div className="management-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
    <div className="sports-admin-grid"><section className="sports-entry-section"><div className="management-heading"><div><span className="section-eyebrow">CAMPUS ATHLETICS</span><h2>Teams, players & activities</h2></div><span className="results-count">{records.length} entries</span></div>{loading ? <div className="management-state"><span className="loading-spinner"/>Loading sports records…</div> : <div className="sports-record-list">{records.map((record) => <article className="sports-record-row" key={record.id}><span className={`sports-record-icon ${record.kind === 'Announcement' ? 'record-amber' : record.kind === 'Sports event' ? 'record-blue' : ''}`}><RecordIcon kind={record.kind}/></span><div className="module-row-body"><span className="sports-record-kind">{record.kind}</span><strong>{record.title}</strong><span>{record.description}</span></div><button className="user-action deactivate-action" aria-label={`Remove ${record.title}`} title="Remove record" onClick={() => removeRecord(record)}><Trash2 size={14}/></button></article>)}{records.length === 0 && <div className="management-state">No sports records yet. Add the first team or activity.</div>}</div>}</section>
      <section className="sports-create-section"><span className="sports-create-icon"><Plus size={16}/></span><span className="section-eyebrow">KEEP CAMPUS MOVING</span><h2>Add an update</h2><p>Share a team, student, sports event, participation record, equipment detail or announcement.</p><form className="user-form" onSubmit={addRecord}><label htmlFor="sports-kind">CATEGORY</label><select id="sports-kind" value={kind} onChange={(event) => setKind(event.target.value)}>{KINDS.map((item) => <option key={item}>{item}</option>)}</select><label htmlFor="sports-title">TITLE</label><input id="sports-title" value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={100} placeholder={kind === 'Team' ? 'e.g. Badminton team' : `Name your ${kind.toLowerCase()}`} required/><label htmlFor="sports-description">DETAILS</label><textarea id="sports-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} minLength={3} maxLength={1000} placeholder="Share the information students need…" required/><button className="module-primary" disabled={saving}>{saving ? 'Adding…' : 'Add to sports'} <ArrowRight size={13}/></button></form></section></div>
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Sports information is available campus-wide</span><span>No court or facility bookings are managed here.</span></footer>
  </div>
}

function CalendarDaysIcon() { return <Award size={15}/> }
function RecordIcon({ kind }) { if (kind === 'Team' || kind === 'Player') return <UsersRound size={16}/>; if (kind === 'Sports event' || kind === 'Participation') return <Medal size={16}/>; if (kind === 'Equipment') return <Dumbbell size={16}/>; if (kind === 'Announcement') return <Activity size={16}/>; return <Trophy size={16}/> }