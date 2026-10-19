import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createCampusApp } from '../server/app.js'
import { hashPassword, signSession } from '../server/auth.js'
import { createStore } from '../server/store.js'
import { APP_ROLES, canSeePage } from '../src/auth/access.js'
import {
  ALL_DEPARTMENTS, formatSportsTime, normalizeSportsTime, SPORTS_DEPARTMENTS,
  SPORTS_DEPARTMENT_OPTIONS, SPORTS_EVENT_REGISTRATION_STATUSES, SPORTS_EVENT_STATUSES,
  normalizeSportsEventContract, sportsEventTimePayload,
} from '../shared/sports-time.js'

let server
let store
let directory
let baseUrl
const secret = randomBytes(32)
const captainPassword = 'Sports-captain-test-password-2026!'
test('Sports event time formats normalize and display 12-hour values consistently', () => {
  assert.equal(normalizeSportsTime('10:30 AM'), '10:30')
  assert.equal(normalizeSportsTime('12:00 AM'), '00:00')
  assert.equal(normalizeSportsTime('12:00 PM'), '12:00')
  assert.equal(normalizeSportsTime('3:05 PM'), '15:05')
  assert.equal(normalizeSportsTime('Hour:00 AM'), '')
  assert.equal(formatSportsTime('00:00'), '12:00 AM')
  assert.equal(formatSportsTime('12:00'), '12:00 PM')
  assert.deepEqual(sportsEventTimePayload({ startTime: '10:30 AM', endTime: '12:00 PM' }), {
    startTime: '10:30', endTime: '12:00',
  })
  assert.deepEqual(sportsEventTimePayload({ startTime: '', time: '10:30 AM', endTime: '12:00 PM' }), {
    startTime: '10:30', endTime: '12:00',
  })
  assert.throws(() => sportsEventTimePayload({ startTime: '11:00 PM', endTime: '10:00 PM' }), /End time must be after start time/)
  assert.deepEqual(SPORTS_DEPARTMENTS, ['B.Tech', 'Law', 'Pharmacy', 'Diploma', 'Management'])
  assert.deepEqual(SPORTS_DEPARTMENT_OPTIONS, [ALL_DEPARTMENTS, ...SPORTS_DEPARTMENTS])
  assert.deepEqual(SPORTS_EVENT_STATUSES, ['DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ONGOING', 'COMPLETED', 'CANCELLED'])
  assert.deepEqual(SPORTS_EVENT_REGISTRATION_STATUSES, ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'])
  const contract = normalizeSportsEventContract({
    startTime: '10:30 AM', endTime: '12:00 PM', status: 'REGISTRATION_OPEN',
    kind: 'MATCH', eligibleDepartments: ['B.Tech'],
  })
  assert.equal(contract.startTime, '10:30')
  assert.equal(contract.endTime, '12:00')
  assert.equal(contract.status, 'REGISTRATION_OPEN')
  assert.deepEqual(contract.eligibleDepartments, ['B.Tech'])
  assert.deepEqual(normalizeSportsEventContract({
    startTime: '10:30 AM', endTime: '12:00 PM', eligibleDepartments: [ALL_DEPARTMENTS],
  }).eligibleDepartments, [])
  assert.throws(() => normalizeSportsEventContract({
    startTime: '10:30 AM', endTime: '12:00 PM', eligibleDepartments: ['B.Tech CSE'],
  }), /listed eligible departments/)
  assert.throws(() => normalizeSportsEventContract({
    startTime: '10:30 AM', endTime: '12:00 PM', status: 'OPEN',
  }), /valid Sports Event status/)
})
const users = [
  ['PM-S1001', 'Student', true, 'Asha Student'],
  ['PM-S1002', 'Student', true, 'Bina Student'],
  ['PM-S1003', 'Student', true, 'Chirag Student'],
  ['PM-S1004', 'Student', true, 'Deepa Student'],
  ['PM-S1005', 'Student', false, 'Inactive Student'],
  ['PM-ST001', 'Staff', true, 'Staff Example'],
  ['PM-HOD001', 'HOD', true, 'HOD Example'],
  ['PM-SC001', 'Sports Captain', true, 'Captain Example'],
  ['PM-AD001', 'Administration', true, 'Admin Example'],
  ['PM-CS001', 'Canteen Staff', true, 'Canteen Example'],
].map(([id, role, active, name]) => ({
  id, role, active, name, email: `${id.toLowerCase()}@example.test`, mobile: '9876543210',
  department: id === 'PM-S1004' ? 'Civil Engineering' : 'Computer Science', semester: 'Semester 4', course: id === 'PM-S1004' ? 'BCA' : 'B.Tech',
  sessionVersion: 1, mustChangePassword: false,
}))

function cookieFor(user) {
  return `campus_session=${signSession(user, secret)}`
}

async function request(path, { user = users[0], method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Cookie: cookie || cookieFor(user), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { response, result: await response.json() }
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'campus-one-sports-tests-'))
  store = createStore(directory)
  users[7].credentials = await hashPassword(captainPassword)
  await store.write({
    users, sports: [
      { id: 'sport-badminton', kind: 'Sport', title: 'Badminton', description: 'Court sport', rules: 'Campus rules', active: true },
      { id: 'sport-cricket', kind: 'Sport', title: 'Cricket', description: 'Outdoor sport', rules: 'Campus rules', active: true },
      { id: 'sport-volleyball', kind: 'Sport', title: 'Volleyball', description: 'Team sport', rules: 'Campus rules', active: true },
    ],
    sportsEvents: [], sportsRegistrations: [], sportsTeams: [], sportsSchedules: [],
    sportsAttendance: [], sportsResults: [], sportsAchievements: [], sportsNotices: [],
    complaints: [{ id: 'preserve-complaint' }], canteenOrders: [{ id: 'preserve-order' }],
    notifications: [], registrationRequests: [], lostFoundReports: [],
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

test('sports navigation grants management only to Sports Captain and Administration', () => {
  for (const [id, role] of [['PM-S1001', APP_ROLES.STUDENT], ['PM-ST001', APP_ROLES.STAFF], ['PM-HOD001', APP_ROLES.HOD], ['PM-CS001', APP_ROLES.CANTEEN]]) {
    assert.equal(canSeePage({ id, role, modules: [] }, 'sports-management'), false)
  }
  assert.equal(canSeePage({ id: 'PM-SC001', role: APP_ROLES.SPORTS, modules: [] }, 'sports-management'), true)
  assert.equal(canSeePage({ id: 'PM-AD001', role: APP_ROLES.ADMIN, modules: [] }, 'sports-management'), true)
  assert.equal(canSeePage({ id: 'PM-SC001', role: APP_ROLES.SPORTS, modules: [] }, 'sports'), true)
  assert.equal(canSeePage({ id: 'PM-ST001', role: APP_ROLES.STAFF, modules: [] }, 'sports'), true)
  assert.equal(canSeePage({ id: 'PM-HOD001', role: APP_ROLES.HOD, modules: [] }, 'sports'), true)
  assert.equal(canSeePage({ id: 'PM-AD001', role: APP_ROLES.ADMIN, modules: [] }, 'sports'), true)
  assert.equal(canSeePage({ id: 'PM-CS001', role: APP_ROLES.CANTEEN, modules: [] }, 'sports'), false)
})

test('Sports Management API authorizes manager roles and rejects every other role', async () => {
  for (const user of users) {
    const response = await request('/api/sports/management', { user })
    const manager = ['Sports Captain', 'Administration'].includes(user.role)
    const expectedStatus = !user.active ? 401 : manager ? 200 : 403
    assert.equal(response.response.status, expectedStatus, `${user.role} manager endpoint access`)
  }
  const student = await request('/api/sports/student', { user: users[0] })
  assert.equal(student.response.status, 200)
  for (const user of [users[0], users[5], users[6], users[7], users[8]]) {
    assert.equal((await request('/api/sports', { user })).response.status, 200, `${user.role} can view basic Sports`)
    assert.equal((await request('/api/sports/events', { user })).response.status, 200, `${user.role} can view events`)
  }
  assert.equal((await request('/api/sports', { user: users[9] })).response.status, 403, 'Canteen Staff has no Sports access')
  for (const user of [users[5], users[6], users[9]]) {
    const response = await request('/api/sports/student', { user })
    assert.equal(response.response.status, user.role === 'Canteen Staff' ? 403 : 200, `${user.role} basic sports access`)
  }
  const protectedReads = ['/api/sports/students', '/api/sports/registrations', '/api/sports/teams', '/api/sports/schedules', '/api/sports/attendance', '/api/sports/results', '/api/sports/achievements', '/api/sports/notices']
  for (const user of [users[0], users[5], users[6], users[9]]) {
    for (const path of protectedReads) assert.equal((await request(path, { user })).response.status, 403, `${user.role} cannot read ${path}`)
    assert.equal((await request('/api/sports/events', { user, method: 'POST', body: {} })).response.status, 403, `${user.role} cannot create sports events`)
    assert.equal((await request('/api/sports', { user, method: 'POST', body: { kind: 'Sport', title: 'Blocked', description: 'No access' } })).response.status, 403, `${user.role} cannot create sports`)
  }
})

test('Sports Events stay within Sports Management, publish through existing notifications, and register once', async () => {
  const eventBody = {
    name: 'Test Sports Event', sportId: 'sport-cricket', kind: 'TOURNAMENT',
    date: '2099-05-12', ...sportsEventTimePayload({ startTime: '10:30 AM', endTime: '12:00 PM' }),
    venue: 'Sports ground', registrationDeadline: '2099-05-10',
    eligibility: 'All active students', description: 'Annual campus cricket tournament.',
    instructions: 'Arrive 30 minutes before the start.', audienceType: 'ALL', eligibleDepartments: ['B.Tech'],
  }
  let result = await request('/api/sports/events', { user: users[8], method: 'POST', body: eventBody })
  assert.equal(result.response.status, 201)
  const event = result.result.event
  assert.equal(event.status, 'DRAFT')
  assert.equal(event.sportId, 'sport-cricket', 'the event reuses the existing Sport record')
  assert.equal(event.startTime, '10:30')
  assert.equal(event.endTime, '12:00')
  assert.equal((await request('/api/sports/events', { user: users[0] })).result.events.some((entry) => entry.id === event.id), false, 'drafts are hidden from normal users')
  assert.equal((await request(`/api/sports/events/${event.id}`, { user: users[0] })).response.status, 404)
  assert.equal((await request(`/api/sports/events/${event.id}`, { user: users[9] })).response.status, 403, 'Canteen Staff cannot access Sports Events')

  result = await request(`/api/sports/events/${event.id}`, { user: users[8], method: 'PATCH', body: { status: 'PUBLISHED' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.event.status, 'PUBLISHED')
  assert.ok((await request('/api/sports/events', { user: users[0] })).result.events.some((entry) => entry.id === event.id))
  const studentNotifications = (await request('/api/notifications', { user: users[0] })).result.notifications
  assert.ok(studentNotifications.some((notification) => notification.referenceId === event.id && notification.title.includes(event.name)))
  assert.ok(studentNotifications.find((notification) => notification.referenceId === event.id)?.message.includes('10:30 AM'))
  const canteenNotifications = (await request('/api/notifications', { user: users[9] })).result.notifications
  assert.ok(!canteenNotifications.some((notification) => notification.referenceId === event.id), 'Sports notifications never reach Canteen Staff')

  result = await request(`/api/sports/events/${event.id}/register`, { user: users[3], method: 'POST', body: { userId: users[0].id, userName: 'Injected identity' } })
  assert.equal(result.response.status, 201, 'published events accept eligible registrations')
  const eventRegistration = result.result.registration
  assert.equal(eventRegistration.status, 'PENDING')
  assert.equal(eventRegistration.userId, users[3].id, 'registration identity comes from authentication, not the request body')
  assert.equal(eventRegistration.userName, users[3].name)
  assert.equal(eventRegistration.department, 'B.Tech')
  assert.equal(eventRegistration.course, users[3].course)
  assert.equal((await request('/api/sports/student', { user: users[3] })).result.sportsEventRegistrations[0].status, 'PENDING')
  assert.equal((await request('/api/sports/registrations', { user: users[3] })).response.status, 403, 'users cannot read other event registrations')
  assert.equal((await request(`/api/sports/events/${event.id}/register`, { user: users[3], method: 'POST', body: {} })).response.status, 409, 'event registration duplicates are rejected')
  assert.equal((await request(`/api/sports/events/${event.id}/register`, { user: users[9], method: 'POST', body: {} })).response.status, 403, 'Canteen Staff cannot register')
  result = await request(`/api/sports/registrations/${eventRegistration.id}`, { user: users[7], method: 'PATCH', body: { status: 'ACCEPTED' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.registration.status, 'ACCEPTED')
  assert.ok((await request('/api/notifications', { user: users[3] })).result.notifications.some((notification) => notification.title.includes('registration accepted')), 'approval uses the existing Sports notification store')
  assert.equal((await request(`/api/sports/registrations/${eventRegistration.id}`, { user: users[0], method: 'PATCH', body: { status: 'REJECTED' } })).response.status, 403, 'Students cannot approve registrations')
  result = await request(`/api/sports/events/${event.id}`, { user: users[8], method: 'PATCH', body: { status: 'REGISTRATION_OPEN', ...sportsEventTimePayload({ startTime: '9:45 PM', endTime: '10:15 PM' }) } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.event.startTime, '21:45', 'event edits normalize 12-hour time to backend storage format')
  assert.equal(result.result.event.endTime, '22:15')
  const persistedDetail = await request(`/api/sports/events/${event.id}`, { user: users[0] })
  assert.equal(persistedDetail.result.event.startTime, '21:45')
  assert.equal(persistedDetail.result.event.endTime, '22:15')
  const persistedStore = await store.read()
  assert.equal(persistedStore.sportsEvents.find((entry) => entry.id === event.id).startTime, '21:45')
  assert.equal(persistedStore.sportsEvents.find((entry) => entry.id === event.id).eligibleDepartments[0], 'B.Tech')
  assert.equal((await request(`/api/sports/events/${event.id}`, { user: users[8], method: 'PATCH', body: { startTime: '11:00 PM', endTime: '10:00 PM' } })).response.status, 400, 'end time must be later than start time')
  assert.equal((await request('/api/sports/management', { user: users[5] })).response.status, 403, 'Staff cannot view event management')
  const departments = (await request('/api/sports/management', { user: users[8] })).result.departments
  assert.deepEqual(departments, ['B.Tech', 'Law', 'Pharmacy', 'Diploma', 'Management'])

  const saved = await store.read()
  assert.ok(saved.sportsEvents.some((entry) => entry.id === event.id && entry.status === 'REGISTRATION_OPEN'), 'event state persists')
  assert.ok(saved.notifications.some((notification) => notification.referenceId === event.id && notification.target === 'sports'), 'event notices use the existing notification store')
})

test('Sports Event contract normalizes legacy database values and persists canonical values', async () => {
  const legacyEvent = {
    id: 'legacy-sports-event-contract', name: 'Legacy Volleyball Match',
    sportId: 'sport-cricket', sportName: 'Cricket', kind: 'MATCH',
    date: '2099-07-12', startTime: '', time: '10:30 AM', endTime: '12:00 PM',
    venue: 'Legacy Ground', registrationDeadline: '2099-07-10',
    eligibility: 'All active students', eligibleDepartments: ['Computer Science'],
    description: 'Legacy data used to verify safe normalization.', status: 'OPEN',
    audienceType: 'ALL', audienceId: '',
  }
  await store.transact((data) => data.sportsEvents.unshift(legacyEvent))

  const response = await request('/api/sports/events', { user: users[0] })
  const event = response.result.events.find((entry) => entry.id === legacyEvent.id)
  assert.equal(event.status, 'REGISTRATION_OPEN')
  assert.equal(event.startTime, '10:30')
  assert.equal(event.endTime, '12:00')
  assert.deepEqual(event.eligibleDepartments, ['B.Tech'])
  assert.equal(event.time, undefined)
  const persisted = (await store.read()).sportsEvents.find((entry) => entry.id === legacyEvent.id)
  assert.equal(persisted.status, 'REGISTRATION_OPEN')
  assert.equal(persisted.startTime, '10:30')
  assert.equal(persisted.time, undefined)
  assert.deepEqual(persisted.eligibleDepartments, ['B.Tech'])
  assert.equal((await request('/api/sports/student', { user: users[0] })).result.events.find((entry) => entry.id === legacyEvent.id).registrationAvailable, true)

  await store.transact((data) => { data.sportsEvents = data.sportsEvents.filter((entry) => entry.id !== legacyEvent.id) })
})

test('REGISTRATION_OPEN events store consistent status/departments and enforce department eligibility', async () => {
  const eventPayload = normalizeSportsEventContract({
    name: 'Test Volleyball Event', sportId: 'sport-volleyball', kind: 'MATCH',
    date: '2099-10-12', startTime: '10:30 AM', endTime: '12:00 PM',
    venue: 'Test Ground', registrationDeadline: '2099-10-10',
    maxParticipants: 20, eligibility: 'All active students',
    eligibleDepartments: ['B.Tech'], description: 'Department eligibility integration test.',
    status: 'REGISTRATION_OPEN', audienceType: 'ALL',
  })
  assert.equal(eventPayload.startTime, '10:30')
  assert.equal(eventPayload.endTime, '12:00')
  assert.deepEqual(eventPayload.eligibleDepartments, ['B.Tech'])
  assert.equal(eventPayload.status, 'REGISTRATION_OPEN')
  const created = await request('/api/sports/events', {
    user: users[7], method: 'POST',
    body: eventPayload,
  })
  assert.equal(created.response.status, 201)
  const event = created.result.event
  assert.equal(event.status, 'REGISTRATION_OPEN')
  assert.equal(event.startTime, '10:30')
  assert.equal(event.endTime, '12:00')
  assert.equal(event.time, undefined)
  assert.deepEqual(event.eligibleDepartments, ['B.Tech'])
  assert.equal(event.maxParticipants, 20)
  const storedAtCreate = (await store.read()).sportsEvents.find((entry) => entry.id === event.id)
  assert.deepEqual({
    department: storedAtCreate.eligibleDepartments[0],
    startTime: storedAtCreate.startTime,
    endTime: storedAtCreate.endTime,
    status: storedAtCreate.status,
  }, { department: 'B.Tech', startTime: '10:30', endTime: '12:00', status: 'REGISTRATION_OPEN' })
  const refreshed = (await request(`/api/sports/events/${event.id}`, { user: users[0] })).result.event
  assert.deepEqual({
    department: refreshed.eligibleDepartments[0],
    startTime: refreshed.startTime,
    endTime: refreshed.endTime,
    status: refreshed.status,
  }, { department: 'B.Tech', startTime: '10:30', endTime: '12:00', status: 'REGISTRATION_OPEN' })
  const edited = await request(`/api/sports/events/${event.id}`, {
    user: users[8], method: 'PATCH',
    body: {
      ...refreshed, startTime: '10:30', endTime: '12:00',
      eligibleDepartments: ['B.Tech'], status: 'REGISTRATION_OPEN',
    },
  })
  assert.equal(edited.response.status, 200)
  assert.deepEqual({
    department: edited.result.event.eligibleDepartments[0],
    startTime: edited.result.event.startTime,
    endTime: edited.result.event.endTime,
    status: edited.result.event.status,
  }, { department: 'B.Tech', startTime: '10:30', endTime: '12:00', status: 'REGISTRATION_OPEN' })
  const baseEvent = {
    ...event, id: undefined, createdAt: undefined, updatedAt: undefined,
  }
  assert.equal((await request('/api/sports/events', {
    user: users[7], method: 'POST',
    body: { ...baseEvent, name: 'Bad Department Event', eligibleDepartments: ['B.Tech CSE'] },
  })).response.status, 400)
  assert.equal((await request('/api/sports/events', {
    user: users[7], method: 'POST',
    body: { ...baseEvent, name: 'Bad Status Event', status: 'OPEN_NOW' },
  })).response.status, 400)
  const studentEvents = (await request('/api/sports/student', { user: users[0] })).result.events
  assert.equal(studentEvents.find((entry) => entry.id === event.id).registrationAvailable, true)
  const studentRegistration = await request(`/api/sports/events/${event.id}/register`, { user: users[0], method: 'POST', body: {} })
  assert.equal(studentRegistration.response.status, 201)
  assert.equal(studentRegistration.result.registration.status, 'PENDING')
  const captainView = await request('/api/sports/management', { user: users[7] })
  const adminView = await request('/api/sports/management', { user: users[8] })
  assert.ok(captainView.result.registrations.some((entry) => entry.id === studentRegistration.result.registration.id))
  assert.ok(adminView.result.registrations.some((entry) => entry.id === studentRegistration.result.registration.id))
  const accepted = await request(`/api/sports/registrations/${studentRegistration.result.registration.id}`, {
    user: users[7], method: 'PATCH', body: { status: 'ACCEPTED' },
  })
  assert.equal(accepted.response.status, 200)
  assert.equal(accepted.result.registration.status, 'ACCEPTED')
  assert.ok((await request('/api/notifications', { user: users[0] })).result.notifications.some((notification) => notification.title.includes('registration accepted')))
  assert.equal((await request('/api/sports/student', { user: users[0] })).result.sportsEventRegistrations[0].status, 'ACCEPTED')
  assert.equal((await request(`/api/sports/events/${event.id}/register`, { user: users[0], method: 'POST', body: {} })).response.status, 409)

  const secondRegistration = await request(`/api/sports/events/${event.id}/register`, { user: users[1], method: 'POST', body: {} })
  assert.equal(secondRegistration.response.status, 201)
  const rejected = await request(`/api/sports/registrations/${secondRegistration.result.registration.id}`, {
    user: users[8], method: 'PATCH', body: { status: 'REJECTED' },
  })
  assert.equal(rejected.response.status, 200)
  assert.equal(rejected.result.registration.status, 'REJECTED')
  assert.ok((await request('/api/notifications', { user: users[1] })).result.notifications.some((notification) => notification.title.includes('registration rejected')))
  assert.ok((await request('/api/sports/student', { user: users[1] })).result.sportsEventRegistrations.some((entry) => entry.status === 'REJECTED'))

  await store.transact((data) => {
    data.users.find((entry) => entry.id === users[2].id).department = 'Law'
  })
  try {
    const lawEvents = (await request('/api/sports/student', { user: users[2] })).result.events
    assert.equal(lawEvents.find((entry) => entry.id === event.id).registrationAvailable, false)
    assert.equal((await request(`/api/sports/events/${event.id}/register`, { user: users[2], method: 'POST', body: {} })).response.status, 403)
  } finally {
    await store.transact((data) => {
      data.users.find((entry) => entry.id === users[2].id).department = 'Computer Science'
    })
  }
})

test('every canonical eligible department and All Departments round-trip through Sports Event registration', async () => {
  const originalDepartment = users[0].department
  try {
    for (const department of SPORTS_DEPARTMENTS) {
      const created = await request('/api/sports/events', {
        user: users[7], method: 'POST',
        body: {
          name: `Eligible ${department} Volleyball Match`,
          sportId: 'sport-volleyball', kind: 'MATCH',
          date: '2099-11-12', startTime: '10:30 AM', endTime: '12:00 PM',
          venue: 'Test Ground', registrationDeadline: '2099-11-10',
          maxParticipants: 20, eligibility: 'Eligible students',
          eligibleDepartments: [department], description: 'Department eligibility round-trip test.',
          status: 'REGISTRATION_OPEN', audienceType: 'ALL',
        },
      })
      assert.equal(created.response.status, 201, `API accepts ${department}`)
      assert.deepEqual(created.result.event.eligibleDepartments, [department])
      assert.equal((await store.read()).sportsEvents.find((entry) => entry.id === created.result.event.id).eligibleDepartments[0], department)
      await store.transact((data) => {
        data.users.find((entry) => entry.id === users[0].id).department = department
      })
      const studentData = (await request('/api/sports/student', { user: users[0] })).result
      assert.equal(studentData.events.find((entry) => entry.id === created.result.event.id).registrationAvailable, true)
      assert.equal((await request(`/api/sports/events/${created.result.event.id}/register`, {
        user: users[0], method: 'POST', body: {},
      })).response.status, 201, `${department} user can register`)
    }

    const allDepartments = await request('/api/sports/events', {
      user: users[7], method: 'POST',
      body: {
        name: 'All Departments Volleyball Match',
        sportId: 'sport-volleyball', kind: 'MATCH',
        date: '2099-11-13', startTime: '10:30 AM', endTime: '12:00 PM',
        venue: 'Test Ground', registrationDeadline: '2099-11-11',
        maxParticipants: 20, eligibility: 'All eligible users',
        eligibleDepartments: [ALL_DEPARTMENTS], description: 'All departments eligibility test.',
        status: 'REGISTRATION_OPEN', audienceType: 'ALL',
      },
    })
    assert.equal(allDepartments.response.status, 201)
    assert.deepEqual(allDepartments.result.event.eligibleDepartments, [])
    await store.transact((data) => {
      data.users.find((entry) => entry.id === users[0].id).department = 'Management'
    })
    const managementUser = (await request('/api/sports/student', { user: users[0] })).result
    assert.equal(managementUser.events.find((entry) => entry.id === allDepartments.result.event.id).registrationAvailable, true)
    assert.equal((await request(`/api/sports/events/${allDepartments.result.event.id}/register`, {
      user: users[0], method: 'POST', body: {},
    })).response.status, 201)
  } finally {
    await store.transact((data) => {
      data.users.find((entry) => entry.id === users[0].id).department = originalDepartment
    })
  }
})

test('Sports Event registration enforces capacity, deadlines, and manager visibility', async () => {
  const captain = users[7]
  const eventBody = {
    name: 'Limited Badminton Trial', sportId: 'sport-badminton', kind: 'TRIAL',
    date: '2099-08-12', startTime: '9:00 AM', endTime: '11:00 AM',
    venue: 'Court 1', registrationDeadline: '2099-08-10',
    maxParticipants: 1, eligibility: 'All active students',
    description: 'A capacity-limited badminton trial.', status: 'REGISTRATION_OPEN',
  }
  const created = await request('/api/sports/events', { user: captain, method: 'POST', body: eventBody })
  assert.equal(created.response.status, 201)
  const event = created.result.event
  assert.equal(event.startTime, '09:00')
  assert.equal(event.endTime, '11:00')
  const first = await request(`/api/sports/events/${event.id}/register`, { user: users[0], method: 'POST', body: {} })
  assert.equal(first.response.status, 201)
  assert.equal((await request(`/api/sports/events/${event.id}/register`, { user: users[1], method: 'POST', body: {} })).response.status, 409, 'pending registrations reserve capacity')
  assert.equal((await request('/api/sports/student', { user: users[1] })).result.events.find((entry) => entry.id === event.id).registrationAvailable, false)
  const captainView = await request('/api/sports/management', { user: captain })
  assert.ok(captainView.result.registrations.some((entry) => entry.id === first.result.registration.id), 'Sports Captain can view event registrations')
  const adminView = await request('/api/sports/management', { user: users[8] })
  assert.ok(adminView.result.registrations.some((entry) => entry.id === first.result.registration.id), 'Administration can view event registrations')

  const expired = await request('/api/sports/events', { user: captain, method: 'POST', body: {
    ...eventBody, name: 'Expired Badminton Trial', maxParticipants: 0,
    date: '2099-09-12', registrationDeadline: '2000-01-01',
  } })
  assert.equal(expired.response.status, 201)
  assert.equal((await request(`/api/sports/events/${expired.result.event.id}/register`, { user: users[1], method: 'POST', body: {} })).response.status, 409, 'expired registration deadlines are enforced')
})

test('sport applications persist for allowed roles, prevent duplicates, and activate only selected participants', async () => {
  const applicants = [users[0], users[5], users[6], users[7], users[8]]
  const sports = new Map([['PM-S1001', 'sport-badminton'], ['PM-ST001', 'sport-cricket'], ['PM-HOD001', 'sport-cricket'], ['PM-SC001', 'sport-badminton'], ['PM-AD001', 'sport-cricket']])
  const applications = new Map()

  for (const applicant of applicants) {
    const response = await request('/api/sports/applications', {
      user: applicant, method: 'POST',
      body: { sportId: sports.get(applicant.id), position: 'Player', details: `Relevant experience for ${applicant.name}.`, studentId: 'PM-S9999' },
    })
    assert.equal(response.response.status, 201, `${applicant.role} can apply`)
    assert.equal(response.result.application.studentId, applicant.id, 'application identity comes from the authenticated account')
    assert.equal(response.result.application.studentName, applicant.name)
    assert.equal(response.result.application.department, applicant.department)
    assert.equal(response.result.application.status, 'SUBMITTED')
    assert.equal(response.result.application.applicationType, 'SPORT')
    applications.set(applicant.id, response.result.application)
  }

  assert.equal((await request('/api/sports/applications', { user: users[0], method: 'POST', body: { sportId: 'sport-badminton', details: 'Duplicate pending application.' } })).response.status, 409)
  assert.equal((await request('/api/sports/applications', { user: users[0], method: 'POST', body: { sportId: 'inactive-sport', details: 'This sport is not active.' } })).response.status, 400)
  assert.equal((await request('/api/sports/applications', { user: users[9], method: 'POST', body: { sportId: 'sport-badminton', details: 'Canteen has no sports access.' } })).response.status, 403)

  const studentView = await request('/api/sports/student', { user: users[0] })
  const ownApplication = studentView.result.registrations.find((entry) => entry.id === applications.get(users[0].id).id)
  assert.ok(ownApplication, 'My Applications contains the signed-in user’s sports application')
  assert.equal(ownApplication.sportName, 'Badminton')
  assert.equal(ownApplication.status, 'SUBMITTED')
  assert.equal(studentView.result.mySports.length, 0, 'a submitted application does not activate a participant')
  assert.equal(studentView.result.teams.length, 0)
  assert.equal(studentView.result.schedules.length, 0)

  const captain = users[7]
  const staffApplication = applications.get(users[5].id)
  assert.equal((await request(`/api/sports/registrations/${staffApplication.id}`, { user: users[0], method: 'PATCH', body: { status: 'SHORTLISTED' } })).response.status, 403, 'applicants cannot make captain decisions')
  let decision = await request(`/api/sports/registrations/${staffApplication.id}`, { user: captain, method: 'PATCH', body: { status: 'SHORTLISTED' } })
  assert.equal(decision.response.status, 200)
  assert.equal(decision.result.registration.status, 'SHORTLISTED')
  assert.equal((await request('/api/sports/student', { user: users[5] })).result.mySports.length, 0, 'shortlisting does not grant participant access')
  decision = await request(`/api/sports/registrations/${staffApplication.id}`, { user: captain, method: 'PATCH', body: { status: 'SELECTED' } })
  assert.equal(decision.response.status, 200)
  assert.equal(decision.result.registration.status, 'SELECTED')

  let saved = await store.read()
  assert.ok(saved.sportsParticipations.some((entry) => entry.userId === users[5].id && entry.sportId === 'sport-cricket' && entry.source === 'APPLICATION' && entry.active), 'selection creates an authoritative active participation')
  assert.equal((await request(`/api/sports/registrations/${staffApplication.id}`, { user: captain, method: 'PATCH', body: { status: 'REJECTED' } })).response.status, 409, 'selected sport applications are terminal')
  assert.equal((await request('/api/sports/applications', { user: users[5], method: 'POST', body: { sportId: 'sport-cricket', details: 'Duplicate selected application.' } })).response.status, 409, 'active selected participants cannot apply twice for the same sport')
  const managerView = await request('/api/sports/management', { user: captain })
  assert.equal(managerView.response.status, 200)
  assert.equal(managerView.result.registrations.find((entry) => entry.id === staffApplication.id).details, `Relevant experience for ${users[5].name}.`)
  assert.ok(managerView.result.registrations.find((entry) => entry.id === staffApplication.id).position)

  const schedule = await request('/api/sports/schedules', { user: captain, method: 'POST', body: {
    title: 'Cricket practice', sportId: 'sport-cricket', kind: 'PRACTICE',
    date: '2099-05-11', time: '16:00', venue: 'Sports ground', instructions: 'Bring kit.',
  } })
  assert.equal(schedule.response.status, 201)
  assert.ok((await request('/api/sports/student', { user: users[5] })).result.schedules.some((entry) => entry.id === schedule.result.schedule.id), 'selected staff participant can access that sport schedule')
  assert.ok(!(await request('/api/sports/student', { user: users[6] })).result.schedules.some((entry) => entry.id === schedule.result.schedule.id), 'submitted applicants cannot access another applicant’s private sport information')

  decision = await request(`/api/sports/registrations/${applications.get(users[0].id).id}`, { user: captain, method: 'PATCH', body: { status: 'REJECTED' } })
  assert.equal(decision.response.status, 200)
  const rejectedView = await request('/api/sports/student', { user: users[0] })
  assert.equal(rejectedView.result.registrations[0].status, 'REJECTED')
  assert.equal(rejectedView.result.mySports.length, 0, 'rejection does not activate a participant')
  assert.equal(rejectedView.result.schedules.length, 0)
  const cricketNotice = await request('/api/sports/notices', { user: captain, method: 'POST', body: {
    title: 'Cricket practice notice', message: 'The cricket practice schedule is available.',
    audienceType: 'SPORT', audienceId: 'sport-cricket',
  } })
  assert.equal(cricketNotice.result.recipientCount, 1, 'sport notice targets selected active participants only')
  assert.ok((await request('/api/notifications', { user: users[5] })).result.notifications.some((entry) => entry.referenceId === cricketNotice.result.notice.id))
  assert.ok(!(await request('/api/notifications', { user: users[6] })).result.notifications.some((entry) => entry.referenceId === cricketNotice.result.notice.id))
  assert.ok(!(await request('/api/notifications', { user: users[0] })).result.notifications.some((entry) => entry.referenceId === cricketNotice.result.notice.id))

  const cricketEvent = await request('/api/sports/events', { user: captain, method: 'POST', body: {
    name: 'Cricket invitational', sportId: 'sport-cricket', kind: 'TOURNAMENT',
    date: '2099-06-12', startTime: '10:00', endTime: '14:00',
    venue: 'Sports ground', registrationDeadline: '2099-06-10',
    eligibility: 'Active Cricket participants', description: 'Cricket-only tournament.',
    status: 'PUBLISHED', audienceType: 'SPORT',
  } })
  assert.equal(cricketEvent.response.status, 201)
  assert.ok((await request('/api/notifications', { user: users[5] })).result.notifications.some((entry) => entry.referenceId === cricketEvent.result.event.id), 'event notifications reuse the existing sport-target recipient logic')
  assert.ok(!(await request('/api/notifications', { user: users[6] })).result.notifications.some((entry) => entry.referenceId === cricketEvent.result.event.id), 'unrelated sports users are not notified')
  assert.ok(!(await request('/api/notifications', { user: users[0] })).result.notifications.some((entry) => entry.referenceId === cricketEvent.result.event.id), 'nonparticipants in the sport are not notified')

  const multipleSportApplication = await request('/api/sports/applications', { user: users[0], method: 'POST', body: { sportId: 'sport-cricket', details: 'Interested in playing cricket too.' } })
  assert.equal(multipleSportApplication.response.status, 201, 'a user may apply for a different sport')
  assert.equal((await request('/api/sports/student', { user: users[0] })).result.registrations.filter((entry) => entry.applicationType === 'SPORT').length, 2)
  saved = await store.read()
  assert.equal(saved.sportsRegistrations.find((entry) => entry.id === applications.get(users[0].id).id).status, 'REJECTED', 'application status is persisted')
})

test('sports setup, event selection, team roster, scheduling, attendance, results and notices persist', async () => {
  const captain = users[7]
  let result = await request('/api/sports', { user: captain, method: 'POST', body: { kind: 'Sport', title: 'Tennis', description: 'Campus tennis', rules: 'Standard rules' } })
  assert.equal(result.response.status, 201)
  const tennis = result.result.record
  assert.equal((await request('/api/sports', { user: captain, method: 'POST', body: { kind: 'Sport', title: 'Badminton', description: 'Duplicate sport' } })).response.status, 409)

  const eventBody = {
    name: 'Tennis trials', sportId: tennis.id, kind: 'TRIAL', date: '2099-05-12', time: '10:30 AM', endTime: '12:00 PM',
    venue: 'Sports ground', registrationDeadline: '2099-05-10', maxParticipants: 12,
<<<<<<< HEAD
    eligibility: 'All active students', eligibleDepartments: ['Law'], description: 'Try out for the college team.', status: 'REGISTRATION_OPEN',
=======
    eligibility: 'All active students', eligibleDepartments: ['BTech'], description: 'Try out for the college team.',
>>>>>>> e957f2e274225976ecab5017e65c01a1d87d0a99
  }
  result = await request('/api/sports/events', { user: captain, method: 'POST', body: eventBody })
  assert.equal(result.response.status, 201)
  const event = result.result.event

  assert.equal((await request(`/api/sports/events/${event.id}/register`, { user: users[3], method: 'POST', body: {} })).response.status, 403, 'department eligibility is enforced')
  result = await request(`/api/sports/events/${event.id}`, { user: captain, method: 'PATCH', body: { eligibleDepartments: ['B.Tech'] } })
  assert.equal(result.response.status, 200, 'legacy engineering departments can be targeted through the new B.Tech option')
  const student = users[2]
  result = await request(`/api/sports/events/${event.id}/register`, { user: student, method: 'POST', body: {} })
  assert.equal(result.response.status, 201)
  const eventRegistration = result.result.registration
  assert.equal(eventRegistration.studentId, student.id)
  assert.equal(eventRegistration.status, 'PENDING')
  assert.equal((await request(`/api/sports/events/${event.id}/register`, { user: student, method: 'POST', body: {} })).response.status, 409)
  const staffApplication = await request(`/api/sports/events/${event.id}/register`, { user: users[5], method: 'POST', body: {} })
  assert.equal(staffApplication.response.status, 201, 'eligible Staff may apply')
  assert.equal(staffApplication.result.registration.status, 'PENDING')
  const cancelApplication = await request(`/api/sports/applications/${staffApplication.result.registration.id}`, { user: users[5], method: 'PATCH', body: { status: 'CANCELLED' } })
  assert.equal(cancelApplication.result.application.status, 'CANCELLED', 'applicants can cancel their own application')
  assert.equal((await request(`/api/sports/applications/${staffApplication.result.registration.id}`, { user: users[6], method: 'PATCH', body: { status: 'CANCELLED' } })).response.status, 404, 'users cannot cancel someone else’s application')
  const hodApplication = await request(`/api/sports/events/${event.id}/register`, { user: users[6], method: 'POST', body: {} })
  assert.equal(hodApplication.response.status, 201, 'eligible HOD may apply')

  result = await request(`/api/sports/registrations/${eventRegistration.id}`, { user: users[8], method: 'PATCH', body: { status: 'ACCEPTED' } })
  assert.equal(result.result.registration.status, 'ACCEPTED')
  assert.ok((await request('/api/notifications', { user: student })).result.notifications.some((notification) => notification.title.includes('registration accepted')), 'Administration acceptance notifies the registrant')
  const sportApplicationResult = await request('/api/sports/applications', { user: student, method: 'POST', body: { sportId: tennis.id, details: 'I have played tennis competitively and want to join.' } })
  assert.equal(sportApplicationResult.response.status, 201)
  const selectedApplication = sportApplicationResult.result.application
  result = await request(`/api/sports/registrations/${selectedApplication.id}`, { user: captain, method: 'PATCH', body: { status: 'SHORTLISTED' } })
  assert.equal(result.response.status, 200)
  result = await request(`/api/sports/registrations/${selectedApplication.id}`, { user: captain, method: 'PATCH', body: { status: 'SELECTED' } })
  assert.equal(result.result.registration.status, 'SELECTED')
  let saved = await store.read()
  assert.ok(saved.sportsParticipations.some((entry) => entry.userId === student.id && entry.sportId === tennis.id && entry.active), 'selection creates the authoritative active sports participation')

  const badmintonEventResult = await request('/api/sports/events', { user: captain, method: 'POST', body: {
    ...eventBody, name: 'Badminton trials', sportId: 'sport-badminton', eligibleDepartments: [],
  } })
  const badmintonEvent = badmintonEventResult.result.event
  const badmintonApplication = await request(`/api/sports/events/${badmintonEvent.id}/register`, { user: student, method: 'POST', body: {} })
  assert.equal(badmintonApplication.response.status, 201)
  result = await request(`/api/sports/registrations/${badmintonApplication.result.registration.id}`, { user: captain, method: 'PATCH', body: { status: 'ACCEPTED' } })
  assert.equal(result.result.registration.status, 'ACCEPTED')
  const badmintonSportApplication = await request('/api/sports/applications', { user: student, method: 'POST', body: { sportId: 'sport-badminton', details: 'I have badminton experience and want to join.' } })
  assert.equal(badmintonSportApplication.response.status, 201)
  for (const status of ['SHORTLISTED', 'SELECTED']) {
    result = await request(`/api/sports/registrations/${badmintonSportApplication.result.application.id}`, { user: captain, method: 'PATCH', body: { status } })
  }
  const rejectedApplication = await request(`/api/sports/events/${badmintonEvent.id}/register`, { user: users[3], method: 'POST', body: {} })
  assert.equal(rejectedApplication.response.status, 201)
  result = await request(`/api/sports/registrations/${rejectedApplication.result.registration.id}`, { user: users[8], method: 'PATCH', body: { status: 'REJECTED' } })
  assert.equal(result.response.status, 200)
  assert.ok((await request('/api/notifications', { user: users[3] })).result.notifications.some((notification) => notification.title.includes('registration rejected')), 'Administration rejection notifies the registrant')

  result = await request('/api/sports/teams', { user: captain, method: 'POST', body: {
    name: 'Tennis College Team', sportId: tennis.id, category: 'Mixed', teamType: 'College Team',
    description: 'Campus tennis players', captainId: users[0].id, viceCaptainId: users[1].id,
  } })
  assert.equal(result.response.status, 201)
  const team = result.result.team
  assert.equal(team.playerCount, 2, 'captain and vice-captain are active members')
  assert.equal((await request('/api/sports/teams', { user: users[0], method: 'POST', body: { name: 'Invalid', sportId: tennis.id, category: 'Mixed', teamType: 'College Team', description: 'No access', captainId: users[0].id } })).response.status, 403)
  assert.equal((await request('/api/sports/teams', { user: captain, method: 'POST', body: { name: 'Bad captain', sportId: tennis.id, category: 'Mixed', teamType: 'College Team', description: 'Invalid player', captainId: users[5].id } })).response.status, 400)
  assert.equal((await request('/api/sports/teams', { user: captain, method: 'POST', body: { name: 'Bad inactive', sportId: tennis.id, category: 'Mixed', teamType: 'College Team', description: 'Inactive player', captainId: users[4].id } })).response.status, 400)
  assert.equal((await request('/api/sports/teams', { user: captain, method: 'POST', body: { name: 'Same captains', sportId: tennis.id, category: 'Mixed', teamType: 'College Team', description: 'Duplicate roles', captainId: users[0].id, viceCaptainId: users[0].id } })).response.status, 400)
  result = await request(`/api/sports/teams/${team.id}/members`, { user: captain, method: 'POST', body: { studentId: student.id, registrationId: selectedApplication.id, position: 'Singles' } })
  assert.equal(result.response.status, 201, 'selected trial participant can join a matching team')
  assert.equal(result.result.team.playerCount, 3)
  result = await request(`/api/sports/teams/${team.id}/members`, { user: captain, method: 'POST', body: { studentId: captain.id, position: 'Player' } })
  assert.equal(result.response.status, 201, 'Sports Captain also receives normal student team-member access')
  assert.equal(result.result.team.playerCount, 4)
  assert.equal((await request(`/api/sports/teams/${team.id}/members`, { user: captain, method: 'POST', body: { studentId: student.id } })).response.status, 409, 'duplicate membership is prevented')
  assert.equal((await request(`/api/sports/teams/${team.id}/members/${users[0].id}`, { user: captain, method: 'DELETE' })).response.status, 409, 'captain cannot be removed while assigned')
  assert.equal((await request(`/api/sports/teams/${team.id}/members`, { user: captain, method: 'POST', body: { studentId: users[4].id } })).response.status, 400)
  assert.equal((await request(`/api/sports/teams/${team.id}/members`, { user: captain, method: 'POST', body: { studentId: 'PM-S9999' } })).response.status, 400)

  result = await request('/api/sports/schedules', { user: captain, method: 'POST', body: {
    title: 'Tennis practice', sportId: tennis.id, teamId: team.id, kind: 'PRACTICE',
    date: '2099-05-11', time: '16:00', venue: 'Court 2', instructions: 'Bring kit.',
  } })
  assert.equal(result.response.status, 201)
  const schedule = result.result.schedule

  result = await request('/api/sports/attendance', { user: captain, method: 'POST', body: { scheduleId: schedule.id, records: [{ studentId: student.id, status: 'PRESENT' }] } })
  assert.equal(result.response.status, 200)
  result = await request('/api/sports/results', { user: captain, method: 'POST', body: {
    eventId: event.id, sportId: tennis.id, teamIds: [team.id], playerIds: [student.id],
    registrationIds: [selectedApplication.id], winner: team.name, score: '2-0', date: '2099-05-12', venue: 'Sports ground', remarks: 'Final',
  } })
  assert.equal(result.response.status, 201)
  const achievement = await request('/api/sports/achievements', { user: captain, method: 'POST', body: {
    studentId: student.id, teamId: team.id, sportId: tennis.id, competition: 'Campus Cup',
    position: 'Winner', year: 2099, achievement: 'Won the tennis final',
  } })
  assert.equal(achievement.response.status, 201)

  result = await request('/api/sports/notices', { user: captain, method: 'POST', body: {
    title: 'Tennis team practice', message: 'Practice is on Court 2.', audienceType: 'TEAM', audienceId: team.id,
  } })
  assert.equal(result.response.status, 201)
  assert.equal(result.result.recipientCount, 4)
  const noticeId = result.result.notice.id
  assert.ok((await request('/api/notifications', { user: student })).result.notifications.some((notice) => notice.referenceId === noticeId))
  assert.ok(!(await request('/api/notifications', { user: users[3] })).result.notifications.some((notice) => notice.referenceId === noticeId))
  const eventNotice = await request('/api/sports/notices', { user: captain, method: 'POST', body: {
    title: 'Tennis trial reminder', message: 'Reminder for applicants.', audienceType: 'EVENT', audienceId: event.id,
  } })
  assert.equal(eventNotice.result.recipientCount, 2, 'event notices reach active applicants but not cancelled applications')
  assert.ok((await request('/api/notifications', { user: users[6] })).result.notifications.some((notice) => notice.referenceId === eventNotice.result.notice.id))
  assert.ok(!(await request('/api/notifications', { user: users[5] })).result.notifications.some((notice) => notice.referenceId === eventNotice.result.notice.id))
  const badmintonNotice = await request('/api/sports/notices', { user: captain, method: 'POST', body: {
    title: 'Badminton update', message: 'Selected Badminton members only.', audienceType: 'SPORT', audienceId: 'sport-badminton',
  } })
  assert.equal(badmintonNotice.result.recipientCount, 1, 'sport notices target active participants in that sport only')
  assert.ok((await request('/api/notifications', { user: student })).result.notifications.some((notice) => notice.referenceId === badmintonNotice.result.notice.id))
  assert.ok(!(await request('/api/notifications', { user: users[0] })).result.notifications.some((notice) => notice.referenceId === badmintonNotice.result.notice.id))
  const studentSports = await request('/api/sports/student', { user: student })
  assert.equal(studentSports.response.status, 200)
  assert.equal(studentSports.result.registrations.find((entry) => entry.id === selectedApplication.id).status, 'SELECTED')
  assert.deepEqual(new Set(studentSports.result.mySports.map((entry) => entry.sportId)), new Set([tennis.id, 'sport-badminton']), 'multiple selected sports remain independently available')
  assert.equal(studentSports.result.teams[0].name, team.name)
  assert.equal(studentSports.result.schedules[0].id, schedule.id)
  assert.equal(studentSports.result.attendance[0].status, 'PRESENT')
  assert.equal(studentSports.result.attendance[0].sportId, tennis.id, 'attendance remains sport-specific')
  assert.equal(studentSports.result.results.length, 1)
  assert.equal(studentSports.result.achievements.length, 1)
  assert.ok(studentSports.result.notices.some((notice) => notice.id === noticeId))
  assert.equal((await request('/api/sports/student', { user: users[3] })).result.notices.length, 0)
  const privateSportData = await request('/api/sports/student', { user: users[3] })
  assert.equal(privateSportData.result.mySports.length, 0, 'unselected users have no private sport membership')
  assert.equal(privateSportData.result.teams.length, 0)
  assert.equal(privateSportData.result.schedules.length, 0)
  assert.equal(privateSportData.result.attendance.length, 0)
  assert.equal(privateSportData.result.results.length, 0)
  assert.equal(privateSportData.result.achievements.length, 0)
  assert.equal(privateSportData.result.registrations.find((entry) => entry.id === rejectedApplication.result.registration.id).status, 'REJECTED')
  const teammateData = await request('/api/sports/student', { user: users[0] })
  assert.equal(teammateData.result.attendance.length, 0, 'attendance never exposes another team member’s record')
  assert.ok(!teammateData.result.notices.some((notice) => notice.id === badmintonNotice.result.notice.id), 'sport notices do not cross membership boundaries')
  assert.equal((await request('/api/sports/student', { user: captain })).result.teams.length, 1, 'Sports Captain can use My Team as a student')

  await request(`/api/sports/teams/${team.id}`, { user: captain, method: 'PATCH', body: { status: 'ARCHIVED' } })
  saved = await store.read()
  assert.equal(saved.sportsTeams.find((entry) => entry.id === team.id).members.length, 4, 'archiving retains the roster')
  assert.equal(saved.sportsResults.length, 1, 'historical results remain')
  assert.equal(saved.complaints[0].id, 'preserve-complaint')
  assert.equal(saved.canteenOrders[0].id, 'preserve-order')
})

test('students separately apply for sports and teams; Sports Captain reviews and materializes approval', async () => {
  const captain = users[7]
  const sportApplicant = users[3]
  const teamApplicant = users[2]
  const createdTeam = await request('/api/sports/teams', { user: captain, method: 'POST', body: {
    name: 'Cricket Practice Team', sportId: 'sport-cricket', category: 'Mixed',
    teamType: 'Practice Team', description: 'Configured cricket practice team',
    captainId: users[0].id, viceCaptainId: users[1].id,
  } })
  assert.equal(createdTeam.response.status, 201)
  const team = createdTeam.result.team

  let result = await request('/api/sports/membership-applications', { user: sportApplicant, method: 'POST', body: { sportId: 'sport-cricket' } })
  assert.equal(result.response.status, 201)
  const sportApplication = result.result.application
  assert.equal(sportApplication.type, 'SPORT')
  assert.equal(sportApplication.status, 'APPLIED')
  assert.equal((await request('/api/sports/membership-applications', { user: sportApplicant, method: 'POST', body: { sportId: 'sport-cricket' } })).response.status, 409, 'duplicate sport applications are rejected')

  result = await request('/api/sports/membership-applications', { user: teamApplicant, method: 'POST', body: { teamId: team.id } })
  assert.equal(result.response.status, 201)
  const teamApplication = result.result.application
  assert.equal(teamApplication.type, 'TEAM')
  assert.equal(teamApplication.teamId, team.id)
  assert.equal((await request('/api/sports/membership-applications', { user: teamApplicant, method: 'POST', body: { teamId: team.id } })).response.status, 409, 'duplicate team applications are rejected')
  assert.equal((await request('/api/sports/membership-applications', { user: users[5], method: 'POST', body: { sportId: 'sport-cricket' } })).response.status, 403, 'non-students cannot apply')

  let own = await request('/api/sports/student', { user: sportApplicant })
  assert.deepEqual(own.result.membershipApplications.map((entry) => entry.id), [sportApplication.id], 'students see only their own sports/team applications')
  assert.ok(own.result.availableTeams.some((entry) => entry.id === team.id), 'students can see active team choices without needing prior membership')
  assert.equal((await request('/api/sports/student', { user: users[1] })).result.membershipApplications.length, 0, 'another student cannot see the applications')

  const managerData = await request('/api/sports/management', { user: captain })
  assert.ok(managerData.result.membershipApplications.some((entry) => entry.id === sportApplication.id))
  assert.ok(managerData.result.membershipApplications.some((entry) => entry.id === teamApplication.id))
  assert.equal((await request(`/api/sports/membership-applications/${sportApplication.id}`, { user: sportApplicant, method: 'PATCH', body: { status: 'APPROVED' } })).response.status, 403, 'students cannot review applications')

  result = await request(`/api/sports/membership-applications/${sportApplication.id}`, { user: captain, method: 'PATCH', body: { status: 'APPROVED' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.application.status, 'APPROVED')
  own = await request('/api/sports/student', { user: sportApplicant })
  assert.equal(own.result.membershipApplications[0].status, 'APPROVED', 'students can see their application status')
  assert.ok(own.result.mySports.some((entry) => entry.sportId === 'sport-cricket'), 'sport approval creates active participation')

  result = await request(`/api/sports/membership-applications/${teamApplication.id}`, { user: captain, method: 'PATCH', body: { status: 'APPROVED' } })
  assert.equal(result.response.status, 200)
  const teamData = await request('/api/sports/teams', { user: captain })
  assert.ok(teamData.result.teams.find((entry) => entry.id === team.id).members.some((entry) => entry.studentId === teamApplicant.id && entry.status === 'ACTIVE'), 'team approval adds the student to the active roster')

  const rejected = await request('/api/sports/membership-applications', { user: users[1], method: 'POST', body: { sportId: 'sport-badminton' } })
  assert.equal(rejected.response.status, 201)
  const rejectResult = await request(`/api/sports/membership-applications/${rejected.result.application.id}`, { user: captain, method: 'PATCH', body: { status: 'REJECTED' } })
  assert.equal(rejectResult.response.status, 200)
  assert.equal((await request('/api/sports/student', { user: users[1] })).result.membershipApplications[0].status, 'REJECTED')
})

test('general Sports notices target participants while campus announcements remain in Notices', async () => {
  const captain = users[7]
  const sportsNotice = await request('/api/sports/notices', { user: captain, method: 'POST', body: {
    title: 'All sports participants update', message: 'A general update for active sports participants.', audienceType: 'ALL',
  } })
  assert.equal(sportsNotice.response.status, 201, sportsNotice.result.error)
  const saved = await store.read()
  const persistedSportsNotice = saved.sportsNotices.find((notice) => notice.id === sportsNotice.result.notice.id)
  assert.ok(persistedSportsNotice.recipientIds.length > 0)
  for (const user of [users[5], users[6]]) {
    assert.ok(!persistedSportsNotice.recipientIds.includes(user.id), `${user.role} is not included without sports participation`)
    const inbox = await request('/api/notifications', { user })
    assert.ok(!inbox.result.notifications.some((entry) => entry.referenceId === persistedSportsNotice.id))
  }
  for (const recipientId of persistedSportsNotice.recipientIds) {
    assert.equal(saved.notifications.filter((entry) => entry.referenceId === persistedSportsNotice.id && entry.recipientUserId === recipientId).length, 1)
  }

  const campusAnnouncement = await request('/api/notices', { user: users[8], method: 'POST', body: {
    title: 'Campus-wide sports announcement', description: 'The sports festival starts next week.',
    category: 'Sports', priority: 'Normal', target: { type: 'EVERYONE' },
    publishAt: new Date().toISOString(),
  } })
  assert.equal(campusAnnouncement.response.status, 201, campusAnnouncement.result.error)
  assert.ok((await request('/api/notices', { user: users[0] })).result.notices.some((notice) => notice.id === campusAnnouncement.result.notice.id))
  const studentSports = await request('/api/sports/student', { user: users[0] })
  assert.ok(!studentSports.result.notices.some((notice) => notice.id === campusAnnouncement.result.notice.id), 'campus announcements remain in general Notices, not targeted Sports notices')
  assert.equal((await request('/api/notices', { user: users[9] })).response.status, 403, 'Canteen Staff remains outside the campus notice audience')
  const afterRead = await store.read()
  const campusNoticeNotifications = afterRead.notifications.filter((entry) => entry.referenceId === campusAnnouncement.result.notice.id && entry.type === 'CAMPUS_NOTICE')
  assert.ok(campusNoticeNotifications.length > 0)
  assert.equal(campusNoticeNotifications.filter((entry) => entry.recipientUserId === users[0].id).length, 1)
  await request('/api/notices', { user: users[0] })
  const afterRefresh = await store.read()
  assert.equal(afterRefresh.notifications.filter((entry) => entry.referenceId === campusAnnouncement.result.notice.id && entry.recipientUserId === users[0].id).length, 1, 'refreshing does not duplicate campus notice notifications')

  const denied = await request('/api/notices', { user: captain, method: 'POST', body: {
    title: 'Unauthorized campus post', description: 'Sports Captain remains sports-audience scoped.',
    category: 'Sports', target: { type: 'EVERYONE' },
  } })
  assert.equal(denied.response.status, 403)
})

test('event and trial applications reject closed events and elapsed deadlines', async () => {
  const captain = users[7]
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const base = {
    sportId: 'sport-cricket', kind: 'TRIAL', date: '2099-05-12', time: '10:30',
    venue: 'Sports ground', maxParticipants: 0, eligibility: 'All active students',
    eligibleDepartments: [], description: 'Configured test trial.',
  }
  let result = await request('/api/sports/events', { user: captain, method: 'POST', body: { ...base, name: 'Deadline test trial', registrationDeadline: yesterday } })
  assert.equal(result.response.status, 201)
  assert.equal((await request(`/api/sports/events/${result.result.event.id}/register`, { user: users[0], method: 'POST', body: {} })).response.status, 409, 'elapsed deadline prevents registration')

  result = await request('/api/sports/events', { user: captain, method: 'POST', body: { ...base, name: 'Closed test trial', date: '2099-06-12', registrationDeadline: '2099-06-10' } })
  assert.equal(result.response.status, 201)
  const closed = await request(`/api/sports/events/${result.result.event.id}`, { user: captain, method: 'PATCH', body: { status: 'CLOSED' } })
  assert.equal(closed.response.status, 200)
  assert.equal((await request(`/api/sports/events/${result.result.event.id}/register`, { user: users[0], method: 'POST', body: {} })).response.status, 409, 'closed events reject registration')

  result = await request('/api/sports/events', { user: captain, method: 'POST', body: { ...base, name: 'Passed test trial', date: yesterday, registrationDeadline: yesterday } })
  assert.equal(result.response.status, 201)
  assert.equal((await request(`/api/sports/events/${result.result.event.id}/register`, { user: users[0], method: 'POST', body: {} })).response.status, 409, 'past events reject registration')
})

test('event and trial date/time values create and edit as stable campus-local fields', async () => {
  const captain = users[7]
  const eventBody = {
    name: 'Clock picker regression trial', sportId: 'sport-cricket', kind: 'TRIAL',
    date: '2099-08-15', time: '17:45', venue: 'Sports ground',
    registrationRequired: true, registrationDeadline: '2099-08-10',
    maxParticipants: 0, eligibility: 'All active students', eligibleDepartments: [],
    description: 'Date and time should persist exactly as selected.',
  }
  const created = await request('/api/sports/events', { user: captain, method: 'POST', body: eventBody })
  assert.equal(created.response.status, 201, created.result.error)
  assert.equal(created.result.event.date, '2099-08-15')
  assert.equal(created.result.event.time, '17:45')
  assert.equal(created.result.event.registrationRequired, true)

  const updated = await request(`/api/sports/events/${created.result.event.id}`, {
    user: captain, method: 'PATCH', body: { date: '2099-08-16', time: '08:05:00', registrationDeadline: '2099-08-12' },
  })
  assert.equal(updated.response.status, 200, updated.result.error)
  assert.equal(updated.result.event.date, '2099-08-16')
  assert.equal(updated.result.event.time, '08:05')
  assert.equal(updated.result.event.registrationDeadline, '2099-08-12')
  const saved = await store.read()
  const storedEvent = saved.sportsEvents.find((event) => event.id === created.result.event.id)
  assert.equal(storedEvent.time, '08:05')
  assert.equal(storedEvent.date, '2099-08-16')

  const invalidTime = await request('/api/sports/events', { user: captain, method: 'POST', body: { ...eventBody, name: 'Invalid clock value', time: '25:90' } })
  assert.equal(invalidTime.response.status, 400)
  assert.match(invalidTime.result.error, /valid event time/i)
  const invalidDate = await request('/api/sports/events', { user: captain, method: 'POST', body: { ...eventBody, name: 'Invalid calendar date', date: '2099-02-30' } })
  assert.equal(invalidDate.response.status, 400)
  assert.match(invalidDate.result.error, /valid event date/i)
})

test('event registration is optional and legacy events default safely without rewriting stored records', async () => {
  const captain = users[7]
  const optional = await request('/api/sports/events', { user: captain, method: 'POST', body: {
    name: 'No registration required', sportId: 'sport-cricket', kind: 'EVENT',
    date: '2099-09-15', time: '12:30', venue: 'Main field',
    registrationRequired: false, registrationDeadline: '', eligibleDepartments: [],
    description: 'Attend without applying.',
  } })
  assert.equal(optional.response.status, 201, optional.result.error)
  assert.equal(optional.result.event.registrationRequired, false)
  assert.equal((await request(`/api/sports/events/${optional.result.event.id}/register`, { user: users[0], method: 'POST', body: {} })).response.status, 409)

  const legacy = {
    id: 'legacy-sports-event', name: 'Legacy sports event', sportId: 'sport-cricket',
    sportName: 'Cricket', kind: 'TRIAL', date: '2099-10-15', time: '10:30',
    venue: 'Sports ground', registrationDeadline: '2099-10-10', status: 'OPEN',
    eligibleDepartments: ['Computer Science'], description: 'Existing record without a registration setting.',
  }
  await store.transact((data) => { data.sportsEvents.unshift(legacy) })
  const beforeRead = await store.read()
  assert.equal(Object.hasOwn(beforeRead.sportsEvents.find((event) => event.id === legacy.id), 'registrationRequired'), false)
  const fetched = await request('/api/sports/events', { user: users[0] })
  assert.equal(fetched.result.events.find((event) => event.id === legacy.id).registrationRequired, true)
  const afterRead = await store.read()
  assert.equal(Object.hasOwn(afterRead.sportsEvents.find((event) => event.id === legacy.id), 'registrationRequired'), false)
  const applied = await request(`/api/sports/events/${legacy.id}/register`, { user: users[0], method: 'POST', body: {} })
  assert.equal(applied.response.status, 201, 'legacy events preserve their previous registration behavior')
})

test('Sports event departments normalize the six configured values and reject unrelated values', async () => {
  const captain = users[7]
  const configuredDepartments = ['BTech', 'BCA', 'Law', 'Pharmacy', 'Diploma', 'Management']
  for (const department of configuredDepartments) {
    const result = await request('/api/sports/events', { user: captain, method: 'POST', body: {
      name: `${department} test trial`, sportId: 'sport-cricket', kind: 'TRIAL',
      date: '2099-11-15', time: '09:00', venue: 'Sports ground',
      registrationRequired: true, registrationDeadline: '2099-11-10',
      eligibleDepartments: [` ${department.toLowerCase()} `], description: 'Department eligibility test.',
    } })
    assert.equal(result.response.status, 201, `${department}: ${result.result.error || ''}`)
    assert.deepEqual(result.result.event.eligibleDepartments, [department])
  }
  const invalid = await request('/api/sports/events', { user: captain, method: 'POST', body: {
    name: 'Unrelated department', sportId: 'sport-cricket', kind: 'TRIAL',
    date: '2099-11-15', time: '09:00', venue: 'Sports ground',
    registrationRequired: true, registrationDeadline: '2099-11-10',
    eligibleDepartments: ['Computer Science'], description: 'Invalid Sports department should fail.',
  } })
  assert.equal(invalid.response.status, 400)
  assert.match(invalid.result.error, /Sports departments/i)

  const bcaEvent = await request('/api/sports/events', { user: captain, method: 'POST', body: {
    name: 'BCA registration eligibility', sportId: 'sport-cricket', kind: 'TRIAL',
    date: '2099-12-15', time: '10:00', venue: 'Sports ground',
    registrationRequired: true, registrationDeadline: '2099-12-10',
    eligibleDepartments: [' BCA '], description: 'BCA applicants may register.',
  } })
  assert.equal(bcaEvent.response.status, 201)
  const originalCourse = (await store.read()).users.find((user) => user.id === users[0].id).course
  await store.transact((data) => { data.users.find((user) => user.id === users[0].id).course = ' bCa ' })
  try {
    const application = await request(`/api/sports/events/${bcaEvent.result.event.id}/register`, { user: users[0], method: 'POST', body: {} })
    assert.equal(application.response.status, 201, application.result.error)
  } finally {
    await store.transact((data) => { data.users.find((user) => user.id === users[0].id).course = originalCourse })
  }
})

test('Administration retains sports access but cannot manage Canteen menu or orders', async () => {
  const admin = users[8]
  const getMenu = await request('/api/canteen/menu', { user: admin })
  assert.equal(getMenu.response.status, 200, 'Administration can browse the menu as a customer')
  const menuItem = getMenu.result.items[0]
  const manageMenu = await request('/api/canteen/menu', { user: admin, method: 'POST', body: { diet: menuItem.diet, category: menuItem.category, name: 'Unauthorized menu item', price: 1 } })
  assert.equal(manageMenu.response.status, 403)
  const order = await request('/api/canteen/orders', { user: admin, method: 'POST', body: { items: [{ itemId: menuItem.id, quantity: 1 }] } })
  assert.equal(order.response.status, 201, 'Administration can place a customer order')
})

test('Sports Captain can log in, restore access after refresh, log out, and log in again', async () => {
  async function login() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: users[7].id, role: users[7].role, password: captainPassword }),
    })
    const sessionCookie = response.headers.get('set-cookie')?.split(';', 1)[0]
    assert.equal(response.status, 200)
    assert.match(sessionCookie || '', /^campus_session=/)
    return sessionCookie
  }

  let cookie = await login()
  assert.equal((await request('/api/auth/me', { user: users[7], cookie })).response.status, 200, 'session restores after refresh')
  assert.equal((await request('/api/sports/management', { user: users[7], cookie })).response.status, 200)
  assert.equal((await request('/api/auth/logout', { user: users[7], method: 'POST', cookie })).response.status, 200)
  assert.equal((await request('/api/sports/management', { user: users[7], cookie })).response.status, 401, 'logout invalidates the sports session')
  cookie = await login()
  assert.equal((await request('/api/sports/management', { user: users[7], cookie })).response.status, 200, 'data and role access persist after signing in again')
})
