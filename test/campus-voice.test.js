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

const PASSWORD = 'Campus-Voice-Test-Password-2026!'
const fixtures = [
  { id: 'PM-AD001', role: 'Administration', name: 'Campus Admin' },
  { id: 'PM-S1001', role: 'Student', name: 'Student One' },
  { id: 'PM-S1002', role: 'Student', name: 'Student Two' },
  { id: 'PM-SC001', role: 'Sports Captain', name: 'Campus Sports Captain' },
  { id: 'PM-ST001', role: 'Staff', name: 'Campus Staff' },
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
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null
  return { response, result }
}

function cookie(userId) {
  return cookies.get(userId)
}

async function submit(body) {
  return request('/api/campus-voice/submissions', { method: 'POST', cookie: cookie('PM-S1001'), body })
}

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'campus-one-voice-'))
  store = createStore(dataDirectory)
  const users = await Promise.all(fixtures.map(async ({ id, role, name }) => ({
    id, role, name, department: '', email: `${id.toLowerCase()}@example.test`,
    active: true, modules: [], credentials: await hashPassword(PASSWORD),
    sessionVersion: 1, mustChangePassword: false,
  })))
  await store.write({
    users,
    complaints: [{ id: 'preserved-complaint' }],
    notifications: [],
    registrationRequests: [],
    issuedUserIds: [],
    idCounters: {},
  })
  server = createServer(createCampusApp({ store, sessionSecret: randomBytes(32) }))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
  for (const { id, role } of fixtures) {
    const result = await request('/api/auth/login', { method: 'POST', body: { userId: id, role, password: PASSWORD } })
    assert.equal(result.response.status, 200)
    cookies.set(id, result.response.headers.get('set-cookie').split(';', 1)[0])
  }
})

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
  await store?.clear()
})

test('Campus Voice requires the existing session and limits submission management by role', async () => {
  const anonymous = await request('/api/campus-voice/ideas')
  assert.equal(anonymous.response.status, 401)

  const staff = await request('/api/campus-voice/ideas', { cookie: cookie('PM-ST001') })
  assert.equal(staff.response.status, 403)
  const adminSubmit = await request('/api/campus-voice/submissions', {
    method: 'POST', cookie: cookie('PM-AD001'),
    body: { kind: 'IDEA', type: 'Idea', category: 'Academics', title: 'Forged role', description: 'This should not be accepted.' },
  })
  assert.equal(adminSubmit.response.status, 403)
  const studentAdminUpdate = await request('/api/campus-voice/submissions/not-real', {
    method: 'PATCH', cookie: cookie('PM-S1001'), body: { status: 'Implemented' },
  })
  assert.equal(studentAdminUpdate.response.status, 403)
})

test('anonymous submissions stay private while students can track their own records', async () => {
  const created = await submit({
    kind: 'ANONYMOUS',
    type: 'Concern',
    category: 'Safety',
    title: 'Lighting near the east entrance',
    description: 'The walkway is very dark after evening classes and needs additional lights.',
    location: 'East entrance',
    submitterId: 'forged-user',
    status: 'Implemented',
    isAnonymous: false,
  })
  assert.equal(created.response.status, 201)
  assert.equal(created.result.submission.status, 'Submitted')
  assert.equal(created.result.submission.isAnonymous, true)
  assert.equal(Object.hasOwn(created.result.submission, 'submitterId'), false)

  const own = await request('/api/campus-voice/submissions', { cookie: cookie('PM-S1001') })
  assert.equal(own.result.submissions.length, 1)
  const privateDetail = await request(`/api/campus-voice/submissions/${created.result.submission.id}`, { cookie: cookie('PM-S1002') })
  assert.equal(privateDetail.response.status, 404)

  const storeData = await store.read()
  const saved = storeData.campusVoiceSubmissions[0]
  assert.equal(saved.submitterId, 'PM-S1001')
  assert.equal(saved.isAnonymous, true)
  assert.equal(storeData.complaints[0].id, 'preserved-complaint')

  const invalidCategory = await submit({
    kind: 'IDEA', type: 'Idea', category: 'Not a category',
    title: 'Invalid idea', description: 'This idea uses a category outside the allowed list.',
  })
  assert.equal(invalidCategory.response.status, 400)
})

test('Sports Captains can use student Campus Voice submissions without administration controls', async () => {
  const created = await request('/api/campus-voice/submissions', {
    method: 'POST',
    cookie: cookie('PM-SC001'),
    body: {
      kind: 'IDEA', type: 'Idea', category: 'Sports',
      title: 'More outdoor seating', description: 'Add seating near the outdoor sports practice area.',
    },
  })
  assert.equal(created.response.status, 201)
  const own = await request('/api/campus-voice/submissions', { cookie: cookie('PM-SC001') })
  assert.equal(own.response.status, 200)
  assert.equal(own.result.submissions.some((item) => item.id === created.result.submission.id), true)
  const adminOnly = await request(`/api/campus-voice/submissions/${created.result.submission.id}`, {
    method: 'PATCH', cookie: cookie('PM-SC001'), body: { status: 'Implemented' },
  })
  assert.equal(adminOnly.response.status, 403)
})

test('ideas are public without author details, support is unique, and only Administration can mark implementation', async () => {
  const created = await submit({
    kind: 'IDEA',
    type: 'Idea',
    category: 'Infrastructure',
    title: 'More shaded seating',
    description: 'Add shaded seating near the central courtyard for students between classes.',
    location: 'Central courtyard',
  })
  assert.equal(created.response.status, 201)
  assert.equal(created.result.submission.kind, 'IDEA')
  assert.equal(created.result.submission.supportCount, 0)

  const publicIdeas = await request('/api/campus-voice/ideas', { cookie: cookie('PM-S1002') })
  const ideaId = created.result.submission.id
  const publicIdea = publicIdeas.result.ideas.find((idea) => idea.id === ideaId)
  assert.ok(publicIdea)
  assert.equal(Object.hasOwn(publicIdea, 'submitterId'), false)
  assert.equal(Object.hasOwn(publicIdea, 'supporters'), false)
  const captainSupport = await request(`/api/campus-voice/ideas/${ideaId}/support`, { method: 'POST', cookie: cookie('PM-SC001') })
  assert.equal(captainSupport.response.status, 200)
  assert.equal(captainSupport.result.idea.supportCount, 1)
  let support = await request(`/api/campus-voice/ideas/${ideaId}/support`, { method: 'POST', cookie: cookie('PM-S1002') })
  assert.equal(support.response.status, 200)
  assert.equal(support.result.idea.supportCount, 2)
  assert.equal(support.result.idea.supportedByMe, true)
  support = await request(`/api/campus-voice/ideas/${ideaId}/support`, { method: 'POST', cookie: cookie('PM-S1002') })
  assert.equal(support.result.idea.supportCount, 1, 'a second support request removes the current user support')

  const needsUpdate = await request(`/api/campus-voice/submissions/${ideaId}`, {
    method: 'PATCH', cookie: cookie('PM-AD001'), body: { status: 'Implemented' },
  })
  assert.equal(needsUpdate.response.status, 409, 'the lifecycle cannot be skipped')

  for (const nextStatus of ['Under Review', 'Approved', 'In Progress']) {
    const transitioned = await request(`/api/campus-voice/submissions/${ideaId}`, {
      method: 'PATCH', cookie: cookie('PM-AD001'), body: { status: nextStatus },
    })
    assert.equal(transitioned.response.status, 200, nextStatus)
  }
  const missingImplementation = await request(`/api/campus-voice/submissions/${ideaId}`, {
    method: 'PATCH', cookie: cookie('PM-AD001'), body: { status: 'Implemented' },
  })
  assert.equal(missingImplementation.response.status, 400, 'implemented ideas require an implementation update')

  const review = await request(`/api/campus-voice/submissions/${ideaId}`, {
    method: 'PATCH',
    cookie: cookie('PM-AD001'),
    body: {
      status: 'Implemented',
      officialResponse: 'Approved by campus administration.',
      implementationUpdate: 'Three shaded benches were installed beside the central courtyard.',
    },
  })
  assert.equal(review.response.status, 200)
  assert.equal(review.result.submission.status, 'Implemented')
  assert.equal(review.result.submission.officialResponse, 'Approved by campus administration.')

  const community = await request('/api/campus-voice/ideas', { cookie: cookie('PM-S1002') })
  assert.equal(community.result.ideas[0].implementationUpdate, 'Three shaded benches were installed beside the central courtyard.')

  const filtered = await request('/api/campus-voice/submissions?status=Implemented&category=Infrastructure', { cookie: cookie('PM-AD001') })
  assert.equal(filtered.result.submissions.length, 1)
  assert.equal(filtered.result.submissions[0].id, ideaId)
})
