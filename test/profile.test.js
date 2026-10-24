import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createCampusApp } from '../server/app.js'
import { hashPassword, signSession, verifyPassword, verifySession } from '../server/auth.js'
import { createStore } from '../server/store.js'

const PASSWORD = 'Current-Campus-Password-2026!'
const NEXT_PASSWORD = 'New-Campus-Password-2026!'
const ROLES = ['Student', 'Staff', 'HOD', 'Sports Captain', 'Administration', 'Canteen Staff']
const USERS = [
  { id: 'PM-S1001', name: 'Student One', role: 'Student', rollNumber: 'CS-1001', department: 'Computer Science', course: 'B.Tech', semester: 'Semester 4', admissionYear: '2023', profilePhoto: 'data:image/png;base64,AAAA' },
  { id: 'PM-S1002', name: 'Student Two', role: 'Student', rollNumber: 'CE-2001', department: 'Civil Engineering' },
  { id: 'PM-ST001', name: 'Staff One', role: 'Staff', department: 'Computer Science', designation: 'Instructor', joiningYear: 2020 },
  { id: 'PM-HOD001', name: 'HOD One', role: 'HOD', department: 'Computer Science', designation: 'Head of Department' },
  { id: 'PM-SC001', name: 'Captain One', role: 'Sports Captain', department: 'Computer Science', sport: 'Football', teamCategory: 'Intercollegiate' },
  { id: 'PM-AD001', name: 'Admin One', role: 'Administration', designation: 'Administrator' },
  { id: 'PM-CS001', name: 'Canteen One', role: 'Canteen Staff', designation: 'Canteen Staff' },
].map((user) => ({
  ...user,
  email: `${user.id.toLowerCase()}@example.test`,
  mobile: '9876543210',
  active: true,
  sessionVersion: 1,
  mustChangePassword: false,
  createdAt: '2024-01-15T00:00:00.000Z',
  modules: [],
}))

let server
let store
let baseUrl
let sessionSecret
let credentials

async function request(path, { user = USERS[0], cookie, anonymous = false, ...options } = {}) {
  const headers = new Headers(options.headers || {})
  if (cookie) headers.set('Cookie', cookie)
  else if (!anonymous) headers.set('Cookie', `campus_session=${signSession(user, sessionSecret)}`)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, {
    ...options, headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  let result = {}
  try { result = await response.json() } catch {}
  return {
    response,
    result,
    cookie: response.headers.get('set-cookie')?.split(';', 1)[0],
    setCookie: response.headers.get('set-cookie') || '',
  }
}

before(async () => {
  store = createStore(await mkdtemp(join(tmpdir(), 'campus-one-profile-')))
  sessionSecret = randomBytes(32)
  credentials = await hashPassword(PASSWORD)
  await store.transact((data) => {
    data.users = USERS.map((user) => ({ ...user, credentials }))
  })
  server = createServer(createCampusApp({ store, sessionSecret }))
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

test('current-user profile is available to every role and never returns credentials', async () => {
  const unauthenticated = await request('/api/auth/me', { anonymous: true })
  assert.equal(unauthenticated.response.status, 401)
  const unauthenticatedProfile = await request('/api/auth/profile', { anonymous: true })
  assert.equal(unauthenticatedProfile.response.status, 401)

  for (const role of ROLES) {
    const user = USERS.find((entry) => entry.role === role)
    const result = await request('/api/auth/profile', { user })
    assert.equal(result.response.status, 200, `${role} can load their own profile`)
    assert.equal(result.result.user.id, user.id)
    assert.equal(result.result.user.role, role)
    assert.equal(result.result.user.name, user.name)
    assert.equal(result.result.user.profilePhoto, user.profilePhoto)
    assert.equal(Object.hasOwn(result.result.user, 'credentials'), false)
    assert.equal(Object.hasOwn(result.result.user, 'password'), false)
    const serialized = JSON.stringify(result.result)
    assert.equal(serialized.includes('credentials'), false)
    assert.equal(serialized.includes(credentials.hash), false)
    assert.equal(serialized.includes(PASSWORD), false)
    assert.equal(serialized.includes('sessionVersion'), false)
    const sessionPreference = await request('/api/auth/session-preference', { user })
    assert.equal(sessionPreference.response.status, 200)
    assert.equal(sessionPreference.result.enabled, false)
  }
})

test('profile requests are session-bound and protected account fields cannot be updated', async () => {
  const own = await request('/api/auth/profile?id=PM-S1002', { user: USERS[0] })
  assert.equal(own.result.user.id, USERS[0].id)
  assert.equal(own.result.user.name, USERS[0].name)

  const denied = await request('/api/auth/profile', {
    user: USERS[0],
    method: 'PATCH',
    body: { mobile: '9876543211', id: USERS[1].id, role: 'Administration', department: 'Civil Engineering' },
  })
  assert.equal(denied.response.status, 400)
  const database = await store.read()
  const unchanged = database.users.find((user) => user.id === USERS[0].id)
  assert.equal(unchanged.mobile, '9876543210')
  assert.equal(unchanged.role, 'Student')
  assert.equal(unchanged.department, 'Computer Science')

  const badPhone = await request('/api/auth/profile', {
    user: USERS[0],
    method: 'PATCH',
    body: { mobile: 'not-a-phone' },
  })
  assert.equal(badPhone.response.status, 400)

  const saved = await request('/api/auth/profile', {
    user: USERS[0],
    method: 'PATCH',
    body: { mobile: '+1 (555) 234-6789', profilePhoto: 'data:image/png;base64,AAAA' },
  })
  assert.equal(saved.response.status, 200)
  assert.equal(saved.result.user.id, USERS[0].id)
  assert.equal(saved.result.user.mobile, '+1 (555) 234-6789')
  assert.equal(saved.result.user.profilePhoto, 'data:image/png;base64,AAAA')
  assert.equal(JSON.stringify(saved.result).includes(credentials.hash), false)
})

test('password changes validate current password and confirmation, then rotate the session safely', async () => {
  const user = USERS[0]
  let result = await request('/api/auth/password', {
    user,
    method: 'POST',
    body: { currentPassword: '', newPassword: NEXT_PASSWORD, confirmNewPassword: NEXT_PASSWORD },
  })
  assert.equal(result.response.status, 400)

  result = await request('/api/auth/password', {
    user,
    method: 'POST',
    body: { currentPassword: 'wrong-current-password', newPassword: NEXT_PASSWORD, confirmNewPassword: NEXT_PASSWORD },
  })
  assert.equal(result.response.status, 400)
  assert.equal(result.result.error, 'Your current password is incorrect.')

  result = await request('/api/auth/password', {
    user,
    method: 'POST',
    body: { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD, confirmNewPassword: 'a-different-confirmation' },
  })
  assert.equal(result.response.status, 400)
  assert.equal(result.result.error, 'Your new passwords do not match.')

  result = await request('/api/auth/password', {
    user,
    method: 'POST',
    body: { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD, confirmNewPassword: NEXT_PASSWORD },
  })
  assert.equal(result.response.status, 200)
  assert.ok(result.cookie, 'the current session is rotated and returned')
  assert.equal(JSON.stringify(result.result).includes(credentials.hash), false)
  assert.equal(JSON.stringify(result.result).includes(NEXT_PASSWORD), false)
  assert.equal(await verifyPassword(PASSWORD, (await store.read()).users.find((entry) => entry.id === user.id).credentials), false)
  assert.equal(await verifyPassword(NEXT_PASSWORD, (await store.read()).users.find((entry) => entry.id === user.id).credentials), true)

  const restored = await request('/api/auth/me', { user, cookie: result.cookie })
  assert.equal(restored.response.status, 200)
  assert.equal(restored.result.user.id, user.id)
  const previousSession = await request('/api/auth/me', { user })
  assert.equal(previousSession.response.status, 401)
})

test('existing sign-in continues to use the existing account and password hash', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: USERS[1].id, role: USERS[1].role, password: PASSWORD }),
  })
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(result.user.id, USERS[1].id)
  assert.equal(JSON.stringify(result).includes(credentials.hash), false)
  const loginCookie = response.headers.get('set-cookie') || ''
  assert.match(loginCookie, /HttpOnly/)
  assert.match(loginCookie, /Max-Age=28800/)
})

test('remembered login is a persistent HttpOnly session, can be disabled, and is revoked by sign out', async () => {
  const user = USERS.find((entry) => entry.role === 'HOD')
  const stranger = USERS[1]
  const originalCredentials = (await store.read()).users.find((entry) => entry.id === user.id).credentials

  const invalid = await request('/api/auth/session-preference', { user, method: 'POST', body: { enabled: true, userId: stranger.id } })
  assert.equal(invalid.response.status, 400)

  const enabled = await request('/api/auth/session-preference', { user, method: 'POST', body: { enabled: true } })
  assert.equal(enabled.response.status, 200)
  assert.deepEqual(enabled.result, { enabled: true })
  assert.match(enabled.setCookie, /HttpOnly/)
  assert.match(enabled.setCookie, /SameSite=Strict/)
  assert.match(enabled.setCookie, /Max-Age=2592000/)
  assert.equal(JSON.stringify(enabled.result).includes(enabled.cookie.split('=')[1]), false)
  const rememberedClaims = verifySession(enabled.cookie.slice('campus_session='.length), sessionSecret)
  assert.equal(rememberedClaims.sub, user.id)
  assert.equal(rememberedClaims.remember, true)
  assert.ok(rememberedClaims.exp - Math.floor(Date.now() / 1000) > 29 * 24 * 60 * 60)
  let storedUser = (await store.read()).users.find((entry) => entry.id === user.id)
  assert.equal(storedUser.sessionVersion, user.sessionVersion)
  assert.deepEqual(storedUser.credentials, originalCredentials)
  assert.equal(Object.hasOwn(storedUser, 'rememberedLogin'), false)

  const remembered = await request('/api/auth/session-preference', { user, cookie: enabled.cookie })
  assert.equal(remembered.response.status, 200)
  assert.equal(remembered.result.enabled, true)

  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  server = createServer(createCampusApp({ store, sessionSecret }))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`

  const restoredAfterRestart = await request('/api/auth/me', { user, cookie: enabled.cookie })
  assert.equal(restoredAfterRestart.response.status, 200)
  assert.equal(restoredAfterRestart.result.user.id, user.id)

  const otherDevice = await request('/api/auth/session-preference', { user })
  assert.equal(otherDevice.result.enabled, false)
  const otherAccount = await request('/api/auth/session-preference', { user: stranger })
  assert.equal(otherAccount.result.enabled, false)

  const disabled = await request('/api/auth/session-preference', {
    user,
    cookie: enabled.cookie,
    method: 'POST',
    body: { enabled: false },
  })
  assert.equal(disabled.response.status, 200)
  assert.deepEqual(disabled.result, { enabled: false })
  assert.match(disabled.setCookie, /Max-Age=28800/)
  const normalClaims = verifySession(disabled.cookie.slice('campus_session='.length), sessionSecret)
  assert.equal(normalClaims.sub, user.id)
  assert.equal(normalClaims.remember, false)
  assert.equal((await request('/api/auth/session-preference', { user, cookie: disabled.cookie })).result.enabled, false)
  storedUser = (await store.read()).users.find((entry) => entry.id === user.id)
  assert.deepEqual(storedUser.credentials, originalCredentials)
  assert.equal(JSON.stringify(disabled.result).includes(PASSWORD), false)
  assert.equal(JSON.stringify(disabled.result).includes(credentials.hash), false)

  const rememberedAgain = await request('/api/auth/session-preference', {
    user,
    cookie: disabled.cookie,
    method: 'POST',
    body: { enabled: true },
  })
  assert.equal(rememberedAgain.response.status, 200)
  assert.match(rememberedAgain.setCookie, /Max-Age=2592000/)
  const logout = await request('/api/auth/logout', { user, cookie: rememberedAgain.cookie, method: 'POST' })
  assert.equal(logout.response.status, 200)
  assert.match(logout.setCookie, /Max-Age=0/)
  const revoked = await request('/api/auth/me', { user, cookie: rememberedAgain.cookie })
  assert.equal(revoked.response.status, 401)
  const noSession = await request('/api/auth/session-preference', { anonymous: true })
  assert.equal(noSession.response.status, 401)
})
