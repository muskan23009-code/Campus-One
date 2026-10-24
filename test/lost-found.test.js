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

const PASSWORD = 'Lost-Found-Test-Password-2026!'
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
let keySequence = 0

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

function cookie(identity) {
  return cookies.get(identity)
}

function idempotencyKey() {
  keySequence += 1
  return `00000000-0000-4000-8000-${String(keySequence).padStart(12, '0')}`
}

async function createReport(identity, type = 'LOST', details = {}) {
  return request('/api/lost-found', {
    method: 'POST',
    cookie: cookie(identity),
    body: {
      type, itemName: `Test item ${identity}`, category: 'Wallet/Bag',
      description: 'A clearly described personal item for campus recovery.',
      location: 'Academic Block A, room 204',
      itemDate: new Date().toISOString().slice(0, 10),
      additionalDetails: 'Private identifying detail not shown publicly.',
      submissionKey: idempotencyKey(),
      ...details,
    },
  })
}

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'campus-one-lost-found-'))
  store = createStore(dataDirectory)
  const users = await Promise.all(fixtures.map(async ({ id, role, name, department }) => ({
    id, role, name, department, email: `${id.toLowerCase()}@example.test`, active: true,
    modules: [], credentials: await hashPassword(PASSWORD), sessionVersion: 1,
    mustChangePassword: false,
  })))
  await store.write({ users, complaints: [], lostFoundReports: [], notifications: [], registrationRequests: [], issuedUserIds: [], idCounters: {} })
  server = createServer(createCampusApp({ store, sessionSecret: randomBytes(32) }))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
  for (const { id, role } of fixtures) {
    const result = await request('/api/auth/login', { method: 'POST', body: { userId: id, role, password: PASSWORD } })
    assert.equal(result.response.status, 200, role)
    cookies.set(id, result.response.headers.get('set-cookie').split(';', 1)[0])
    if (!cookies.has(role)) cookies.set(role, cookies.get(id))
  }
})

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
  await store?.clear()
})

test('Lost & Found APIs require the existing authenticated Campus One session', async () => {
  assert.equal((await request('/api/lost-found')).response.status, 401)
  const created = await request('/api/lost-found', { method: 'POST', body: { type: 'LOST' } })
  assert.equal(created.response.status, 401)
})

test('all five roles can persist lost and found reports with server-assigned identity and IDs', async () => {
  const roles = ['Student', 'Staff', 'HOD', 'Sports Captain', 'Administration']
  const created = []
  for (const role of roles) {
    const category = role === 'Sports Captain' ? 'Sports Equipment' : 'Wallet/Bag'
    for (const type of ['LOST', 'FOUND']) {
      const result = await createReport(role, type, {
        itemName: `${role} ${type.toLowerCase()} campus bag`,
        category,
        reporterId: 'forged-id',
        reporterName: 'Forged name',
        reporterRole: 'Administration',
        status: 'RETURNED',
        itemDate: new Date().toISOString().slice(0, 10),
      })
      assert.equal(result.response.status, 201, `${role} ${type}`)
      assert.equal(result.result.report.id, `LF-${String(created.length + 1).padStart(6, '0')}`)
      assert.equal(result.result.report.type, type)
      assert.equal(result.result.report.reporterId, fixtures.find((user) => user.role === role).id)
      assert.equal(result.result.report.reporterName, fixtures.find((user) => user.role === role).name)
      assert.equal(result.result.report.reporterRole, role)
      assert.equal(result.result.report.status, type)
      assert.equal(result.result.report.activity.length, 1)
      assert.equal(Object.hasOwn(result.result.report, 'submissionKey'), false)
      created.push(result.result.report)
    }
  }
  const stored = await store.read()
  assert.equal(stored.lostFoundReports.length, 10)
  assert.equal(stored.lostFoundReports[0].reporterId, 'PM-AD001')
})

test('search, filters, My Reports, and duplicate submission protection use persistent reports', async () => {
  const report = await createReport('PM-S1001', 'LOST', {
    itemName: 'Blue notebook with silver corners',
    category: 'Books/Notes',
    location: 'Central library second floor',
  })
  assert.equal(report.response.status, 201)
  const body = {
    type: 'LOST', itemName: 'Blue notebook with silver corners', category: 'Books/Notes',
    description: 'A clearly described personal item for campus recovery.',
    location: 'Central library second floor', itemDate: new Date().toISOString().slice(0, 10),
    submissionKey: report.result.report.id,
  }
  body.submissionKey = idempotencyKey()
  const repeatedBody = { ...body, submissionKey: body.submissionKey }
  const repeated1 = await request('/api/lost-found', { method: 'POST', cookie: cookie('PM-S1001'), body: repeatedBody })
  const repeated2 = await request('/api/lost-found', { method: 'POST', cookie: cookie('PM-S1001'), body: repeatedBody })
  assert.equal(repeated1.response.status, 201)
  assert.equal(repeated2.response.status, 200)
  assert.equal(repeated2.result.duplicate, true)
  assert.equal(repeated2.result.report.id, repeated1.result.report.id)

  const searched = await request('/api/lost-found?q=notebook%20library&category=Books%2FNotes&type=LOST', { cookie: cookie('PM-S1002') })
  assert.ok(searched.result.reports.some((item) => item.itemName === 'Blue notebook with silver corners'))
  const mine = await request('/api/lost-found?mine=1', { cookie: cookie('PM-S1001') })
  assert.ok(mine.result.reports.every((item) => item.reporterId === 'PM-S1001'))
  assert.ok(mine.result.reports.length >= 1)
})

test('matching, private claims, unauthorized actions, verification, return, close, and notifications work', async () => {
  const lost = await createReport('PM-S1001', 'LOST', {
    itemName: 'Distinctive red leather wallet',
    category: 'Wallet/Bag',
    location: 'Engineering Block A',
  })
  const found = await createReport('PM-ST001', 'FOUND', {
    itemName: 'Distinctive red leather wallet',
    category: 'Wallet/Bag',
    location: 'Main library entrance',
  })
  assert.equal(found.response.status, 201)
  assert.equal(found.result.report.status, 'MATCHED')
  const matchedLost = await request(`/api/lost-found/${lost.result.report.id}`, { cookie: cookie('PM-S1001') })
  assert.equal(matchedLost.result.report.status, 'MATCHED')
  assert.equal(matchedLost.result.report.matchedReportId, found.result.report.id)

  const secret = 'My initials are embossed inside the left card slot, and I lost it at the library yesterday.'
  const claimKey = idempotencyKey()
  const claim = await request(`/api/lost-found/${found.result.report.id}/claims`, {
    method: 'POST', cookie: cookie('PM-S1002'), body: { details: secret, submissionKey: claimKey },
  })
  assert.equal(claim.response.status, 201)
  assert.equal(claim.result.report.status, 'CLAIM_REQUESTED')
  assert.equal(claim.result.claim.details, secret)
  const repeatedClaim = await request(`/api/lost-found/${found.result.report.id}/claims`, {
    method: 'POST', cookie: cookie('PM-S1002'), body: { details: secret, submissionKey: claimKey },
  })
  assert.equal(repeatedClaim.response.status, 200)
  assert.equal(repeatedClaim.result.duplicate, true)

  const publicDetails = await request(`/api/lost-found/${found.result.report.id}`, { cookie: cookie('PM-S1001') })
  assert.equal(publicDetails.result.report.claimRequests.length, 0)
  assert.equal(publicDetails.result.report.reporterId, null)
  assert.equal(publicDetails.result.report.additionalDetails, '')
  assert.ok(publicDetails.result.report.activity.every((entry) => entry.authorId === null || entry.authorId === 'CAMPUS-SYSTEM'))
  const claimantList = await request('/api/lost-found', { cookie: cookie('PM-S1002') })
  assert.ok(claimantList.result.claimRequests.some((item) => item.claim.details === secret && item.report.id === found.result.report.id))
  const finderDetails = await request(`/api/lost-found/${found.result.report.id}`, { cookie: cookie('PM-ST001') })
  assert.equal(finderDetails.result.report.claimRequests[0].details, secret)
  const matchNotifications = await request('/api/notifications', { cookie: cookie('PM-S1001') })
  assert.ok(matchNotifications.result.notifications.some((item) => item.referenceId === lost.result.report.id && item.title === 'Possible Lost & Found match'))

  const forgedReturn = await request(`/api/lost-found/${found.result.report.id}`, {
    method: 'PATCH', cookie: cookie('PM-S1002'), body: { status: 'RETURNED' },
  })
  assert.equal(forgedReturn.response.status, 403)
  const forgedClose = await request(`/api/lost-found/${found.result.report.id}`, {
    method: 'PATCH', cookie: cookie('PM-S1002'), body: { status: 'CLOSED' },
  })
  assert.equal(forgedClose.response.status, 403)
  const forgedVerify = await request(`/api/lost-found/${found.result.report.id}/claims/${claim.result.claim.id}`, {
    method: 'PATCH', cookie: cookie('PM-S1002'), body: { decision: 'VERIFIED' },
  })
  assert.equal(forgedVerify.response.status, 403)

  const verified = await request(`/api/lost-found/${found.result.report.id}/claims/${claim.result.claim.id}`, {
    method: 'PATCH', cookie: cookie('Administration'), body: { decision: 'VERIFIED' },
  })
  assert.equal(verified.response.status, 200)
  assert.equal(verified.result.report.status, 'CLAIM_VERIFIED')
  assert.equal(verified.result.claim.details, secret)
  const returned = await request(`/api/lost-found/${found.result.report.id}`, {
    method: 'PATCH', cookie: cookie('Staff'), body: { status: 'RETURNED' },
  })
  assert.equal(returned.response.status, 200)
  assert.equal(returned.result.report.status, 'RETURNED')
  const closed = await request(`/api/lost-found/${found.result.report.id}`, {
    method: 'PATCH', cookie: cookie('Administration'), body: { status: 'CLOSED' },
  })
  assert.equal(closed.result.report.status, 'CLOSED')

  const lostOwner = await request(`/api/lost-found/${lost.result.report.id}`, { cookie: cookie('PM-S1001') })
  assert.equal(lostOwner.result.report.status, 'CLOSED')
  const claimantNotifications = await request('/api/notifications', { cookie: cookie('PM-S1002') })
  assert.ok(claimantNotifications.result.notifications.some((item) => item.referenceId === found.result.report.id && item.title === 'Claim verified'))
  const ownerNotifications = await request('/api/notifications', { cookie: cookie('PM-ST001') })
  assert.ok(ownerNotifications.result.notifications.some((item) => item.referenceId === found.result.report.id && item.title === 'Claim request received'))
  assert.ok(claimantNotifications.result.notifications.some((item) => item.referenceId === found.result.report.id && item.title === 'Lost & Found item returned'))

  const rejectedItem = await createReport('PM-ST002', 'FOUND', { itemName: 'Green travel mug' })
  const rejectedClaim = await request(`/api/lost-found/${rejectedItem.result.report.id}/claims`, {
    method: 'POST', cookie: cookie('PM-S1002'), body: { details: 'The base has a small scratch beside the logo, and it was lost yesterday.', submissionKey: idempotencyKey() },
  })
  const rejection = await request(`/api/lost-found/${rejectedItem.result.report.id}/claims/${rejectedClaim.result.claim.id}`, {
    method: 'PATCH', cookie: cookie('PM-AD001'), body: { decision: 'REJECTED' },
  })
  assert.equal(rejection.result.report.status, 'FOUND')
  assert.equal(rejection.result.claim.status, 'REJECTED')
  const rejectedNotifications = await request('/api/notifications', { cookie: cookie('PM-S1002') })
  assert.ok(rejectedNotifications.result.notifications.some((item) => item.referenceId === rejectedItem.result.report.id && item.title === 'Claim not verified'))
})

test('HOD and Sports Captain management stays within department and category scopes', async () => {
  const csReport = await createReport('PM-S1001', 'FOUND', { itemName: 'CS lab access card', category: 'ID Card' })
  const hodReview = await request(`/api/lost-found/${csReport.result.report.id}/notes`, {
    method: 'POST', cookie: cookie('PM-HOD001'), body: { message: 'The department office is checking for the owner.' },
  })
  assert.equal(hodReview.response.status, 201)
  const civilDenied = await request(`/api/lost-found/${csReport.result.report.id}/notes`, {
    method: 'POST', cookie: cookie('PM-HOD002'), body: { message: 'Unauthorized department note.' },
  })
  assert.equal(civilDenied.response.status, 403)
  const sportDenied = await request(`/api/lost-found/${csReport.result.report.id}`, {
    method: 'PATCH', cookie: cookie('PM-SC001'), body: { status: 'CLOSED' },
  })
  assert.equal(sportDenied.response.status, 403)
  const civilReport = await createReport('PM-S1002', 'FOUND', { itemName: 'Civil workshop key', category: 'Keys' })
  const hodList = await request('/api/lost-found', { cookie: cookie('PM-HOD001') })
  assert.ok(hodList.result.reports.every((item) => item.department === 'Computer Science' || item.reporterId === 'PM-HOD001'))
  const crossDepartmentClaim = await request(`/api/lost-found/${civilReport.result.report.id}/claims`, {
    method: 'POST', cookie: cookie('PM-HOD001'), body: { details: 'This identifying detail is not valid for my department.', submissionKey: idempotencyKey() },
  })
  assert.equal(crossDepartmentClaim.response.status, 404)

  const sportsReport = await createReport('PM-S1002', 'FOUND', { itemName: 'Training football', category: 'Sports Equipment' })
  const sportsNote = await request(`/api/lost-found/${sportsReport.result.report.id}/notes`, {
    method: 'POST', cookie: cookie('PM-SC001'), body: { message: 'Sports staff will secure this item.' },
  })
  assert.equal(sportsNote.response.status, 201)
})

test('item photos are validated, stored privately, and available to authenticated viewers', async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
  const created = await createReport('PM-S1001', 'FOUND', {
    itemName: 'Photo-supported water bottle',
    photo: `data:image/png;base64,${png.toString('base64')}`,
  })
  assert.equal(created.response.status, 201)
  const photoUrl = created.result.report.photoUrl
  const photo = await fetch(`${baseUrl}${photoUrl}`, { headers: { Cookie: cookie('PM-S1002') } })
  assert.equal(photo.status, 200)
  assert.equal(photo.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png)
  const unauthenticated = await fetch(`${baseUrl}${photoUrl}`)
  assert.equal(unauthenticated.status, 401)
  const stored = (await store.read()).lostFoundReports.find((report) => report.id === created.result.report.id)
  const photoStat = await stat(join(dataDirectory, 'lost-found-photos', `${stored.photo.photoId}.png`))
  assert.equal(photoStat.mode & 0o777, 0o600)

  const invalid = await createReport('PM-S1001', 'FOUND', {
    itemName: 'Invalid picture',
    photo: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`,
  })
  assert.equal(invalid.response.status, 400)
})
