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
import {
  getStudentRoom,
  getStudentRoommateNames,
  hostelCollection,
  normalizeHostelResponse,
} from '../src/components/hostelData.js'

const PASSWORD = 'Campus-Hostel-Test-Password-2026!'
const fixtures = [
  { id: 'PM-AD001', role: 'Administration', name: 'Campus Admin', department: '' },
  { id: 'PM-S1001', role: 'Student', name: 'First Student', department: 'Computer Science' },
  { id: 'PM-S1002', role: 'Student', name: 'Second Student', department: 'Civil Engineering' },
  { id: 'PM-ST001', role: 'Staff', name: 'Campus Staff', department: 'Computer Science' },
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

before(async () => {
  store = createStore(await mkdtemp(join(tmpdir(), 'campus-one-hostel-')))
  const users = await Promise.all(fixtures.map(async ({ id, role, name, department }) => ({
    id, role, name, department, email: `${id.toLowerCase()}@example.test`, active: true,
    modules: [], credentials: await hashPassword(PASSWORD), sessionVersion: 1,
    mustChangePassword: false,
  })))
  await store.write({
    users,
    complaints: [{ id: 'preserve-complaint' }],
    notices: [{ id: 'preserve-notice' }],
    canteenOrders: [{ id: 'preserve-order' }],
    sportsRegistrations: [{ id: 'preserve-sports-registration' }],
    campus: { food: [{ id: 'preserve-food' }] },
    notifications: [],
  })
  server = createServer(createCampusApp({ store, sessionSecret: randomBytes(32) }))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
  for (const { id, role } of fixtures) {
    const result = await request('/api/auth/login', { method: 'POST', body: { userId: id, role, password: PASSWORD } })
    assert.equal(result.response.status, 200, `${role} uses existing Campus One login`)
    cookies.set(id, result.response.headers.get('set-cookie').split(';', 1)[0])
  }
})

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
  await store?.clear()
})

test('Hostel frontend normalizes role-specific API collection shapes safely', () => {
  const emptyStudent = normalizeHostelResponse({
    currentAllotment: null,
    allotments: null,
    roommates: undefined,
    maintenance: null,
    hostelDetails: null,
  }, false)
  assert.deepEqual(emptyStudent.allotments, [])
  assert.deepEqual(emptyStudent.roommates, [])
  assert.deepEqual(emptyStudent.maintenance, [])
  assert.equal(emptyStudent.hostelDetails, null)

  const studentDetails = { studentId: 'PM-S1001', hostelName: 'B1', roomNumber: '204' }
  const student = normalizeHostelResponse({ hostelDetails: studentDetails }, false)
  assert.equal(student.hostelDetails, studentDetails, 'the student API object remains a singular details record')
  assert.deepEqual(hostelCollection(student.hostelDetails), [], 'singular student detail is not treated as an admin collection')
  assert.deepEqual(hostelCollection({ data: [] }), [], 'unexpected object response is not filtered')

  const administrator = normalizeHostelResponse({
    rooms: null,
    allotments: [{ id: 'allotment-1' }],
    residents: undefined,
    hostelDetails: [studentDetails],
    maintenance: {},
    students: [{ id: 'PM-S1001' }],
  }, true)
  assert.deepEqual(administrator.rooms, [])
  assert.deepEqual(administrator.allotments, [{ id: 'allotment-1' }])
  assert.deepEqual(administrator.residents, [])
  assert.deepEqual(administrator.hostelDetails, [studentDetails])
  assert.deepEqual(administrator.maintenance, [])
  assert.deepEqual(administrator.students, [{ id: 'PM-S1001' }])
})

test('student room and roommate views include submitted details without replacing confirmed allotments', () => {
  const submittedDetails = {
    hostelName: 'B1',
    roomNumber: '204',
    floor: '2',
    roommateNames: ['Rahul', 'Aman', ' rahul '],
  }
  assert.equal(getStudentRoom(null, submittedDetails), submittedDetails)
  assert.equal(getStudentRoom(null, { hostelName: 'B1', roomNumber: '' }), null)
  const confirmed = { hostelName: 'G1', block: 'C', roomNumber: '101', status: 'ALLOTTED' }
  assert.equal(getStudentRoom(confirmed, submittedDetails), confirmed, 'Administration allotment remains authoritative')
  assert.deepEqual(
    getStudentRoommateNames([{ name: 'Aman' }, { name: 'Rohit' }], submittedDetails),
    ['Aman', 'Rohit', 'Rahul'],
    'resident and student-entered names are shown once each',
  )
  assert.deepEqual(getStudentRoommateNames(null, null), [])
})

test('Hostel APIs require an existing session and students only see their own allotment and requests', async () => {
  let result = await request('/api/hostel')
  assert.equal(result.response.status, 401)

  result = await request('/api/hostel', { cookie: cookies.get('PM-S1001') })
  assert.equal(result.response.status, 200, 'the student dashboard route is registered')
  assert.equal(result.result.currentAllotment, null)
  assert.deepEqual(result.result.allotments, [])
  assert.deepEqual(result.result.roommates, [])
  assert.deepEqual(result.result.maintenance, [])

  result = await request('/api/hostel', { cookie: cookies.get('PM-AD001') })
  assert.equal(result.response.status, 200, 'the management dashboard route is registered')
  assert.deepEqual(result.result.rooms, [])
  assert.deepEqual(result.result.allotments, [])
  assert.deepEqual(result.result.residents, [])
  assert.deepEqual(result.result.maintenance, [])
  assert.deepEqual(result.result.students, fixtures.filter(({ role }) => role === 'Student').map(({ id, name, department }) => ({ id, name, department })))

  result = await request('/api/hostel/rooms', {
    cookie: cookies.get('PM-AD001'),
    method: 'POST',
    body: { hostelName: 'Maple House', block: 'B', floor: '2', roomNumber: '204', capacity: 2 },
  })
  assert.equal(result.response.status, 201)
  const firstRoomId = result.result.room.id

  result = await request('/api/hostel/rooms', {
    cookie: cookies.get('PM-AD001'),
    method: 'POST',
    body: { hostelName: 'Maple House', block: 'B', floor: '2', roomNumber: '205', capacity: 2 },
  })
  assert.equal(result.response.status, 201)
  const secondRoomId = result.result.room.id

  for (const studentId of ['PM-S1001', 'PM-S1002']) {
    result = await request('/api/hostel/allotments', {
      cookie: cookies.get('PM-AD001'),
      method: 'POST',
      body: { studentId, roomId: firstRoomId },
    })
    assert.equal(result.response.status, 201)
  }

  result = await request('/api/hostel', { cookie: cookies.get('PM-S1001') })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.currentAllotment.roomNumber, '204')
  assert.deepEqual(result.result.roommates, [{ name: 'Second Student' }])
  assert.equal(Object.hasOwn(result.result, 'residents'), false)
  assert.equal(Object.hasOwn(result.result, 'students'), false)
  assert.equal(JSON.stringify(result.result).includes('PM-S1002'), false)
  assert.equal(JSON.stringify(result.result).includes('bedNumber'), false)
  assert.equal(JSON.stringify(result.result).includes('seatNumber'), false)

  result = await request('/api/hostel/allotments', {
    cookie: cookies.get('PM-AD001'),
    method: 'POST',
    body: { studentId: 'PM-S1002', roomId: secondRoomId },
  })
  assert.equal(result.response.status, 201)

  result = await request('/api/hostel', { cookie: cookies.get('PM-S1002') })
  assert.equal(result.result.currentAllotment.roomNumber, '205')
  assert.equal(result.result.allotments.length, 2, 'students can see their own allotment history')
  assert.equal(result.result.allotments.some((entry) => entry.status === 'TRANSFERRED'), true)

  const invalidRoom = await request('/api/hostel/rooms', {
    cookie: cookies.get('PM-AD001'),
    method: 'POST',
    body: { hostelName: 'Maple House', block: 'B', floor: '2', roomNumber: '206', capacity: 2, bedNumber: 'A', seatNumber: '1' },
  })
  assert.equal(invalidRoom.response.status, 400, 'bed assignment fields are rejected')

  const rooms = await store.read()
  assert.equal(rooms.hostelRooms.some((room) => Object.hasOwn(room, 'bedNumber') || Object.hasOwn(room, 'seatNumber')), false)
  assert.equal(rooms.hostelAllotments.some((allotment) => Object.hasOwn(allotment, 'bedNumber') || Object.hasOwn(allotment, 'seatNumber')), false)
})

test('students submit and track their own maintenance; only Administration can manage hostel operations', async () => {
  const staffView = await request('/api/hostel', { cookie: cookies.get('PM-ST001') })
  assert.equal(staffView.response.status, 403)

  let result = await request('/api/hostel/maintenance', {
    cookie: cookies.get('PM-S1001'),
    method: 'POST',
    body: { category: 'Electrical', description: 'The room light is not working.' },
  })
  assert.equal(result.response.status, 201)
  const requestId = result.result.request.id
  assert.equal(result.result.request.status, 'SUBMITTED')

  let otherStudent = await request('/api/hostel', { cookie: cookies.get('PM-S1002') })
  assert.equal(otherStudent.result.maintenance.some((entry) => entry.id === requestId), false)

  result = await request(`/api/hostel/maintenance/${requestId}`, {
    cookie: cookies.get('PM-S1001'),
    method: 'PATCH',
    body: { status: 'RESOLVED' },
  })
  assert.equal(result.response.status, 403)

  result = await request('/api/hostel/rooms', {
    cookie: cookies.get('PM-ST001'),
    method: 'POST',
    body: { hostelName: 'Unauthorized House', block: 'A', floor: '1', roomNumber: '1', capacity: 2 },
  })
  assert.equal(result.response.status, 403)

  result = await request('/api/hostel', { cookie: cookies.get('PM-AD001') })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.maintenance.find((entry) => entry.id === requestId).studentName, 'First Student')
  assert.equal(result.result.residents.length, 2)

  result = await request(`/api/hostel/maintenance/${requestId}`, {
    cookie: cookies.get('PM-AD001'),
    method: 'PATCH',
    body: { status: 'IN_PROGRESS' },
  })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.request.status, 'IN_PROGRESS')

  result = await request('/api/hostel', { cookie: cookies.get('PM-S1001') })
  assert.equal(result.result.maintenance.find((entry) => entry.id === requestId).status, 'IN_PROGRESS')

  const data = await store.read()
  assert.equal(data.complaints[0].id, 'preserve-complaint')
  assert.equal(data.notices[0].id, 'preserve-notice')
  assert.equal(data.canteenOrders[0].id, 'preserve-order')
  assert.equal(data.sportsRegistrations[0].id, 'preserve-sports-registration')
  assert.equal(data.campus.food[0].id, 'preserve-food')
})

test('students create and edit one Hostel details record; Administration can view and manage submissions', async () => {
  const studentCookie = cookies.get('PM-S1001')
  let result = await request('/api/hostel', { cookie: studentCookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.hostelDetails, null, 'new student has no submitted details')

  const details = {
    hostelName: 'B1',
    roomNumber: 'A-204',
    floor: '2',
    roomType: 'Double',
    wardenName: 'Warden Example',
    wardenContact: '+91 9876543210',
    additionalInformation: 'Near the east staircase.',
    studentId: 'PM-S1002',
    studentName: 'Injected Student Name',
  }
  result = await request('/api/hostel/details', { cookie: studentCookie, method: 'POST', body: details })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.hostelDetails.studentId, 'PM-S1001', 'identity comes from the signed-in session')
  assert.equal(result.result.hostelDetails.hostelName, 'B1')
  assert.equal(result.result.hostelDetails.roomType, 'Double')
  assert.ok(result.result.hostelDetails.createdAt)
  assert.ok(result.result.hostelDetails.updatedAt)
  assert.equal(Object.hasOwn(result.result.hostelDetails, 'studentName'), false)
  assert.equal(Object.hasOwn(result.result.hostelDetails, 'bedNumber'), false)
  assert.equal(Object.hasOwn(result.result.hostelDetails, 'seatNumber'), false)
  assert.equal(Object.hasOwn(result.result.hostelDetails, 'facilities'), false)
  const createdAt = result.result.hostelDetails.createdAt

  const update = { ...details, roomNumber: 'A-205', floor: '3', roomType: 'Shared' }
  result = await request('/api/hostel/details', { cookie: studentCookie, method: 'POST', body: update })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.hostelDetails.roomNumber, 'A-205')
  assert.equal(result.result.hostelDetails.roomType, 'Shared')
  assert.equal(result.result.hostelDetails.createdAt, createdAt, 'editing keeps the record creation date')
  let stored = await store.read()
  assert.equal(stored.hostelDetails.filter((entry) => entry.studentId === 'PM-S1001').length, 1, 'editing updates the same student record')

  for (const hostelName of ['B2', 'B3', 'B4', 'G1']) {
    result = await request('/api/hostel/details', {
      cookie: studentCookie,
      method: 'POST',
      body: { ...update, hostelName },
    })
    assert.equal(result.response.status, 200, `${hostelName} is accepted`)
  }
  result = await request('/api/hostel/details', {
    cookie: studentCookie,
    method: 'POST',
    body: { ...update, roomType: 'Quad' },
  })
  assert.equal(result.response.status, 400, 'unlisted room types are rejected')
  for (const hostelName of ['B5', 'G3', 'b1', '']) {
    result = await request('/api/hostel/details', {
      cookie: studentCookie,
      method: 'POST',
      body: { ...update, hostelName },
    })
    assert.equal(result.response.status, 400, `${hostelName || 'empty'} hostel name is rejected`)
  }
  for (const extraField of [{ facilities: 'Laundry' }, { bedNumber: 'A' }, { seatNumber: '1' }]) {
    result = await request('/api/hostel/details', {
      cookie: studentCookie,
      method: 'POST',
      body: { ...update, ...extraField },
    })
    assert.equal(result.response.status, 400, 'excluded room details are rejected')
  }

  result = await request('/api/hostel', { cookie: cookies.get('PM-S1002') })
  assert.equal(result.result.hostelDetails, null, 'students cannot view another student’s details')

  result = await request('/api/hostel', { cookie: cookies.get('PM-AD001') })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.hostelDetails.length, 1)
  assert.equal(result.result.hostelDetails[0].studentName, 'First Student')
  assert.equal(result.result.hostelDetails[0].roomNumber, 'A-205')

  result = await request('/api/hostel/details/PM-S1001', {
    cookie: cookies.get('PM-AD001'),
    method: 'PATCH',
    body: { ...update, hostelName: 'G2', roomNumber: 'G-101' },
  })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.hostelDetails.studentName, 'First Student')
  assert.equal(result.result.hostelDetails.hostelName, 'G2')
  stored = await store.read()
  assert.equal(stored.hostelDetails.filter((entry) => entry.studentId === 'PM-S1001').length, 1, 'Administration edits do not create duplicate records')
})

test('Hostel details store cooling and roommate names with room-type limits and update in place', async () => {
  const cookie = cookies.get('PM-S1002')
  const baseDetails = {
    hostelName: 'B1',
    roomNumber: '105',
    floor: '1',
    wardenName: '',
    wardenContact: '',
    additionalInformation: '',
  }
  const exactExample = {
    ...baseDetails,
    roomType: '4 Sharing',
    roomCooling: 'Non-AC',
    roommateNames: ['abcde'],
  }
  let result = await request('/api/hostel/details', {
    cookie,
    method: 'POST',
    body: exactExample,
  })
  assert.equal(result.response.status, 200, 'the exact values shown in the form are accepted')
  assert.equal(result.result.hostelDetails.hostelName, 'B1')
  assert.equal(result.result.hostelDetails.roomNumber, '105')
  assert.equal(result.result.hostelDetails.floor, '1')
  assert.equal(result.result.hostelDetails.roomType, '4 Sharing')
  assert.equal(result.result.hostelDetails.roomCooling, 'Non-AC')
  assert.deepEqual(result.result.hostelDetails.roommateNames, ['abcde'])

  result = await request('/api/hostel', { cookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.hostelDetails.roomType, '4 Sharing')
  assert.equal(result.result.hostelDetails.roomNumber, '105', 'saved details remain available after fetching again')
  assert.deepEqual(result.result.hostelDetails.roommateNames, ['abcde'])

  result = await request('/api/hostel/details', {
    cookie,
    method: 'POST',
    body: { ...exactExample, roomNumber: 105, floor: 1 },
  })
  assert.equal(result.response.status, 200, 'numeric room and floor values normalize to strings')
  assert.equal(result.result.hostelDetails.roomNumber, '105')
  assert.equal(result.result.hostelDetails.floor, '1')

  const roommateCounts = [
    ['Single', 0],
    ['Double', 1],
    ['Triple', 2],
    ['4 Sharing', 3],
    ['Shared', 4],
  ]
  let createdAt

  for (const [roomType, count] of roommateCounts) {
    const roommateNames = Array.from({ length: count }, (_, index) => `Roommate ${index + 1}`)
    result = await request('/api/hostel/details', {
      cookie,
      method: 'POST',
      body: { ...baseDetails, hostelName: 'G2', roomType, roomCooling: count % 2 ? 'AC' : 'Non-AC', roommateNames },
    })
    assert.equal(result.response.status, 200, `${roomType} accepts ${count} roommates`)
    assert.equal(result.result.hostelDetails.roomType, roomType)
    assert.equal(result.result.hostelDetails.roomCooling, count % 2 ? 'AC' : 'Non-AC')
    assert.deepEqual(result.result.hostelDetails.roommateNames, roommateNames)
    createdAt ??= result.result.hostelDetails.createdAt
  }

  const invalidCounts = [
    ['Single', ['One']],
    ['Double', ['One', 'Two']],
    ['Triple', ['One', 'Two', 'Three']],
    ['4 Sharing', ['One', 'Two', 'Three', 'Four']],
    ['Shared', Array.from({ length: 21 }, (_, index) => `Roommate ${index + 1}`)],
  ]
  for (const [roomType, roommateNames] of invalidCounts) {
    result = await request('/api/hostel/details', {
      cookie,
      method: 'POST',
      body: { ...baseDetails, roomType, roomCooling: 'AC', roommateNames },
    })
    assert.equal(result.response.status, 400, `${roomType} rejects too many roommates`)
  }

  result = await request('/api/hostel/details', {
    cookie,
    method: 'POST',
    body: { ...baseDetails, roomType: 'Double', roomCooling: 'Non-AC', roommateNames: ['Edited Roommate'] },
  })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.hostelDetails.createdAt, createdAt, 'edits keep the original details record')
  assert.equal(result.result.hostelDetails.roomCooling, 'Non-AC')
  assert.deepEqual(result.result.hostelDetails.roommateNames, ['Edited Roommate'])

  result = await request('/api/hostel', { cookie })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.hostelDetails.roomCooling, 'Non-AC')
  assert.deepEqual(result.result.hostelDetails.roommateNames, ['Edited Roommate'])

  result = await request('/api/hostel', { cookie: cookies.get('PM-AD001') })
  assert.equal(result.response.status, 200)
  const adminDetails = result.result.hostelDetails.find((entry) => entry.studentId === 'PM-S1002')
  assert.equal(adminDetails.roomCooling, 'Non-AC')
  assert.deepEqual(adminDetails.roommateNames, ['Edited Roommate'])

  result = await request('/api/hostel/details/PM-S1002', {
    cookie: cookies.get('PM-AD001'),
    method: 'PATCH',
    body: { ...baseDetails, roomType: 'Double', roomCooling: 'AC', roommateNames: ['Admin edited roommate'] },
  })
  assert.equal(result.response.status, 200)
  assert.equal(result.result.hostelDetails.roomCooling, 'AC')
  assert.deepEqual(result.result.hostelDetails.roommateNames, ['Admin edited roommate'])

  const stored = await store.read()
  assert.equal(stored.hostelDetails.filter((entry) => entry.studentId === 'PM-S1002').length, 1, 'repeat submissions update the existing record')

  result = await request('/api/hostel/details', {
    cookie,
    method: 'POST',
    body: { ...baseDetails, roomType: 'Shared', roomCooling: 'Window AC', roommateNames: ['Roommate'] },
  })
  assert.equal(result.response.status, 400, 'unlisted cooling values are rejected')

  result = await request('/api/hostel/details', {
    cookie,
    method: 'POST',
    body: { ...baseDetails, hostelName: 'B9', roomType: 'Double', roommateNames: ['Roommate'] },
  })
  assert.equal(result.response.status, 400)
  assert.match(result.result.error, /Hostel Name/, 'invalid hostel names identify the invalid field')

  result = await request('/api/hostel/details', {
    cookie,
    method: 'POST',
    body: { ...baseDetails, roomType: 'Double', roomNumber: '', roommateNames: ['Roommate'] },
  })
  assert.equal(result.response.status, 400)
  assert.match(result.result.error, /Room Number/, 'invalid room numbers identify the invalid field')
})
