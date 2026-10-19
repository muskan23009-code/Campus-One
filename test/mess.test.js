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
const meals = ['Breakfast', 'Brunch', 'Lunch', 'Dinner']
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
    messSettings: {
      status: 'Open',
      timings: { Breakfast: { start: '07:00', end: '09:00' } },
      crowdSchedule: { Breakfast: { start: '07:30', end: '08:30', level: 'Medium' } },
    },
    messNotices: [{
      id: 'preserve-mess-notice', title: 'Historical mess notice',
      description: 'Previously published Mess service information.', active: true, createdAt: '2026-01-01T10:00:00.000Z',
    }],
    campus: {
      food: [{
        id: 'preserve-legacy-food', title: 'North student mess', description: 'Older published food record',
        crowdLevel: 'Busy', occupancyPercent: 82, estimatedWaitMinutes: 16, crowdUpdatedAt: '2026-01-01T10:00:00.000Z',
        active: true,
      }],
      notices: [],
    },
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

test('College Mess exposes only four meal timings and keeps configuration Administration-only', async () => {
  let result = await request('/api/mess', { anonymous: true })
  assert.equal(result.response.status, 401)

  result = await request('/api/mess')
  assert.equal(result.response.status, 200)
  assert.deepEqual(Object.keys(result.result.settings), ['timings'])
  assert.deepEqual(Object.keys(result.result.settings.timings), meals)
  assert.deepEqual(result.result.settings.timings.Breakfast, { start: '07:00', end: '09:00' })
  assert.deepEqual(result.result.settings.timings.Brunch, { start: '', end: '' })
  assert.equal(Object.hasOwn(result.result, 'notices'), false)
  assert.equal(Object.hasOwn(result.result.settings, 'status'), false)
  assert.equal(Object.hasOwn(result.result.settings, 'crowdSchedule'), false)
  const legacyFood = await request('/api/campus/food')
  const publicLegacyFood = legacyFood.result.records.find((record) => record.id === 'preserve-legacy-food')
  assert.ok(publicLegacyFood)
  assert.equal(Object.hasOwn(publicLegacyFood, 'crowdLevel'), false, 'old crowd properties are not exposed')
  assert.equal(Object.hasOwn(publicLegacyFood, 'estimatedWaitMinutes'), false)

  const timings = {
    Breakfast: { start: '07:00', end: '09:00' },
    Brunch: { start: '10:30', end: '12:00' },
    Lunch: { start: '12:30', end: '14:00' },
    Dinner: { start: '22:30', end: '01:00' },
  }
  const settings = { timings }
  for (const role of ['Student', 'HOD', 'Canteen Staff']) {
    result = await request('/api/mess/settings', { role, method: 'PATCH', body: settings })
    assert.equal(result.response.status, 403, `${role} cannot configure meal timings`)
  }

  result = await request('/api/mess/settings', { role: 'Administration', method: 'PATCH', body: settings })
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.result.settings, settings)
  result = await request('/api/mess')
  assert.deepEqual(result.result.settings, settings, 'saved meal times reload without timezone conversion')

  result = await request('/api/mess/settings', {
    role: 'Administration', method: 'PATCH',
    body: { timings: { ...timings, Brunch: { start: '10:00', end: '10:00' } } },
  })
  assert.equal(result.response.status, 400, 'equal start and end times are invalid')
  result = await request('/api/mess/settings', {
    role: 'Administration', method: 'PATCH',
    body: { timings: { ...timings, Brunch: { start: '10:00', end: '' } } },
  })
  assert.equal(result.response.status, 400, 'a meal must have both times announced together')

  const data = await store.read()
  assert.deepEqual(data.messSettings, settings, 'saving timings removes obsolete settings fields')
  assert.deepEqual(data.messNotices, [{
    id: 'preserve-mess-notice', title: 'Historical mess notice',
    description: 'Previously published Mess service information.', active: true, createdAt: '2026-01-01T10:00:00.000Z',
  }], 'historical Mess notices remain stored')
  assert.equal(data.campus.food[0].crowdLevel, 'Busy', 'historical food records are retained in storage')
  assert.equal(data.complaints[0].id, 'preserve-complaint')
  assert.equal(data.canteenMenu[0].price, 17)
  assert.equal(data.canteenOrders[0].id, 'preserve-order')
  assert.equal(data.notices[0].id, 'preserve-notice')
  assert.equal(data.sportsRegistrations[0].id, 'preserve-sports-registration')
})

test('Mess announcements use the existing Notices audience and notification pipeline', async () => {
  const draft = {
    title: 'Temporary lunch service change',
    description: 'Lunch service will begin at 12:30 today.',
    category: 'Canteen',
    priority: 'Normal',
    target: { type: 'ROLE', role: 'Student' },
    publishAt: new Date(Date.now() - 60_000).toISOString(),
  }
  let result = await request('/api/notices', { method: 'POST', body: draft })
  assert.equal(result.response.status, 403, 'students cannot issue Mess announcements')
  result = await request('/api/notices', { role: 'Administration', method: 'POST', body: draft })
  assert.equal(result.response.status, 201)
  assert.equal(result.result.recipientCount, 1)
  const noticeId = result.result.notice.id

  const studentNotices = await request('/api/notices')
  assert.ok(studentNotices.result.notices.some((notice) => notice.id === noticeId && notice.category === 'Canteen'))
  assert.ok(studentNotices.result.notices.some((notice) => notice.id === 'mess-legacy-preserve-mess-notice'), 'active historical Mess notices appear in the shared notices feed')
  const staffNotices = await request('/api/notices', { role: 'Staff' })
  assert.equal(staffNotices.result.notices.some((notice) => notice.id === noticeId), false)
  assert.equal(staffNotices.result.notices.some((notice) => notice.id === 'mess-legacy-preserve-mess-notice'), false, 'legacy audience stays student-only')
  const sportsNotices = await request('/api/notices', { role: 'Sports Captain' })
  assert.equal(sportsNotices.result.notices.some((notice) => notice.id === noticeId), false)
  const studentNotifications = await request('/api/notifications')
  assert.ok(studentNotifications.result.notifications.some((notice) =>
    notice.referenceId === noticeId && notice.type === 'CAMPUS_NOTICE' && notice.target === 'notices'))
  const staffNotifications = await request('/api/notifications', { role: 'Staff' })
  assert.equal(staffNotifications.result.notifications.some((notice) => notice.referenceId === noticeId), false)

  result = await request('/api/mess')
  assert.equal(Object.hasOwn(result.result, 'notices'), false, 'College Mess does not duplicate notices')
  result = await request('/api/mess/notices', { role: 'Administration', method: 'POST', body: draft })
  assert.equal(result.response.status, 404, 'legacy Mess-specific notice endpoint is removed')

  const canteenOrders = await request('/api/canteen/orders', { role: 'Canteen Staff' })
  assert.equal(canteenOrders.response.status, 200, 'existing Canteen Staff order access remains available')
})
