import assert from 'node:assert/strict'
import test from 'node:test'
import { APP_ROLES, ROLE_START_PAGES, canSeePage } from '../src/auth/access.js'
import { navigationGroups } from '../src/data/campusData.js'

test('Complaint & Issue Tracker stays available to existing roles and not Canteen Staff', () => {
  const complaintItems = navigationGroups.flatMap((group) => group.items).filter((item) => item.id === 'complaints')
  assert.deepEqual(complaintItems.map(({ label, icon }) => ({ label, icon })), [
    { label: 'Complaint & Issue Tracker', icon: 'MessageSquareWarning' },
  ])

  for (const role of Object.values(APP_ROLES).filter((value) => value !== APP_ROLES.CANTEEN)) {
    assert.equal(canSeePage({ id: 'test-user', name: 'Test User', role, modules: [] }, 'complaints'), true, `${role} should see the tracker`)
  }
})

test('Lost & Found is a dedicated main section visible to all five roles', () => {
  const item = navigationGroups.flatMap((group) => group.items).find((entry) => entry.id === 'lost-found')
  assert.deepEqual({ label: item.label, icon: item.icon }, { label: 'Lost & Found', icon: 'PackageSearch' })
  for (const role of Object.values(APP_ROLES).filter((value) => value !== APP_ROLES.CANTEEN)) {
    assert.equal(canSeePage({ id: 'test-user', name: 'Test User', role, department: 'Computer Science', modules: [] }, 'lost-found'), true, `${role} should see Lost & Found`)
  }
})

test('student routes exclude every management page', () => {
  const student = { id: 'PM-S1047', name: 'Student Example', role: APP_ROLES.STUDENT, modules: [] }
  for (const page of ['overview', 'copilot', 'notices', 'food', 'navigation', 'directory', 'complaints', 'sports', 'events', 'library', 'hostel', 'transport', 'lost-found', 'emergency']) {
    assert.equal(canSeePage(student, page), true, `Student should be able to access ${page}`)
  }
  for (const page of ['analytics', 'users', 'campus-management', 'sports-management']) {
    assert.equal(canSeePage(student, page), false, `Student must not access ${page}`)
  }
})

test('staff only receive assigned modules and no administration controls', () => {
  const staff = { id: 'PM-ST12', name: 'Staff Example', role: APP_ROLES.STAFF, modules: ['copilot'] }
  assert.equal(canSeePage(staff, 'complaints'), true)
  assert.equal(canSeePage(staff, 'lost-found'), true)
  assert.equal(canSeePage(staff, 'canteen'), true)
  assert.equal(canSeePage(staff, 'sports'), true)
  assert.equal(canSeePage(staff, 'copilot'), true)
  for (const page of ['users', 'analytics', 'campus-management', 'sports-management']) {
    assert.equal(canSeePage(staff, page), false, `Staff must not access ${page}`)
  }
  assert.equal(canSeePage({ ...staff, modules: ['sports-management'] }, 'sports-management'), false, 'custom modules cannot grant Sports Management to Staff')
})

test('sports captain receives complaint management and sports tools but not administration', () => {
  const captain = { id: 'PM-SC01', name: 'Captain Example', role: APP_ROLES.SPORTS, modules: [] }
  assert.equal(ROLE_START_PAGES[APP_ROLES.SPORTS], 'overview', 'Sports Captain starts in the normal Student dashboard')
  assert.equal(canSeePage(captain, 'sports-management'), true)
  assert.equal(canSeePage(captain, 'sports'), true)
  assert.equal(canSeePage(captain, 'complaints'), true)
  assert.equal(canSeePage(captain, 'lost-found'), true)
  for (const page of ['canteen', 'copilot', 'library', 'hostel', 'transport', 'directory', 'emergency']) {
    assert.equal(canSeePage(captain, page), true, `Sports Captain should have student access to ${page}`)
  }
  for (const page of ['users', 'analytics', 'campus-management']) {
    assert.equal(canSeePage(captain, page), false, `Sports Captain must not access ${page}`)
  }
})

test('HOD receives only the department-scoped review and roster routes', () => {
  const hod = { id: 'PM-HOD001', name: 'HOD Example', role: APP_ROLES.HOD, department: 'Computer Science', modules: [] }
  assert.equal(canSeePage(hod, 'department-requests'), true)
  assert.equal(canSeePage(hod, 'department-students'), true)
  assert.equal(canSeePage(hod, 'complaints'), true)
  assert.equal(canSeePage(hod, 'lost-found'), true)
  assert.equal(canSeePage(hod, 'canteen'), true)
  assert.equal(canSeePage(hod, 'sports'), true)
  for (const page of ['users', 'campus-management', 'analytics', 'sports-management']) {
    assert.equal(canSeePage(hod, page), false, `HOD must not access ${page}`)
  }
})

test('Administration can open Canteen as a customer, without staff controls', () => {
  const administrator = { id: 'PM-AD01', name: 'Admin Example', role: APP_ROLES.ADMIN, modules: [] }
  assert.equal(canSeePage(administrator, 'canteen'), true)
})

test('administration receives every management capability', () => {
  const administrator = { id: 'PM-AD01', name: 'Admin Example', role: APP_ROLES.ADMIN, modules: [] }
  for (const page of ['overview', 'users', 'analytics', 'campus-management', 'sports-management', 'complaints', 'transport', 'emergency', 'canteen']) {
    assert.equal(canSeePage(administrator, page), true, `Administration should access ${page}`)
  }
  assert.equal(canSeePage(administrator, 'lost-found'), true)
})

test('Canteen Staff can access only the Canteen dashboard', () => {
  const canteenStaff = { id: 'PM-CS001', name: 'Canteen Staff', role: APP_ROLES.CANTEEN, modules: ['overview', 'complaints'] }
  assert.equal(canSeePage(canteenStaff, 'canteen'), true)
  for (const page of ['overview', 'profile', 'copilot', 'food', 'complaints', 'lost-found', 'sports-management', 'analytics', 'users', 'campus-management']) {
    assert.equal(canSeePage(canteenStaff, page), false, `Canteen Staff must not access ${page}`)
  }
})