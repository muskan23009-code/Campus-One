import { useEffect, useState } from 'react'
import { AlertCircle, ArrowDownRight, ArrowUpRight, Check, MessageSquareText, ShieldCheck, Star } from 'lucide-react'
import { api } from '../api/client'
import { APP_ROLES } from '../auth/access'

const CURRENT_MONTH_PARTS = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
const CURRENT_MONTH = `${CURRENT_MONTH_PARTS.find((part) => part.type === 'year').value}-${CURRENT_MONTH_PARTS.find((part) => part.type === 'month').value}`

export default function TeacherReview({ user, onNotify }) {
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [roleFilter, setRoleFilter] = useState('')
  const [faculty, setFaculty] = useState([])
  const [highlights, setHighlights] = useState([])
  const [myReviews, setMyReviews] = useState([])
  const [summary, setSummary] = useState(null)
  const [administration, setAdministration] = useState(null)
  const [facultyId, setFacultyId] = useState('')
  const [rating, setRating] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const isStudent = user.role === APP_ROLES.STUDENT
  const isAdmin = user.role === APP_ROLES.ADMIN

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        if (isStudent) {
          const [facultyResult, mineResult] = await Promise.all([
            api(`/api/teacher-reviews/faculty?month=${encodeURIComponent(month)}`),
            api('/api/teacher-reviews/mine'),
          ])
          if (!active) return
          setFaculty(facultyResult.faculty)
          setHighlights(facultyResult.highlights)
          setMyReviews(mineResult.reviews)
        } else if (isAdmin) {
          const params = new URLSearchParams({ month })
          if (roleFilter) params.set('role', roleFilter)
          const result = await api(`/api/teacher-reviews/admin?${params}`)
          if (!active) return
          setAdministration(result)
        } else {
          const result = await api(`/api/teacher-reviews/staff?month=${encodeURIComponent(month)}`)
          if (!active) return
          setSummary(result.summary)
        }
      } catch (reason) {
        if (active) setError(reason.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [isStudent, isAdmin, month, roleFilter, refreshKey])

  useEffect(() => {
    const existing = myReviews.find((review) => review.facultyId === facultyId && review.month === CURRENT_MONTH)
    setRating(existing?.rating || 0)
    setFeedback(existing?.feedback || '')
  }, [facultyId, faculty, myReviews])

  async function submitReview(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/teacher-reviews', { method: 'POST', body: { facultyId, rating, feedback } })
      setRefreshKey((value) => value + 1)
      onNotify(result.updated ? 'Your monthly review was updated.' : 'Your anonymous review was submitted.')
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  async function moderate(review, status) {
    setBusy(true)
    setError('')
    try {
      await api(`/api/teacher-reviews/admin/${encodeURIComponent(review.id)}`, { method: 'PATCH', body: { status } })
      setRefreshKey((value) => value + 1)
      onNotify(`Review ${status === 'HIDDEN' ? 'hidden' : 'published'}.`)
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  const monthOptions = collectMonths([
    ...(summary?.monthlyRatings || []),
    ...(administration?.summaries || []).flatMap((item) => item.monthlyRatings),
    ...myReviews,
  ])

  return (
    <div className={`teacher-review-page ${isAdmin ? 'review-admin-page' : ''} page-enter`}>
      <header className="teacher-review-hero">
        <div className="review-hero-copy">
          <span className="review-eyebrow"><Star size={13} /> CAMPUS FEEDBACK</span>
          <h1>Teacher Review</h1>
          <p>Your Feedback Helps Improve Our Campus</p>
        </div>
        <div className="review-hero-mark" aria-hidden="true"><MessageSquareText size={30} /><span><Star size={13} fill="currentColor" /></span></div>
      </header>

      {error && <div className="review-alert" role="alert"><AlertCircle size={16} />{error}</div>}
      {loading ? <div className="review-loading">Loading review data...</div> : isStudent ? (
        <StudentReviews
          faculty={faculty}
          highlights={highlights}
          reviews={myReviews}
          facultyId={facultyId}
          setFacultyId={setFacultyId}
          rating={rating}
          setRating={setRating}
          feedback={feedback}
          setFeedback={setFeedback}
          submitReview={submitReview}
          busy={busy}
        />
      ) : isAdmin ? (
        <AdministrationReviews data={administration} month={month} setMonth={setMonth} roleFilter={roleFilter} setRoleFilter={setRoleFilter} moderate={moderate} busy={busy} months={monthOptions} />
      ) : (
        <FacultyReviews summary={summary} role={user.role} month={month} setMonth={setMonth} months={monthOptions} />
      )}
    </div>
  )
}

function StudentReviews({ faculty, highlights, reviews, facultyId, setFacultyId, rating, setRating, feedback, setFeedback, submitReview, busy }) {
  const currentReview = reviews.find((review) => review.facultyId === facultyId && review.month === CURRENT_MONTH)
  return (
    <>
      <div className="review-student-grid">
        <section className="review-panel review-form-panel">
          <PanelHeading eyebrow="SHARE YOUR EXPERIENCE" title="Review Faculty" />
          <form onSubmit={submitReview} className="review-form">
            <label htmlFor="review-faculty">Select Staff/HOD</label>
            <select id="review-faculty" value={facultyId} onChange={(event) => setFacultyId(event.target.value)} required>
              <option value="">Select a faculty member</option>
              {faculty.map((member) => <option key={member.id} value={member.id}>{member.name} — {member.role}</option>)}
            </select>
            {faculty.length === 0 && <p className="review-empty-note">No active Staff or HOD accounts are available yet.</p>}
            <fieldset className="review-rating-field">
              <legend>Give Your Feedback</legend>
              <div className="review-stars" role="radiogroup" aria-label="Rating from 1 to 5 stars">
                {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`} className={value <= rating ? 'is-selected' : ''} onClick={() => setRating(value)}><Star size={28} fill={value <= rating ? 'currentColor' : 'none'} /></button>)}
              </div>
            </fieldset>
            <label htmlFor="review-feedback">Optional feedback</label>
            <textarea id="review-feedback" value={feedback} maxLength={1000} onChange={(event) => setFeedback(event.target.value)} placeholder="Share what worked well or what could improve..." rows={4} />
            <div className="review-form-footer"><span>Anonymous to everyone</span><span>{feedback.length}/1000</span></div>
            <button className="review-submit" type="submit" disabled={busy || !facultyId || !rating}>{busy ? 'Submitting...' : currentReview ? 'Update this month’s review' : 'Submit anonymously'}<Check size={15} /></button>
          </form>
        </section>
        <section className="review-panel review-my-panel">
          <PanelHeading eyebrow="YOUR FEEDBACK" title="My Reviews" />
          {reviews.length ? <div className="review-own-list">{reviews.map((review) => <article className="review-own-card" key={review.id}>
            <div className="review-own-heading"><div><h3>{review.facultyName}</h3><span>{review.facultyRole} · {formatMonth(review.month)}</span></div><StatusPill status={review.status} /></div>
            <div className="review-own-rating"><RatingStars value={review.rating} /><strong>{review.rating}.0</strong></div>
            {review.feedback && <p>“{review.feedback}”</p>}
            {review.month === CURRENT_MONTH && <button type="button" className="review-edit-link" onClick={() => setFacultyId(review.facultyId)}>Edit this month’s review</button>}
          </article>)}</div> : <EmptyState text="Your submitted reviews will appear here." />}
        </section>
      </div>
      <section className="review-highlights-section">
        <PanelHeading eyebrow={formatMonth(CURRENT_MONTH).toUpperCase()} title="Monthly Faculty Highlights" detail="Top Rated Faculty This Month" />
        {highlights.length ? <div className="review-highlight-grid">{highlights.map((entry) => <RankingCard key={entry.faculty.id} entry={entry} />)}</div> : <EmptyState text="Faculty highlights will appear when at least three reviews are submitted for a member this month." />}
      </section>
    </>
  )
}

function FacultyReviews({ summary, role, month, setMonth, months }) {
  if (!summary) return <EmptyState text="Review summary is unavailable." />
  return <>
    <section className="review-faculty-heading"><div><span className="review-eyebrow">{role === APP_ROLES.HOD ? 'HOD REVIEW SUMMARY' : 'STAFF VIEW'}</span><h2>My Review Summary</h2><p>Your ratings and feedback, shared anonymously.</p></div><MonthSelect month={month} setMonth={setMonth} months={months} /></section>
    <div className="review-faculty-identity"><div><span>{summary.faculty.role}</span><h3>{summary.faculty.name}</h3></div><div className="review-score"><RatingStars value={summary.averageRating} /><strong>{summary.averageRating ? summary.averageRating.toFixed(1) : '—'}</strong></div></div>
    <div className="review-stat-grid">
      <Metric label="Average rating" value={summary.averageRating ? summary.averageRating.toFixed(1) : '—'} accent="blue" />
      <Metric label="Total reviews" value={summary.totalReviews} accent="teal" />
      <Metric label={`${formatMonth(month)} rating`} value={summary.monthlyRating ? summary.monthlyRating.toFixed(1) : '—'} accent="gold" />
    </div>
    <div className="review-data-grid">
      <section className="review-panel"><PanelHeading eyebrow="MONTHLY TREND" title="Rating history" />{summary.monthlyRatings.length ? <div className="review-history-list">{summary.monthlyRatings.map((entry) => <div key={entry.month} className="review-history-row"><span>{formatMonth(entry.month)}</span><div className="review-bar-track"><span style={{ width: `${entry.averageRating * 20}%` }} /></div><strong>{entry.averageRating.toFixed(1)}</strong><small>{entry.totalReviews} {entry.totalReviews === 1 ? 'review' : 'reviews'}</small></div>)}</div> : <EmptyState text="Monthly ratings will appear after reviews are submitted." />}</section>
      <section className="review-panel"><PanelHeading eyebrow={formatMonth(month).toUpperCase()} title="Rating distribution" />{[5, 4, 3, 2, 1].map((score) => <div key={score} className="review-distribution-row"><span>{score} <Star size={12} fill="currentColor" /></span><div className="review-bar-track"><span style={{ width: `${summary.monthlyReviewCount ? summary.ratingDistribution[score] / summary.monthlyReviewCount * 100 : 0}%` }} /></div><strong>{summary.ratingDistribution[score]}</strong></div>)}</section>
    </div>
    <section className="review-feedback-section"><PanelHeading eyebrow="ANONYMOUS STUDENT FEEDBACK" title={`${formatMonth(month)} feedback`} />{summary.feedback.length ? <div className="review-feedback-grid">{summary.feedback.map((item) => <article className="review-feedback-card" key={item.id}><RatingStars value={item.rating} /><p>“{item.feedback}”</p><time>{formatDate(item.createdAt)}</time></article>)}</div> : <EmptyState text="No written feedback for this month." />}</section>
  </>
}

function AdministrationReviews({ data, month, setMonth, roleFilter, setRoleFilter, moderate, busy, months }) {
  if (!data) return <EmptyState text="Review management is unavailable." />
  return <>
    <section className="review-admin-toolbar"><div><span className="review-eyebrow">CAMPUS-WIDE OVERSIGHT</span><h2>Faculty Review Management</h2></div><div className="review-filters"><MonthSelect month={month} setMonth={setMonth} months={months} /><label className="sr-only" htmlFor="review-role-filter">Filter faculty role</label><select id="review-role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All faculty</option><option value="Staff">Staff</option><option value="HOD">HOD</option></select></div></section>
    <div className="review-stat-grid review-admin-stats">
      <Metric label="Faculty members" value={data.statistics.facultyCount} accent="blue" />
      <Metric label="Reviews this month" value={data.statistics.totalReviews} accent="teal" />
      <Metric label="Published reviews" value={data.statistics.publishedReviews} accent="gold" />
      <Metric label="Campus average" value={data.statistics.averageRating ? data.statistics.averageRating.toFixed(1) : '—'} accent="purple" />
    </div>
    <section className="review-panel review-admin-distribution"><PanelHeading eyebrow={formatMonth(month).toUpperCase()} title="Monthly rating distribution" />{[5, 4, 3, 2, 1].map((score) => <div key={score} className="review-distribution-row"><span>{score} <Star size={12} fill="currentColor" /></span><div className="review-bar-track"><span style={{ width: `${data.statistics.publishedReviews ? data.statistics.ratingDistribution[score] / data.statistics.publishedReviews * 100 : 0}%` }} /></div><strong>{data.statistics.ratingDistribution[score]}</strong></div>)}</section>
    <section className="review-highlights-section review-admin-ranking"><PanelHeading eyebrow="REAL REVIEW DATA · MINIMUM 3 REVIEWS" title="Top Rated Faculty This Month" />{data.rankings.length ? <div className="review-highlight-grid">{data.rankings.map((entry) => <RankingCard key={entry.faculty.id} entry={entry} />)}</div> : <EmptyState text="Rankings will appear when a faculty member reaches three published reviews this month." />}</section>
    <section className="review-admin-faculty"><PanelHeading eyebrow="STAFF & HOD ACCOUNTS" title="Monthly faculty ratings" />{data.summaries.length ? <div className="review-table-wrap"><table className="review-table"><thead><tr><th>Faculty member</th><th>Role</th><th>Average</th><th>Reviews</th><th>Trend</th></tr></thead><tbody>{data.summaries.map((entry) => <tr key={entry.faculty.id}><td>{entry.faculty.name}</td><td><RolePill role={entry.faculty.role} /></td><td>{entry.monthlyRating ? `${entry.monthlyRating.toFixed(1)} / 5` : '—'}</td><td>{entry.monthlyReviewCount}</td><td><Trend value={trendFor(entry.monthlyRatings, month)} /></td></tr>)}</tbody></table></div> : <EmptyState text="No Staff or HOD accounts match this filter." />}</section>
    <section className="review-moderation-section"><PanelHeading eyebrow={`${formatMonth(month).toUpperCase()} · ${data.reviews.length} REVIEWS`} title="Anonymous feedback moderation" />{data.reviews.length ? <div className="review-moderation-list">{data.reviews.map((review) => <article className={`review-moderation-card ${review.status === 'Hidden' ? 'is-hidden' : ''}`} key={review.id}><div className="review-moderation-main"><div className="review-moderation-meta"><strong>{review.facultyName}</strong><RolePill role={review.facultyRole} /><StatusPill status={review.status} /></div><div className="review-own-rating"><RatingStars value={review.rating} /><strong>{review.rating}.0</strong></div>{review.feedback ? <p>“{review.feedback}”</p> : <p className="review-no-feedback">No written feedback</p>}<time>{formatDate(review.createdAt)}</time></div><button type="button" className={`review-moderate-button ${review.status === 'Hidden' ? 'is-publish' : ''}`} disabled={busy} onClick={() => moderate(review, review.status === 'Hidden' ? 'PUBLISHED' : 'HIDDEN')}>{review.status === 'Hidden' ? 'Publish' : 'Hide'}<ShieldCheck size={14} /></button></article>)}</div> : <EmptyState text="No reviews have been submitted for this month." />}</section>
  </>
}

function PanelHeading({ eyebrow, title, detail }) {
  return <div className="review-panel-heading"><div><span>{eyebrow}</span><h2>{title}</h2>{detail && <p>{detail}</p>}</div></div>
}

function Metric({ label, value, accent }) {
  return <article className={`review-metric review-metric-${accent}`}><span>{label}</span><strong>{value}</strong></article>
}

function RankingCard({ entry }) {
  return <article className="review-ranking-card"><span className="review-rank">#{entry.rank}</span><div className="review-ranking-main"><span className="review-ranking-role">{entry.faculty.role}</span><h3>{entry.faculty.name}</h3><div className="review-ranking-score"><RatingStars value={entry.averageRating} /><strong>{entry.averageRating.toFixed(1)}</strong></div><small>{entry.totalReviews} reviews</small></div><Trend value={entry.monthlyTrend} /></article>
}

function RatingStars({ value }) {
  return <span className="review-stars-display" aria-label={`${value} out of 5 stars`}>{[1, 2, 3, 4, 5].map((score) => <Star key={score} size={13} fill={score <= value ? 'currentColor' : 'none'} />)}</span>
}

function Trend({ value }) {
  if (value === 'up') return <span className="review-trend trend-up"><ArrowUpRight size={15} /> Rising</span>
  if (value === 'down') return <span className="review-trend trend-down"><ArrowDownRight size={15} /> Falling</span>
  if (value === 'no-history') return <span className="review-trend trend-steady">No prior data</span>
  return <span className="review-trend trend-steady">Steady</span>
}

function trendFor(monthlyRatings, month) {
  const currentEntry = monthlyRatings.find((entry) => entry.month === month)
  const previousDate = new Date(`${month}-01T00:00:00.000Z`)
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1)
  const previousMonth = previousDate.toISOString().slice(0, 7)
  const previousEntry = monthlyRatings.find((entry) => entry.month === previousMonth)
  if (!currentEntry || !previousEntry) return 'no-history'
  return currentEntry.averageRating > previousEntry.averageRating ? 'up' : currentEntry.averageRating < previousEntry.averageRating ? 'down' : 'steady'
}

function RolePill({ role }) { return <span className={`review-role-pill ${role === 'HOD' ? 'role-hod' : 'role-staff'}`}>{role}</span> }
function StatusPill({ status }) { return <span className={`review-status-pill ${status === 'Hidden' ? 'status-hidden' : ''}`}>{status}</span> }
function EmptyState({ text }) { return <div className="review-empty"><span><MessageSquareText size={17} /></span><p>{text}</p></div> }

function MonthSelect({ month, setMonth, months }) {
  return <label className="review-month-select"><span>Month</span><select value={month} onChange={(event) => setMonth(event.target.value)}>{months.map((value) => <option key={value} value={value}>{formatMonth(value)}</option>)}</select></label>
}

function collectMonths(entries) {
  const values = new Set([CURRENT_MONTH])
  const cursor = new Date(`${CURRENT_MONTH}-01T00:00:00.000Z`)
  for (let index = 0; index < 11; index += 1) {
    cursor.setUTCMonth(cursor.getUTCMonth() - 1)
    values.add(cursor.toISOString().slice(0, 7))
  }
  entries.forEach((entry) => { if (entry.month) values.add(entry.month) })
  return [...values].sort((left, right) => right.localeCompare(left))
}

function formatMonth(value) {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00.000Z`))
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
}