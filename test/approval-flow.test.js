import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createCampusApp } from '../server/app.js'
import { createStore } from '../server/store.js'

const ADMIN_CODE = 'PMV05'
const PASSWORD = 'my-secure-campus-password'
const PROFILES = {
  Administration: { role: 'Administration', name: 'Admin Example', gender: 'Prefer not to say', mobile: '9876543210', email: 'admin@puranmurti.example', designation: 'Campus Administrator', password: PASSWORD, accessCode: ADMIN_CODE },
  HOD: { role: 'HOD', name: 'Computer Science HOD', gender: 'Female', mobile: '9876543211', email: 'hod-cs@puranmurti.example', department: 'Computer Science', designation: 'Head of Department', joiningYear: '2017' },
  Staff: { role: 'Staff', name: 'Computer Science Staff', gender: 'Male', mobile: '9876543212', email: 'staff-cs@puranmurti.example', department: 'Computer Science', designation: 'Department Instructor', joiningYear: '2020' },
  'Sports Captain': { role: 'Sports Captain', name: 'Campus Captain', gender: 'Non-binary', mobile: '9876543213', email: 'captain@puranmurti.example', department: 'Computer Science', sport: 'Football', teamCategory: 'Intercollegiate' },
  student: { role: 'Student', name: 'CS Student', gender: 'Female', mobile: '9876543214', email: 'student-cs@puranmurti.example', dateOfBirth: '2005-04-12', rollNumber: 'CS-1001', course: 'B.Tech', department: 'Computer Science', semester: 'Semester 4', admissionYear: '2023' },
  otherStudent: { role: 'Student', name: 'Civil Student', gender: 'Male', mobile: '9876543215', email: 'student-civil@puranmurti.example', dateOfBirth: '2004-08-09', rollNumber: 'CE-2001', course: 'B.Tech', department: 'Civil Engineering', semester: 'Semester 5', admissionYear: '2022' },
  rejectedStudent: { role: 'Student', name: 'Rejected Student', gender: 'Female', mobile: '9876543216', email: 'rejected@puranmurti.example', dateOfBirth: '2005-07-10', rollNumber: 'CS-1002', course: 'B.Tech', department: 'Computer Science', semester: 'Semester 4', admissionYear: '2023' },
}

let server
let store
let baseUrl
let adminCookie
let hodCookie
let staffCookie
let sportsCookie
let studentCookie
let adminId
let hodRequest
let staffRequest
let staffRequestToken
let rejectedStaffRequest
let rejectedStaffRequestToken
let sportsRequest
let sportsRequestToken
let rejectedSportsRequest
let rejectedSportsRequestToken
let studentRequest
let otherStudentRequest
let hodRequestToken
let studentRequestToken
let otherStudentRequestToken

async function request(path, { cookie, ...options } = {}) {
  const headers = new Headers(options.headers || {})
  if (cookie) headers.set('Cookie', cookie)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, {
    ...options, headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  let result = {}
  try { result = await response.json() } catch { /* Keep failures visible in assertions. */ }
  return { response, result, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] }
}

async function apply(profile) {
  return request('/api/registrations', { method: 'POST', body: profile })
}

function permanentPassword(role) {
  return `Permanent-${role.replaceAll(' ', '')}-Password-2026!`
}

async function createPasswordAndLogin(requestId, requestToken, userId, role, email, mobile) {
  const data = await store.read()
  const storedUser = data.users.find((candidate) => candidate.id === userId)
  assert.ok(storedUser, `${role} has a reserved account record after approval`)
  assert.equal(storedUser.active, false, 'approved accounts cannot sign in before setting a password')
  assert.equal(storedUser.credentials, null, 'approval does not create a password')
  assert.equal(storedUser.email, email, 'the approved account retains its registration email')
  assert.equal(storedUser.mobile, mobile, 'the approved account retains its registration contact number')
  assert.equal(storedUser.mustChangePassword, false)
  assert.equal(JSON.stringify(data).includes('temporaryPassword'), false)

  let result = await request('/api/auth/login', { method: 'POST', body: { userId, role, password: permanentPassword(role) } })
  assert.equal(result.response.status, 401, 'approval alone does not allow sign-in')

  result = await request('/api/registrations/status', {
    method: 'POST',
    body: { requestId, requestToken },
  })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.application.status, 'Approved')
  assert.equal(result.result.application.userId, userId)
  assert.equal(result.result.application.passwordSetupAvailable, true, 'setup remains available after leaving and reopening status')
  result = await request(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { active: true },
  })
  assert.equal(result.response.status, 400, 'Administration cannot bypass the applicant password setup')

  if (role === 'Staff') {
    await store.transact((current) => {
      current.registrationRequests.find((application) => application.id === requestId).setupTokenExpiresAt = new Date(Date.now() - 1000).toISOString()
    })
    result = await request('/api/registrations/password', {
      method: 'POST',
      body: { requestId, requestToken, password: permanentPassword(role), confirmPassword: permanentPassword(role) },
    })
    assert.equal(result.response.status, 410, 'password setup tokens expire')
    await store.transact((current) => {
      current.registrationRequests.find((application) => application.id === requestId).setupTokenExpiresAt = new Date(Date.now() + 60_000).toISOString()
    })
  }

  result = await request('/api/registrations/password', {
    method: 'POST',
    body: { requestId, requestToken, password: '', confirmPassword: '' },
  })
  assert.equal(result.response.status, 400, 'empty passwords are rejected')
  result = await request('/api/registrations/password', {
    method: 'POST',
    body: { requestId, requestToken, password: 'short', confirmPassword: 'short' },
  })
  assert.equal(result.response.status, 400, 'password policy is enforced by the server')
  result = await request('/api/registrations/password', {
    method: 'POST',
    body: { requestId, requestToken, password: permanentPassword(role), confirmPassword: 'not-the-same-password' },
  })
  assert.equal(result.response.status, 400, 'confirmation is checked by the server')
  result = await request('/api/registrations/password', {
    method: 'POST',
    body: { requestId, requestToken, password: permanentPassword(role), confirmPassword: permanentPassword(role) },
  })
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.result, { passwordCreated: true, userId, role })
  assert.equal(JSON.stringify(result.result).includes(permanentPassword(role)), false)

  const afterSetup = await store.read()
  const completedUser = afterSetup.users.find((candidate) => candidate.id === userId)
  const completedRequest = afterSetup.registrationRequests.find((candidate) => candidate.id === requestId)
  assert.equal(completedUser.active, true)
  assert.equal(completedUser.credentials.scheme, 'scrypt-32768')
  assert.equal(Object.hasOwn(completedUser.credentials, 'password'), false)
  assert.equal(JSON.stringify(afterSetup).includes(permanentPassword(role)), false, 'only the secure password hash is persisted')
  assert.equal(completedUser.email, email)
  assert.equal(completedUser.mobile, mobile)
  assert.equal(completedRequest.statusTokenHash, null, 'the one-time setup token is invalidated')
  assert.equal(completedRequest.setupTokenExpiresAt, null)

  result = await request('/api/registrations/password', {
    method: 'POST',
    body: { requestId, requestToken, password: permanentPassword(role), confirmPassword: permanentPassword(role) },
  })
  assert.equal(result.response.status, 404, 'the setup token cannot be reused')
  result = await request('/api/registrations/status', { method: 'POST', body: { requestId, requestToken } })
  assert.equal(result.response.status, 404, 'the consumed setup token is no longer valid')
  result = await request('/api/auth/login', {
    method: 'POST',
    body: { userId, role, password: permanentPassword(role) },
  })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.user.mustChangePassword, false)
  assert.equal(result.result.user.role, role)
  assert.equal(result.result.user.email, email)
  assert.equal(result.result.user.mobile, mobile)
  assert.ok(result.result.modules.includes('overview'), `${role} login receives its normal dashboard modules`)
  const roleDashboardModule = {
    Student: 'food',
    Staff: 'complaints',
    HOD: 'department-requests',
    'Sports Captain': 'sports-management',
  }[role]
  assert.ok(result.result.modules.includes(roleDashboardModule), `${role} login receives its role-specific dashboard module`)
  return result.cookie
}

before(async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'campus-one-approval-tests-'))
  store = createStore(dataDirectory)
  const handler = createCampusApp({ store, sessionSecret: randomBytes(32), adminAccessCode: ADMIN_CODE })
  server = createServer(handler)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
  await store?.clear()
})

test('protected Administration setup and exactly five role-specific login identities', async () => {
  let result = await request('/api/auth/bootstrap-status')
  assert.equal(result.response.status, 200)
  assert.equal(result.result.setupRequired, true)
  assert.equal(result.result.adminAccessConfigured, true)

  result = await request('/api/admin/registration-code/verify', { method: 'POST', body: { accessCode: 'wrong-code' } })
  assert.equal(result.response.status, 403)
  assert.match(result.result.error, /Invalid Administration Access Code/)
  result = await request('/api/admin/registration-code/verify', { method: 'POST', body: { accessCode: ADMIN_CODE } })
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.result, { valid: true })

  result = await apply({ ...PROFILES.Administration, accessCode: 'incorrect-code' })
  assert.equal(result.response.status, 403, 'the wrong code cannot create an administrator')

  result = await apply(PROFILES.Administration)
  assert.equal(result.response.status, 201)
  assert.equal(result.result.user.id, 'PM-AD001')
  assert.equal(result.result.user.role, 'Administration')
  assert.equal(JSON.stringify(result.result).includes(PASSWORD), false)
  assert.equal(JSON.stringify(result.result).includes(ADMIN_CODE), false)
  adminId = result.result.user.id
  adminCookie = result.cookie

  result = await apply(PROFILES.Administration)
  assert.equal(result.response.status, 409, 'a duplicate email or administrator registration cannot duplicate an ID')

  for (const role of ['Student', 'Staff', 'HOD', 'Sports Captain']) {
    const profile = Object.values(PROFILES).find((candidate) => candidate.role === role)
    assert.ok(profile, `${role} keeps its role-specific registration fields`)
    assert.equal(Object.hasOwn(profile, 'password'), false, `${role} does not register with a password`)
  }
  assert.equal(Object.hasOwn(PROFILES.Administration, 'password'), true, 'Administration setup retains its existing password field')

  result = await request('/api/users', { cookie: adminCookie })
  assert.deepEqual(result.result.users.map((user) => user.id), [adminId])
  assert.equal(JSON.stringify(result.result).includes(PASSWORD), false, 'administration listings never expose password material')
})

test('pending registrations, role-specific approvals, and sequential immutable IDs', async () => {
  let result = await apply({ ...PROFILES.student, employeeId: 'must-not-be-accepted' })
  assert.equal(result.response.status, 400, 'student and staff registration never accepts employee IDs')

  result = await apply({ ...PROFILES.student, id: 'PM-S9999' })
  assert.equal(result.response.status, 400, 'applicants cannot choose their user ID')

  result = await apply({ ...PROFILES.student, dateOfBirth: '' })
  assert.equal(result.response.status, 400, 'date of birth is required for students')

  result = await apply({ ...PROFILES.HOD, dateOfBirth: '2000-01-01', password: PASSWORD })
  assert.equal(result.response.status, 201, 'nonstudents are not required to supply a date of birth')
  hodRequest = result.result.application
  hodRequestToken = result.result.requestToken
  assert.equal(hodRequest.status, 'Pending')
  assert.ok(hodRequest.id, 'pending applications receive a separate tracking reference')
  assert.equal(hodRequest.assignedUserId, '', 'pending applicants receive no active user ID')
  assert.equal(result.result.userId, undefined)
  assert.equal(JSON.stringify(result.result).includes(PASSWORD), false)
  assert.equal(Object.hasOwn((await store.read()).registrationRequests.find((application) => application.id === hodRequest.id), 'credentials'), false)
  const storedPendingHod = (await store.read()).registrationRequests.find((application) => application.id === hodRequest.id)
  assert.notEqual(storedPendingHod.statusTokenHash, hodRequestToken, 'only a hash of the private request/setup token is stored')
  assert.equal(hodRequest.fields, undefined)
  assert.equal(hodRequest.email, PROFILES.HOD.email)
  assert.equal(hodRequest.mobile, PROFILES.HOD.mobile)

  result = await apply(PROFILES.Staff)
  assert.equal(result.response.status, 201)
  staffRequest = result.result.application
  staffRequestToken = result.result.requestToken
  result = await apply({ ...PROFILES.Staff, name: 'Rejected Staff Applicant', email: 'rejected-staff@puranmurti.example' })
  assert.equal(result.response.status, 201)
  rejectedStaffRequest = result.result.application
  rejectedStaffRequestToken = result.result.requestToken

  result = await apply(PROFILES['Sports Captain'])
  assert.equal(result.response.status, 201)
  sportsRequest = result.result.application
  sportsRequestToken = result.result.requestToken
  result = await apply({ ...PROFILES['Sports Captain'], name: 'Rejected Captain Applicant', email: 'rejected-captain@puranmurti.example' })
  assert.equal(result.response.status, 201)
  rejectedSportsRequest = result.result.application
  rejectedSportsRequestToken = result.result.requestToken

  result = await apply(PROFILES.student)
  assert.equal(result.response.status, 201)
  studentRequest = result.result.application
  studentRequestToken = result.result.requestToken

  result = await apply(PROFILES.otherStudent)
  assert.equal(result.response.status, 201)
  otherStudentRequest = result.result.application
  otherStudentRequestToken = result.result.requestToken

  result = await apply({ ...PROFILES.student, email: 'student-duplicate@puranmurti.example' })
  assert.equal(result.response.status, 409, 'a repeated roll number cannot register twice')

  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-HOD001', role: 'HOD', password: PASSWORD } })
  assert.equal(result.response.status, 401, 'a pending HOD cannot sign in before administration approval')
  result = await request('/api/auth/login', { method: 'POST', body: { userId: adminId, role: 'HOD', password: PASSWORD } })
  assert.equal(result.response.status, 401, 'selecting another role never bypasses credential roles')

  result = await request('/api/admin/requests', { cookie: adminCookie })
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.result.requests.filter((entry) => entry.status === 'Pending').map((entry) => entry.role).sort(), ['HOD', 'Sports Captain', 'Sports Captain', 'Staff', 'Staff'])
  assert.equal(result.result.requests.some((entry) => entry.id === studentRequest.id), false, 'Administration cannot approve department student requests')
  result = await request('/api/notifications', { cookie: adminCookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.unreadCount, 5)
  assert.deepEqual(result.result.notifications.map((item) => item.title).sort(), ['New HOD Access Request', 'New Sports Captain Access Request', 'New Sports Captain Access Request', 'New Staff Access Request', 'New Staff Access Request'])
  result = await request('/api/notifications/read-all', { method: 'POST', cookie: adminCookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.markedRead, 5)

  result = await request(`/api/admin/requests/${encodeURIComponent(hodRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Rejected' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.request.status, 'Rejected')
  assert.equal(result.result.userId, null)
  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-HOD001', role: 'HOD', password: PASSWORD } })
  assert.equal(result.response.status, 401, 'rejected HOD requests do not activate an account')

  result = await request(`/api/admin/requests/${encodeURIComponent(staffRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.userId, 'PM-ST001')
  assert.equal(result.result.request.status, 'Approved')
  assert.equal(result.result.request.passwordSetupAvailable, true)
  assert.equal(Object.hasOwn(result.result, 'temporaryPassword'), false)
  const wrongOwnerSetup = await request('/api/registrations/password', {
    method: 'POST',
    body: { requestId: staffRequest.id, requestToken: sportsRequestToken, password: permanentPassword('Staff'), confirmPassword: permanentPassword('Staff') },
  })
  assert.equal(wrongOwnerSetup.response.status, 404, 'a different applicant cannot set this account password')
  staffCookie = await createPasswordAndLogin(staffRequest.id, staffRequestToken, 'PM-ST001', 'Staff', PROFILES.Staff.email, PROFILES.Staff.mobile)
  result = await request(`/api/admin/requests/${encodeURIComponent(sportsRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.userId, 'PM-SC001')
  sportsCookie = await createPasswordAndLogin(sportsRequest.id, sportsRequestToken, 'PM-SC001', 'Sports Captain', PROFILES['Sports Captain'].email, PROFILES['Sports Captain'].mobile)
  result = await request(`/api/admin/requests/${encodeURIComponent(rejectedStaffRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Rejected' } })
  assert.equal(result.response.status, 200)
  result = await request('/api/registrations/status', { method: 'POST', body: { requestId: rejectedStaffRequest.id, requestToken: rejectedStaffRequestToken } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications[0].title, 'Staff access rejected')
  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-ST002', role: 'Staff', password: PASSWORD } })
  assert.equal(result.response.status, 401, 'rejected staff requests do not create active accounts')
  result = await request(`/api/admin/requests/${encodeURIComponent(rejectedSportsRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Rejected' } })
  assert.equal(result.response.status, 200)
  result = await request('/api/registrations/status', { method: 'POST', body: { requestId: rejectedSportsRequest.id, requestToken: rejectedSportsRequestToken } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications[0].title, 'Sports Captain access rejected')
  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-SC002', role: 'Sports Captain', password: PASSWORD } })
  assert.equal(result.response.status, 401, 'rejected Sports Captain requests do not create active accounts')

  result = await request('/api/admin/requests', { cookie: adminCookie })
  assert.equal(result.result.requests.find((entry) => entry.id === staffRequest.id).status, 'Approved')
  result = await request(`/api/admin/requests/${encodeURIComponent(staffRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Rejected' } })
  assert.equal(result.response.status, 409, 'an approved account cannot be reviewed twice')

  result = await request('/api/auth/login', { method: 'POST', body: { userId: adminId, role: 'Administration', password: PASSWORD } })
  assert.equal(result.response.status, 200)
  adminCookie = result.cookie
  result = await request('/api/users', { method: 'POST', cookie: adminCookie, body: { role: 'HOD', name: 'Manual HOD', temporaryPassword: PASSWORD } })
  assert.equal(result.response.status, 404, 'Administration cannot create user accounts or passwords directly')
  result = await request(`/api/users/${encodeURIComponent('PM-ST001')}/reset-password`, { method: 'POST', cookie: adminCookie, body: { temporaryPassword: PASSWORD } })
  assert.equal(result.response.status, 410, 'administrators cannot set another user password')
})

test('only an HOD in the selected department can review its student registrations', async () => {
  let result = await request('/api/auth/login', { method: 'POST', body: { userId: adminId, role: 'Administration', password: PASSWORD } })
  adminCookie = result.cookie
  result = await request(`/api/admin/requests/${encodeURIComponent(hodRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 409, 'rejected HOD requests cannot be accepted later')
  result = await request('/api/registrations/status', { method: 'POST', body: { requestId: hodRequest.id, requestToken: hodRequestToken } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications[0].title, 'HOD access rejected', 'applicants receive status notifications without signing in')

  result = await request('/api/hod/requests', { cookie: adminCookie })
  assert.equal(result.response.status, 403, 'Administration cannot enter a HOD department review route')

  const approvedHodRequest = await apply({ ...PROFILES.HOD, name: 'Approved CS HOD', email: 'approved-hod@puranmurti.example' })
  assert.equal(approvedHodRequest.response.status, 201)
  result = await request(`/api/admin/requests/${encodeURIComponent(approvedHodRequest.result.application.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.userId, 'PM-HOD001')
  result = await request('/api/registrations/status', { method: 'POST', body: { requestId: approvedHodRequest.result.application.id, requestToken: approvedHodRequest.result.requestToken } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications[0].title, 'HOD access approved')
  hodCookie = await createPasswordAndLogin(approvedHodRequest.result.application.id, approvedHodRequest.result.requestToken, 'PM-HOD001', 'HOD', 'approved-hod@puranmurti.example', PROFILES.HOD.mobile)
  result = await request('/api/notifications', { cookie: hodCookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications.some((notification) => notification.title === 'New Student Registration Request' && notification.referenceId === studentRequest.id), true, 'newly approved HOD receives queued requests for their department')

  result = await request('/api/hod/requests', { cookie: hodCookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.department, 'Computer Science')
  assert.deepEqual(result.result.requests.map((application) => application.id), [studentRequest.id])
  assert.equal(result.result.requests[0].rollNumber, 'CS-1001')
  assert.equal(result.result.requests[0].dateOfBirth, '2005-04-12')

  result = await request(`/api/hod/requests/${encodeURIComponent(studentRequest.id)}`, { cookie: hodCookie })
  assert.equal(result.response.status, 200, 'the HOD can open the complete request from its notification')
  assert.equal(result.result.request.email, PROFILES.student.email)
  assert.equal(result.result.request.dateOfBirth, PROFILES.student.dateOfBirth)
  result = await request(`/api/hod/requests/${encodeURIComponent(otherStudentRequest.id)}`, { cookie: hodCookie })
  assert.equal(result.response.status, 404, 'request details are limited to the HOD own department')

  result = await request('/api/hod/requests', { cookie: staffCookie })
  assert.equal(result.response.status, 403, 'staff cannot approve student registrations')
  result = await request('/api/hod/requests', { cookie: sportsCookie })
  assert.equal(result.response.status, 403, 'Sports Captain cannot approve student registrations')
  result = await request(`/api/admin/requests/${encodeURIComponent(rejectedStaffRequest.id)}`, { method: 'PATCH', cookie: staffCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 403, 'Staff cannot approve Administration requests')

  result = await request(`/api/hod/requests/${encodeURIComponent(otherStudentRequest.id)}`, { method: 'PATCH', cookie: hodCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 404, 'HOD cannot approve a student from a different department')
  result = await request(`/api/hod/requests/${encodeURIComponent(studentRequest.id)}`, { method: 'PATCH', cookie: hodCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.userId, 'PM-S1001')
  assert.equal(result.result.application.status, 'Approved')
  assert.equal(result.result.application.passwordSetupAvailable, true)
  result = await request('/api/registrations/status', { method: 'POST', body: { requestId: studentRequest.id, requestToken: studentRequestToken } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications[0].title, 'Student registration approved')
  studentCookie = await createPasswordAndLogin(studentRequest.id, studentRequestToken, 'PM-S1001', 'Student', PROFILES.student.email, PROFILES.student.mobile)

  result = await request('/api/hod/students', { cookie: hodCookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.department, 'Computer Science')
  assert.deepEqual(result.result.students.map((student) => student.id), ['PM-S1001'])

  result = await request('/api/notifications', { cookie: studentCookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.unreadCount, 1)
  assert.equal(result.result.notifications[0].title, 'Student registration approved')
  result = await request(`/api/notifications/${encodeURIComponent(result.result.notifications[0].id)}`, { method: 'PATCH', cookie: studentCookie })
  assert.equal(result.response.status, 200)
  assert.ok(result.result.notification.readAt)
  result = await request('/api/users', { cookie: hodCookie })
  assert.equal(result.response.status, 403, 'HOD cannot access the complete Administration user directory')

  result = await request(`/api/hod/requests/${encodeURIComponent(studentRequest.id)}`, { method: 'PATCH', cookie: hodCookie, body: { status: 'Rejected' } })
  assert.equal(result.response.status, 409, 'a student request cannot be approved or rejected a second time')

  result = await request(`/api/hod/requests/${encodeURIComponent(otherStudentRequest.id)}`, { method: 'PATCH', cookie: hodCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 404)
  result = await request('/api/hod/students', { cookie: adminCookie })
  assert.equal(result.response.status, 403)
})

test('rejected registrations cannot log in and permanent role IDs are never reused', async () => {
  const rejected = await apply(PROFILES.rejectedStudent)
  assert.equal(rejected.response.status, 201)
  let result = await request(`/api/hod/requests/${encodeURIComponent(rejected.result.application.id)}`, { method: 'PATCH', cookie: hodCookie, body: { status: 'Rejected' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.userId, null)
  result = await request('/api/registrations/status', { method: 'POST', body: { requestId: rejected.result.application.id, requestToken: rejected.result.requestToken } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications[0].title, 'Student registration rejected')
  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-S1002', role: 'Student', password: PASSWORD } })
  assert.equal(result.response.status, 401, 'rejected student applications do not create active accounts')

  result = await request(`/api/users/${encodeURIComponent('PM-S1001')}`, { method: 'PATCH', cookie: adminCookie, body: { active: false } })
  assert.equal(result.response.status, 200)
  let data = await store.read()
  assert.equal(data.users.find((user) => user.id === 'PM-S1001').active, false)
  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-S1001', role: 'Student', password: 'Permanent-Student-Password-2026!' } })
  assert.equal(result.response.status, 401, 'deactivated students cannot sign in')
  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-ST001', role: 'Staff', password: 'Permanent-Staff-Password-2026!' } })
  assert.equal(result.response.status, 200, 'deactivating a student does not affect an unrelated staff account')
  result = await request(`/api/users/${encodeURIComponent('PM-S1001')}`, { method: 'PATCH', cookie: adminCookie, body: { active: true } })
  assert.equal(result.response.status, 200)
  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-S1001', role: 'Student', password: 'Permanent-Student-Password-2026!' } })
  assert.equal(result.response.status, 200, 'Administration can reactivate a preserved account')
  studentCookie = result.cookie

  const nextStudent = await apply({ ...PROFILES.student, rollNumber: 'CS-1003', email: 'next-student@puranmurti.example' })
  assert.equal(nextStudent.response.status, 201)
  result = await request(`/api/hod/requests/${encodeURIComponent(nextStudent.result.application.id)}`, { method: 'PATCH', cookie: hodCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.userId, 'PM-S1002', 'IDs advance sequentially and are not reused after deactivation')

  const nextStudentCookie = await createPasswordAndLogin(nextStudent.result.application.id, nextStudent.result.requestToken, 'PM-S1002', 'Student', 'next-student@puranmurti.example', PROFILES.student.mobile)
  result = await request('/api/users', { cookie: adminCookie })
  assert.equal(result.response.status, 200)
  const ids = result.result.users.map((user) => user.id)
  assert.equal(new Set(ids).size, ids.length, 'all active and deactivated accounts have unique User IDs')
  assert.deepEqual(ids.filter((id) => id === adminId), [adminId])

  const activeStudentCookie = nextStudentCookie
  result = await request(`/api/users/${encodeURIComponent('PM-S1002')}`, { method: 'PATCH', cookie: hodCookie, body: { active: false } })
  assert.equal(result.response.status, 403, 'HODs cannot deactivate accounts through the API')
  result = await request(`/api/users/${encodeURIComponent('PM-S1002')}`, { method: 'DELETE', cookie: hodCookie })
  assert.equal(result.response.status, 403, 'HODs cannot permanently delete accounts through the API')
  for (const [role, cookie] of [['Student', studentCookie], ['Staff', staffCookie], ['Sports Captain', sportsCookie]]) {
    const deniedDelete = await request(`/api/users/${encodeURIComponent('PM-S1002')}`, { method: 'DELETE', cookie })
    assert.equal(deniedDelete.response.status, 403, `${role} cannot permanently delete accounts through the API`)
    const deniedDeactivate = await request(`/api/users/${encodeURIComponent('PM-S1002')}`, { method: 'PATCH', cookie, body: { active: false } })
    assert.equal(deniedDeactivate.response.status, 403, `${role} cannot deactivate accounts through the API`)
  }
  result = await request('/api/food/orders', { method: 'POST', cookie: activeStudentCookie, body: { meal: 'Lunch', item: 'Paneer tikka wrap', price: 0, status: 'Ready' } })
  assert.equal(result.response.status, 201)
  const foodOrderId = result.result.order.id
  assert.equal(result.result.order.status, 'Placed', 'the server controls initial order status')
  assert.equal(Object.hasOwn(result.result.order, 'price'), false, 'clients cannot set menu prices')
  result = await request('/api/food/orders', { cookie: activeStudentCookie })
  assert.deepEqual(result.result.orders.map((order) => order.id), [foodOrderId])
  result = await request('/api/food/orders', { method: 'POST', cookie: hodCookie, body: { meal: 'Lunch', item: 'Paneer tikka wrap' } })
  assert.equal(result.response.status, 403, 'HOD and other nonstudent roles cannot create student canteen orders')
  result = await request(`/api/food/orders/${encodeURIComponent(foodOrderId)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Ready' } })
  assert.equal(result.response.status, 200)
  result = await request('/api/food/orders', { cookie: activeStudentCookie })
  assert.equal(result.result.orders[0].status, 'Ready', 'students can track Administration-updated order status')
  result = await request(`/api/campus/food/${encodeURIComponent('food-mess')}`, { method: 'PATCH', cookie: adminCookie, body: { title: 'North student mess', description: 'Manual crowd estimate · service closes at 2:30 pm', crowdLevel: 'Busy', occupancyPercent: 82, estimatedWaitMinutes: 16 } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.record.crowdLevel, 'Busy')
  result = await request('/api/campus/food', { cookie: activeStudentCookie })
  assert.equal(result.result.records.find((record) => record.id === 'food-mess').estimatedWaitMinutes, 16, 'students see current manually supplied mess estimates')

  result = await request(`/api/users/${encodeURIComponent('PM-S1002')}`, { method: 'DELETE', cookie: adminCookie })
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.result, { deleted: true, userId: 'PM-S1002' })
  data = await store.read()
  assert.equal(data.users.some((user) => user.id === 'PM-S1002'), false)
  assert.equal(data.issuedUserIds.includes('PM-S1002'), true, 'deleted official IDs remain permanently reserved')
  assert.equal(data.foodOrders.some((order) => order.id === foodOrderId && order.userId === 'PM-S1002'), true, 'deleting an account does not remove historical orders')
  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-S1002', role: 'Student', password: 'Permanent-Student-Password-2026!' } })
  assert.equal(result.response.status, 401, 'a permanently deleted account cannot log in')
  result = await request('/api/auth/me', { cookie: activeStudentCookie })
  assert.equal(result.response.status, 401, 'deletion immediately invalidates existing sessions')

  const afterDelete = await apply({ ...PROFILES.student, rollNumber: 'CS-1004', email: 'after-delete@puranmurti.example' })
  assert.equal(afterDelete.response.status, 201)
  result = await request(`/api/hod/requests/${encodeURIComponent(afterDelete.result.application.id)}`, { method: 'PATCH', cookie: hodCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.userId, 'PM-S1003', 'new accounts receive a new ID after permanent deletion')
  await createPasswordAndLogin(afterDelete.result.application.id, afterDelete.result.requestToken, 'PM-S1003', 'Student', 'after-delete@puranmurti.example', PROFILES.student.mobile)

  result = await request('/api/users', { cookie: adminCookie })
  assert.equal(result.response.status, 200)
  const unauthorizedDelete = await request('/api/users/PM-ST001', { method: 'DELETE', cookie: studentCookie })
  assert.equal(unauthorizedDelete.response.status, 403, 'non-Administration users cannot delete accounts')
  assert.equal((await store.read()).users.some((candidate) => candidate.id === 'PM-ST001'), true, 'an unauthorized delete leaves the account persisted')
  const targets = [
    { id: 'PM-ST001', role: 'Staff', password: 'Permanent-Staff-Password-2026!' },
    { id: 'PM-SC001', role: 'Sports Captain', password: 'Permanent-SportsCaptain-Password-2026!' },
    { id: 'PM-HOD001', role: 'HOD', password: 'Permanent-HOD-Password-2026!' },
    { id: 'PM-S1003', role: 'Student', password: 'Permanent-Student-Password-2026!' },
  ]
  for (const target of targets) {
    assert.ok(result.result.users.some((candidate) => candidate.id === target.id && candidate.active), `${target.role} is present in the refreshed account list`)
    const unrelatedBefore = result.result.users.filter((candidate) => candidate.id !== target.id).map((candidate) => [candidate.id, candidate.active])
    let access = await request(`/api/users/${encodeURIComponent(target.id)}`, {
      method: 'PATCH', cookie: adminCookie, body: { active: false },
    })
    assert.equal(access.response.status, 200, `${target.role} can be deactivated`)
    assert.equal(access.result.user.id, target.id)
    assert.equal(access.result.user.active, false)
    let login = await request('/api/auth/login', { method: 'POST', body: { userId: target.id, role: target.role, password: target.password } })
    assert.equal(login.response.status, 401, `${target.role} cannot log in while deactivated`)
    result = await request('/api/users', { cookie: adminCookie })
    assert.equal(result.result.users.find((candidate) => candidate.id === target.id).active, false, 'a refreshed list shows the inactive state')
    assert.deepEqual(result.result.users.filter((candidate) => candidate.id !== target.id).map((candidate) => [candidate.id, candidate.active]), unrelatedBefore)

    access = await request(`/api/users/${encodeURIComponent(target.id)}`, {
      method: 'PATCH', cookie: adminCookie, body: { active: true },
    })
    assert.equal(access.response.status, 200, `${target.role} can be reactivated`)
    assert.equal(access.result.user.active, true)
    login = await request('/api/auth/login', { method: 'POST', body: { userId: target.id, role: target.role, password: target.password } })
    assert.equal(login.response.status, 200, `${target.role} can log in after reactivation`)

    const deleted = await request(`/api/users/${encodeURIComponent(target.id)}`, { method: 'DELETE', cookie: adminCookie })
    assert.equal(deleted.response.status, 200)
    assert.deepEqual(deleted.result, { deleted: true, userId: target.id })
    login = await request('/api/auth/login', { method: 'POST', body: { userId: target.id, role: target.role, password: target.password } })
    assert.equal(login.response.status, 401, `${target.role} cannot log in after deletion`)
    result = await request('/api/users', { cookie: adminCookie })
    assert.equal(result.response.status, 200)
    assert.equal(result.result.users.some((candidate) => candidate.id === target.id), false)
    assert.deepEqual(result.result.users.filter((candidate) => candidate.id !== target.id).map((candidate) => [candidate.id, candidate.active]), unrelatedBefore)
    assert.equal((await store.read()).issuedUserIds.includes(target.id), true)
  }
  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-S1001', role: 'Student', password: 'Permanent-Student-Password-2026!' } })
  assert.equal(result.response.status, 200, 'deleting other role accounts does not affect an unrelated student')

  result = await request('/api/auth/logout', { method: 'POST', cookie: adminCookie })
  assert.equal(result.response.status, 200)
  assert.match(result.response.headers.get('set-cookie'), /Max-Age=0/)
  result = await request('/api/auth/me', { cookie: adminCookie })
  assert.equal(result.response.status, 401, 'logout revokes the server-side session even if its old cookie is replayed')
})