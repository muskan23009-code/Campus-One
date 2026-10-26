import { useEffect, useState } from 'react'
import {
  Activity, AlertCircle, ArrowRight, Bell, BookOpen, Building2, CalendarDays,
  ChartNoAxesCombined, ClipboardCheck, MessageSquareText, PackageSearch,
  ShieldCheck, Sparkles, Star, Utensils, UsersRound, Volleyball,
} from 'lucide-react'
import { api } from '../api/client'

const MODULES = {
  users: 'users',
  events: 'events',
  sports: 'sports',
  hostel: 'hostel',
  canteen: 'food',
  notices: 'notices',
  complaints: 'complaints',
  lostFound: 'lost-found',
  campusVoice: 'campus-voice',
  skillExchange: 'skill-exchange',
  facultyReviews: 'teacher-review',
}

const ICONS = {
  users: UsersRound,
  events: CalendarDays,
  sports: Volleyball,
  hostel: Building2,
  canteen: Utensils,
  notices: Bell,
  complaints: MessageSquareText,
  lostFound: PackageSearch,
  campusVoice: ShieldCheck,
  skillExchange: Activity,
  facultyReviews: Star,
}

export default function CampusInsight({ onNavigate }) {
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api('/api/analytics/dashboard')
      .then((result) => { if (active) setInsights(result.insights) })
      .catch((reason) => { if (active) setError(reason.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading) return <main className="campus-insight-page page-enter"><div className="insight-state"><span className="loading-spinner" />Loading campus insights...</div></main>
  if (error) return <main className="campus-insight-page page-enter"><div className="insight-state insight-state-error" role="alert"><AlertCircle size={19} /><span>Unable to load this insight. {error}</span></div></main>
  if (!insights) return <main className="campus-insight-page page-enter"><div className="insight-state">No insight data available yet.</div></main>

  const metrics = [
    ['Total users', insights.overview?.totalUsers, 'users'],
    ['Students', insights.overview?.students, 'users'],
    ['Staff', insights.overview?.staff, 'users'],
    ['HODs', insights.overview?.hods, 'users'],
    ['Upcoming events', insights.events?.upcomingEvents, 'events'],
    ['Active clubs', insights.events?.activeClubs, 'events'],
    ['Sports activities', insights.sports?.activities, 'sports'],
    ['Current hostel allotments', insights.hostel?.allotted, 'hostel'],
    ['Available menu items', insights.canteen?.availableItems, 'canteen'],
    ['Published notices', insights.notices?.total, 'notices'],
    ['Support requests', insights.complaints?.total, 'complaints'],
    ['Lost & Found reports', insights.lostFound?.total, 'lostFound'],
    ['Campus Voice submissions', insights.campusVoice?.total, 'campusVoice'],
    ['Active skill listings', insights.skillExchange?.activeListings, 'skillExchange'],
    ['Published faculty reviews', insights.facultyReviews?.publishedReviews, 'facultyReviews'],
  ].filter(([, value]) => value !== null && value !== undefined)

  const highlights = [
    insights.events?.upcomingEvents > 0 && `${insights.events.upcomingEvents} upcoming ${plural(insights.events.upcomingEvents, 'event')} scheduled`,
    insights.notices?.total > 0 && `${insights.notices.total} published ${plural(insights.notices.total, 'notice')} currently available`,
    voiceUnderReview(insights.campusVoice) > 0 && `${voiceUnderReview(insights.campusVoice)} Campus Voice ${plural(voiceUnderReview(insights.campusVoice), 'submission')} under review`,
    insights.hostel?.occupancy?.capacity > 0 && `${insights.hostel.occupancy.occupied} of ${insights.hostel.occupancy.capacity} hostel beds allotted`,
  ].filter(Boolean)

  return <main className="campus-insight-page page-enter">
    <header className="insight-hero">
      <div className="insight-hero-copy">
        <span className="insight-kicker"><ChartNoAxesCombined size={14} /> CAMPUS ONE · INTELLIGENCE</span>
        <h1>Campus Insight</h1>
        <p>Understand campus activity, engagement and services from one place.</p>
      </div>
      <div className="insight-hero-art" aria-hidden="true">
        <span className="insight-art-building"><Building2 size={35} /></span>
        <span className="insight-art-chart"><Activity size={23} /></span>
        <span className="insight-art-dot insight-dot-one" />
        <span className="insight-art-dot insight-dot-two" />
      </div>
    </header>

    {insights.overview && <section className="insight-overview">
      <SectionHeading eyebrow="CAMPUS OVERVIEW" title="A clear view of campus" />
      <div className="insight-overview-strip">
        <OverviewTotal label="Registered users" value={insights.overview.totalUsers} note={`${insights.overview.activeUsers} active accounts`} icon={UsersRound} />
        <OverviewTotal label="Students" value={insights.overview.students} note="Registered student accounts" icon={BookOpen} />
        <OverviewTotal label="Staff & HODs" value={insights.overview.staff + insights.overview.hods} note={`${insights.overview.staff} staff · ${insights.overview.hods} HODs`} icon={ClipboardCheck} />
        <OverviewTotal label="Administration" value={insights.overview.administrators} note="Registered admin accounts" icon={ShieldCheck} />
      </div>
    </section>}

    {metrics.length > 0 && <section className="insight-metrics">
      <SectionHeading eyebrow="KEY CAMPUS METRICS" title="Services at a glance" />
      <div className="insight-metric-grid">
        {metrics.map(([label, value, module]) => {
          const Icon = ICONS[module]
          return <button className="insight-metric" key={label} onClick={() => onNavigate(MODULES[module])} aria-label={`Open ${label} module`}>
            <span className={`insight-metric-icon insight-icon-${module}`}><Icon size={17} /></span>
            <span className="insight-metric-copy"><strong>{Number(value).toLocaleString()}</strong><small>{label}</small></span>
            <ArrowRight className="insight-metric-arrow" size={15} />
          </button>
        })}
      </div>
    </section>}

    <div className="insight-section-grid">
      {insights.events && <InsightSection icon={CalendarDays} eyebrow="CAMPUS LIFE" title="Events & clubs" route="events" onNavigate={onNavigate}>
        <div className="insight-stat-row">
          <Stat label="Upcoming events" value={insights.events.upcomingEvents} />
          <Stat label="Past / closed" value={insights.events.pastEvents} />
          <Stat label="Active clubs" value={insights.events.activeClubs} />
          {insights.events.registrations !== null && <Stat label="Registrations" value={insights.events.registrations} />}
        </div>
        <Breakdown title="Event categories" items={insights.events.eventCategories} />
        {insights.events.upcoming.length > 0 && <div className="insight-upcoming-list">
          <h3>Coming up</h3>
          {insights.events.upcoming.map((event, index) => <div className="insight-upcoming-item" key={`${event.name}-${event.date}-${index}`}>
            <time>{formatDate(event.date)}</time><span><strong>{event.name}</strong><small>{[event.startTime, event.venue].filter(Boolean).join(' · ') || 'Campus event'}</small></span>
          </div>)}
        </div>}
      </InsightSection>}

      {insights.sports && <InsightSection icon={Volleyball} eyebrow="SPORTS & WELLNESS" title="Activity & participation" route="sports" onNavigate={onNavigate}>
        <div className="insight-stat-row">
          <Stat label="Sports activities" value={insights.sports.activities} />
          <Stat label="Sports events" value={insights.sports.events} />
          <Stat label="Upcoming" value={insights.sports.upcomingEvents} />
          <Stat label="Active teams" value={insights.sports.teams} />
        </div>
        {insights.sports.categories && <Breakdown title="Sports & activity types" items={insights.sports.categories} />}
        {insights.sports.registrations !== null && <p className="insight-footnote">{insights.sports.registrations} recorded registrations</p>}
      </InsightSection>}

      {insights.hostel && <InsightSection icon={Building2} eyebrow="RESIDENTIAL LIFE" title="Hostel overview" route="hostel" onNavigate={onNavigate}>
        <div className="insight-stat-row">
          <Stat label="Rooms" value={insights.hostel.rooms} />
          <Stat label="Current allotments" value={insights.hostel.allotted} />
          <Stat label="Capacity" value={insights.hostel.occupancy?.capacity} />
        </div>
        {insights.hostel.occupancy && <div className="insight-capacity">
          <div><span>Allotted rooms</span><strong>{insights.hostel.occupancy.occupied} / {insights.hostel.occupancy.capacity} beds</strong></div>
          <Meter value={insights.hostel.occupancy.occupied} total={insights.hostel.occupancy.capacity} />
        </div>}
        <Breakdown title="Blocks" items={insights.hostel.hostelBlocks} />
        <Breakdown title="Room types" items={insights.hostel.roomTypes} />
        {insights.hostel.maintenanceTotal !== null && <Breakdown title="Maintenance requests" items={Object.entries(insights.hostel.maintenance || {}).map(([name, count]) => ({ name: humanize(name), count }))} />}
      </InsightSection>}

      {insights.canteen && <InsightSection icon={Utensils} eyebrow="CAMPUS DINING" title="Canteen & mess" route="food" onNavigate={onNavigate}>
        <div className="insight-stat-row">
          <Stat label="Available menu items" value={insights.canteen.availableItems} />
          <Stat label="Vegetarian" value={insights.canteen.vegetarian} />
          <Stat label="Non-vegetarian" value={insights.canteen.nonVegetarian} />
          {insights.canteen.orders !== null && <Stat label="Recorded orders" value={insights.canteen.orders} />}
        </div>
        <Breakdown title="Menu categories" items={insights.canteen.categories} />
        {insights.canteen.messTimings && <div className="insight-meal-times">
          <h3>Mess schedule</h3>
          {Object.entries(insights.canteen.messTimings).filter(([, time]) => time?.start && time?.end).map(([meal, time]) => <span key={meal}><strong>{meal}</strong>{formatTime(time.start)} – {formatTime(time.end)}</span>)}
          {!Object.values(insights.canteen.messTimings).some((time) => time?.start && time?.end) && <small>Meal timings are not configured.</small>}
        </div>}
      </InsightSection>}

      {insights.notices && <InsightSection icon={Bell} eyebrow="CAMPUS COMMUNICATION" title="Notices & announcements" route="notices" onNavigate={onNavigate}>
        <div className="insight-stat-row">
          <Stat label="Published notices" value={insights.notices.total} />
          <Stat label="Important" value={insights.notices.important} />
        </div>
        <Breakdown title="By category" items={insights.notices.categories} />
        <Breakdown title="By audience" items={insights.notices.audiences} />
        {insights.notices.recent.length > 0 && <div className="insight-recent-notices">
          <h3>Recent notices</h3>
          {insights.notices.recent.map((notice, index) => <div key={`${notice.title}-${notice.timestamp}-${index}`}><span className="insight-notice-pin"><Bell size={13} /></span><span><strong>{notice.title}</strong><small>{[notice.category, notice.priority, formatTimestamp(notice.timestamp)].filter(Boolean).join(' · ')}</small></span></div>)}
        </div>}
      </InsightSection>}

      {insights.complaints && <InsightSection icon={MessageSquareText} eyebrow="STUDENT SUPPORT" title="Complaint & support" route="complaints" onNavigate={onNavigate}>
        <div className="insight-stat-row">
          <Stat label="Total requests" value={insights.complaints.total} />
          <Stat label="Open" value={statusTotal(insights.complaints.statuses, ['SUBMITTED', 'ACCEPTED'])} />
          <Stat label="In progress" value={statusTotal(insights.complaints.statuses, ['IN_PROGRESS'])} />
          <Stat label="Resolved" value={statusTotal(insights.complaints.statuses, ['RESOLVED'])} />
        </div>
        <Breakdown title="Status distribution" items={insights.complaints.statuses.map(({ name, count }) => ({ name: humanize(name), count }))} />
        <Breakdown title="Request categories" items={insights.complaints.categories} />
      </InsightSection>}

      {insights.lostFound && <InsightSection icon={PackageSearch} eyebrow="CAMPUS PROPERTY" title="Lost & Found" route="lost-found" onNavigate={onNavigate}>
        <div className="insight-stat-row">
          <Stat label="Total reports" value={insights.lostFound.total} />
          <Stat label="Lost" value={statusTotal(insights.lostFound.types, ['LOST'])} />
          <Stat label="Found" value={statusTotal(insights.lostFound.types, ['FOUND'])} />
          <Stat label="Resolved / returned" value={statusTotal(insights.lostFound.statuses, ['RETURNED', 'CLOSED'])} />
        </div>
        <Breakdown title="Current status" items={insights.lostFound.statuses.map(({ name, count }) => ({ name: humanize(name), count }))} />
      </InsightSection>}

      {insights.campusVoice && <InsightSection icon={ShieldCheck} eyebrow="STUDENT & COMMUNITY" title="Campus Voice" route="campus-voice" onNavigate={onNavigate}>
        <div className="insight-stat-row">
          <Stat label="Submissions" value={insights.campusVoice.total} />
          {insights.campusVoice.types.map(({ name, count }) => <Stat key={name} label={humanize(name)} value={count} />)}
        </div>
        <Breakdown title="Submission lifecycle" items={insights.campusVoice.statuses} />
        <p className="insight-privacy-note"><ShieldCheck size={14} /> Anonymous, aggregate counts only. Submitter identity is not included.</p>
      </InsightSection>}

      {insights.skillExchange && <InsightSection icon={Activity} eyebrow="PEER LEARNING" title="Skill Exchange" route="skill-exchange" onNavigate={onNavigate}>
        <div className="insight-stat-row">
          <Stat label="Active listings" value={insights.skillExchange.activeListings} />
          <Stat label="I can help" value={insights.skillExchange.offers} />
          <Stat label="I need help" value={insights.skillExchange.requests} />
        </div>
        <Breakdown title="Listing categories" items={insights.skillExchange.categories} />
        {insights.skillExchange.connections && <Breakdown title="Connection requests" items={Object.entries(insights.skillExchange.connections).map(([name, count]) => ({ name: humanize(name), count }))} />}
      </InsightSection>}

      {insights.facultyReviews && <InsightSection icon={Star} eyebrow="FACULTY FEEDBACK" title="Faculty review insights" route="teacher-review" onNavigate={onNavigate}>
        <div className="insight-stat-row">
          <Stat label="Published reviews" value={insights.facultyReviews.publishedReviews} />
          <Stat label="Faculty reviewed" value={insights.facultyReviews.reviewedFaculty} />
          {insights.facultyReviews.averageRating === null
            ? <Stat label="Average rating" value="—" note="Not enough data yet" />
            : <Stat label="Average rating" value={`${insights.facultyReviews.averageRating} / 5`} />}
        </div>
        {insights.facultyReviews.ratingDistribution && <Breakdown title="Rating distribution" items={Object.entries(insights.facultyReviews.ratingDistribution).map(([name, count]) => ({ name: `${name} ${Number(name) === 1 ? 'star' : 'stars'}`, count }))} />}
        {insights.facultyReviews.monthlyActivity.length > 1
          ? <Breakdown title="Review activity by month" items={insights.facultyReviews.monthlyActivity.map(({ month, count }) => ({ name: month, count }))} />
          : <p className="insight-footnote">Historical trend unavailable.</p>}
        <p className="insight-privacy-note"><ShieldCheck size={14} /> Anonymous aggregate data. Student identities and individual reviews are not shown.</p>
      </InsightSection>}
    </div>

    {(insights.recentActivity.length > 0 || highlights.length > 0) && <div className="insight-bottom-grid">
      {insights.recentActivity.length > 0 && <section className="insight-panel insight-timeline">
        <SectionHeading eyebrow="RECENT CAMPUS ACTIVITY" title="What’s happening" />
        <ol>{insights.recentActivity.map((entry, index) => <li key={`${entry.timestamp}-${entry.title}-${index}`}>
          <span className="insight-timeline-mark"><Activity size={13} /></span><span><strong>{entry.title}</strong><time>{formatTimestamp(entry.timestamp)}</time></span>
        </li>)}</ol>
      </section>}
      {highlights.length > 0 && <section className="insight-panel insight-highlights">
        <SectionHeading eyebrow="CAMPUS HIGHLIGHTS" title="In focus" />
        <ul>{highlights.map((highlight) => <li key={highlight}><span><Sparkles size={15} /></span>{highlight}</li>)}</ul>
      </section>}
    </div>}
    {metrics.length === 0 && !Object.keys(insights).some((key) => key !== 'recentActivity' && insights[key]) && <div className="insight-state">No insight data available yet.</div>}
  </main>
}

function SectionHeading({ eyebrow, title }) {
  return <div className="insight-section-heading"><span>{eyebrow}</span><h2>{title}</h2></div>
}

function OverviewTotal({ label, value, note, icon: Icon }) {
  return <article className="insight-overview-card"><span className="insight-overview-icon"><Icon size={18} /></span><div><small>{label}</small><strong>{Number(value).toLocaleString()}</strong><span>{note}</span></div></article>
}

function InsightSection({ icon: Icon, eyebrow, title, route, onNavigate, children }) {
  return <section className="insight-panel">
    <button className="insight-panel-heading" onClick={() => onNavigate(MODULES[route])}>
      <span className="insight-panel-icon"><Icon size={18} /></span><span><small>{eyebrow}</small><strong>{title}</strong></span><ArrowRight size={15} />
    </button>
    {children}
  </section>
}

function Stat({ label, value, note }) {
  const unavailable = value === null || value === undefined
  return <div className={`insight-stat${unavailable ? ' insight-stat-unavailable' : ''}`}><strong>{unavailable ? 'Data not available' : typeof value === 'number' ? value.toLocaleString() : value}</strong><span>{label}</span>{note && <small>{note}</small>}</div>
}

function Breakdown({ title, items }) {
  if (!items) return null
  const sorted = items.slice().sort((left, right) => right.count - left.count)
  const max = Math.max(1, ...sorted.map((item) => item.count))
  return <div className="insight-breakdown">
    <h3>{title}</h3>
    {sorted.length ? sorted.slice(0, 6).map(({ name, count }) => <div className="insight-breakdown-row" key={name}>
      <span>{humanize(name)}</span><span className="insight-breakdown-track"><i style={{ width: `${Math.max(count ? 5 : 0, count / max * 100)}%` }} /></span><strong>{count}</strong>
    </div>) : <small className="insight-empty-note">No records available yet.</small>}
  </div>
}

function Meter({ value, total }) {
  const width = total > 0 ? Math.min(100, value / total * 100) : 0
  return <div className="insight-meter" role="img" aria-label={`${value} of ${total} beds allotted`}><span style={{ width: `${width}%` }} /></div>
}

function statusTotal(items, statuses) {
  return items.filter((item) => statuses.includes(item.name)).reduce((total, item) => total + item.count, 0)
}

function voiceUnderReview(voice) {
  return voice?.statuses.find((entry) => entry.name === 'Under Review')?.count || 0
}

function plural(count, word) {
  return count === 1 ? word : `${word}s`
}

function humanize(value = '') {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function formatTimestamp(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatTime(value) {
  const [hour, minute] = value.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}
