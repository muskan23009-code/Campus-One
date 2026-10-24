import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Check, ChevronRight, CircleHelp, Heart, Lightbulb,
  MessageSquareText, Send, ShieldCheck, ThumbsUp, X,
} from 'lucide-react'
import { api } from '../api/client'

const CATEGORIES = [
  'Academics', 'Hostel', 'Food & Dining', 'Infrastructure', 'Sports',
  'Events & Clubs', 'Safety', 'Other',
]
const STATUSES = ['Submitted', 'Under Review', 'Approved', 'In Progress', 'Implemented', 'Declined']
const ANONYMOUS_TYPES = ['Concern', 'Suggestion', 'Appreciation']
const NEXT_STATUSES = {
  Submitted: ['Under Review', 'Declined'],
  'Under Review': ['Approved', 'Declined'],
  Approved: ['In Progress', 'Declined'],
  'In Progress': ['Implemented', 'Declined'],
  Implemented: [],
  Declined: [],
}

export default function CampusVoice({ user, onNotify }) {
  const isAdmin = user.role === 'Administration'
  const [ideas, setIdeas] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [selected, setSelected] = useState(null)
  const [formKind, setFormKind] = useState('')
  const [filters, setFilters] = useState({ category: '', status: '' })
  const [form, setForm] = useState({ type: 'Concern', category: CATEGORIES[0], title: '', description: '', location: '' })
  const [officialResponse, setOfficialResponse] = useState('')
  const [implementationUpdate, setImplementationUpdate] = useState('')
  const [status, setStatus] = useState('Submitted')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadRecords() {
    const params = new URLSearchParams()
    if (isAdmin && filters.category) params.set('category', filters.category)
    if (isAdmin && filters.status) params.set('status', filters.status)
    const suffix = params.size ? `?${params}` : ''
    const [ideaResult, submissionResult] = await Promise.all([
      api('/api/campus-voice/ideas'),
      api(`/api/campus-voice/submissions${suffix}`),
    ])
    setIdeas(ideaResult.ideas)
    setSubmissions(submissionResult.submissions)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    loadRecords()
      .catch((reason) => { if (active) setError(reason.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isAdmin, filters.category, filters.status])

  const communityIdeas = useMemo(
    () => [...ideas].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [ideas],
  )
  const implementedIdeas = ideas.filter((idea) => idea.status === 'Implemented' && idea.implementationUpdate)

  function openDetails(record) {
    setSelected(record)
    setStatus(record.status)
    setOfficialResponse(record.officialResponse || '')
    setImplementationUpdate(record.implementationUpdate || '')
    setError('')
  }

  async function openDetailsFromServer(record) {
    setError('')
    try {
      const result = await api(`/api/campus-voice/submissions/${encodeURIComponent(record.id)}`)
      openDetails(result.submission)
    } catch (reason) { setError(reason.message) }
  }

  function resetForm() {
    setFormKind('')
    setForm({ type: 'Concern', category: CATEGORIES[0], title: '', description: '', location: '' })
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const kind = formKind === 'idea' ? 'IDEA' : 'ANONYMOUS'
      await api('/api/campus-voice/submissions', {
        method: 'POST',
        body: { ...form, kind, type: kind === 'IDEA' ? 'Idea' : form.type },
      })
      resetForm()
      await loadRecords()
      onNotify(kind === 'IDEA' ? 'Your idea has been submitted.' : 'Your anonymous voice has been shared.')
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  async function supportIdea(idea) {
    setError('')
    try {
      const result = await api(`/api/campus-voice/ideas/${encodeURIComponent(idea.id)}/support`, { method: 'POST' })
      setIdeas((current) => current.map((item) => item.id === idea.id ? result.idea : item))
      if (selected?.id === idea.id) setSelected(result.idea)
      onNotify(result.supported ? 'You supported this campus idea.' : 'Your support was removed.')
    } catch (reason) { setError(reason.message) }
  }

  async function saveAdministrationUpdate(event) {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const result = await api(`/api/campus-voice/submissions/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        body: { status, officialResponse, implementationUpdate },
      })
      setSelected(result.submission)
      await loadRecords()
      onNotify('Campus Voice submission updated.')
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  return <div className="module-page page-enter campus-voice-page">
    <div className="module-breadcrumb">CAMPUS <span>›</span> STUDENT VOICE</div>
    <section className="campus-voice-hero">
      <div className="campus-voice-orbit voice-orbit-one" />
      <div className="campus-voice-orbit voice-orbit-two" />
      <div className="campus-voice-hero-copy">
        <span className="campus-voice-kicker"><span className="voice-spark" /> A BETTER CAMPUS, TOGETHER</span>
        <h1>CAMPUS VOICE</h1>
        <h2>Speak. Support. Improve.</h2>
        <p>Share your thoughts, suggest improvements, and help make our campus better.</p>
        <div className="voice-journey"><span>Students speak</span><ChevronRight/><span>Students support</span><ChevronRight/><span>Administration acts</span></div>
      </div>
      <div className="voice-hero-art" aria-hidden="true"><div className="voice-art-sun"/><div className="voice-art-speech"><MessageSquareText size={30}/><i/><i/><i/></div><div className="voice-art-leaf leaf-a"/><div className="voice-art-leaf leaf-b"/><div className="voice-art-ground"/></div>
    </section>

    {error && <div className="management-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}

    {!isAdmin && <section className="voice-action-grid" aria-label="Campus Voice actions">
      <button className="voice-action voice-action-anonymous" onClick={() => setFormKind('anonymous')}>
        <span className="voice-action-icon"><ShieldCheck size={21}/></span><span className="voice-action-copy"><strong>Share Anonymously</strong><small>A private way to be heard, with no name shown.</small></span><ArrowRight size={18}/>
      </button>
      <button className="voice-action voice-action-idea" onClick={() => setFormKind('idea')}>
        <span className="voice-action-icon"><Lightbulb size={21}/></span><span className="voice-action-copy"><strong>Submit an Idea</strong><small>Bring your campus improvement idea to life.</small></span><ArrowRight size={18}/>
      </button>
      <button className="voice-action voice-action-explore" onClick={() => document.getElementById('voice-community')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        <span className="voice-action-icon"><Heart size={21}/></span><span className="voice-action-copy"><strong>Explore Community Ideas</strong><small>Support the changes you want to see.</small></span><ArrowRight size={18}/>
      </button>
    </section>}

    {isAdmin && <section className="voice-admin-banner"><span className="voice-admin-icon"><ShieldCheck size={20}/></span><div><strong>Administration workspace</strong><p>Review student submissions, share official responses, and record real implementation updates.</p></div><span className="voice-admin-total">{submissions.length} submissions</span></section>}

    <section id="voice-community" className="voice-section">
      <div className="voice-section-heading"><div><span className="section-eyebrow">IDEAS FROM YOUR CAMPUS</span><h2>{isAdmin ? 'Campus Ideas' : 'Community Ideas'}</h2><p>Every idea is a chance to make campus life a little better.</p></div>
        {isAdmin && <div className="voice-filter-row"><label><span className="voice-visually-hidden">Filter by category</span><select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><option value="">All categories</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label><span className="voice-visually-hidden">Filter by status</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label></div>}
      </div>
      {loading ? <div className="voice-empty-state"><span className="voice-loading-dot"/>Loading real campus submissions…</div> : communityIdeas.length === 0 ? <div className="voice-empty-state"><span className="voice-empty-icon"><Lightbulb size={22}/></span><strong>No community ideas yet</strong><span>Be the first to share an improvement idea with your campus.</span></div> : <div className="voice-idea-grid">
        {communityIdeas.map((idea) => <article className="voice-idea-card" key={idea.id}>
          <div className="voice-card-top"><span className="voice-category">{idea.category}</span><StatusBadge status={idea.status}/></div>
          <h3>{idea.title}</h3><p className="voice-idea-preview">{idea.description}</p>
          {idea.location && <span className="voice-location">{idea.location}</span>}
          <div className="voice-idea-footer"><span className="voice-support-count"><Heart size={15}/><strong>{idea.supportCount}</strong> {idea.supportCount === 1 ? 'support' : 'supports'}</span>
            <div className="voice-idea-buttons">{!isAdmin && <button className={`voice-support-button ${idea.supportedByMe ? 'is-supported' : ''}`} onClick={() => supportIdea(idea)} disabled={idea.status === 'Declined'} aria-pressed={idea.supportedByMe}><ThumbsUp size={14}/>{idea.supportedByMe ? 'Supported' : 'Support'}</button>}<button className="voice-details-button" onClick={() => openDetailsFromServer(idea)}>View Details <ArrowRight size={13}/></button></div>
          </div>
        </article>)}
      </div>}
    </section>

    {!isAdmin && <section className="voice-section voice-acted-section">
      <div className="voice-section-heading"><div><span className="section-eyebrow">IDEAS MADE REAL</span><h2>You Asked. We Acted.</h2><p>Real student ideas with a documented implementation update.</p></div><span className="voice-acted-mark"><Check size={17}/> CAMPUS IN ACTION</span></div>
      {implementedIdeas.length === 0 ? <div className="voice-acted-empty"><span className="voice-acted-empty-icon"><CircleHelp size={20}/></span><span><strong>Good ideas deserve follow-through.</strong><small>When an idea is genuinely implemented and documented, it will appear here.</small></span></div> : <div className="voice-acted-grid">{implementedIdeas.map((idea) => <article className="voice-acted-card" key={idea.id}><span className="voice-implemented-pill"><Check size={12}/> IMPLEMENTED</span><span className="voice-category">{idea.category}</span><h3>{idea.title}</h3><p>{idea.description}</p><div className="voice-implemented-update"><strong>What was implemented</strong><span>{idea.implementationUpdate}</span></div><button className="voice-details-button" onClick={() => openDetailsFromServer(idea)}>View original idea <ArrowRight size={13}/></button></article>)}</div>}
    </section>}

    <section className="voice-section voice-my-section">
      <div className="voice-section-heading"><div><span className="section-eyebrow">{isAdmin ? 'CAMPUS VOICE INBOX' : 'YOUR VOICE, TRACKED'}</span><h2>{isAdmin ? 'Manage Submissions' : 'My Submissions'}</h2><p>{isAdmin ? 'Review, respond, and keep the campus informed.' : 'Check the latest status of your Campus Voice submissions.'}</p></div></div>
      {loading ? <div className="voice-empty-state">Loading submissions…</div> : submissions.length === 0 ? <div className="voice-empty-state voice-empty-compact">{isAdmin ? 'No submissions match these filters.' : 'Your submissions will appear here once you share your voice.'}</div> : <div className="voice-submission-list">{submissions.map((submission) => <article className="voice-submission-row" key={submission.id}><div className="voice-submission-symbol">{submission.isAnonymous ? <ShieldCheck size={17}/> : <Lightbulb size={17}/>}</div><div className="voice-submission-main"><div className="voice-submission-meta"><span className="voice-category">{submission.category}</span><span>{submission.type}</span>{submission.isAnonymous && <span className="voice-anonymous-label"><ShieldCheck size={12}/> Anonymous</span>}</div><strong>{submission.title}</strong><small>Submitted {new Date(submission.createdAt).toLocaleDateString()}</small></div><StatusBadge status={submission.status}/><button className="voice-details-button" onClick={() => openDetailsFromServer(submission)}>Review <ArrowRight size={13}/></button></article>)}</div>}
    </section>

    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Student voice · Administration action · Campus improvement</span><span>Campus One · Campus Voice</span></footer>

    {formKind && <div className="voice-modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) resetForm() }}><section className="voice-modal" role="dialog" aria-modal="true" aria-labelledby="voice-form-title">
      <div className="voice-modal-heading"><span className={`voice-modal-icon ${formKind === 'anonymous' ? 'modal-icon-purple' : 'modal-icon-green'}`}>{formKind === 'anonymous' ? <ShieldCheck size={20}/> : <Lightbulb size={20}/>}</span><div><span className="section-eyebrow">{formKind === 'anonymous' ? 'A SAFE SPACE TO SPEAK' : 'BUILD A BETTER CAMPUS'}</span><h2 id="voice-form-title">{formKind === 'anonymous' ? 'Share Anonymously' : 'Submit an Idea'}</h2></div><button className="voice-close-button" onClick={resetForm} aria-label="Close form"><X size={18}/></button></div>
      {formKind === 'anonymous' && <p className="voice-privacy-note"><ShieldCheck size={15}/> Your identity is kept private and is not shown in Campus Voice views.</p>}
      <form className="voice-form" onSubmit={submit}>
        {formKind === 'anonymous' && <label>TYPE <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>{ANONYMOUS_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>}
        <label>CATEGORY <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label>IDEA / SUBMISSION TITLE <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} minLength={3} maxLength={120} placeholder="Give your submission a clear title" required/></label>
        <label>DESCRIPTION <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} minLength={10} maxLength={5000} rows={5} placeholder="Share the details, context, or improvement you have in mind" required/></label>
        <label>LOCATION / AREA <span className="voice-optional">OPTIONAL</span><input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} maxLength={160} placeholder="e.g. library, east courtyard"/></label>
        {error && <p className="voice-form-error" role="alert">{error}</p>}
        <div className="voice-form-actions"><button type="button" className="voice-cancel-button" onClick={resetForm} disabled={saving}>Cancel</button><button className="voice-submit-button" disabled={saving}>{saving ? 'Submitting…' : 'Submit'} <Send size={15}/></button></div>
      </form>
    </section></div>}

    {selected && <div className="voice-modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelected(null) }}><section className="voice-modal voice-detail-modal" role="dialog" aria-modal="true" aria-labelledby="voice-detail-title">
      <div className="voice-modal-heading"><span className="voice-modal-icon modal-icon-blue"><MessageSquareText size={19}/></span><div><span className="section-eyebrow">{selected.type} · {selected.category}</span><h2 id="voice-detail-title">{selected.title}</h2></div><button className="voice-close-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={18}/></button></div>
      <div className="voice-detail-badges"><StatusBadge status={selected.status}/><span className="voice-category">{selected.category}</span>{selected.location && <span className="voice-location">{selected.location}</span>}{selected.isAnonymous && <span className="voice-anonymous-label"><ShieldCheck size={12}/> Anonymous submission</span>}</div>
      <p className="voice-full-description">{selected.description}</p>
      {selected.kind === 'IDEA' && <div className="voice-detail-support"><Heart size={16}/><strong>{selected.supportCount}</strong> {selected.supportCount === 1 ? 'person supports' : 'people support'} this idea{!isAdmin && <button className={`voice-support-button ${selected.supportedByMe ? 'is-supported' : ''}`} onClick={() => supportIdea(selected)} aria-pressed={selected.supportedByMe}><ThumbsUp size={14}/>{selected.supportedByMe ? 'Supported' : 'Support'}</button>}</div>}
      {selected.officialResponse && <div className="voice-official-response"><span className="section-eyebrow">OFFICIAL ADMINISTRATION RESPONSE</span><p>{selected.officialResponse}</p></div>}
      {selected.implementationUpdate && <div className="voice-implemented-update"><strong>Implementation update</strong><span>{selected.implementationUpdate}</span></div>}
      {isAdmin && <form className="voice-admin-form" onSubmit={saveAdministrationUpdate}><span className="section-eyebrow">ADMINISTRATION REVIEW</span><label>STATUS<select value={status} onChange={(event) => setStatus(event.target.value)}>{[selected.status, ...(NEXT_STATUSES[selected.status] || [])].map((item) => <option key={item}>{item}</option>)}</select></label><label>OFFICIAL RESPONSE<textarea value={officialResponse} onChange={(event) => setOfficialResponse(event.target.value)} maxLength={3000} rows={3} placeholder="Share an official response with the student community"/></label><label>IMPLEMENTATION UPDATE<textarea value={implementationUpdate} onChange={(event) => setImplementationUpdate(event.target.value)} maxLength={3000} rows={3} placeholder="Describe what was actually implemented"/></label>{error && <p className="voice-form-error" role="alert">{error}</p>}<button className="voice-submit-button" disabled={saving}>{saving ? 'Saving…' : 'Save review'} <Check size={15}/></button></form>}
    </section></div>}
  </div>
}

function StatusBadge({ status }) {
  const statusClass = status.toLowerCase().replace(/\s+/g, '-')
  return <span className={`voice-status-badge status-${statusClass}`}><i/>{status}</span>
}
