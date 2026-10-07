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

const secret = randomBytes(32)
const users = [
  { id: 'PM-S1001', name: 'CSE Semester Three', role: 'Student', course: 'B.Tech', department: 'Computer Science', semester: 'Semester 3' },
  { id: 'PM-S1002', name: 'CSE Semester Two', role: 'Student', course: 'B.Tech', department: 'Computer Science', semester: '2nd' },
  { id: 'PM-S1003', name: 'ECE Semester Three', role: 'Student', course: 'B.Tech', department: 'Electrical Engineering', semester: 'Semester 3' },
  { id: 'PM-ST001', name: 'Department Staff', role: 'Staff', department: 'Computer Science' },
  { id: 'PM-HOD001', name: 'CSE HOD', role: 'HOD', department: 'Computer Science' },
  { id: 'PM-SC001', name: 'Sports Captain', role: 'Sports Captain' },
  { id: 'PM-AD001', name: 'Administrator', role: 'Administration' },
  { id: 'PM-CS001', name: 'Canteen Staff', role: 'Canteen Staff' },
].map((user) => ({ ...user, active: true, sessionVersion: 1, mustChangePassword: false }))

let server
let store
let directory
let baseUrl

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
  directory = await mkdtemp(join(tmpdir(), 'campus-one-notice-tests-'))
  store = createStore(directory)
  await store.write({
    users,
    campus: { notices: [] },
    notifications: [
      { id: 'canteen-order-notice', recipientUserId: users[7].id, title: 'New Canteen pre-order', message: 'Order test', target: 'canteen', referenceId: 'order-1', readAt: null, createdAt: new Date().toISOString() },
      { id: 'canteen-campus-leak', recipientUserId: users[7].id, title: 'Unrelated update', message: 'Must stay private', target: 'complaints', referenceId: 'complaint-1', readAt: null, createdAt: new Date().toISOString() },
    ],
    sports: [{ id: 'cricket', kind: 'Sport', title: 'Cricket', active: true }],
    sportsEvents: [{ id: 'trial-cricket', name: 'Cricket trials', sportId: 'cricket', status: 'OPEN' }],
    sportsRegistrations: [
      { id: 'app-selected', eventId: 'trial-cricket', sportId: 'cricket', studentId: users[0].id, status: 'SELECTED' },
      { id: 'app-applied', eventId: 'trial-cricket', sportId: 'cricket', studentId: users[1].id, status: 'APPLIED' },
      { id: 'app-rejected', eventId: 'trial-cricket', sportId: 'cricket', studentId: users[2].id, status: 'REJECTED' },
    ],
    sportsParticipations: [{ id: 'participation-cse', userId: users[0].id, sportId: 'cricket', active: true, status: 'ACTIVE' }],
    sportsTeams: [{
      id: 'team-cricket',
      name: 'Cricket Team',
      sportId: 'cricket',
      status: 'ACTIVE',
      members: [{ studentId: users[0].id, status: 'ACTIVE' }],
    }],
    sportsSchedules: [], sportsAttendance: [], sportsResults: [], sportsAchievements: [], sportsNotices: [],
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

test('Notice navigation excludes Canteen Staff and permits authorized publisher roles', () => {
  for (const user of users) assert.equal(canSeePage({ id: user.id, role: user.role, modules: [] }, 'notices'), user.role !== 'Canteen Staff')
})

test('Administration publishes to everyone except Canteen Staff and notification/read state persists', async () => {
  const admin = users[6]
  const created = await request('/api/notices', { user: admin, method: 'POST', body: {
    title: 'Campus closure', description: 'The college will be closed tomorrow.', category: 'General',
    priority: 'Important', pinned: true, target: { type: 'EVERYONE' },
    publishAt: new Date(Date.now() - 60_000).toISOString(),
  } })
  assert.equal(created.response.status, 201)
  assert.equal(created.result.recipientCount, 7, 'everyone excludes only Canteen Staff')
  const noticeId = created.result.notice.id

  for (const recipient of users.slice(0, 7)) {
    const list = await request('/api/notices', { user: recipient })
    const notice = list.result.notices.find((entry) => entry.id === noticeId)
    assert.ok(notice, `${recipient.role} receives the notice`)
    assert.equal(notice.isRead, false)
    assert.equal(notice.issuerName, admin.name)
    const details = await request(`/api/notices/${encodeURIComponent(noticeId)}`, { user: recipient })
    assert.equal(details.response.status, 200)
    assert.equal(details.result.notice.id, noticeId)
  }
  assert.equal((await request(`/api/notices/${encodeURIComponent(noticeId)}`, { user: users[7] })).response.status, 403)
  assert.equal((await request('/api/notices', { user: users[7] })).response.status, 403)
  assert.equal((await request('/api/notices', { user: users[7], method: 'POST', body: {} })).response.status, 403)
  assert.equal((await request('/api/notices/options', { user: users[7] })).response.status, 403)

  const unreadBefore = (await request('/api/notifications', { user: users[0] })).result.unreadCount
  const marked = await request(`/api/notices/${noticeId}/read`, { user: users[0], method: 'POST', body: {} })
  assert.equal(marked.result.notice.isRead, true)
  const refreshed = await request('/api/notices', { user: users[0] })
  assert.equal(refreshed.result.notices.find((entry) => entry.id === noticeId).isRead, true)
  assert.equal((await request('/api/notifications', { user: users[0] })).result.unreadCount, unreadBefore - 1)
  const saved = await store.read()
  assert.equal(saved.notifications.filter((entry) => entry.referenceId === noticeId && entry.type === 'CAMPUS_NOTICE').length, 7, 'notifications are not duplicated on subsequent refreshes')
})

test('HOD and Staff issuance is confined to their own department and profile targeting', async () => {
  const hod = users[4]
  const matched = await request('/api/notices', { user: hod, method: 'POST', body: {
    title: 'CSE third semester assessment', description: 'Assessment schedule is attached.', category: 'Examination',
    priority: 'Normal', target: { type: 'PROFILE', department: 'CSE', course: 'B.Tech', semester: '3rd' },
    publishAt: new Date(Date.now() - 60_000).toISOString(),
  } })
  assert.equal(matched.response.status, 201)
  assert.equal(matched.result.recipientCount, 1)
  const noticeId = matched.result.notice.id
  assert.ok((await request('/api/notices', { user: users[0] })).result.notices.some((entry) => entry.id === noticeId))
  assert.ok(!(await request('/api/notices', { user: users[1] })).result.notices.some((entry) => entry.id === noticeId))
  assert.ok(!(await request('/api/notices', { user: users[2] })).result.notices.some((entry) => entry.id === noticeId))

  const crossDepartment = await request('/api/notices', { user: hod, method: 'POST', body: {
    title: 'Unauthorized department notice', description: 'Must not be issued.', category: 'Department',
    target: { type: 'DEPARTMENT', department: 'Electrical Engineering' },
  } })
  assert.equal(crossDepartment.response.status, 403)

  const staff = await request('/api/notices', { user: users[3], method: 'POST', body: {
    title: 'CSE semester update', description: 'Course work deadline.', category: 'Academic',
    target: { type: 'SEMESTER', semester: 'Semester 3' },
  } })
  assert.equal(staff.response.status, 201)
  assert.equal(staff.result.recipientCount, 1)
  const broadStaff = await request('/api/notices', { user: users[3], method: 'POST', body: {
    title: 'Campus-wide update', description: 'Unauthorized broad audience.', category: 'General',
    target: { type: 'EVERYONE' },
  } })
  assert.equal(broadStaff.response.status, 403)
})

test('Sports Captain can issue sports notices only to appropriate sports audiences', async () => {
  const captain = users[5]
  const academic = await request('/api/notices', { user: captain, method: 'POST', body: {
    title: 'Academic notice', description: 'Not a sports notice.', category: 'Academic',
    target: { type: 'EVERYONE' },
  } })
  assert.equal(academic.response.status, 403)
  const created = await request('/api/notices', { user: captain, method: 'POST', body: {
    title: 'Cricket practice update', description: 'Practice begins at 5 PM.', category: 'Sports',
    target: { type: 'SPORT', sportId: 'cricket' }, publishAt: new Date(Date.now() - 60_000).toISOString(),
  } })
  assert.equal(created.response.status, 201)
  assert.equal(created.result.recipientCount, 1)
  assert.ok((await request('/api/notices', { user: users[0] })).result.notices.some((entry) => entry.id === created.result.notice.id))
  assert.ok(!(await request('/api/notices', { user: users[1] })).result.notices.some((entry) => entry.id === created.result.notice.id))

  const teamNotice = await request('/api/notices', { user: captain, method: 'POST', body: {
    title: 'Cricket team update', description: 'Team meeting at 4 PM.', category: 'Sports',
    target: { type: 'TEAM', teamId: 'team-cricket' }, publishAt: new Date(Date.now() - 60_000).toISOString(),
  } })
  assert.equal(teamNotice.response.status, 201)
  assert.equal(teamNotice.result.recipientCount, 1)
  assert.ok((await request('/api/notices', { user: users[0] })).result.notices.some((entry) => entry.id === teamNotice.result.notice.id))
  assert.ok(!(await request('/api/notices', { user: users[1] })).result.notices.some((entry) => entry.id === teamNotice.result.notice.id))

  const eventNotice = await request('/api/notices', { user: captain, method: 'POST', body: {
    title: 'Cricket trial update', description: 'Trial timing updated.', category: 'Sports',
    target: { type: 'EVENT', eventId: 'trial-cricket' }, publishAt: new Date(Date.now() - 60_000).toISOString(),
  } })
  assert.equal(eventNotice.response.status, 201)
  assert.equal(eventNotice.result.recipientCount, 2)
  assert.ok((await request('/api/notices', { user: users[0] })).result.notices.some((entry) => entry.id === eventNotice.result.notice.id))
  assert.ok((await request('/api/notices', { user: users[1] })).result.notices.some((entry) => entry.id === eventNotice.result.notice.id))
  assert.ok(!(await request('/api/notices', { user: users[2] })).result.notices.some((entry) => entry.id === eventNotice.result.notice.id))
})

test('Students can read but cannot issue; Canteen Staff sees order notifications only', async () => {
  assert.equal((await request('/api/notices', { user: users[0], method: 'POST', body: {} })).response.status, 403)
  const canteen = users[7]
  const notices = await request('/api/notifications', { user: canteen })
  assert.deepEqual(notices.result.notifications.map((entry) => entry.id), ['canteen-order-notice'])
  assert.equal((await request('/api/campus/notices', { user: canteen })).response.status, 403)
  assert.equal((await request('/api/campus/notices', { user: users[6], method: 'POST', body: { title: 'Bypass', description: 'No alternate issue route' } })).response.status, 403)
})

test('Scheduled and expired notices respect their publication window', async () => {
  const admin = users[6]
  const scheduled = await request('/api/notices', { user: admin, method: 'POST', body: {
    title: 'Future notice', description: 'Visible at publish time.', category: 'General',
    target: { type: 'STUDENTS' }, publishAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  } })
  assert.equal(scheduled.response.status, 201)
  assert.ok(!(await request('/api/notices', { user: users[0] })).result.notices.some((entry) => entry.id === scheduled.result.notice.id))
  const invalidExpiry = await request('/api/notices', { user: admin, method: 'POST', body: {
    title: 'Expired early', description: 'Invalid time range.', category: 'General',
    target: { type: 'EVERYONE' }, publishAt: new Date().toISOString(), expiresAt: new Date(Date.now() - 10_000).toISOString(),
  } })
  assert.equal(invalidExpiry.response.status, 400)
})
