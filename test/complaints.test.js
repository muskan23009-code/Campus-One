import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createCampusApp } from '../server/app.js'
import { hashPassword } from '../server/auth.js'
import { createStore } from '../server/store.js'

const PASSWORD = 'Complaint-Test-Password-2026!'
const fixtures = [
  { id: 'PM-AD001', role: 'Administration', name: 'Campus Admin', department: '' },
  { id: 'PM-HOD001', role: 'HOD', name: 'CS HOD', department: 'Computer Science' },
  { id: 'PM-HOD002', role: 'HOD', name: 'Civil HOD', department: 'Civil Engineering' },
  { id: 'PM-ST001', role: 'Staff', name: 'CS Staff', department: 'Computer Science' },
  { id: 'PM-ST002', role: 'Staff', name: 'Civil Staff', department: 'Civil Engineering' },
  { id: 'PM-SC001', role: 'Sports Captain', name: 'Sports Captain', department: '' },
  { id: 'PM-S1001', role: 'Student', name: 'CS Student', department: 'Computer Science' },
  { id: 'PM-S1002', role: 'Student', name: 'Civil Student', department: 'Civil Engineering' },
]

let server
let store
let baseUrl
let dataDirectory
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

function cookie(role) {
  return cookies.get(role)
}

function submissionKey(number) {
  return `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
}

async function submit(role, key, details = {}) {
  return request('/api/complaints', {
    method: 'POST',
    cookie: cookie(role),
    body: {
      title: `${role} test issue`,
      category: 'Electrical',
      description: 'A sufficiently detailed campus issue for authorization testing.',
      submissionKey: submissionKey(key),
      ...details,
    },
  })
}

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'campus-one-complaints-'))
  store = createStore(dataDirectory)
  const users = await Promise.all(fixtures.map(async ({ id, role, name, department }) => ({
    id, role, name, department, email: `${id.toLowerCase()}@example.test`, active: true,
    modules: [], credentials: await hashPassword(PASSWORD), sessionVersion: 1,
    mustChangePassword: false,
  })))
  await store.write({ users, complaints: [], notifications: [], registrationRequests: [], issuedUserIds: [], idCounters: {} })
  server = createServer(createCampusApp({ store, sessionSecret: randomBytes(32) }))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
  for (const { id, role } of fixtures) {
    const response = await request('/api/auth/login', { method: 'POST', body: { userId: id, role, password: PASSWORD } })
    assert.equal(response.response.status, 200, `${role} uses the existing login`)
    const sessionCookie = response.response.headers.get('set-cookie').split(';', 1)[0]
    cookies.set(id, sessionCookie)
    if (!cookies.has(role)) cookies.set(role, sessionCookie)
  }
})

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
  await store?.clear()
})

test('complaint endpoints require the existing Campus One session', async () => {
  const listed = await request('/api/complaints')
  assert.equal(listed.response.status, 401)
  const submitted = await request('/api/complaints', {
    method: 'POST',
    body: { title: 'Unauthenticated issue', category: 'Other', description: 'This should not be persisted.', submissionKey: submissionKey(100) },
  })
  assert.equal(submitted.response.status, 401)
  assert.equal((await store.read()).complaints.length, 0)
})

test('all five authenticated roles can submit and privately track real complaints', async () => {
  for (const [index, role] of ['Student', 'Staff', 'HOD', 'Sports Captain', 'Administration'].entries()) {
    const details = role === 'Sports Captain' ? { category: 'Sports' } : {}
    const result = await submit(role, index + 1, {
      ...details,
      submitterId: 'forged-id',
      submitterRole: 'Administration',
      status: 'RESOLVED',
      assignedTo: 'forged-assignee',
    })
    assert.equal(result.response.status, 201, role)
    assert.equal(result.result.complaint.id, `CMP-${String(index + 1).padStart(6, '0')}`)
    assert.equal(result.result.complaint.submitterId, fixtures.find((user) => user.role === role).id)
    assert.equal(result.result.complaint.submitterRole, role)
    assert.equal(result.result.complaint.status, 'SUBMITTED')
    assert.equal(result.result.complaint.activity.length, 1)
    assert.equal(Object.hasOwn(result.result.complaint, 'submissionKey'), false)
    const own = await request('/api/complaints', { cookie: cookie(role) })
    assert.equal(own.response.status, 200)
    assert.ok(own.result.complaints.some((item) => item.id === result.result.complaint.id))
  }

  const studentOnlyCookie = cookie('PM-S1001')
  const unauthorizedRead = await request('/api/complaints/CMP-000002', { cookie: studentOnlyCookie })
  assert.equal(unauthorizedRead.response.status, 404, 'students cannot see another account’s complaint')
})

test('submission is idempotent and students cannot modify statuses or official activity', async () => {
  const first = await submit('Student', 10)
  assert.equal(first.response.status, 201)
  const repeated = await submit('Student', 10)
  assert.equal(repeated.response.status, 200)
  assert.equal(repeated.result.duplicate, true)
  assert.equal(repeated.result.complaint.id, first.result.complaint.id)

  const patch = await request(`/api/complaints/${first.result.complaint.id}`, {
    method: 'PATCH', cookie: cookie('PM-S1001'), body: { status: 'RESOLVED' },
  })
  assert.equal(patch.response.status, 403)
  const note = await request(`/api/complaints/${first.result.complaint.id}/notes`, {
    method: 'POST', cookie: cookie('PM-S1001'), body: { message: 'I resolved this myself.' },
  })
  assert.equal(note.response.status, 403)
  const details = await request(`/api/complaints/${first.result.complaint.id}`, { cookie: cookie('PM-S1001') })
  assert.equal(details.result.complaint.status, 'SUBMITTED')
  assert.equal(details.result.complaint.activity.length, 1)
})

test('Staff and HOD manage only department-scoped complaints; authorized updates are append-only', async () => {
  const created = await submit('Student', 20, { title: 'CS electrical repair' })
  const id = created.result.complaint.id
  const staffView = await request(`/api/complaints/${id}`, { cookie: cookie('Staff') })
  assert.equal(staffView.response.status, 200)
  const accepted = await request(`/api/complaints/${id}`, { method: 'PATCH', cookie: cookie('Staff'), body: { status: 'ACCEPTED' } })
  assert.equal(accepted.response.status, 200)
  const note = await request(`/api/complaints/${id}/notes`, { method: 'POST', cookie: cookie('Staff'), body: { message: 'Maintenance has been informed.' } })
  assert.equal(note.response.status, 201)
  const started = await request(`/api/complaints/${id}`, { method: 'PATCH', cookie: cookie('Staff'), body: { status: 'IN_PROGRESS' } })
  assert.equal(started.response.status, 200)
  const resolved = await request(`/api/complaints/${id}`, { method: 'PATCH', cookie: cookie('Staff'), body: { status: 'RESOLVED' } })
  assert.equal(resolved.result.complaint.status, 'RESOLVED')
  assert.deepEqual(resolved.result.complaint.activity.filter((item) => item.type === 'status').map((item) => item.status), ['SUBMITTED', 'ACCEPTED', 'IN_PROGRESS', 'RESOLVED'])
  assert.ok(resolved.result.complaint.activity.some((item) => item.message === 'Maintenance has been informed.'))

  const second = await submit('Student', 21, { title: 'Water supply issue' })
  const hodAccepted = await request(`/api/complaints/${second.result.complaint.id}`, { method: 'PATCH', cookie: cookie('HOD'), body: { status: 'ACCEPTED' } })
  assert.equal(hodAccepted.response.status, 200)
  const hodNote = await request(`/api/complaints/${second.result.complaint.id}/notes`, { method: 'POST', cookie: cookie('HOD'), body: { message: 'Department facilities has received this report.' } })
  assert.equal(hodNote.response.status, 201)
  const civilHod = await request(`/api/complaints/${second.result.complaint.id}`, { cookie: cookie('PM-HOD002') })
  assert.equal(civilHod.response.status, 404)
  const civilPatch = await request(`/api/complaints/${second.result.complaint.id}`, { method: 'PATCH', cookie: cookie('PM-HOD002'), body: { status: 'REJECTED' } })
  assert.equal(civilPatch.response.status, 403)

  const wrongTransition = await request(`/api/complaints/${second.result.complaint.id}`, { method: 'PATCH', cookie: cookie('Staff'), body: { status: 'RESOLVED' } })
  assert.equal(wrongTransition.response.status, 409)
  const rejected = await submit('Student', 22, { category: 'Security', title: 'Security desk concern' })
  const rejection = await request(`/api/complaints/${rejected.result.complaint.id}`, { method: 'PATCH', cookie: cookie('HOD'), body: { status: 'REJECTED' } })
  assert.equal(rejection.response.status, 200)
  assert.equal(rejection.result.complaint.status, 'REJECTED')
})

test('Sports Captain manages sports complaints only; Administration can manage all', async () => {
  const sports = await submit('Student', 30, { category: 'Sports', title: 'Sports court lighting' })
  const sportsId = sports.result.complaint.id
  const captainView = await request(`/api/complaints/${sportsId}`, { cookie: cookie('Sports Captain') })
  assert.equal(captainView.response.status, 200)
  const captainAction = await request(`/api/complaints/${sportsId}`, { method: 'PATCH', cookie: cookie('Sports Captain'), body: { status: 'ACCEPTED' } })
  assert.equal(captainAction.response.status, 200)
  const captainNote = await request(`/api/complaints/${sportsId}/notes`, { method: 'POST', cookie: cookie('Sports Captain'), body: { message: 'Sports facilities team is reviewing the lights.' } })
  assert.equal(captainNote.response.status, 201)

  const nonSports = await submit('Student', 31, { category: 'Transport' })
  const captainDenied = await request(`/api/complaints/${nonSports.result.complaint.id}`, { method: 'PATCH', cookie: cookie('Sports Captain'), body: { status: 'ACCEPTED' } })
  assert.equal(captainDenied.response.status, 403)
  const invalidAssignment = await request(`/api/complaints/${nonSports.result.complaint.id}`, { method: 'PATCH', cookie: cookie('Administration'), body: { assignedTo: { id: 'PM-ST002' } } })
  assert.equal(invalidAssignment.response.status, 400)
  const assigned = await request(`/api/complaints/${nonSports.result.complaint.id}`, { method: 'PATCH', cookie: cookie('Administration'), body: { assignedTo: 'PM-ST002' } })
  assert.equal(assigned.response.status, 200)
  assert.equal(assigned.result.complaint.assignedTo.id, 'PM-ST002')
  const assigneeView = await request(`/api/complaints/${nonSports.result.complaint.id}`, { cookie: cookie('PM-ST002') })
  assert.equal(assigneeView.response.status, 200, 'Staff can manage an explicitly assigned complaint outside their department')
  const otherStaffDenied = await request(`/api/complaints/${nonSports.result.complaint.id}`, { method: 'PATCH', cookie: cookie('Staff'), body: { status: 'ACCEPTED' } })
  assert.equal(otherStaffDenied.response.status, 403, 'a different Staff member cannot act on an assigned complaint')

  const civil = await submit('PM-S1002', 32, { category: 'Water', title: 'Civil department water issue' })
  const adminAction = await request(`/api/complaints/${civil.result.complaint.id}`, { method: 'PATCH', cookie: cookie('Administration'), body: { status: 'ACCEPTED' } })
  assert.equal(adminAction.response.status, 200)
  const adminNote = await request(`/api/complaints/${civil.result.complaint.id}/notes`, { method: 'POST', cookie: cookie('Administration'), body: { message: 'Campus administration has accepted this report.' } })
  assert.equal(adminNote.response.status, 201)
  const adminInProgress = await request(`/api/complaints/${civil.result.complaint.id}`, { method: 'PATCH', cookie: cookie('Administration'), body: { status: 'IN_PROGRESS' } })
  const adminResolved = await request(`/api/complaints/${civil.result.complaint.id}`, { method: 'PATCH', cookie: cookie('Administration'), body: { status: 'RESOLVED' } })
  assert.equal(adminInProgress.response.status, 200)
  assert.equal(adminResolved.result.complaint.status, 'RESOLVED')
  const allComplaints = await request('/api/complaints', { cookie: cookie('Administration') })
  assert.ok(allComplaints.result.complaints.some((complaint) => complaint.id === civil.result.complaint.id))
  const filtered = await request('/api/complaints?department=Civil%20Engineering&category=Water', { cookie: cookie('Administration') })
  assert.ok(filtered.result.complaints.length > 0)
  assert.ok(filtered.result.complaints.every((complaint) => complaint.department === 'Civil Engineering' && complaint.category === 'Water'))
})

test('existing notifications receive complaint creation, status, and official note updates', async () => {
  const result = await submit('Student', 40, { title: 'Notified electrical issue' })
  const recipientNotifications = await request('/api/notifications', { cookie: cookie('HOD') })
  assert.ok(recipientNotifications.result.notifications.some((notification) => notification.referenceId === result.result.complaint.id && notification.target === 'complaints'))
  const accepted = await request(`/api/complaints/${result.result.complaint.id}`, { method: 'PATCH', cookie: cookie('Staff'), body: { status: 'ACCEPTED' } })
  assert.equal(accepted.response.status, 200)
  await request(`/api/complaints/${result.result.complaint.id}/notes`, { method: 'POST', cookie: cookie('Staff'), body: { message: 'We have started coordinating the repair.' } })
  await request(`/api/complaints/${result.result.complaint.id}`, { method: 'PATCH', cookie: cookie('Staff'), body: { status: 'IN_PROGRESS' } })
  await request(`/api/complaints/${result.result.complaint.id}`, { method: 'PATCH', cookie: cookie('Staff'), body: { status: 'RESOLVED' } })
  const submitterNotifications = await request('/api/notifications', { cookie: cookie('PM-S1001') })
  const updates = submitterNotifications.result.notifications.filter((notification) => notification.referenceId === result.result.complaint.id)
  assert.ok(updates.some((notification) => notification.title === 'Complaint Accepted'))
  assert.ok(updates.some((notification) => notification.title === 'Complaint In Progress'))
  assert.ok(updates.some((notification) => notification.title === 'Complaint Resolved'))
  assert.ok(updates.some((notification) => notification.title === 'Complaint update'))
})

test('complaint photos are validated, private, and served only to authorized viewers', async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
  const created = await submit('Student', 50, {
    title: 'Photo-supported classroom issue',
    photo: `data:image/png;base64,${png.toString('base64')}`,
  })
  assert.equal(created.response.status, 201)
  const complaint = created.result.complaint
  assert.ok(complaint.photoUrl)
  const ownerPhoto = await fetch(`${baseUrl}${complaint.photoUrl}`, { headers: { Cookie: cookie('PM-S1001') } })
  assert.equal(ownerPhoto.status, 200)
  assert.equal(ownerPhoto.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(Buffer.from(await ownerPhoto.arrayBuffer()), png)
  const otherPhoto = await fetch(`${baseUrl}${complaint.photoUrl}`, { headers: { Cookie: cookie('PM-S1002') } })
  assert.equal(otherPhoto.status, 404)
  const data = await store.read()
  const photo = data.complaints.find((item) => item.id === complaint.id).photo
  const directoryMode = (await stat(join(storeDirectory(), 'complaint-photos'))).mode & 0o777
  const photoMode = (await stat(join(storeDirectory(), 'complaint-photos', `${photo.photoId}.png`))).mode & 0o777
  assert.equal(directoryMode, 0o700)
  assert.equal(photoMode, 0o600)

  const invalid = await submit('Student', 51, {
    photo: `data:image/png;base64,${Buffer.from('not a PNG').toString('base64')}`,
  })
  assert.equal(invalid.response.status, 400)
})

function storeDirectory() {
  return dataDirectory
}
