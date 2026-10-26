import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createCampusApp } from '../server/app.js'
import { signSession } from '../server/auth.js'
import { createStore } from '../server/store.js'

const secret = randomBytes(32)
const users = [
  { id: 'PM-AD001', role: 'Administration', name: 'Insight Admin', active: true, sessionVersion: 1 },
  { id: 'PM-S1001', role: 'Student', name: 'Private Student', active: true, sessionVersion: 1 },
  { id: 'PM-ST001', role: 'Staff', name: 'Campus Staff', active: true, sessionVersion: 1 },
  { id: 'PM-HOD001', role: 'HOD', name: 'Campus HOD', active: true, sessionVersion: 1 },
  { id: 'PM-SC001', role: 'Sports Captain', name: 'Campus Captain', active: true, sessionVersion: 1 },
  { id: 'PM-CS001', role: 'Canteen Staff', name: 'Canteen Staff', active: true, sessionVersion: 1 },
]

let server
let store
let directory
let baseUrl
let timestamp

function cookieFor(user) {
  return `campus_session=${signSession(user, secret)}`
}

async function request(path, user) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: user ? { Cookie: cookieFor(user) } : {},
  })
  return { response, result: await response.json() }
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'campus-one-insight-'))
  store = createStore(directory)
  timestamp = new Date().toISOString()
  const priorTimestamp = new Date(Date.now() - 86400000).toISOString()
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  await store.write({
    users,
    campusEvents: [{ id: 'event-1', name: 'Campus Festival', category: 'Cultural', date: future, status: 'PUBLISHED', createdAt: timestamp }],
    eventRegistrations: [{ id: 'registration-1', eventId: 'event-1', status: 'REGISTERED' }],
    campusClubs: [{ id: 'club-1', name: 'Coding Club', active: true, createdAt: timestamp }],
    sports: [{ id: 'sport-1', kind: 'Sport', active: true }],
    sportsEvents: [],
    sportsTeams: [{ id: 'team-1', status: 'ACTIVE' }],
    sportsRegistrations: [],
    hostelRooms: [{ id: 'room-1', block: 'B1', capacity: 2 }],
    hostelAllotments: [{ id: 'allotment-1', roomId: 'room-1', status: 'ALLOTTED', studentName: 'Private Student' }],
    hostelDetails: [{ studentId: 'PM-S1001', roomType: 'Double', studentName: 'Private Student' }],
    hostelMaintenance: [{ id: 'maintenance-1', status: 'SUBMITTED', studentId: 'PM-S1001' }],
    canteenMenu: [
      { id: 'menu-veg', diet: 'VEG', category: 'Sandwich', available: true },
      { id: 'menu-nonveg', diet: 'NON_VEG', category: 'Sandwich', available: true },
    ],
    canteenOrders: [{ id: 'order-1', userId: 'PM-S1001', total: 9999, createdAt: timestamp }],
    messSettings: { timings: { Lunch: { start: '12:00', end: '14:00' } } },
    campus: { notices: [{ id: 'notice-1', title: 'Festival schedule', category: 'Events', priority: 'Important', target: { type: 'EVERYONE' }, active: true, createdAt: timestamp, publishAt: timestamp }] },
    complaints: [{ id: 'complaint-1', status: 'IN_PROGRESS', category: 'Infrastructure', submitterId: 'PM-S1001', title: 'Private complaint', createdAt: priorTimestamp, activity: [{ createdAt: timestamp, message: 'Private complaint update' }] }],
    lostFoundReports: [{ id: 'lost-1', type: 'LOST', status: 'LOST', reporterId: 'PM-S1001', itemName: 'Private item', createdAt: priorTimestamp, activity: [{ createdAt: timestamp, message: 'Private item update' }] }],
    campusVoiceSubmissions: [{ id: 'voice-1', kind: 'ANONYMOUS', type: 'Suggestion', status: 'Under Review', submitterId: 'PM-S1001', title: 'Private suggestion', updatedAt: timestamp }],
    skillExchangeListings: [{ id: 'listing-1', ownerId: 'PM-S1001', kind: 'OFFER', category: 'Technology', active: true }],
    skillExchangeConnections: [{ id: 'connection-1', senderId: 'PM-S1001', recipientId: 'PM-S1002', status: 'PENDING' }],
    teacherReviews: [
      { id: 'review-1', facultyId: 'PM-ST001', studentId: 'PM-S1001', studentName: 'Private Student', status: 'PUBLISHED', rating: 4, month: '2026-01' },
      { id: 'review-2', facultyId: 'PM-HOD001', studentId: 'PM-S1001', studentName: 'Private Student', status: 'PUBLISHED', rating: 5, month: '2026-01' },
      { id: 'review-3', facultyId: 'PM-ST001', studentId: 'PM-S1001', studentName: 'Private Student', status: 'HIDDEN', rating: 1, month: '2026-01' },
    ],
    messNotices: [
      { id: 'legacy-active', title: 'Legacy meal update', active: true, createdAt: timestamp },
      { id: 'legacy-inactive', title: 'Expired meal update', active: false, createdAt: timestamp },
    ],
  })
  server = createServer(createCampusApp({ store, sessionSecret: secret }))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
  if (directory) await rm(directory, { recursive: true, force: true })
})

test('Campus Insight keeps its endpoint restricted to Administration', async () => {
  assert.equal((await request('/api/analytics/dashboard')).response.status, 401)
  for (const user of users.slice(1)) {
    assert.equal((await request('/api/analytics/dashboard', user)).response.status, 403, user.role)
  }
  assert.equal((await request('/api/analytics/dashboard', users[0])).response.status, 200)
})

test('Campus Insight uses real aggregates and never returns private records or identities', async () => {
  const { result } = await request('/api/analytics/dashboard', users[0])
  const insights = result.insights
  assert.equal(insights.overview.totalUsers, users.length)
  assert.equal(insights.overview.students, 1)
  assert.equal(insights.events.upcomingEvents, 1)
  assert.equal(insights.events.activeClubs, 1)
  assert.equal(insights.hostel.occupancy.occupied, 1)
  assert.equal(insights.hostel.occupancy.capacity, 2)
  assert.equal(insights.canteen.vegetarian, 1)
  assert.equal(insights.canteen.nonVegetarian, 1)
  assert.equal(insights.complaints.total, 1)
  assert.equal(insights.lostFound.total, 1)
  assert.equal(insights.campusVoice.total, 1)
  assert.equal(insights.skillExchange.activeListings, 1)
  assert.equal(insights.facultyReviews.publishedReviews, 2)
  assert.equal(insights.facultyReviews.averageRating, null, 'ratings below the minimum review threshold are withheld')
  assert.equal(insights.facultyReviews.ratingDistribution, null)
  assert.equal(insights.notices.total, 2, 'active legacy Mess notices are included once without migration')
  assert.equal(insights.notices.categories.find((entry) => entry.name === 'Canteen').count, 1)
  const serialized = JSON.stringify(insights)
  for (const privateValue of ['Private Student', 'studentId', 'submitterId', 'reporterId', 'studentName', 'PM-S1001', 'Private complaint', 'Private item', 'Private suggestion', '9999']) {
    assert.equal(serialized.includes(privateValue), false, `${privateValue} is not exposed`)
  }
  assert.equal(insights.recentActivity.some((entry) => entry.title.includes('order')), true)
  assert.equal(insights.recentActivity.find((entry) => entry.title === 'Campus support request updated').timestamp, timestamp)
  assert.equal(insights.recentActivity.find((entry) => entry.title === 'Lost & Found report updated').timestamp, timestamp)
  const persisted = await store.read()
  assert.equal(persisted.campus.notices.some((entry) => entry.id === 'mess-legacy-legacy-active'), false, 'aggregation does not migrate or write notice data')
  assert.equal(persisted.messNotices.length, 2)
})
