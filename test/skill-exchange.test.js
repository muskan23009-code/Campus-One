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

const PASSWORD = 'Skill-Exchange-Test-Password-2026!'
const fixtures = [
  { id: 'PM-AD001', role: 'Administration', name: 'Campus Admin' },
  { id: 'PM-S1001', role: 'Student', name: 'Student One', department: 'Computer Science', semester: 'Semester 3', email: 'one@example.test', mobile: '9999999999' },
  { id: 'PM-S1002', role: 'Student', name: 'Student Two', department: 'Design', semester: 'Semester 5', email: 'two@example.test', mobile: '8888888888' },
  { id: 'PM-ST001', role: 'Staff', name: 'Campus Staff' },
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

before(async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'campus-one-skills-'))
  store = createStore(dataDirectory)
  const users = await Promise.all(fixtures.map(async (details) => ({
    ...details,
    department: details.department || '',
    active: true,
    modules: [],
    credentials: await hashPassword(PASSWORD),
    sessionVersion: 1,
    mustChangePassword: false,
  })))
  await store.write({
    users,
    complaints: [{ id: 'keep-complaint' }],
    campusVoiceSubmissions: [{ id: 'keep-campus-voice-record' }],
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
    const login = await request('/api/auth/login', { method: 'POST', body: { userId: id, role, password: PASSWORD } })
    assert.equal(login.response.status, 200)
    cookies.set(id, login.response.headers.get('set-cookie').split(';', 1)[0])
  }
})

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
  await store?.clear()
})

test('Skill Exchange endpoints require a session and restrict access and mutation to students', async () => {
  const anonymous = await request('/api/skill-exchange/listings')
  assert.equal(anonymous.response.status, 401)
  const staff = await request('/api/skill-exchange/listings', { cookie: cookie('PM-ST001') })
  assert.equal(staff.response.status, 403)
  const adminSubmit = await request('/api/skill-exchange/listings', {
    method: 'POST', cookie: cookie('PM-AD001'),
    body: { kind: 'OFFER', skill: 'Guitar', category: 'Media', description: 'Guitar lessons for fellow students.', level: 'Advanced', helpWith: 'Practice' },
  })
  assert.equal(adminSubmit.response.status, 403)
})

test('students create offers and requests, edit only their own, and close or delete their listings', async () => {
  const offer = await request('/api/skill-exchange/listings', {
    method: 'POST',
    cookie: cookie('PM-S1001'),
    body: { kind: 'OFFER', skill: 'React', category: 'Technology', description: 'I can help with React basics and small projects.', level: 'Intermediate', helpWith: 'Components, hooks, and project setup', availability: 'Weekday evenings' },
  })
  assert.equal(offer.response.status, 201)
  assert.equal(offer.result.listing.student.name, 'Student One')
  assert.equal(offer.result.listing.student.department, 'Computer Science')
  assert.equal(Object.hasOwn(offer.result.listing.student, 'email'), false)
  assert.equal(Object.hasOwn(offer.result.listing.student, 'mobile'), false)
  assert.equal(Object.hasOwn(offer.result.listing, 'ownerId'), false)
  assert.equal(offer.result.listing.isMine, true)

  const helpRequest = await request('/api/skill-exchange/listings', {
    method: 'POST',
    cookie: cookie('PM-S1002'),
    body: { kind: 'REQUEST', skill: 'Poster design', category: 'Design', description: 'Looking for help designing a poster for a campus event.', level: 'Beginner', deadline: '2026-12-15' },
  })
  assert.equal(helpRequest.response.status, 201)
  assert.equal(helpRequest.result.listing.kind, 'REQUEST')

  const forbiddenEdit = await request(`/api/skill-exchange/listings/${offer.result.listing.id}`, {
    method: 'PATCH', cookie: cookie('PM-S1002'), body: { skill: 'Changed by another student' },
  })
  assert.equal(forbiddenEdit.response.status, 404)
  const updated = await request(`/api/skill-exchange/listings/${offer.result.listing.id}`, {
    method: 'PATCH', cookie: cookie('PM-S1001'), body: { skill: 'React and UI', description: 'I can help with React and interface basics for student projects.' },
  })
  assert.equal(updated.response.status, 200)
  assert.equal(updated.result.listing.skill, 'React and UI')

  const closed = await request(`/api/skill-exchange/listings/${helpRequest.result.listing.id}`, {
    method: 'PATCH', cookie: cookie('PM-S1002'), body: { active: false },
  })
  assert.equal(closed.result.listing.active, false)
  const mine = await request('/api/skill-exchange/listings?mine=1', { cookie: cookie('PM-S1002') })
  assert.equal(mine.result.listings[0].active, false)
  const reopened = await request(`/api/skill-exchange/listings/${helpRequest.result.listing.id}`, {
    method: 'PATCH', cookie: cookie('PM-S1002'), body: { active: true },
  })
  assert.equal(reopened.result.listing.active, true)

  const deleted = await request(`/api/skill-exchange/listings/${helpRequest.result.listing.id}`, { method: 'DELETE', cookie: cookie('PM-S1002') })
  assert.equal(deleted.response.status, 200)
  const forbiddenDelete = await request(`/api/skill-exchange/listings/${offer.result.listing.id}`, { method: 'DELETE', cookie: cookie('PM-S1002') })
  assert.equal(forbiddenDelete.response.status, 404)

  const saved = await store.read()
  assert.equal(saved.complaints[0].id, 'keep-complaint')
  assert.equal(saved.campusVoiceSubmissions[0].id, 'keep-campus-voice-record')
})

test('connection requests can be accepted, declined, or cancelled only by their participant', async () => {
  const created = await request('/api/skill-exchange/listings', {
    method: 'POST', cookie: cookie('PM-S1001'),
    body: { kind: 'OFFER', skill: 'Photography', category: 'Media', description: 'I can teach basic campus event photography.', level: 'Advanced', helpWith: 'Camera basics and composition' },
  })
  const sent = await request('/api/skill-exchange/connections', {
    method: 'POST', cookie: cookie('PM-S1002'),
    body: { listingId: created.result.listing.id, message: 'I would love to learn event photography.' },
  })
  assert.equal(sent.response.status, 201)
  assert.equal(sent.result.connection.status, 'PENDING')
  assert.equal(Object.hasOwn(sent.result.connection.student, 'email'), false)

  const duplicate = await request('/api/skill-exchange/connections', {
    method: 'POST', cookie: cookie('PM-S1002'), body: { listingId: created.result.listing.id },
  })
  assert.equal(duplicate.response.status, 409)
  const wrongParticipant = await request(`/api/skill-exchange/connections/${sent.result.connection.id}`, {
    method: 'PATCH', cookie: cookie('PM-AD001'), body: { status: 'ACCEPTED' },
  })
  assert.equal(wrongParticipant.response.status, 403)
  const accepted = await request(`/api/skill-exchange/connections/${sent.result.connection.id}`, {
    method: 'PATCH', cookie: cookie('PM-S1001'), body: { status: 'ACCEPTED' },
  })
  assert.equal(accepted.result.connection.status, 'ACCEPTED')
  const participants = await request('/api/skill-exchange/connections', { cookie: cookie('PM-S1002') })
  assert.equal(participants.result.connections.length, 1)
  assert.equal(participants.result.connections[0].status, 'ACCEPTED')

  const cancelable = await request('/api/skill-exchange/connections', {
    method: 'POST', cookie: cookie('PM-S1002'), body: { listingId: created.result.listing.id },
  })
  const cancelled = await request(`/api/skill-exchange/connections/${cancelable.result.connection.id}`, {
    method: 'PATCH', cookie: cookie('PM-S1002'), body: { status: 'CANCELLED' },
  })
  assert.equal(cancelled.result.connection.status, 'CANCELLED')
})

test('students can report active listings and Administration can review or remove them', async () => {
  const created = await request('/api/skill-exchange/listings', {
    method: 'POST', cookie: cookie('PM-S1001'),
    body: { kind: 'OFFER', skill: 'Illustration', category: 'Design', description: 'I can help students improve their illustration skills.', level: 'Intermediate', helpWith: 'Digital illustration' },
  })
  const report = await request('/api/skill-exchange/reports', {
    method: 'POST', cookie: cookie('PM-S1002'),
    body: { listingId: created.result.listing.id, reason: 'Misleading', details: 'Please review this offer.' },
  })
  assert.equal(report.response.status, 201)
  const deniedReports = await request('/api/skill-exchange/reports', { cookie: cookie('PM-S1002') })
  assert.equal(deniedReports.response.status, 403)
  const adminReports = await request('/api/skill-exchange/reports', { cookie: cookie('PM-AD001') })
  assert.equal(adminReports.response.status, 200)
  assert.equal(adminReports.result.reports[0].listing.skill, 'Illustration')
  const removed = await request(`/api/skill-exchange/reports/${report.result.report.id}`, {
    method: 'PATCH', cookie: cookie('PM-AD001'), body: { status: 'REMOVE_LISTING' },
  })
  assert.equal(removed.response.status, 200)
  const browse = await request('/api/skill-exchange/listings', { cookie: cookie('PM-S1002') })
  assert.equal(browse.result.listings.some((listing) => listing.id === created.result.listing.id), false)
  const own = await request('/api/skill-exchange/listings?mine=1', { cookie: cookie('PM-S1001') })
  assert.equal(own.result.listings.find((listing) => listing.id === created.result.listing.id).active, false)
})
