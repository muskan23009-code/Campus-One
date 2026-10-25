import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createCampusApp } from '../server/app.js'
import { hashPassword } from '../server/auth.js'
import { createStore } from '../server/store.js'

const PASSWORD = 'Teacher-Review-Test-Password-2026!'
const ADMIN_ACCESS_CODE = 'REVIEW-ADMIN-CODE'
const students = [
  { id: 'PM-S1001', name: 'Alex Student', email: 'alex.student@example.test', rollNumber: 'ROLL-A1', username: 'student-alex' },
  { id: 'PM-S1002', name: 'Blair Student', email: 'blair.student@example.test', rollNumber: 'ROLL-B2', username: 'student-blair' },
  { id: 'PM-S1003', name: 'Casey Student', email: 'casey.student@example.test', rollNumber: 'ROLL-C3', username: 'student-casey' },
]
const fixtures = [
  { id: 'PM-AD001', role: 'Administration', name: 'Campus Admin', department: '' },
  ...students.map((student) => ({ ...student, role: 'Student', department: 'Computer Science' })),
  { id: 'PM-ST001', role: 'Staff', name: 'Riley Faculty', department: 'Computer Science' },
  { id: 'PM-HOD001', role: 'HOD', name: 'Jordan HOD', department: 'Computer Science' },
  { id: 'PM-ST099', role: 'Staff', name: 'Inactive Faculty', department: 'Computer Science', active: false },
  { id: 'PM-SC001', role: 'Sports Captain', name: 'Sports Captain', department: '' },
]

let server
let store
let baseUrl
const cookies = new Map()

async function request(path, { cookie, ...options } = {}) {
  const headers = new Headers(options.headers || {})
  if (cookie) headers.set('Cookie', cookie)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, {
    ...options, headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null
  return { response, result }
}

function cookie(id) { return cookies.get(id) }

function assertNoStudentIdentity(result) {
  const serialized = JSON.stringify(result)
  for (const student of students) {
    for (const identifier of [student.id, student.name, student.email, student.rollNumber, student.username]) {
      assert.equal(serialized.includes(identifier), false, `review response must not contain ${identifier}`)
    }
  }
  assert.equal(/"(?:reviewerId|studentId|studentName|rollNumber|email|username)"\s*:/.test(serialized), false)
}

before(async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'campus-one-teacher-reviews-'))
  store = createStore(dataDirectory)
  const users = await Promise.all(fixtures.map(async ({ active = true, ...fixture }) => ({
    ...fixture, active, modules: [], credentials: await hashPassword(PASSWORD), sessionVersion: 1,
    mustChangePassword: false,
  })))
  await store.write({ users, teacherReviews: [], notifications: [], registrationRequests: [], issuedUserIds: [], idCounters: {} })
  server = createServer(createCampusApp({ store, sessionSecret: randomBytes(32), adminAccessCode: ADMIN_ACCESS_CODE }))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
  for (const { id, role } of fixtures) {
    if (id === 'PM-ST099') continue
    const loggedIn = await request('/api/auth/login', { method: 'POST', body: { userId: id, role, password: PASSWORD } })
    assert.equal(loggedIn.response.status, 200)
    cookies.set(id, loggedIn.response.headers.get('set-cookie').split(';', 1)[0])
  }
})

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
  await store?.clear()
})

test('active Staff and HOD accounts populate the faculty list without student data', async () => {
  const result = await request('/api/teacher-reviews/faculty', { cookie: cookie('PM-S1001') })
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.result.faculty.map(({ id, role }) => [id, role]), [
    ['PM-ST001', 'Staff'], ['PM-HOD001', 'HOD'],
  ])
  assertNoStudentIdentity(result.result)
  const captainStudentView = await request('/api/teacher-reviews/faculty', { cookie: cookie('PM-SC001') })
  assert.equal(captainStudentView.response.status, 200)
  assertNoStudentIdentity(captainStudentView.result)
})

test('newly approved Staff and HOD accounts appear automatically when activated', async () => {
  for (const role of ['Staff', 'HOD']) {
    const registration = await request('/api/registrations', {
      method: 'POST',
      body: {
        role, name: `New ${role}`, email: `new.${role.toLowerCase()}@example.test`,
        gender: 'Prefer not to say', mobile: '9876543210', department: 'Computer Science',
        designation: 'Faculty Member', joiningYear: 2020,
      },
    })
    assert.equal(registration.response.status, 201)
    const approval = await request(`/api/admin/requests/${encodeURIComponent(registration.result.application.id)}`, {
      method: 'PATCH', cookie: cookie('PM-AD001'), body: { status: 'Accepted' },
    })
    assert.equal(approval.response.status, 200)
    const setup = await request('/api/registrations/password', {
      method: 'POST',
      body: {
        requestId: registration.result.application.id,
        requestToken: registration.result.requestToken,
        password: 'New-Account-Password-2026!',
        confirmPassword: 'New-Account-Password-2026!',
      },
    })
    assert.equal(setup.response.status, 200)
  }
  const list = await request('/api/teacher-reviews/faculty', { cookie: cookie('PM-S1001') })
  assert.equal(list.response.status, 200)
  assert.deepEqual(list.result.faculty.filter((member) => member.name.startsWith('New ')).map((member) => member.role).sort(), ['HOD', 'Staff'])
  assertNoStudentIdentity(list.result)
})

test('monthly reviews upsert per student and all review APIs omit student identity', async () => {
  const feedback = 'Alex Student PM-S1001 alex.student@example.test ROLL-A1 student-alex; Blair Student PM-S1002 blair.student@example.test ROLL-B2 student-blair explains clearly.'
  const first = await request('/api/teacher-reviews', {
    method: 'POST', cookie: cookie('PM-S1001'),
    body: { facultyId: 'PM-ST001', rating: 5, feedback, reviewerId: 'PM-S1003', studentName: 'forged name' },
  })
  assert.equal(first.response.status, 201)
  assert.equal(first.result.updated, false)
  assertNoStudentIdentity(first.result)
  assert.equal(first.result.review.feedback.includes('[redacted]'), true)

  const updated = await request('/api/teacher-reviews', {
    method: 'POST', cookie: cookie('PM-S1001'),
    body: { facultyId: 'PM-ST001', rating: 4, feedback: 'Updated practical feedback.' },
  })
  assert.equal(updated.response.status, 200)
  assert.equal(updated.result.updated, true)
  assert.equal(updated.result.review.id, first.result.review.id)
  assert.equal((await store.read()).teacherReviews.filter((review) => review.reviewerId === 'PM-S1001' && review.facultyId === 'PM-ST001').length, 1)
  assertNoStudentIdentity(updated.result)

  for (const studentId of ['PM-S1002', 'PM-S1003']) {
    const submitted = await request('/api/teacher-reviews', {
      method: 'POST', cookie: cookie(studentId),
      body: { facultyId: 'PM-ST001', rating: 5, feedback: 'Helpful during practical sessions.' },
    })
    assert.equal(submitted.response.status, 201)
    assertNoStudentIdentity(submitted.result)
  }

  const captainReview = await request('/api/teacher-reviews', {
    method: 'POST', cookie: cookie('PM-SC001'),
    body: { facultyId: 'PM-ST001', rating: 4, feedback: 'Useful practical guidance.' },
  })
  assert.equal(captainReview.response.status, 201)
  assertNoStudentIdentity(captainReview.result)
  const captainMine = await request('/api/teacher-reviews/mine', { cookie: cookie('PM-SC001') })
  assert.equal(captainMine.response.status, 200)
  assert.equal(captainMine.result.reviews.length, 1)
  assertNoStudentIdentity(captainMine.result)

  const mine = await request('/api/teacher-reviews/mine', { cookie: cookie('PM-S1001') })
  assert.equal(mine.result.reviews.length, 1)
  assert.equal(mine.result.reviews[0].facultyName, 'Riley Faculty')
  assert.equal(mine.result.reviews[0].rating, 4)
  assertNoStudentIdentity(mine.result)

  const summary = await request('/api/teacher-reviews/staff?facultyId=PM-HOD001', { cookie: cookie('PM-ST001') })
  assert.equal(summary.response.status, 200)
  assert.equal(summary.result.summary.faculty.name, 'Riley Faculty')
  assert.equal(summary.result.summary.totalReviews, 4)
  assertNoStudentIdentity(summary.result)
  const staffCannotSeeOther = await request('/api/teacher-reviews/admin', { cookie: cookie('PM-ST001') })
  assert.equal(staffCannotSeeOther.response.status, 403)

  const hodSummary = await request('/api/teacher-reviews/staff', { cookie: cookie('PM-HOD001') })
  assert.equal(hodSummary.result.summary.faculty.name, 'Jordan HOD')
  assert.equal(hodSummary.result.summary.totalReviews, 0)
  assertNoStudentIdentity(hodSummary.result)

  const admin = await request('/api/teacher-reviews/admin', { cookie: cookie('PM-AD001') })
  assert.equal(admin.response.status, 200)
  assert.equal(admin.result.rankings.some((entry) => entry.faculty.id === 'PM-ST001'), true)
  assert.equal(admin.result.reviews.length, 4)
  assertNoStudentIdentity(admin.result)

  const hidden = await request(`/api/teacher-reviews/admin/${encodeURIComponent(first.result.review.id)}`, {
    method: 'PATCH', cookie: cookie('PM-AD001'), body: { status: 'HIDDEN' },
  })
  assert.equal(hidden.response.status, 200)
  assertNoStudentIdentity(hidden.result)
  const adminAfterModeration = await request('/api/teacher-reviews/admin', { cookie: cookie('PM-AD001') })
  assert.equal(adminAfterModeration.result.reviews.find((review) => review.id === first.result.review.id).status, 'Hidden')
  assert.equal(adminAfterModeration.result.summaries.find((entry) => entry.faculty.id === 'PM-ST001').totalReviews, 3)
  assert.equal(adminAfterModeration.result.rankings.some((entry) => entry.faculty.id === 'PM-ST001'), true)
  assertNoStudentIdentity(adminAfterModeration.result)
})

test('students cannot review arbitrary or inactive accounts and invalid ratings are rejected', async () => {
  const inactive = await request('/api/teacher-reviews', {
    method: 'POST', cookie: cookie('PM-S1001'),
    body: { facultyId: 'PM-ST099', rating: 5 },
  })
  assert.equal(inactive.response.status, 404)
  const arbitrary = await request('/api/teacher-reviews', {
    method: 'POST', cookie: cookie('PM-S1001'),
    body: { facultyId: 'PM-S1002', rating: 5 },
  })
  assert.equal(arbitrary.response.status, 404)
  const invalidRating = await request('/api/teacher-reviews', {
    method: 'POST', cookie: cookie('PM-S1001'),
    body: { facultyId: 'PM-ST001', rating: 6 },
  })
  assert.equal(invalidRating.response.status, 400)
})