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

const password = 'Campus-Mess-Test-Password-2026!'
const fixtures = [
  ['PM-AD001', 'Administration'],
  ['PM-S1001', 'Student'],
  ['PM-ST001', 'Staff'],
  ['PM-SC001', 'Sports Captain'],
  ['PM-HOD001', 'HOD'],
  ['PM-CS001', 'Canteen Staff'],
]
let server
let store
let baseUrl
const cookies = new Map()

async function request(path, { role = 'Student', cookie, anonymous = false, ...options } = {}) {
  const headers = new Headers(options.headers || {})
  if (!anonymous && (cookie || cookies.has(role))) headers.set('Cookie', cookie || cookies.get(role))
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  let result = {}
  try { result = await response.json() } catch {}
  return { response, result }
}

before(async () => {
  store = createStore(await mkdtemp(join(tmpdir(), 'campus-one-mess-')))
  const users = await Promise.all(fixtures.map(async ([id, role]) => ({
    id, role, name: `${role} Example`, department: 'Computer Science', email: `${id.toLowerCase()}@example.test`,
    active: true, modules: [], credentials: await hashPassword(password), sessionVersion: 1, mustChangePassword: false,
  })))
  await store.write({
    users,
    complaints: [{ id: 'preserve-complaint' }],
    canteenMenu: [{ id: 'preserve-menu', price: 17 }],
    canteenOrders: [{ id: 'preserve-order' }],
    notices: [{ id: 'preserve-notice' }],
    sportsRegistrations: [{ id: 'preserve-sports-registration' }],
    notifications: [],
  })
  server = createServer(createCampusApp({ store, sessionSecret: randomBytes(32) }))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
  for (const [id, role] of fixtures) {
    const result = await request('/api/auth/login', { role, method: 'POST', body: { userId: id, role, password } })
    assert.equal(result.response.status, 200, `${role} login fixture`)
    cookies.set(role, result.response.headers.get('set-cookie').split(';', 1)[0])
  }
})

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
  await store?.clear()
})

test('College Mess defaults are unannounced, settings are Administration-only, and notices are managed safely', async () => {
  let result = await request('/api/mess', { anonymous: true })
  assert.equal(result.response.status, 401)

  result = await request('/api/mess')
  assert.equal(result.response.status, 200)
  assert.equal(result.result.settings.status, 'Closed')
  for (const meal of ['Breakfast', 'Lunch', 'Dinner']) {
    assert.deepEqual(result.result.settings.timings[meal], { start: '', end: '' })
    assert.deepEqual(result.result.settings.crowdSchedule[meal], { start: '', end: '', level: '' })
  }
  assert.deepEqual(result.result.notices, [])

  const settings = {
    status: 'Open',
    timings: {
      Breakfast: { start: '07:00', end: '09:00' },
      Lunch: { start: '', end: '' },
      Dinner: { start: '', end: '' },
    },
    crowdSchedule: {
      Breakfast: { start: '07:30', end: '08:30', level: 'Medium' },
      Lunch: { start: '', end: '', level: '' },
      Dinner: { start: '', end: '', level: '' },
    },
  }
  result = await request('/api/mess/settings', { method: 'PATCH', body: settings })
  assert.equal(result.response.status, 403)
  result = await request('/api/mess/settings', { role: 'HOD', method: 'PATCH', body: settings })
  assert.equal(result.response.status, 403)
  result = await request('/api/mess/settings', { role: 'Canteen Staff', method: 'PATCH', body: settings })
  assert.equal(result.response.status, 403)

  result = await request('/api/mess/settings', { role: 'Administration', method: 'PATCH', body: settings })
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.result.settings, settings)
  result = await request('/api/mess')
  assert.equal(result.result.settings.status, 'Open')
  assert.deepEqual(result.result.settings.timings.Breakfast, settings.timings.Breakfast)
  assert.deepEqual(result.result.settings.crowdSchedule.Breakfast, settings.crowdSchedule.Breakfast)

  const draft = { title: 'Temporary lunch service change', description: 'Lunch service status has been updated for today.' }
  result = await request('/api/mess/notices', { method: 'POST', body: draft })
  assert.equal(result.response.status, 403)
  result = await request('/api/mess/notices', { role: 'Administration', method: 'POST', body: draft })
  assert.equal(result.response.status, 201)
  const noticeId = result.result.notice.id
  const notification = await request('/api/notifications')
  assert.ok(notification.result.notifications.some((item) => item.target === 'food' && item.referenceId === noticeId))
  const canteenNotices = await request('/api/mess', { role: 'Canteen Staff' })
  assert.equal(canteenNotices.response.status, 403)
  const canteenOrders = await request('/api/canteen/orders', { role: 'Canteen Staff' })
  assert.equal(canteenOrders.response.status, 200, 'existing Canteen Staff order access remains available')

  result = await request(`/api/mess/notices/${encodeURIComponent(noticeId)}`, {
    role: 'Administration', method: 'PATCH', body: { ...draft, title: 'Updated lunch service notice' },
  })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notice.title, 'Updated lunch service notice')
  result = await request(`/api/mess/notices/${encodeURIComponent(noticeId)}`, {
    role: 'Administration', method: 'PATCH', body: { active: false },
  })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.notice.active, false)

  result = await request('/api/mess')
  assert.deepEqual(result.result.notices, [])
  result = await request('/api/mess', { role: 'Administration' })
  assert.equal(result.result.notices.length, 1)
  assert.equal(result.result.notices[0].active, false)

  const data = await store.read()
  assert.equal(data.complaints[0].id, 'preserve-complaint')
  assert.equal(data.canteenMenu[0].price, 17)
  assert.equal(data.canteenOrders[0].id, 'preserve-order')
  assert.equal(data.notices[0].id, 'preserve-notice')
  assert.equal(data.sportsRegistrations[0].id, 'preserve-sports-registration')
})