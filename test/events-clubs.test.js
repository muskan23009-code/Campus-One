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
import { APP_ROLES, canSeePage } from '../src/auth/access.js'

let server
let store
let directory
let baseUrl
const secret = randomBytes(32)
const users = [
  { id: 'PM-S2001', role: 'Student', name: 'Student One', active: true, sessionVersion: 1, department: 'Computer Science', semester: 'Semester 3', course: 'B.Tech' },
  { id: 'PM-ST001', role: 'Staff', name: 'Staff One', active: true, sessionVersion: 1, department: 'Computer Science' },
  { id: 'PM-HOD001', role: 'HOD', name: 'HOD One', active: true, sessionVersion: 1, department: 'Computer Science' },
  { id: 'PM-SC001', role: 'Sports Captain', name: 'Captain One', active: true, sessionVersion: 1, department: 'Computer Science' },
  { id: 'PM-AD001', role: 'Administration', name: 'Admin One', active: true, sessionVersion: 1 },
  { id: 'PM-CS001', role: 'Canteen Staff', name: 'Canteen One', active: true, sessionVersion: 1 },
  { id: 'PM-S2002', role: 'Student', name: 'Student Other Department', active: true, sessionVersion: 1, department: 'Civil Engineering', semester: 'Semester 3', course: 'B.Tech' },
]

function cookieFor(user) {
  return `campus_session=${signSession(user, secret)}`
}

async function request(path, { user = users[0], method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Cookie: cookieFor(user), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { response, result: await response.json() }
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'campus-one-events-test-'))
  store = createStore(directory)
  await store.write({
    users, notifications: [], campusEvents: [], eventRegistrations: [], eventAttendance: [], eventResults: [],
    campusClubs: [{ id: 'club-open', name: 'Coding Club', category: 'Coding', description: 'Build and learn together.', active: true, requiresApproval: false }],
    clubMemberships: [], clubAnnouncements: [], clubActivities: [],
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

test('Events & Clubs navigation includes permitted roles and excludes Canteen Staff', () => {
  for (const user of users) assert.equal(canSeePage(user, 'events'), user.role !== 'Canteen Staff', user.role)
})

test('Events APIs are role-protected, Canteen Staff is denied, and Admin owns management', async () => {
  for (const user of users.slice(0, 5)) assert.equal((await request('/api/events-clubs', { user })).response.status, 200, user.role)
  for (const path of ['/api/events-clubs', '/api/events-clubs/events', '/api/events-clubs/clubs']) {
    assert.equal((await request(path, { user: users[5] })).response.status, 403, `canteen cannot access ${path}`)
  }
  assert.equal((await request('/api/events-clubs/events', { user: users[0], method: 'POST', body: {} })).response.status, 403)
  assert.equal((await request('/api/events-clubs/clubs', { user: users[2], method: 'POST', body: {} })).response.status, 403)
})

test('Event registration is persistent, unique, cancelable, and privately scoped', async () => {
  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const createdResponse = await request('/api/events-clubs/events', {
    user: users[4], method: 'POST',
    body: { name: 'Campus Coding Day', category: 'Technical', description: 'A campus programming event.', date, startTime: '10:00', endTime: '16:00', venue: 'Main Hall', organizer: 'Computer Science', registrationDeadline: deadline, department: 'Computer Science', maxParticipants: 1, status: 'DRAFT' },
  })
  assert.equal(createdResponse.response.status, 201)
  const id = createdResponse.result.event.id
  assert.equal((await request('/api/events-clubs', { user: users[0] })).result.events.some((event) => event.id === id), false, 'draft is private')
  assert.equal((await request(`/api/events-clubs/events/${id}`, { user: users[4], method: 'PATCH', body: { status: 'REGISTRATION_OPEN' } })).response.status, 200)
  assert.equal((await request('/api/events-clubs', { user: users[6] })).result.events.some((event) => event.id === id), false, 'department-targeted event is private to eligible users')
  const registration = await request(`/api/events-clubs/events/${id}/register`, { user: users[0], method: 'POST', body: {} })
  assert.equal(registration.response.status, 201)
  assert.equal(registration.result.registration.department, 'Computer Science')
  assert.equal((await request(`/api/events-clubs/events/${id}/register`, { user: users[0], method: 'POST', body: {} })).response.status, 409)
  assert.equal((await request(`/api/events-clubs/events/${id}/register`, { user: users[1], method: 'POST', body: {} })).response.status, 409, 'capacity enforced')
  assert.equal((await request('/api/events-clubs', { user: users[1] })).result.registrations.length, 0, 'users only see their own registrations')
  assert.equal((await request(`/api/events-clubs/registrations/${registration.result.registration.id}`, { user: users[1], method: 'PATCH', body: { status: 'CANCELLED' } })).response.status, 404)
  assert.equal((await request(`/api/events-clubs/registrations/${registration.result.registration.id}`, { user: users[0], method: 'PATCH', body: { status: 'ATTENDED' } })).response.status, 403)
  assert.equal((await request(`/api/events-clubs/registrations/${registration.result.registration.id}`, { user: users[0], method: 'PATCH', body: { status: 'CANCELLED' } })).response.status, 200)
})

test('Student, Staff, HOD, Sports Captain, and Administration can register while Canteen Staff cannot', async () => {
  const date = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10)
  const created = await request('/api/events-clubs/events', {
    user: users[4], method: 'POST',
    body: { name: 'Campus Awareness Day', category: 'Awareness', description: 'A general campus event.', date, startTime: '09:00', endTime: '12:00', venue: 'Auditorium', organizer: 'Administration', status: 'REGISTRATION_OPEN' },
  })
  assert.equal(created.response.status, 201)
  for (const user of users.slice(0, 5)) {
    const registered = await request(`/api/events-clubs/events/${created.result.event.id}/register`, { user, method: 'POST', body: {} })
    assert.equal(registered.response.status, 201, `${user.role} can register`)
  }
  assert.equal((await request(`/api/events-clubs/events/${created.result.event.id}/register`, { user: users[5], method: 'POST', body: {} })).response.status, 403)
})

test('Selected management actions mark attendance and create linked event results', async () => {
  const data = await store.read()
  const eventId = data.eventRegistrations.find((entry) => entry.status === 'CANCELLED').eventId
  const created = await request(`/api/events-clubs/events/${eventId}/register`, { user: users[1], method: 'POST', body: {} })
  assert.equal(created.response.status, 201)
  const registration = created.result.registration
  const updated = await request(`/api/events-clubs/registrations/${registration.id}`, { user: users[4], method: 'PATCH', body: { status: 'ATTENDED' } })
  assert.equal(updated.response.status, 200)
  assert.equal(updated.result.registration.status, 'ATTENDED')
  const result = await request('/api/events-clubs/results', { user: users[4], method: 'POST', body: { registrationId: registration.id, position: 'Winner', remarks: 'Great work' } })
  assert.equal(result.response.status, 201)
  assert.equal(result.result.result.userId, registration.userId)
  assert.equal((await request('/api/events-clubs/results', { user: users[0], method: 'POST', body: {} })).response.status, 403)
})

test('Club joins are persistent and duplicate active memberships are rejected', async () => {
  const joined = await request('/api/events-clubs/clubs/club-open/join', { method: 'POST', body: {} })
  assert.equal(joined.response.status, 201)
  assert.equal(joined.result.membership.status, 'ACTIVE')
  assert.equal((await request('/api/events-clubs/clubs/club-open/join', { method: 'POST', body: {} })).response.status, 409)
  const participantData = await request('/api/events-clubs')
  assert.equal(participantData.result.memberships[0].clubId, 'club-open')
})

test('Approval-based club applications stay private until approved and activated', async () => {
  const club = await request('/api/events-clubs/clubs', { user: users[4], method: 'POST', body: { name: 'Debate Club', category: 'Debate', description: 'Practice public speaking.', requiresApproval: true } })
  assert.equal(club.response.status, 201)
  const joined = await request(`/api/events-clubs/clubs/${club.result.club.id}/join`, { user: users[1], method: 'POST', body: {} })
  assert.equal(joined.result.membership.status, 'PENDING')
  assert.equal((await request(`/api/events-clubs/clubs/${club.result.club.id}/join`, { user: users[1], method: 'POST', body: {} })).response.status, 409)
  assert.equal((await request('/api/events-clubs/announcements', { user: users[4], method: 'POST', body: { clubId: club.result.club.id, title: 'Members only', message: 'Private club update.' } })).response.status, 201)
  assert.equal((await request('/api/events-clubs', { user: users[1] })).result.announcements.some((entry) => entry.clubId === club.result.club.id), false)
  assert.equal((await request(`/api/events-clubs/memberships/${joined.result.membership.id}`, { user: users[4], method: 'PATCH', body: { status: 'APPROVED' } })).response.status, 200)
  assert.equal((await request('/api/events-clubs', { user: users[1] })).result.announcements.some((entry) => entry.clubId === club.result.club.id), false, 'approval alone is not active membership')
  assert.equal((await request(`/api/events-clubs/memberships/${joined.result.membership.id}`, { user: users[4], method: 'PATCH', body: { status: 'ACTIVE' } })).response.status, 200)
  assert.equal((await request('/api/events-clubs', { user: users[1] })).result.announcements.some((entry) => entry.clubId === club.result.club.id), true)
})

test('Events notifications exclude Canteen Staff and successful registrations are notified', async () => {
  const saved = await store.read()
  assert.ok(saved.notifications.some((notification) => notification.recipientUserId === users[0].id && notification.title === 'Event registration successful'))
  assert.equal(saved.notifications.some((notification) => notification.recipientUserId === users[5].id), false)
  assert.ok(Object.values(APP_ROLES).includes(users[4].role))
})
