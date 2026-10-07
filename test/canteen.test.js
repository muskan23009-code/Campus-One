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
import { CANTEEN_CATEGORIES, INITIAL_CANTEEN_MENU } from '../server/policy.js'

const ADMIN_CODE = 'canteen-admin-code'
const PASSWORD = 'Campus-Canteen-Password-2026!'
let server
let store
let baseUrl
let adminCookie
let staffCookie
let studentCookie
let staffId

async function request(path, { cookie, ...options } = {}) {
  const headers = new Headers(options.headers || {})
  if (cookie) headers.set('Cookie', cookie)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, {
    ...options, headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  let result = {}
  try { result = await response.json() } catch {}
  return { response, result, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] }
}

before(async () => {
  store = createStore(await mkdtemp(join(tmpdir(), 'campus-one-canteen-')))
  server = createServer(createCampusApp({ store, sessionSecret: randomBytes(32), adminAccessCode: ADMIN_CODE }))
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

test('Canteen Staff uses Administration approval, unique ID, password setup, and restricted APIs', async () => {
  let result = await request('/api/registrations', {
    method: 'POST',
    body: {
      role: 'Administration', name: 'Canteen Administrator', gender: 'Prefer not to say',
      mobile: '9876543200', email: 'admin-canteen@example.test', designation: 'Administrator',
      password: PASSWORD, accessCode: ADMIN_CODE,
    },
  })
  assert.equal(result.response.status, 201)
  adminCookie = result.cookie

  result = await request('/api/registrations', {
    method: 'POST',
    body: {
      role: 'Canteen Staff', name: 'Canteen Operator', gender: 'Female',
      mobile: '9876543201', email: 'canteen-staff@example.test',
    },
  })
  assert.equal(result.response.status, 201)
  const application = result.result.application
  const requestToken = result.result.requestToken
  assert.equal(application.status, 'Pending')
  assert.equal(application.assignedUserId, '')
  let database = await store.read()
  assert.equal(database.users.some((user) => user.role === 'Canteen Staff'), false)
  assert.ok(database.notifications.some((notification) => notification.recipientUserId === 'PM-AD001' && notification.referenceId === application.id))

  result = await request('/api/admin/requests', { cookie: adminCookie })
  assert.ok(result.result.requests.some((requestEntry) => requestEntry.id === application.id && requestEntry.role === 'Canteen Staff'))
  result = await request(`/api/admin/requests/${application.id}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'Accepted' } })
  assert.equal(result.response.status, 200)
  staffId = result.result.userId
  assert.equal(staffId, 'PM-CS001')
  database = await store.read()
  assert.equal(database.users.find((user) => user.id === staffId).active, false)
  assert.equal(database.users.find((user) => user.id === staffId).credentials, null)
  result = await request('/api/registrations/password', {
    method: 'POST',
    body: { requestId: application.id, requestToken, password: PASSWORD, confirmPassword: PASSWORD },
  })
  assert.equal(result.response.status, 200)
  result = await request('/api/auth/login', { method: 'POST', body: { userId: staffId, role: 'Canteen Staff', password: PASSWORD } })
  assert.equal(result.response.status, 200)
  staffCookie = result.cookie
  assert.deepEqual(result.result.modules, ['canteen'])
  assert.equal(result.result.user.active, true)
  const adminMe = await request('/api/auth/me', { cookie: adminCookie })
  assert.ok(adminMe.result.modules.includes('canteen'))
  assert.ok(adminMe.result.modules.includes('users'))

  for (const path of ['/api/users', '/api/complaints', '/api/lost-found', '/api/sports', '/api/food/orders', '/api/notices', '/api/notices/options', '/api/campus/notices']) {
    const blocked = await request(path, { cookie: staffCookie })
    assert.equal(blocked.response.status, 403, `Canteen Staff cannot access ${path}`)
  }
  const bootstrap = await request('/api/auth/me', { cookie: staffCookie })
  assert.deepEqual(bootstrap.result.modules, ['canteen'])
  result = await request('/api/canteen/menu', { cookie: staffCookie })
  assert.equal(result.response.status, 403, 'Canteen Staff has order-only Canteen API access')
  result = await request('/api/canteen/menu', { cookie: staffCookie, method: 'POST', body: { name: 'Restricted', price: 1 } })
  assert.equal(result.response.status, 403, 'Canteen Staff cannot create menu items')
  result = await request('/api/canteen/menu/menu-item', { cookie: staffCookie, method: 'PATCH', body: { name: 'Restricted', price: 1 } })
  assert.equal(result.response.status, 403, 'Canteen Staff cannot edit menu items')
  result = await request('/api/canteen/orders', { cookie: staffCookie })
  assert.equal(result.response.status, 200, 'Canteen Staff can view incoming orders')
})

test('verified menu browsing, half/full variants, order lifecycle, and notifications persist', async () => {
  const studentHash = await hashPassword(PASSWORD)
  await store.transact((data) => data.users.push({
    id: 'PM-S1001', name: 'Canteen Student', role: 'Student', email: 'student-canteen@example.test',
    active: true, modules: [], credentials: studentHash, sessionVersion: 1, mustChangePassword: false,
  }))
  let result = await request('/api/auth/login', { method: 'POST', body: { userId: 'PM-S1001', role: 'Student', password: PASSWORD } })
  assert.equal(result.response.status, 200)
  studentCookie = result.cookie

  const menu = await request('/api/canteen/menu', { cookie: studentCookie })
  assert.equal(menu.response.status, 200)
  assert.equal(menu.result.items.length, INITIAL_CANTEEN_MENU.length)
  assert.deepEqual(menu.result.categories, CANTEEN_CATEGORIES)
  assert.ok(menu.result.items.some((item) => item.name === 'Red Sauce Pasta' && item.size === 'Half' && item.price === 120))
  assert.ok(menu.result.items.some((item) => item.name === 'Red Sauce Pasta' && item.size === 'Full' && item.price === 200))
  const tea = menu.result.items.find((item) => item.name === 'Milk Tea')
  const halfPasta = menu.result.items.find((item) => item.name === 'Red Sauce Pasta' && item.size === 'Half')
  assert.equal(tea.price, 20)
  result = await request('/api/canteen/menu', { cookie: studentCookie, method: 'POST', body: { name: 'Injected', diet: 'Veg', category: 'Tea & Coffee', price: 1 } })
  assert.equal(result.response.status, 403)
  result = await request(`/api/canteen/menu/${tea.id}`, { cookie: studentCookie, method: 'PATCH', body: { ...tea, price: 1 } })
  assert.equal(result.response.status, 403)
  result = await request('/api/canteen/orders', { cookie: studentCookie, method: 'POST', body: { items: [{ itemId: 'unavailable-item', quantity: 1, size: '' }] } })
  assert.equal(result.response.status, 400, 'unknown food cannot be ordered')

  result = await request('/api/canteen/orders', { cookie: studentCookie, method: 'POST', body: { items: [
    { itemId: tea.id, quantity: 2, size: '', price: tea.price },
    { itemId: halfPasta.id, quantity: 1, size: 'Half', price: halfPasta.price },
  ] } })
  assert.equal(result.response.status, 201)
  let order = result.result.order
  assert.equal(order.orderNumber, 'ORD-000001')
  assert.equal(order.items[0].price, 20)
  assert.equal(order.items[0].quantity, 2)
  assert.equal(order.items[1].size, 'Half')
  assert.equal(order.items[1].price, 120)
  assert.equal(order.total, 160)
  result = await request(`/api/canteen/orders/${order.id}`, { cookie: studentCookie, method: 'PATCH', body: { status: 'COMPLETED' } })
  assert.equal(result.response.status, 403)

  for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']) {
    result = await request(`/api/canteen/orders/${order.id}`, { cookie: staffCookie, method: 'PATCH', body: { status } })
    assert.equal(result.response.status, 200)
    order = result.result.order
    assert.equal(order.status, status)
  }
  assert.deepEqual(order.history.map((entry) => entry.status), ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'])
  const studentOrders = await request('/api/canteen/orders', { cookie: studentCookie })
  assert.equal(studentOrders.result.orders[0].orderNumber, order.orderNumber)
  assert.ok((await request('/api/notifications', { cookie: studentCookie })).result.notifications.some((entry) => entry.title === 'Canteen order completed'))
  assert.ok((await request('/api/notifications', { cookie: staffCookie })).result.notifications.some((entry) => entry.title === 'New Canteen pre-order'))
  assert.equal((await store.read()).canteenOrders[0].total, 160)

  const rejectedOrder = await request('/api/canteen/orders', { cookie: studentCookie, method: 'POST', body: { items: [{ itemId: tea.id, quantity: 1, size: '', price: tea.price }] } })
  const rejected = await request(`/api/canteen/orders/${rejectedOrder.result.order.id}`, { cookie: staffCookie, method: 'PATCH', body: { status: 'REJECTED' } })
  assert.equal(rejected.response.status, 200)
  assert.equal(rejected.result.order.status, 'REJECTED')
  assert.ok((await request('/api/notifications', { cookie: studentCookie })).result.notifications.some((entry) => entry.title === 'Canteen order rejected'))
})

test('all five customer roles can order privately and only Canteen Staff manage orders', async () => {
  const denied = await request('/api/admin/requests', { cookie: staffCookie })
  assert.equal(denied.response.status, 403)
  const accounts = await request('/api/users', { cookie: adminCookie })
  assert.equal(accounts.response.status, 200)
  assert.ok(accounts.result.users.some((user) => user.id === staffId))
  const menu = await request('/api/canteen/menu', { cookie: adminCookie })
  assert.equal(menu.response.status, 200)
  const item = menu.result.items.find((entry) => entry.name === 'Milk Tea')
  const deniedEdit = await request(`/api/canteen/menu/${item.id}`, { cookie: adminCookie, method: 'PATCH', body: { ...item, price: 25 } })
  assert.equal(deniedEdit.response.status, 403)
  const deniedAdd = await request('/api/canteen/menu', { cookie: adminCookie, method: 'POST', body: { name: 'Admin-only item', diet: 'Veg', category: 'Tea & Coffee', price: 1 } })
  assert.equal(deniedAdd.response.status, 403)

  const passwordHash = await hashPassword(PASSWORD)
  const addedUsers = [
    { id: 'PM-ST001', name: 'Canteen Staff Customer', role: 'Staff' },
    { id: 'PM-HOD001', name: 'Canteen HOD Customer', role: 'HOD' },
    { id: 'PM-SC001', name: 'Canteen Captain Customer', role: 'Sports Captain' },
  ]
  await store.transact((data) => data.users.push(...addedUsers.map((user) => ({
    ...user, email: `${user.id.toLowerCase()}@example.test`, active: true, modules: [],
    credentials: passwordHash, sessionVersion: 1, mustChangePassword: false,
  }))))
  const roleCookies = new Map([['Student', studentCookie], ['Administration', adminCookie]])
  for (const user of addedUsers) {
    const loggedIn = await request('/api/auth/login', { method: 'POST', body: { userId: user.id, role: user.role, password: PASSWORD } })
    assert.equal(loggedIn.response.status, 200)
    roleCookies.set(user.role, loggedIn.cookie)
  }
  assert.ok((await request('/api/auth/me', { cookie: roleCookies.get('Sports Captain') })).result.modules.includes('copilot'))
  assert.ok((await request('/api/auth/me', { cookie: roleCookies.get('Sports Captain') })).result.modules.includes('sports-management'))

  const customerOrderIds = new Map()
  for (const role of ['Student', 'Staff', 'HOD', 'Sports Captain', 'Administration']) {
    const placed = await request('/api/canteen/orders', {
      cookie: roleCookies.get(role), method: 'POST',
      body: { items: [{ itemId: item.id, quantity: 1, size: '', price: item.price }] },
    })
    assert.equal(placed.response.status, 201, `${role} can place a pre-order`)
    assert.equal(placed.result.order.customerRole, role)
    assert.equal(placed.result.order.customerUserId, role === 'Student' ? 'PM-S1001' : role === 'Administration' ? 'PM-AD001' : addedUsers.find((user) => user.role === role).id)
    customerOrderIds.set(role, placed.result.order.id)
  }

  for (const role of ['Student', 'Staff', 'HOD', 'Sports Captain', 'Administration']) {
    const own = await request('/api/canteen/orders', { cookie: roleCookies.get(role) })
    const expectedCustomerId = role === 'Student' ? 'PM-S1001' : role === 'Administration' ? 'PM-AD001' : addedUsers.find((user) => user.role === role).id
    assert.ok(own.result.orders.some((order) => order.id === customerOrderIds.get(role)), `${role} can see their new order`)
    assert.ok(own.result.orders.every((order) => order.customerUserId === expectedCustomerId), `${role} can see only their own orders`)
    const deniedStatusChange = await request(`/api/canteen/orders/${customerOrderIds.get(role)}`, {
      cookie: roleCookies.get(role), method: 'PATCH', body: { status: 'COMPLETED' },
    })
    assert.equal(deniedStatusChange.response.status, 403, `${role} cannot change order status`)
  }
  const staffOrders = await request('/api/canteen/orders', { cookie: staffCookie })
  assert.equal(staffOrders.result.orders.length, 7, 'Canteen Staff can see all customer orders and history')
  const pending = staffOrders.result.orders.find((order) => order.id === customerOrderIds.get('Administration'))
  const accepted = await request(`/api/canteen/orders/${pending.id}`, { cookie: staffCookie, method: 'PATCH', body: { status: 'ACCEPTED' } })
  assert.equal(accepted.response.status, 200)
  assert.ok((await request('/api/notifications', { cookie: staffCookie })).result.notifications.some((entry) => entry.referenceId === pending.id))
})
