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
  HOD: { role: 'HOD', name: 'Computer Science HOD', gender: 'Female', mobile: '9876543211', email: 'hod-cs@puranmurti.example', department: 'Computer Science', designation: 'Head of Department', joiningYear: '2017', password: PASSWORD },
  Staff: { role: 'Staff', name: 'Computer Science Staff', gender: 'Male', mobile: '9876543212', email: 'staff-cs@puranmurti.example', department: 'Computer Science', designation: 'Department Instructor', joiningYear: '2020', password: PASSWORD },
  'Sports Captain': { role: 'Sports Captain', name: 'Campus Captain', gender: 'Non-binary', mobile: '9876543213', email: 'captain@puranmurti.example', department: 'Computer Science', sport: 'Football', teamCategory: 'Intercollegiate', password: PASSWORD },
  student: { role: 'Student', name: 'CS Student', gender: 'Female', mobile: '9876543214', email: 'student-cs@puranmurti.example', dateOfBirth: '2005-04-12', rollNumber: 'CS-1001', course: 'B.Tech', department: 'Computer Science', semester: 'Semester 4', admissionYear: '2023', password: PASSWORD },
  otherStudent: { role: 'Student', name: 'Civil Student', gender: 'Male', mobile: '9876543215', email: 'student-civil@puranmurti.example', dateOfBirth: '2004-08-09', rollNumber: 'CE-2001', course: 'B.Tech', department: 'Civil Engineering', semester: 'Semester 5', admissionYear: '2022', password: PASSWORD },
  rejectedStudent: { role: 'Student', name: 'Rejected Student', gender: 'Female', mobile: '9876543216', email: 'rejected@puranmurti.example', dateOfBirth: '2005-07-10', rollNumber: 'CS-1002', course: 'B.Tech', department: 'Computer Science', semester: 'Semester 4', admissionYear: '2023', password: PASSWORD },
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
let rejectedStaffRequest
let rejectedStaffRequestToken
let sportsRequest
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

  for (const role of ['Student', 'Staff', 'HOD', 'Sports Captain', 'Administration']) {
    const profile = Object.values(PROFILES).find((candidate) => candidate.role === role)
    assert.ok(profile, `${role} has a self-authored password registration flow`)
  }

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

  result = await apply({ ...PROFILES.HOD, dateOfBirth: '2000-01-01' })
  assert.equal(result.response.status, 201, 'nonstudents are not required to supply a date of birth')
  hodRequest = result.result.application
  hodRequestToken = result.result.requestToken
  assert.equal(hodRequest.status, 'Pending')
  assert.ok(hodRequest.id, 'pending applications receive a separate tracking reference')
  assert.equal(hodRequest.assignedUserId, '', 'pending applicants receive no active user ID')
  assert.equal(result.result.userId, undefined)
  assert.equal(JSON.stringify(result.result).includes(PASSWORD), false)

  result = await apply(PROFILES.Staff)
  assert.equal(result.response.status, 201)
  staffRequest = result.result.application
  result = await apply({ ...PROFILES.Staff, name: 'Rejected Staff Applicant', email: 'rejected-staff@puranmurti.example' })
  assert.equal(result.response.status, 201)
  rejectedStaffRequest = result.result.application
  rejectedStaffRequestToken = result.result.requestToken

  result = await apply(PROFILES['Sports Captain'])
  assert.equal(result.response.status, 201)
  sportsRequest = result.result.application
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

  result = await request(`/api/admin/requests/${encodeURIComponent(staffRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.userId, 'PM-ST001')
  result = await request(`/api/admin/requests/${encodeURIComponent(sportsRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.userId, 'PM-SC001')
  result = await request(`/api/admin/requests/${encodeURIComponent(rejectedStaffRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Rejected' } })
  assert.equal(result.response.status, 200)
  result = await request('/api/registrations/status', { method: 'POST', body: { requestId: rejectedStaffRequest.id, requestToken: rejectedStaffRequestToken } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications[0].title, 'Staff access rejected')
  result = await request(`/api/admin/requests/${encodeURIComponent(rejectedSportsRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Rejected' } })
  assert.equal(result.response.status, 200)
  result = await request('/api/registrations/status', { method: 'POST', body: { requestId: rejectedSportsRequest.id, requestToken: rejectedSportsRequestToken } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications[0].title, 'Sports Captain access rejected')

  result = await request('/api/admin/requests', { cookie: adminCookie })
  assert.equal(result.result.requests.find((entry) => entry.id === staffRequest.id).status, 'Accepted')
  result = await request(`/api/admin/requests/${encodeURIComponent(staffRequest.id)}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Rejected' } })
  assert.equal(result.response.status, 409, 'an approved account cannot be reviewed twice')

  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-ST001', role: 'Staff', password: PASSWORD } })
  assert.equal(result.response.status, 200, 'staff sign in using their own registration password after approval')
  staffCookie = result.cookie
  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-SC001', role: 'Sports Captain', password: PASSWORD } })
  assert.equal(result.response.status, 200, 'Sports Captain uses their own registration password after approval')
  sportsCookie = result.cookie

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

  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-HOD001', role: 'HOD', password: PASSWORD } })
  assert.equal(result.response.status, 200)
  hodCookie = result.cookie
  result = await request('/api/registrations/status', { method: 'POST', body: { requestId: approvedHodRequest.result.application.id, requestToken: approvedHodRequest.result.requestToken } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications[0].title, 'HOD access approved')
  result = await request('/api/notifications', { cookie: hodCookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications.some((notification) => notification.title === 'New Student Registration Request' && notification.referenceId === studentRequest.id), true, 'newly approved HOD receives queued requests for their department')

  result = await request('/api/hod/requests', { cookie: hodCookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.department, 'Computer Science')
  assert.deepEqual(result.result.requests.map((application) => application.id), [studentRequest.id])
  assert.equal(result.result.requests[0].rollNumber, 'CS-1001')
  assert.equal(result.result.requests[0].dateOfBirth, '2005-04-12')

  result = await request('/api/hod/requests', { cookie: staffCookie })
  assert.equal(result.response.status, 403, 'staff cannot approve student registrations')
  result = await request('/api/hod/requests', { cookie: sportsCookie })
  assert.equal(result.response.status, 403, 'Sports Captain cannot approve student registrations')

  result = await request(`/api/hod/requests/${encodeURIComponent(otherStudentRequest.id)}`, { method: 'PATCH', cookie: hodCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 404, 'HOD cannot approve a student from a different department')
  result = await request(`/api/hod/requests/${encodeURIComponent(studentRequest.id)}`, { method: 'PATCH', cookie: hodCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.userId, 'PM-S1001')

  result = await request('/api/hod/students', { cookie: hodCookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.department, 'Computer Science')
  assert.deepEqual(result.result.students.map((student) => student.id), ['PM-S1001'])

  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-S1001', role: 'Student', password: PASSWORD } })
  assert.equal(result.response.status, 200, 'the student activates with the password they set on their application')
  studentCookie = result.cookie
  result = await request('/api/registrations/status', { method: 'POST', body: { requestId: studentRequest.id, requestToken: studentRequestToken } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notifications[0].title, 'Student registration approved')
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
  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-S1001', role: 'Student', password: PASSWORD } })
  assert.equal(result.response.status, 401, 'deactivated students cannot sign in')

  const nextStudent = await apply({ ...PROFILES.student, rollNumber: 'CS-1003', email: 'next-student@puranmurti.example' })
  assert.equal(nextStudent.response.status, 201)
  result = await request(`/api/hod/requests/${encodeURIComponent(nextStudent.result.application.id)}`, { method: 'PATCH', cookie: hodCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.userId, 'PM-S1002', 'IDs advance sequentially and are not reused after deactivation')

  result = await request('/api/users', { cookie: adminCookie })
  assert.equal(result.response.status, 200)
  const ids = result.result.users.map((user) => user.id)
  assert.equal(new Set(ids).size, ids.length, 'all active and deactivated accounts have unique User IDs')
  assert.deepEqual(ids.filter((id) => id === adminId), [adminId])

  result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-S1002', role: 'Student', password: PASSWORD } })
  assert.equal(result.response.status, 200)
  const activeStudentCookie = result.cookie
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

  result = await request('/api/auth/logout', { method: 'POST', cookie: adminCookie })
  assert.equal(result.response.status, 200)
  assert.match(result.response.headers.get('set-cookie'), /Max-Age=0/)
  result = await request('/api/auth/me', { cookie: adminCookie })
  assert.equal(result.response.status, 401, 'logout revokes the server-side session even if its old cookie is replayed')
})