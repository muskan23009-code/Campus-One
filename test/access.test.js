import assert from 'node:assert/strict'
import test from 'node:test'
import { APP_ROLES, canSeePage } from '../src/auth/access.js'

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
  assert.equal(canSeePage(staff, 'copilot'), true)
  for (const page of ['users', 'analytics', 'campus-management', 'sports-management']) {
    assert.equal(canSeePage(staff, page), false, `Staff must not access ${page}`)
  }
})

test('sports captain receives sports management but not administration', () => {
  const captain = { id: 'PM-SC01', name: 'Captain Example', role: APP_ROLES.SPORTS, modules: [] }
  assert.equal(canSeePage(captain, 'sports-management'), true)
  assert.equal(canSeePage(captain, 'sports'), true)
  for (const page of ['users', 'analytics', 'campus-management', 'complaints', 'transport']) {
    assert.equal(canSeePage(captain, page), false, `Sports Captain must not access ${page}`)
  }
})

test('HOD receives only the department-scoped review and roster routes', () => {
  const hod = { id: 'PM-HOD001', name: 'HOD Example', role: APP_ROLES.HOD, department: 'Computer Science', modules: [] }
  assert.equal(canSeePage(hod, 'department-requests'), true)
  assert.equal(canSeePage(hod, 'department-students'), true)
  for (const page of ['users', 'campus-management', 'analytics', 'sports-management', 'transport']) {
    assert.equal(canSeePage(hod, page), false, `HOD must not access ${page}`)
  }
})

test('administration receives every management capability', () => {
  const administrator = { id: 'PM-AD01', name: 'Admin Example', role: APP_ROLES.ADMIN, modules: [] }
  for (const page of ['overview', 'users', 'analytics', 'campus-management', 'sports-management', 'complaints', 'transport', 'emergency']) {
    assert.equal(canSeePage(administrator, page), true, `Administration should access ${page}`)
  }
})