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

let server
let store
let directory
let baseUrl
const secret = randomBytes(32)
const captainPassword = 'Sports-captain-test-password-2026!'
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
  department: id === 'PM-S1004' ? 'Civil Engineering' : 'Computer Science', semester: 'Semester 4', course: 'B.Tech',
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

test('sports setup, event selection, team roster, scheduling, attendance, results and notices persist', async () => {
  const captain = users[7]
  let result = await request('/api/sports', { user: captain, method: 'POST', body: { kind: 'Sport', title: 'Tennis', description: 'Campus tennis', rules: 'Standard rules' } })
  assert.equal(result.response.status, 201)
  const tennis = result.result.record
  assert.equal((await request('/api/sports', { user: captain, method: 'POST', body: { kind: 'Sport', title: 'Badminton', description: 'Duplicate sport' } })).response.status, 409)

  const eventBody = {
    name: 'Tennis trials', sportId: tennis.id, kind: 'TRIAL', date: '2099-05-12', time: '10:30',
    venue: 'Sports ground', registrationDeadline: '2099-05-10', maxParticipants: 12,
    eligibility: 'All active students', eligibleDepartments: ['Computer Science'], description: 'Try out for the college team.',
  }
  result = await request('/api/sports/events', { user: captain, method: 'POST', body: eventBody })
  assert.equal(result.response.status, 201)
  const event = result.result.event

  assert.equal((await request(`/api/sports/events/${event.id}/register`, { user: users[3], method: 'POST', body: {} })).response.status, 403, 'department eligibility is enforced')
  const student = users[2]
  result = await request(`/api/sports/events/${event.id}/register`, { user: student, method: 'POST', body: {} })
  assert.equal(result.response.status, 201)
  const registration = result.result.registration
  assert.equal(registration.studentId, student.id)
  assert.equal((await request(`/api/sports/events/${event.id}/register`, { user: student, method: 'POST', body: {} })).response.status, 409)
  const staffApplication = await request(`/api/sports/events/${event.id}/register`, { user: users[5], method: 'POST', body: {} })
  assert.equal(staffApplication.response.status, 201, 'eligible Staff may apply')
  assert.equal(staffApplication.result.registration.status, 'APPLIED')
  const cancelApplication = await request(`/api/sports/applications/${staffApplication.result.registration.id}`, { user: users[5], method: 'PATCH', body: { status: 'CANCELLED' } })
  assert.equal(cancelApplication.result.application.status, 'CANCELLED', 'applicants can cancel their own application')
  assert.equal((await request(`/api/sports/applications/${staffApplication.result.registration.id}`, { user: users[6], method: 'PATCH', body: { status: 'CANCELLED' } })).response.status, 404, 'users cannot cancel someone else’s application')
  const hodApplication = await request(`/api/sports/events/${event.id}/register`, { user: users[6], method: 'POST', body: {} })
  assert.equal(hodApplication.response.status, 201, 'eligible HOD may apply')

  result = await request(`/api/sports/registrations/${registration.id}`, { user: captain, method: 'PATCH', body: { status: 'SHORTLISTED' } })
  assert.equal(result.response.status, 200)
  result = await request(`/api/sports/registrations/${registration.id}`, { user: captain, method: 'PATCH', body: { status: 'SELECTED' } })
  assert.equal(result.result.registration.status, 'SELECTED')
  let saved = await store.read()
  assert.ok(saved.sportsParticipations.some((entry) => entry.userId === student.id && entry.sportId === tennis.id && entry.active), 'selection creates the authoritative active sports participation')

  const badmintonEventResult = await request('/api/sports/events', { user: captain, method: 'POST', body: {
    ...eventBody, name: 'Badminton trials', sportId: 'sport-badminton', eligibleDepartments: [],
  } })
  const badmintonEvent = badmintonEventResult.result.event
  const badmintonApplication = await request(`/api/sports/events/${badmintonEvent.id}/register`, { user: student, method: 'POST', body: {} })
  assert.equal(badmintonApplication.response.status, 201)
  for (const status of ['SHORTLISTED', 'SELECTED']) {
    result = await request(`/api/sports/registrations/${badmintonApplication.result.registration.id}`, { user: captain, method: 'PATCH', body: { status } })
  }
  const rejectedApplication = await request(`/api/sports/events/${badmintonEvent.id}/register`, { user: users[3], method: 'POST', body: {} })
  assert.equal(rejectedApplication.response.status, 201)
  result = await request(`/api/sports/registrations/${rejectedApplication.result.registration.id}`, { user: captain, method: 'PATCH', body: { status: 'REJECTED' } })
  assert.equal(result.response.status, 200)

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
  result = await request(`/api/sports/teams/${team.id}/members`, { user: captain, method: 'POST', body: { studentId: student.id, registrationId: registration.id, position: 'Singles' } })
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
    registrationIds: [registration.id], winner: team.name, score: '2-0', date: '2099-05-12', venue: 'Sports ground', remarks: 'Final',
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
  assert.equal(studentSports.result.registrations.find((entry) => entry.id === registration.id).status, 'SELECTED')
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
