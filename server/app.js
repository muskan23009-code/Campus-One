import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { basename, extname, resolve } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import {
  clearSessionCookie, hashPassword, normalizeUserId, publicUser,
  sessionCookie, signSession, validatePassword, verifyPassword,
  verifySession,
} from './auth.js'
import {
  CANTEEN_CATEGORIES, CANTEEN_CONTACT, CANTEEN_MENU, DEFAULT_CAMPUS_DATA,
  DEFAULT_CANTEEN_CATALOG, DEFAULT_SPORTS_DATA, DEPARTMENTS,
  EMERGENCY_CONTACT_CATEGORIES, EMERGENCY_CONTACT_CATEGORY_VALUES,
  INITIAL_CANTEEN_MENU, LEGACY_DEPARTMENTS, MANAGEMENT_COLLECTIONS,
  ROLE_VALUES, ROLES, STAFF_MODULES, STUDENT_MODULES, USER_ID_FORMATS,
  canAccess, modulesForUser,
} from './policy.js'
import {
  ALL_DEPARTMENTS, SPORTS_DEPARTMENTS, SPORTS_EVENT_CAPACITY_STATUSES, SPORTS_EVENT_PUBLISHED_STATUSES,
  SPORTS_EVENT_REGISTRATION_STATUSES, SPORTS_EVENT_STATUSES, SPORTS_EVENT_VISIBLE_STATUSES,
  SPORTS_EVENT_REGISTRATION_STATUS, SPORTS_EVENT_STATUS,
  formatSportsTime, isNormalizedSportsTime, normalizeSportsDepartment,
  normalizeSportsEventContract, normalizeSportsEventStatus, normalizeSportsTime,
} from '../shared/sports-time.js'

const BODY_LIMIT = 2_000_000
const PHOTO_LIMIT = 1_400_000
const COMPLAINT_PHOTO_BYTES_LIMIT = 1_000_000
const COMPLAINT_CATEGORIES = Object.freeze([
  'Cleanliness', 'Electrical', 'Water', 'Hostel', 'Classroom', 'Canteen/Mess',
  'Sports', 'Transport', 'Infrastructure', 'Security', 'IT/Technical', 'Other',
])
const COMPLAINT_STATUSES = Object.freeze(['SUBMITTED', 'ACCEPTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'])
const MESS_MEALS = Object.freeze(['Breakfast', 'Brunch', 'Lunch', 'Dinner'])
const LOST_FOUND_CATEGORIES = Object.freeze([
  'ID Card', 'Mobile/Device', 'Books/Notes', 'Wallet/Bag', 'Keys', 'Clothing',
  'Accessories', 'Sports Equipment', 'Other',
])
const LOST_FOUND_TYPES = Object.freeze(['LOST', 'FOUND'])
const LOST_FOUND_STATUSES = Object.freeze([
  'LOST', 'FOUND', 'MATCHED', 'CLAIM_REQUESTED', 'CLAIM_VERIFIED', 'RETURNED', 'CLOSED',
])
const LOST_FOUND_PHOTO_BYTES_LIMIT = 1_000_000
const HOSTEL_MAINTENANCE_CATEGORIES = Object.freeze(['Electrical', 'Plumbing', 'Furniture', 'Other'])
const HOSTEL_MAINTENANCE_STATUSES = Object.freeze(['SUBMITTED', 'IN_PROGRESS', 'RESOLVED'])
const HOSTEL_NAMES = Object.freeze(['B1', 'B2', 'B3', 'B4', 'G1', 'G2'])
const HOSTEL_ROOM_TYPES = Object.freeze(['Single', 'Double', 'Triple', '4 Sharing', 'Shared'])
const HOSTEL_ROOMMATE_LIMITS = Object.freeze({ Single: 0, Double: 1, Triple: 2, '4 Sharing': 3, Shared: 20 })
const HOSTEL_ROOM_COOLING_OPTIONS = Object.freeze(['AC', 'Non-AC'])
const PASSWORD_ATTEMPT_LIMIT = 10
const PASSWORD_ATTEMPT_WINDOW = 15 * 60 * 1000
const CAMPUS_MODULES = {
  notices: 'notices', food: 'food', events: 'events',
  directory: 'directory', emergency: 'emergency',
}
const DUMMY_CREDENTIALS = await hashPassword(randomUUID())
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
}

export function createCampusApp({ store, sessionSecret, staticDirectory, viteMiddleware, adminAccessCode = process.env.CAMPUS_ADMIN_ACCESS_CODE }) {
  const loginAttempts = new Map()
  const adminCodeAttempts = new Map()

  function json(response, status, body, headers = {}) {
    response.writeHead(status, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...headers,
    })
    response.end(JSON.stringify(body))
  }

  function reject(response, status, message) {
    json(response, status, { error: message })
  }

  function secureRequest(request) {
    return request.socket.encrypted === true || request.headers['x-forwarded-proto'] === 'https'
  }

  function cookieValue(request, name) {
    const cookieHeader = request.headers.cookie || ''
    const part = cookieHeader.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))
    return part ? part.slice(name.length + 1) : ''
  }

  function safeDecodeURIComponent(value) {
    if (typeof value !== 'string') return ''
    try { return decodeURIComponent(value) } catch { return '' }
  }

  async function body(request) {
    let size = 0
    const chunks = []
    for await (const chunk of request) {
      size += chunk.length
      if (size > BODY_LIMIT) throw Object.assign(new Error('Request is too large.'), { status: 413 })
      chunks.push(chunk)
    }
    if (!size) return {}
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.')
      return value
    } catch {
      throw Object.assign(new Error('Invalid JSON request.'), { status: 400 })
    }
  }

  function sameOrigin(request) {
    const origin = request.headers.origin
    if (!origin) return true
    try { return new URL(origin).host.toLowerCase() === String(request.headers.host || '').toLowerCase() } catch { return false }
  }

  function userIdForRole(role, data) {
    const format = USER_ID_FORMATS[role]
    if (!format) throw Object.assign(new Error('Select a valid user role.'), { status: 400 })
    data.idCounters ??= {}
    data.issuedUserIds ??= []
    let sequence = Math.max(format.start, Number(data.idCounters[role]) || format.start)
    const permanentlyUsed = new Set([...data.issuedUserIds, ...data.users.map((user) => user.id)])
    while (permanentlyUsed.has(`${format.prefix}${String(sequence).padStart(format.width, '0')}`)) sequence += 1
    const id = `${format.prefix}${String(sequence).padStart(format.width, '0')}`
    data.idCounters[role] = sequence + 1
    data.issuedUserIds.push(id)
    return id
  }

  function validUserDetails(input) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
    if (name.length < 2 || name.length > 100) throw Object.assign(new Error('Enter a name between 2 and 100 characters.'), { status: 400 })
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 })
    return { name, email }
  }

  function validateRegistration(input) {
    if (input.employeeId !== undefined || input.userId !== undefined || input.id !== undefined) {
      throw Object.assign(new Error('Employee IDs and user IDs are assigned by campus administration.'), { status: 400 })
    }
    if (!ROLE_VALUES.includes(input.role)) throw Object.assign(new Error('Choose a valid campus role.'), { status: 400 })
    const { name, email } = validUserDetails(input)
    if (!email) throw Object.assign(new Error('Enter your college or official email address.'), { status: 400 })
    const gender = safeText(input.gender, 32)
    if (!['Female', 'Male', 'Non-binary', 'Prefer not to say'].includes(gender)) throw Object.assign(new Error('Select a valid gender option.'), { status: 400 })
    const mobile = safeText(input.mobile, 24)
    if (!/^\+?[\d\s().-]{7,20}$/.test(mobile)) throw Object.assign(new Error('Enter a valid mobile number.'), { status: 400 })
    const profilePhoto = validatePhoto(input.profilePhoto)
    const fields = { name, email, gender, mobile, profilePhoto }

    if (input.role === ROLES.STUDENT) {
      const dateOfBirth = safeText(input.dateOfBirth, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(Date.parse(`${dateOfBirth}T00:00:00Z`))) {
        throw Object.assign(new Error('Enter your date of birth.'), { status: 400 })
      }
      const rollNumber = safeText(input.rollNumber, 64)
      const course = safeText(input.course, 100)
      const department = safeText(input.department, 100)
      const semester = safeText(input.semester, 40)
      const admissionYear = validYear(input.admissionYear, 'admission year')
      if (!rollNumber || !course || !semester || !validDepartment(department)) throw Object.assign(new Error('Complete your enrollment, course, department, and semester details.'), { status: 400 })
      Object.assign(fields, { dateOfBirth, rollNumber, course, department, semester, admissionYear })
    } else if ([ROLES.STAFF, ROLES.HOD].includes(input.role)) {
      const department = safeText(input.department, 100)
      const designation = safeText(input.designation, 100)
      const joiningYear = validYear(input.joiningYear, 'joining year')
      if (!validDepartment(department) || !designation) throw Object.assign(new Error('Choose your department and enter your designation.'), { status: 400 })
      Object.assign(fields, { department, designation, joiningYear })
    } else if (input.role === ROLES.CANTEEN) {
      fields.designation = 'Canteen Staff'
    } else if (input.role === ROLES.SPORTS) {
      const department = safeText(input.department, 100)
      const sport = safeText(input.sport, 80)
      const teamCategory = safeText(input.teamCategory, 100)
      if ((department && !validDepartment(department)) || !sport || !teamCategory) throw Object.assign(new Error('Enter your sport and team or category, and choose a valid department if applicable.'), { status: 400 })
      Object.assign(fields, { department, sport, teamCategory })
    } else if (input.role === ROLES.ADMIN) {
      const designation = safeText(input.designation, 100)
      if (!designation) throw Object.assign(new Error('Enter your Administration designation.'), { status: 400 })
      Object.assign(fields, { designation })
    }

    if (input.role === ROLES.ADMIN && !validatePassword(input.password)) throw Object.assign(new Error('Choose a password with at least 12 characters.'), { status: 400 })
    return fields
  }

  function validYear(value, fieldName) {
    const year = Number(value)
    const currentYear = new Date().getFullYear()
    if (!Number.isInteger(year) || year < 1980 || year > currentYear + 1) throw Object.assign(new Error(`Enter a valid ${fieldName}.`), { status: 400 })
    return year
  }

  function validatePhoto(value) {
    if (!value) return ''
    if (typeof value !== 'string' || value.length > PHOTO_LIMIT) throw Object.assign(new Error('Profile photos must be under 1 MB.'), { status: 400 })
    const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/)
    if (!match) throw Object.assign(new Error('Upload a PNG, JPEG, or WebP profile photo.'), { status: 400 })
    const bytes = Buffer.from(match[2], 'base64')
    if (bytes.length > 1_000_000) throw Object.assign(new Error('Profile photos must be under 1 MB.'), { status: 400 })
    return value
  }

  function secretMatches(actual, expected) {
    if (typeof actual !== 'string' || typeof expected !== 'string') return false
    const actualBytes = Buffer.from(actual)
    const expectedBytes = Buffer.from(expected)
    return actualBytes.length === expectedBytes.length && actualBytes.length > 0 && timingSafeEqual(actualBytes, expectedBytes)
  }

  function publicRegistration(application) {
    const { id, role, fields, status, createdAt, reviewedAt, rejectionReason, assignedUserId } = application
    const { profilePhoto, ...visibleFields } = fields
    return { id, role, ...visibleFields, status, createdAt, reviewedAt, rejectionReason, assignedUserId }
  }

  function applicationTokenHash(token, secret) {
    return createHmac('sha256', secret).update(token).digest('hex')
  }

  function createApprovedUser(application, data, { credentials = application.credentials, mustChangePassword = false } = {}) {
  const role = String(application.role || '').trim()
  if (!USER_ID_FORMATS[role]) throw Object.assign(new Error('Select a valid user role.'), { status: 400 })
  const user = {
    ...application.fields,
    id: userIdForRole(role, data),
    role,
    active: Boolean(credentials),
    modules: [],
      credentials,
      sessionVersion: 1,
      mustChangePassword,
      registrationRequestId: application.id,
      createdAt: new Date().toISOString(),
    }
    if (data.users.some((candidate) => candidate.id === user.id || (candidate.email && candidate.email === user.email))) {
      throw Object.assign(new Error('This user ID or email address is already assigned.'), { status: 409 })
    }
    data.users.push(user)
    return user
  }

  function assertRegistrationUnique(data, fields) {
    data.registrationRequests ??= []
    const normalizedEmail = typeof fields.email === 'string' ? fields.email.toLowerCase() : ''
    const normalizedRollNumber = typeof fields.rollNumber === 'string' ? fields.rollNumber.toLowerCase() : ''
    const activeUsers = data.users.filter((user) => user.active !== false)
    const pendingApplications = data.registrationRequests.filter((application) => application.status === 'Pending')

    if (normalizedEmail && (activeUsers.some((user) => (user.email || '').toLowerCase() === normalizedEmail)
      || pendingApplications.some((application) => (application.fields?.email || '').toLowerCase() === normalizedEmail))) {
      throw Object.assign(new Error('An account or application already uses this email address.'), { status: 409 })
    }

    if (normalizedRollNumber && pendingApplications.some((application) => application.role === ROLES.STUDENT && (application.fields?.rollNumber || '').toLowerCase() === normalizedRollNumber)) {
      throw Object.assign(new Error('This roll/enrollment number is already registered or awaiting review.'), { status: 409 })
    }
  }

  function uniqueEmail(users, email, exceptId = '') {
    if (email && users.some((user) => user.id !== exceptId && user.email === email)) {
      throw Object.assign(new Error('That email address is already assigned to another user.'), { status: 409 })
    }
  }

  async function authenticatedUser(request) {
    const token = cookieValue(request, 'campus_session')
    const session = verifySession(token, sessionSecret)
    if (!session) return null
    const data = await store.read()
    const user = data.users.find((candidate) => candidate.id === session.sub && candidate.active && candidate.sessionVersion === session.ver)
    return user || null
  }

  function saveSession(response, user, request) {
    response.setHeader('Set-Cookie', sessionCookie(signSession(user, sessionSecret), secureRequest(request)))
  }

  function addNotification(data, { recipientUserId = '', recipientRequestId = '', title, message, referenceId = '', target = '', type = 'GENERAL' }) {
    data.notifications ??= []
    const notification = {
      id: randomUUID(), recipientUserId, recipientRequestId, title, message,
      referenceId, target, type, readAt: null, createdAt: new Date().toISOString(),
    }
    data.notifications.unshift(notification)
    if (data.notifications.length > 5000) data.notifications.length = 5000
    return notification
  }

  function notifyApprovers(data, role, fields, application) {
    const recipients = role === ROLES.STUDENT
      ? data.users.filter((candidate) => candidate.active && candidate.role === ROLES.HOD && sameDepartment(candidate.department, fields.department))
      : role === ROLES.ADMIN ? [] : data.users.filter((candidate) => candidate.active && candidate.role === ROLES.ADMIN)
    if (!recipients.length) return
    const requestKind = role === ROLES.STUDENT ? 'Student Registration Request' : `${role} Access Request`
    const target = role === ROLES.STUDENT ? 'department-requests' : 'users'
    for (const recipient of recipients) addNotification(data, {
      recipientUserId: recipient.id,
      title: `New ${requestKind}`,
      message: `${fields.name} · ${fields.department || role}`,
      referenceId: application.id,
      target,
    })
  }

  function notifyPendingDepartmentRequests(data, hod) {
    if (hod.role !== ROLES.HOD) return
    for (const application of data.registrationRequests || []) {
      if (application.role !== ROLES.STUDENT || application.status !== 'Pending' || application.fields.department !== hod.department) continue
      const alreadyNotified = (data.notifications || []).some((notification) => notification.recipientUserId === hod.id && notification.referenceId === application.id && notification.title === 'New Student Registration Request')
      if (!alreadyNotified) addNotification(data, {
        recipientUserId: hod.id,
        title: 'New Student Registration Request',
        message: `${application.fields.name} · ${application.fields.department}`,
        referenceId: application.id,
        target: 'department-requests',
      })
    }
  }

  function parseCanteenVariant(inputValue, item) {
    const value = String(inputValue || '').trim().toUpperCase()
    if (value === 'HALF' || value === 'FULL') return value
    if (item?.half_price !== null && item?.half_price !== undefined && item?.full_price !== null && item?.full_price !== undefined) return 'FULL'
    if (item?.half_price !== null && item?.half_price !== undefined) return 'HALF'
    return 'FULL'
  }

  function foodItemPrice(item, variant) {
    const candidate = item || {}
    const normalizedVariant = parseCanteenVariant(variant, candidate)
    if (candidate.price !== null && candidate.price !== undefined && candidate.price !== '') return Number(candidate.price)
    if (normalizedVariant === 'HALF' && candidate.half_price !== null && candidate.half_price !== undefined) return Number(candidate.half_price)
    if (normalizedVariant === 'FULL' && candidate.full_price !== null && candidate.full_price !== undefined) return Number(candidate.full_price)
    if (candidate.full_price !== null && candidate.full_price !== undefined) return Number(candidate.full_price)
    if (candidate.half_price !== null && candidate.half_price !== undefined) return Number(candidate.half_price)
    return Number(candidate.price || 0)
  }

  function activeCanteenItems(data) {
    data.foodItems ??= structuredClone(DEFAULT_CANTEEN_CATALOG)
    return (data.foodItems || []).filter((item) => item.available !== false)
  }

  function publicFoodItem(item) {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      menu_type: item.menu_type,
      price: item.price ?? null,
      half_price: item.half_price ?? null,
      full_price: item.full_price ?? null,
      image: item.image || '',
      available: item.available !== false,
      preparation_time: Number(item.preparation_time || 0),
      created_at: item.created_at || null,
      updated_at: item.updated_at || null,
    }
  }

  function publicCartSummary(cart) {
    const items = cart.items || []
    const subtotal = items.reduce((total, item) => total + Number(item.line_total || 0), 0)
    return {
      id: cart.id,
      user_id: cart.user_id,
      created_at: cart.created_at,
      updated_at: cart.updated_at,
      subtotal,
      total: subtotal,
      item_count: items.reduce((count, item) => count + Number(item.quantity || 0), 0),
      items: items.map((item) => ({
        id: item.id,
        food_item_id: item.food_item_id,
        food_name: item.food_name,
        category: item.category,
        price: item.price,
        variant: item.variant,
        quantity: item.quantity,
        line_total: item.line_total,
      })),
    }
  }

  function addCanteenNotification(data, payload) {
    data.notifications ??= []
    const notification = {
      id: randomUUID(),
      recipientUserId: payload.recipientUserId || '',
      recipientRequestId: payload.recipientRequestId || '',
      title: payload.title,
      message: payload.message,
      referenceId: payload.referenceId || '',
      target: payload.target || 'canteen',
      readAt: null,
      createdAt: new Date().toISOString(),
      type: payload.type || 'canteen',
      orderId: payload.orderId || '',
    }
    data.notifications.unshift(notification)
    return notification
  }

  function canChangeOrderStatus(currentStatus, nextStatus) {
    const allowed = {
      PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
      ACCEPTED: ['PREPARING', 'REJECTED'],
      PREPARING: ['READY'],
      READY: ['COMPLETED'],
      COMPLETED: [],
      REJECTED: [],
      CANCELLED: [],
    }
    return allowed[currentStatus]?.includes(nextStatus) ?? false
  }

  function ensureValidPaymentStatus(value) {
    if (!['PENDING', 'PAYMENT_SUBMITTED', 'PAID', 'PAYMENT_FAILED', 'REFUNDED'].includes(value)) {
      throw Object.assign(new Error('Choose a valid payment status.'), { status: 400 })
    }
  }

  async function handleApi(request, response, pathname, searchParams) {
    if (request.method !== 'GET' && !sameOrigin(request)) return reject(response, 403, 'This request origin is not allowed.')

    if (pathname === '/api/weather' && request.method === 'GET') {
      const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=28.9931&longitude=77.0151&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=Asia%2FKolkata'
      let weatherResponse
      try {
        weatherResponse = await fetch(weatherUrl, { signal: AbortSignal.timeout(10_000) })
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') console.warn('[weather] Open-Meteo request failed:', error.message)
        throw Object.assign(new Error('Current weather is temporarily unavailable.'), { status: 502 })
      }
      if (!weatherResponse.ok) {
        if (process.env.NODE_ENV !== 'production') console.warn(`[weather] Open-Meteo returned HTTP ${weatherResponse.status}.`)
        return reject(response, 502, 'Current weather is temporarily unavailable.')
      }
      let weatherData
      try { weatherData = await weatherResponse.json() } catch {
        if (process.env.NODE_ENV !== 'production') console.warn('[weather] Open-Meteo returned invalid JSON.')
        return reject(response, 502, 'Current weather data could not be read.')
      }
      const temperatureC = weatherData?.current?.temperature_2m
      const weatherCode = weatherData?.current?.weather_code
      if (!Number.isFinite(temperatureC) || !Number.isInteger(weatherCode)) {
        if (process.env.NODE_ENV !== 'production') console.warn('[weather] Open-Meteo response is missing numeric current.temperature_2m or current.weather_code fields.')
        return reject(response, 502, 'Current weather data is unavailable.')
      }
      return json(response, 200, { current: { temperatureC, weatherCode } })
    }

    if (pathname === '/api/auth/bootstrap-status' && request.method === 'GET') {
      const data = await store.read()
      return json(response, 200, {
        setupRequired: !data.users.some((user) => user.role === ROLES.ADMIN && user.active),
        adminAccessConfigured: typeof adminAccessCode === 'string' && adminAccessCode.length >= 5,
        departments: DEPARTMENTS,
      })
    }

    if (pathname === '/api/admin/registration-code/verify' && request.method === 'POST') {
      if (typeof adminAccessCode !== 'string' || adminAccessCode.length < 5) return reject(response, 503, 'Administration registration is not configured on this server.')
      const ip = request.socket.remoteAddress || 'unknown'
      const now = Date.now()
      const attempts = adminCodeAttempts.get(ip)
      if (attempts && attempts.until > now && attempts.count >= 10) return reject(response, 429, 'Too many code attempts. Contact the campus operator.')
      const input = await body(request)
      if (!secretMatches(input.accessCode, adminAccessCode)) {
        adminCodeAttempts.set(ip, { count: attempts?.until > now ? attempts.count + 1 : 1, until: attempts?.until > now ? attempts.until : now + 15 * 60 * 1000 })
        return reject(response, 403, 'Invalid Administration Access Code.')
      }
      adminCodeAttempts.delete(ip)
      return json(response, 200, { valid: true })
    }

    if (pathname === '/api/auth/bootstrap' && request.method === 'POST') {
      return reject(response, 410, 'Register using your Administration Access Code.')
    }

    if (pathname === '/api/registrations' && request.method === 'POST') {
      const input = await body(request)
      const role = input.role
      const fields = validateRegistration(input)
      if (role === ROLES.ADMIN) {
        if (typeof adminAccessCode !== 'string' || adminAccessCode.length < 5) return reject(response, 503, 'Administration registration is not configured. Contact the Campus One administrator.')
        if (!secretMatches(input.accessCode, adminAccessCode)) return reject(response, 403, 'The Administration Access Code is incorrect.')
      }
      const credentials = role === ROLES.ADMIN ? await hashPassword(input.password) : null
      const requestToken = role === ROLES.ADMIN ? '' : randomBytes(32).toString('base64url')
      const result = await store.transact((data) => {
        assertRegistrationUnique(data, fields)
        if (role === ROLES.ADMIN) {
          return { user: createApprovedUser({ role, fields, credentials, id: randomUUID() }, data) }
        }
        data.registrationRequests ??= []
        const application = {
          id: randomUUID(), role, fields, status: 'Pending',
          statusTokenHash: applicationTokenHash(requestToken, sessionSecret),
          assignedUserId: '', createdAt: new Date().toISOString(),
        }
        data.registrationRequests.unshift(application)
        notifyApprovers(data, role, fields, application)
        return { application }
      })
      if (role === ROLES.ADMIN) {
        saveSession(response, result.user, request)
        return json(response, 201, { user: publicUser(result.user) })
      }
      return json(response, 201, { application: publicRegistration(result.application), requestToken })
    }

    if (pathname === '/api/registrations/status' && request.method === 'POST') {
      const input = await body(request)
      const requestId = safeText(input.requestId, 64)
      const token = safeText(input.requestToken, 128)
      if (!requestId || token.length < 32) return reject(response, 400, 'Enter your application reference and status token.')
      const data = await store.read()
      const application = data.registrationRequests.find((candidate) => candidate.id === requestId)
      if (!application || !secretMatches(application.statusTokenHash, applicationTokenHash(token, sessionSecret))) return reject(response, 404, 'Application reference or status token is incorrect.')
      return json(response, 200, {
        application: {
          id: application.id,
          role: application.role,
          status: application.status,
          department: application.fields.department || '',
          submittedAt: application.createdAt,
          reviewedAt: application.reviewedAt || null,
          userId: application.assignedUserId || null,
          passwordSetupAvailable: application.status === 'Approved'
            && Boolean(application.assignedUserId)
            && Boolean(application.statusTokenHash)
            && Date.parse(application.setupTokenExpiresAt || '') > Date.now(),
        },
        notifications: (data.notifications || []).filter((notification) => notification.recipientRequestId === application.id).map(publicNotification),
      })
    }

    if (pathname === '/api/registrations/password' && request.method === 'POST') {
      const input = await body(request)
      const requestId = safeText(input.requestId, 64)
      const token = safeText(input.requestToken, 128)
      if (!requestId || token.length < 32) return reject(response, 400, 'Your application reference and setup token are required.')
      if (!validatePassword(input.password)) return reject(response, 400, 'Choose a password with at least 12 characters.')
      if (input.password !== input.confirmPassword) return reject(response, 400, 'Your passwords do not match.')
      const current = await store.read()
      const application = (current.registrationRequests || []).find((candidate) => candidate.id === requestId)
      const currentUser = application?.assignedUserId
        ? current.users.find((candidate) => candidate.id === application.assignedUserId && candidate.registrationRequestId === application.id)
        : null
      if (!application
        || application.status !== 'Approved'
        || !application.statusTokenHash
        || !secretMatches(application.statusTokenHash, applicationTokenHash(token, sessionSecret))) {
        return reject(response, 404, 'This approved account setup could not be verified.')
      }
      if (!Number.isFinite(Date.parse(application.setupTokenExpiresAt || '')) || Date.parse(application.setupTokenExpiresAt) <= Date.now()) {
        return reject(response, 410, 'This password setup link has expired. Contact campus administration for assistance.')
      }
      if (!currentUser || currentUser.active || currentUser.credentials) return reject(response, 409, 'This account has already completed password setup or is unavailable.')
      const credentials = await hashPassword(input.password)
      const setup = await store.transact((data) => {
        const application = (data.registrationRequests || []).find((candidate) => candidate.id === requestId)
        const now = Date.now()
        if (!application
          || application.status !== 'Approved'
          || !application.assignedUserId
          || !application.statusTokenHash
          || !secretMatches(application.statusTokenHash, applicationTokenHash(token, sessionSecret))) {
          throw Object.assign(new Error('This approved account setup could not be verified.'), { status: 404 })
        }
        if (!Number.isFinite(Date.parse(application.setupTokenExpiresAt || '')) || Date.parse(application.setupTokenExpiresAt) <= now) {
          throw Object.assign(new Error('This password setup link has expired. Contact campus administration for assistance.'), { status: 410 })
        }
        const user = data.users.find((candidate) => candidate.id === application.assignedUserId && candidate.registrationRequestId === application.id)
        if (!user || user.active || user.credentials) throw Object.assign(new Error('This account has already completed password setup or is unavailable.'), { status: 409 })
        user.credentials = credentials
        user.active = true
        user.mustChangePassword = false
        user.sessionVersion += 1
        user.passwordSetupCompletedAt = new Date().toISOString()
        application.statusTokenHash = null
        application.setupTokenExpiresAt = null
        return { userId: user.id, role: user.role }
      })
      return json(response, 200, { passwordCreated: true, ...setup })
    }

    if (pathname === '/api/registrations/notifications/read' && request.method === 'POST') {
      const input = await body(request)
      const requestId = safeText(input.requestId, 64)
      const token = safeText(input.requestToken, 128)
      const notificationId = safeText(input.notificationId, 64)
      const result = await store.transact((data) => {
        const application = data.registrationRequests.find((candidate) => candidate.id === requestId)
        if (!application || !secretMatches(application.statusTokenHash, applicationTokenHash(token, sessionSecret))) throw Object.assign(new Error('Application reference or status token is incorrect.'), { status: 404 })
        const now = new Date().toISOString()
        let markedRead = 0
        for (const notification of data.notifications || []) {
          if (notification.recipientRequestId === application.id && (!notificationId || notification.id === notificationId) && !notification.readAt) { notification.readAt = now; markedRead += 1 }
        }
        return markedRead
      })
      return json(response, 200, { markedRead: result })
    }

    const hodQueue = pathname.match(/^\/api\/hod\/(requests|students)(?:\/([^/]+))?$/)
    if (hodQueue) {
      const user = await authenticatedUser(request)
      if (!user) return reject(response, 401, 'Sign in to continue.')
      if (user.role !== ROLES.HOD || !user.department) return reject(response, 403, 'Department HOD access is required.')
      const data = await store.read()
      if (hodQueue[1] === 'students' && request.method === 'GET' && !hodQueue[2]) {
        const students = data.users.filter((candidate) => candidate.active && candidate.role === ROLES.STUDENT && sameDepartment(candidate.department, user.department))
        return json(response, 200, { department: user.department, students: students.map((student) => publicUser(student)) })
      }
      if (hodQueue[1] === 'requests' && request.method === 'GET' && !hodQueue[2]) {
        const requests = data.registrationRequests.filter((application) => application.role === ROLES.STUDENT && application.status === 'Pending' && sameDepartment(application.fields.department, user.department))
        return json(response, 200, { department: user.department, requests: requests.map(publicRegistration) })
      }
      if (hodQueue[1] === 'requests' && hodQueue[2] && request.method === 'GET') {
        const application = data.registrationRequests.find((candidate) => candidate.id === safeDecodeURIComponent(hodQueue[2]) && candidate.role === ROLES.STUDENT && sameDepartment(candidate.fields.department, user.department))
        if (!application) return reject(response, 404, 'This student request is not in your department.')
        return json(response, 200, { request: publicRegistration(application) })
      }
      if (hodQueue[1] === 'requests' && hodQueue[2] && request.method === 'PATCH') {
        const input = await body(request)
        if (!['Accepted', 'Rejected'].includes(input.status)) return reject(response, 400, 'Choose Accept or Reject.')
        const result = await store.transact(async (current) => {
          const application = current.registrationRequests.find((candidate) => candidate.id === safeDecodeURIComponent(hodQueue[2]))
          if (!application || application.role !== ROLES.STUDENT || !sameDepartment(application.fields.department, user.department)) throw Object.assign(new Error('This student request is not in your department.'), { status: 404 })
          if (application.status !== 'Pending') throw Object.assign(new Error('This request has already been reviewed.'), { status: 409 })
          application.status = input.status === 'Accepted' ? 'Approved' : 'Rejected'
          application.reviewedAt = new Date().toISOString()
          if (input.status === 'Accepted') {
            const student = createApprovedUser(application, current, { credentials: null })
            application.assignedUserId = student.id
            application.credentials = null
            application.setupTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            addNotification(current, {
              recipientUserId: student.id,
              recipientRequestId: application.id,
              title: 'Student registration approved',
              message: `Your request has been approved. Your Student ID is ${student.id}. Create your password from your application status page within seven days.`,
              referenceId: application.id,
              target: 'login',
            })
            return { application: publicRegistration(application), userId: student.id }
          }
          application.credentials = null
          application.setupTokenExpiresAt = null
          addNotification(current, {
            recipientRequestId: application.id,
            title: 'Student registration rejected',
            message: 'Your department HOD reviewed your registration request. Contact your department for next steps.',
            referenceId: application.id,
            target: 'login',
          })
          return { application: publicRegistration(application), userId: null }
        })
        return json(response, 200, {
          application: {
            ...result.application,
            userId: result.userId,
            passwordSetupAvailable: Boolean(result.userId),
          },
          userId: result.userId,
        })
      }
      return reject(response, 404, 'Department route not found.')
    }

    if (pathname === '/api/admin/requests' && request.method === 'GET') {
      const user = await authenticatedUser(request)
      if (!user) return reject(response, 401, 'Sign in to continue.')
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required.')
      const data = await store.read()
      const requests = data.registrationRequests.filter((application) => [ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.CANTEEN].includes(application.role))
      return json(response, 200, { requests: requests.map(publicRegistration) })
    }

    const adminRequest = pathname.match(/^\/api\/admin\/requests\/([^/]+)$/)
    if (adminRequest && request.method === 'PATCH') {
      const user = await authenticatedUser(request)
      if (!user) return reject(response, 401, 'Sign in to continue.')
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required.')
      const input = await body(request)
      if (!['Accepted', 'Rejected'].includes(input.status)) return reject(response, 400, 'Choose Allow/Accept or Reject.')
      const result = await store.transact(async (data) => {
        const application = data.registrationRequests.find((candidate) => candidate.id === safeDecodeURIComponent(adminRequest[1]))
        if (!application || ![ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.CANTEEN].includes(application.role)) throw Object.assign(new Error('This Administration request was not found.'), { status: 404 })
        if (application.status !== 'Pending') throw Object.assign(new Error('This request has already been reviewed.'), { status: 409 })
        application.status = input.status === 'Accepted' ? 'Approved' : 'Rejected'
        application.reviewedAt = new Date().toISOString()
        if (input.status === 'Accepted') {
          const approved = createApprovedUser(application, data, { credentials: null })
          application.assignedUserId = approved.id
          application.credentials = null
          application.setupTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          notifyPendingDepartmentRequests(data, approved)
          addNotification(data, {
            recipientUserId: approved.id,
            recipientRequestId: application.id,
            title: `${application.role} access approved`,
            message: `Your request has been approved. Your User ID is ${approved.id}. Create your password from your application status page within seven days.`,
            referenceId: application.id,
            target: 'login',
          })
          return { request: publicRegistration(application), userId: approved.id }
        }
        application.credentials = null
        application.setupTokenExpiresAt = null
        addNotification(data, {
          recipientRequestId: application.id,
          title: `${application.role} access rejected`,
          message: 'Administration reviewed your access request. Contact the campus office for next steps.',
          referenceId: application.id,
          target: 'login',
        })
        return { request: publicRegistration(application), userId: null }
      })
      return json(response, 200, {
        request: {
          ...result.request,
          userId: result.userId,
          passwordSetupAvailable: Boolean(result.userId),
        },
        userId: result.userId,
      })
    }

    if (pathname === '/api/auth/login' && request.method === 'POST') {
      const ip = request.socket.remoteAddress || 'unknown'
      const now = Date.now()
      const input = await body(request)
      const id = normalizeUserId(input.userId)
      const attemptKey = `${ip}:${id.slice(0, 32) || 'unknown'}`
      if (loginAttempts.size > 1000) {
        for (const [key, attempts] of loginAttempts) if (attempts.until <= now) loginAttempts.delete(key)
        if (loginAttempts.size > 1000) loginAttempts.delete(loginAttempts.keys().next().value)
      }
      const attempts = loginAttempts.get(attemptKey)
      if (attempts && attempts.until > now && attempts.count >= PASSWORD_ATTEMPT_LIMIT) return reject(response, 429, 'Too many sign-in attempts. Please try again in 15 minutes.')
      const data = await store.read()
      const candidate = data.users.find((user) => user.id === id)
      const passwordMatches = await verifyPassword(input.password, candidate?.credentials || DUMMY_CREDENTIALS)
      if (!candidate || !candidate.active || !passwordMatches || !ROLE_VALUES.includes(input.role) || candidate.role !== input.role) {
        const previous = loginAttempts.get(attemptKey)
        loginAttempts.set(attemptKey, { count: previous?.until > now ? previous.count + 1 : 1, until: previous?.until > now ? previous.until : now + PASSWORD_ATTEMPT_WINDOW })
        return reject(response, 401, 'Invalid User ID or password.')
      }
      loginAttempts.delete(attemptKey)
      saveSession(response, candidate, request)
      return json(response, 200, { user: publicUser(candidate), modules: modulesForUser(candidate) })
    }

    const user = await authenticatedUser(request)
    if (!user) return reject(response, 401, 'Sign in to continue.')
    if (user.role === ROLES.CANTEEN && !(
      pathname === '/api/canteen/orders' && request.method === 'GET'
      || /^\/api\/canteen\/orders\/[^/]+$/.test(pathname) && request.method === 'PATCH'
      || pathname === '/api/auth/me' && request.method === 'GET'
      || pathname === '/api/auth/password' && request.method === 'POST'
      || pathname === '/api/auth/logout' && request.method === 'POST'
      || pathname === '/api/notifications' && request.method === 'GET'
      || pathname === '/api/notifications/read-all' && request.method === 'POST'
      || /^\/api\/notifications\/[^/]+$/.test(pathname) && request.method === 'PATCH'
    )) return reject(response, 403, 'Canteen Staff can only access Canteen services.')
    if (user.mustChangePassword && !(
      (pathname === '/api/auth/me' && request.method === 'GET')
      || (pathname === '/api/auth/password' && request.method === 'POST')
      || (pathname === '/api/auth/logout' && request.method === 'POST')
    )) return reject(response, 403, 'Change your temporary password before continuing.')

    if (pathname === '/api/notifications' && request.method === 'GET') {
      const data = await store.transact((current) => {
        initializeCampusNotices(current)
        deliverDueNoticeNotifications(current)
        return current
      })
      const notifications = (data.notifications || [])
        .filter((notification) => notification.recipientUserId === user.id && (user.role !== ROLES.CANTEEN || notification.target === 'canteen'))
        .slice(0, 100)
      return json(response, 200, { notifications: notifications.map(publicNotification), unreadCount: notifications.filter((notification) => !notification.readAt).length })
    }

    if (pathname === '/api/notifications/read-all' && request.method === 'POST') {
      const now = new Date().toISOString()
      const updated = await store.transact((data) => {
        let count = 0
        for (const notification of data.notifications || []) {
          if (notification.recipientUserId === user.id && (user.role !== ROLES.CANTEEN || notification.target === 'canteen') && !notification.readAt) { notification.readAt = now; count += 1 }
        }
        return count
      })
      return json(response, 200, { markedRead: updated })
    }

    const notificationRoute = pathname.match(/^\/api\/notifications\/([^/]+)$/)
    if (notificationRoute && request.method === 'PATCH') {
      const updated = await store.transact((data) => {
        const notification = (data.notifications || []).find((item) => item.id === safeDecodeURIComponent(notificationRoute[1]) && item.recipientUserId === user.id && (user.role !== ROLES.CANTEEN || item.target === 'canteen'))
        if (!notification) throw Object.assign(new Error('Notification not found.'), { status: 404 })
        notification.readAt ||= new Date().toISOString()
        return notification
      })
      return json(response, 200, { notification: publicNotification(updated) })
    }

    if (pathname.startsWith('/api/events-clubs')) {
      if (!canAccess(user, 'events') || user.role === ROLES.CANTEEN) return reject(response, 403, 'Your role cannot access Events & Clubs.')
      const manager = user.role === ROLES.ADMIN
      const dataArrays = (data) => {
        data.campusEvents ??= []
        data.eventRegistrations ??= []
        data.eventAttendance ??= []
        data.eventResults ??= []
        data.campusClubs ??= []
        data.clubMemberships ??= []
        data.clubAnnouncements ??= []
        data.clubActivities ??= []
      }
      const eventRoute = pathname.match(/^\/api\/events-clubs\/events\/([^/]+)$/)
      const registrationRoute = pathname.match(/^\/api\/events-clubs\/registrations\/([^/]+)$/)
      const clubRoute = pathname.match(/^\/api\/events-clubs\/clubs\/([^/]+)$/)
      const membershipRoute = pathname.match(/^\/api\/events-clubs\/memberships\/([^/]+)$/)

      if (pathname === '/api/events-clubs' && request.method === 'GET') {
        const data = await store.read()
        dataArrays(data)
        const events = data.campusEvents.filter((event) => manager
          ? true
          : event.status !== 'DRAFT' && (eligibleForCampusEvent(event, user) || data.eventRegistrations.some((entry) => entry.eventId === event.id && entry.userId === user.id)))
        const clubs = data.campusClubs.filter((club) => manager || club.active)
        const registrations = data.eventRegistrations.filter((entry) => manager || entry.userId === user.id)
        const memberships = data.clubMemberships.filter((entry) => manager || entry.userId === user.id)
        const myClubIds = new Set(memberships.filter((entry) => entry.status === 'ACTIVE').map((entry) => entry.clubId))
        return json(response, 200, {
          events: events.map((event) => ({ ...event, registrationCount: data.eventRegistrations.filter((entry) => entry.eventId === event.id && !['CANCELLED'].includes(entry.status)).length })),
          registrations, clubs, memberships,
          announcements: data.clubAnnouncements.filter((entry) => manager || myClubIds.has(entry.clubId)),
          activities: data.clubActivities.filter((entry) => manager || myClubIds.has(entry.clubId) || entry.public === true),
          attendance: manager ? data.eventAttendance : data.eventAttendance.filter((entry) => entry.userId === user.id),
          results: manager ? data.eventResults : data.eventResults.filter((entry) => entry.userId === user.id),
          analytics: manager ? {
            totalEvents: data.campusEvents.length,
            upcomingEvents: data.campusEvents.filter((entry) => ['PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(entry.status) && entry.date >= new Date().toISOString().slice(0, 10)).length,
            totalRegistrations: data.eventRegistrations.filter((entry) => entry.status !== 'CANCELLED').length,
            activeClubs: data.campusClubs.filter((entry) => entry.active).length,
            pendingClubApplications: data.clubMemberships.filter((entry) => entry.status === 'PENDING').length,
          } : null,
        })
      }

      if (pathname === '/api/events-clubs/events' && request.method === 'POST') {
        if (!manager) return reject(response, 403, 'Administration access is required to manage Events & Clubs.')
        const input = await body(request)
        const event = validateCampusEvent(input)
        const created = await store.transact((data) => {
          dataArrays(data)
          event.id = randomUUID()
          event.createdAt = event.updatedAt = new Date().toISOString()
          event.createdBy = user.id
          data.campusEvents.unshift(event)
          if (event.status !== 'DRAFT') notifyEventAudience(data, event, 'Event published', addNotification)
          return event
        })
        return json(response, 201, { event: created })
      }

      if (eventRoute && request.method === 'PATCH') {
        if (!manager) return reject(response, 403, 'Administration access is required to manage Events & Clubs.')
        const input = await body(request)
        const updated = await store.transact((data) => {
          dataArrays(data)
          const event = data.campusEvents.find((entry) => entry.id === decodeURIComponent(eventRoute[1]))
          if (!event) throw Object.assign(new Error('Event not found.'), { status: 404 })
          const wasDraft = event.status === 'DRAFT'
          const previousSchedule = `${event.date}|${event.startTime}|${event.endTime}|${event.venue}`
          Object.assign(event, validateCampusEvent({ ...event, ...input }, { partial: true }), { updatedAt: new Date().toISOString() })
          if (event.status === 'CANCELLED') {
            for (const registration of data.eventRegistrations.filter((entry) => entry.eventId === event.id && entry.status !== 'CANCELLED')) {
              addNotification(data, { recipientUserId: registration.userId, title: 'Event cancelled', message: `${event.name} has been cancelled.`, referenceId: event.id, target: 'events' })
            }
          } else if (wasDraft && event.status !== 'DRAFT') notifyEventAudience(data, event, 'Event published', addNotification)
          else if (previousSchedule !== `${event.date}|${event.startTime}|${event.endTime}|${event.venue}`) {
            for (const registration of data.eventRegistrations.filter((entry) => entry.eventId === event.id && entry.status !== 'CANCELLED')) {
              addNotification(data, { recipientUserId: registration.userId, title: 'Event schedule changed', message: `${event.name} · ${event.date} · ${event.startTime}–${event.endTime} · ${event.venue}`, referenceId: event.id, target: 'events' })
            }
          }
          return event
        })
        return json(response, 200, { event: updated })
      }

      const registerRoute = pathname.match(/^\/api\/events-clubs\/events\/([^/]+)\/register$/)
      if (registerRoute && request.method === 'POST') {
        const registration = await store.transact((data) => {
          dataArrays(data)
          const event = data.campusEvents.find((entry) => entry.id === decodeURIComponent(registerRoute[1]))
          if (!event || !['PUBLISHED', 'REGISTRATION_OPEN'].includes(event.status)) throw Object.assign(new Error('This event is not open for registration.'), { status: 409 })
          if (!eligibleForCampusEvent(event, user)) throw Object.assign(new Error('This event is limited to its eligible audience.'), { status: 403 })
          if (event.date < new Date().toISOString().slice(0, 10)) throw Object.assign(new Error('Registration is closed because this event has passed.'), { status: 409 })
          if (event.registrationDeadline && event.registrationDeadline < new Date().toISOString().slice(0, 10)) throw Object.assign(new Error('Registration is closed for this event.'), { status: 409 })
          if (data.eventRegistrations.some((entry) => entry.eventId === event.id && entry.userId === user.id && entry.status !== 'CANCELLED')) throw Object.assign(new Error('You are already registered for this event.'), { status: 409 })
          const count = data.eventRegistrations.filter((entry) => entry.eventId === event.id && entry.status !== 'CANCELLED').length
          if (event.maxParticipants && count >= event.maxParticipants) throw Object.assign(new Error('Registration is full for this event.'), { status: 409 })
          const now = new Date().toISOString()
          const entry = {
            id: randomUUID(), eventId: event.id, eventName: event.name, userId: user.id,
            userName: user.name, role: user.role, department: user.department || '',
            course: user.course || '', semester: user.semester || '',
            registeredAt: now, status: 'REGISTERED',
          }
          data.eventRegistrations.unshift(entry)
          addNotification(data, { recipientUserId: user.id, title: 'Event registration successful', message: `You are registered for ${event.name}.`, referenceId: event.id, target: 'events' })
          return entry
        })
        return json(response, 201, { registration })
      }

      if (registrationRoute && request.method === 'PATCH') {
        const input = await body(request)
        if (['ATTENDED', 'ABSENT'].includes(input.status) && !manager) return reject(response, 403, 'Administration access is required to mark attendance.')
        if (input.status !== 'CANCELLED' && !(manager && ['ATTENDED', 'ABSENT'].includes(input.status))) return reject(response, 400, 'Choose an allowed registration or attendance status.')
        const updated = await store.transact((data) => {
          dataArrays(data)
          const entry = data.eventRegistrations.find((candidate) => candidate.id === decodeURIComponent(registrationRoute[1]))
          if (!entry || !manager && entry.userId !== user.id) throw Object.assign(new Error('Registration not found.'), { status: 404 })
          if (input.status === 'CANCELLED' && entry.status === 'REGISTERED') {
            entry.status = 'CANCELLED'
            addNotification(data, { recipientUserId: entry.userId, title: 'Event registration cancelled', message: `Your registration for ${entry.eventName} was cancelled.`, referenceId: entry.eventId, target: 'events' })
          } else if (manager && ['ATTENDED', 'ABSENT'].includes(input.status)) {
            entry.status = input.status
            entry.attendanceStatus = input.status
            data.eventAttendance.unshift({ id: randomUUID(), eventId: entry.eventId, userId: entry.userId, userName: entry.userName, status: input.status, markedAt: new Date().toISOString(), markedBy: user.id })
          } else if (input.status === 'CANCELLED') throw Object.assign(new Error('This registration cannot be cancelled.'), { status: 409 })
          entry.updatedAt = new Date().toISOString()
          return entry
        })
        return json(response, 200, { registration: updated })
      }

      if (pathname === '/api/events-clubs/clubs' && request.method === 'POST') {
        if (!manager) return reject(response, 403, 'Administration access is required to manage Clubs.')
        const club = validateCampusClub(await body(request))
        const created = await store.transact((data) => {
          dataArrays(data)
          if (data.campusClubs.some((entry) => entry.name.toLowerCase() === club.name.toLowerCase())) throw Object.assign(new Error('A club with this name already exists.'), { status: 409 })
          club.id = randomUUID()
          club.createdAt = club.updatedAt = new Date().toISOString()
          data.campusClubs.unshift(club)
          return club
        })
        return json(response, 201, { club: created })
      }

      if (clubRoute && request.method === 'PATCH') {
        if (!manager) return reject(response, 403, 'Administration access is required to manage Clubs.')
        const input = await body(request)
        const updated = await store.transact((data) => {
          dataArrays(data)
          const club = data.campusClubs.find((entry) => entry.id === decodeURIComponent(clubRoute[1]))
          if (!club) throw Object.assign(new Error('Club not found.'), { status: 404 })
          const patch = validateCampusClub({ ...club, ...input }, { partial: true })
          if (patch.name && data.campusClubs.some((entry) => entry.id !== club.id && entry.name.toLowerCase() === patch.name.toLowerCase())) throw Object.assign(new Error('A club with this name already exists.'), { status: 409 })
          Object.assign(club, patch, { updatedAt: new Date().toISOString() })
          return club
        })
        return json(response, 200, { club: updated })
      }

      const joinRoute = pathname.match(/^\/api\/events-clubs\/clubs\/([^/]+)\/join$/)
      if (joinRoute && request.method === 'POST') {
        const membership = await store.transact((data) => {
          dataArrays(data)
          const club = data.campusClubs.find((entry) => entry.id === decodeURIComponent(joinRoute[1]) && entry.active)
          if (!club) throw Object.assign(new Error('Active Club not found.'), { status: 404 })
          const existing = data.clubMemberships.find((entry) => entry.clubId === club.id && entry.userId === user.id && ['PENDING', 'APPROVED', 'ACTIVE'].includes(entry.status))
          if (existing) throw Object.assign(new Error('You already have an active or pending application for this Club.'), { status: 409 })
          const now = new Date().toISOString()
          const entry = { id: randomUUID(), clubId: club.id, clubName: club.name, userId: user.id, userName: user.name, role: user.role, department: user.department || '', status: club.requiresApproval ? 'PENDING' : 'ACTIVE', appliedAt: now, joinedAt: club.requiresApproval ? null : now }
          data.clubMemberships.unshift(entry)
          if (!club.requiresApproval) addNotification(data, { recipientUserId: user.id, title: 'Club membership active', message: `You joined ${club.name}.`, referenceId: club.id, target: 'events' })
          else for (const administrator of data.users.filter((candidate) => candidate.active && candidate.role === ROLES.ADMIN)) {
            addNotification(data, { recipientUserId: administrator.id, title: 'Pending Club application', message: `${user.name} applied to join ${club.name}.`, referenceId: entry.id, target: 'events' })
          }
          return entry
        })
        return json(response, 201, { membership })
      }

      if (membershipRoute && request.method === 'PATCH') {
        if (!manager) return reject(response, 403, 'Administration access is required to manage Club memberships.')
        const { status } = await body(request)
        if (!['APPROVED', 'REJECTED', 'ACTIVE', 'LEFT'].includes(status)) return reject(response, 400, 'Choose an allowed membership status.')
        const updated = await store.transact((data) => {
          dataArrays(data)
          const entry = data.clubMemberships.find((candidate) => candidate.id === decodeURIComponent(membershipRoute[1]))
          if (!entry) throw Object.assign(new Error('Club membership not found.'), { status: 404 })
          entry.status = status
          entry.updatedAt = new Date().toISOString()
          if (status === 'APPROVED' || status === 'ACTIVE') entry.joinedAt ||= entry.updatedAt
          addNotification(data, { recipientUserId: entry.userId, title: `Club membership ${status.toLowerCase()}`, message: `${entry.clubName} · ${status.toLowerCase()}.`, referenceId: entry.clubId, target: 'events' })
          return entry
        })
        return json(response, 200, { membership: updated })
      }

      if (pathname === '/api/events-clubs/announcements' && request.method === 'POST') {
        if (!manager) return reject(response, 403, 'Administration access is required to post Club announcements.')
        const input = await body(request)
        const message = safeText(input.message, 2000)
        const title = safeText(input.title, 120)
        const created = await store.transact((data) => {
          dataArrays(data)
          const club = data.campusClubs.find((entry) => entry.id === input.clubId && entry.active)
          if (!club || title.length < 2 || message.length < 3) throw Object.assign(new Error('Choose a Club and enter an announcement title and message.'), { status: 400 })
          const announcement = { id: randomUUID(), clubId: club.id, clubName: club.name, title, message, createdAt: new Date().toISOString(), createdBy: user.id }
          data.clubAnnouncements.unshift(announcement)
          for (const member of data.clubMemberships.filter((entry) => entry.clubId === club.id && entry.status === 'ACTIVE')) addNotification(data, { recipientUserId: member.userId, title, message, referenceId: announcement.id, target: 'events' })
          return announcement
        })
        return json(response, 201, { announcement: created })
      }

      if (pathname === '/api/events-clubs/activities' && request.method === 'POST') {
        if (!manager) return reject(response, 403, 'Administration access is required to manage Club activities.')
        const input = await body(request)
        const created = await store.transact((data) => {
          dataArrays(data)
          const club = data.campusClubs.find((entry) => entry.id === input.clubId && entry.active)
          const title = safeText(input.title, 120)
          if (!club || title.length < 2 || !validIsoDate(input.date)) throw Object.assign(new Error('Choose an active Club, activity name, and valid date.'), { status: 400 })
          const activity = { id: randomUUID(), clubId: club.id, clubName: club.name, title, description: safeText(input.description, 1000), date: input.date, venue: safeText(input.venue, 160), public: input.public === true, createdAt: new Date().toISOString() }
          data.clubActivities.unshift(activity)
          for (const member of data.clubMemberships.filter((entry) => entry.clubId === club.id && entry.status === 'ACTIVE')) {
            addNotification(data, { recipientUserId: member.userId, title: 'New Club activity', message: `${club.name} · ${activity.title} · ${activity.date}`, referenceId: activity.id, target: 'events' })
          }
          return activity
        })
        return json(response, 201, { activity: created })
      }

      if (pathname === '/api/events-clubs/results' && request.method === 'POST') {
        if (!manager) return reject(response, 403, 'Administration access is required to manage event results.')
        const input = await body(request)
        const result = await store.transact((data) => {
          dataArrays(data)
          const registration = data.eventRegistrations.find((entry) => entry.id === input.registrationId)
          const position = safeText(input.position, 60)
          if (!registration || !position) throw Object.assign(new Error('Choose a registered participant and enter a result.'), { status: 400 })
          const record = { id: randomUUID(), eventId: registration.eventId, eventName: registration.eventName, userId: registration.userId, userName: registration.userName, position, remarks: safeText(input.remarks, 500), date: new Date().toISOString(), createdBy: user.id }
          data.eventResults.unshift(record)
          return record
        })
        return json(response, 201, { result })
      }

      return reject(response, 404, 'Events & Clubs route not found.')
    }

    const noticeReadRoute = pathname.match(/^\/api\/notices\/([^/]+)\/read$/)
    if (noticeReadRoute && request.method === 'POST') {
      const noticeId = safeDecodeURIComponent(noticeReadRoute[1])
      const updated = await store.transact((data) => {
        const notice = campusNotices(data).find((entry) => entry.id === noticeId)
        if (!notice || !notice.recipientIds?.includes(user.id) && notice.createdBy !== user.id) throw Object.assign(new Error('Notice not found.'), { status: 404 })
        const now = new Date().toISOString()
        const notifications = (data.notifications || []).filter((entry) => entry.recipientUserId === user.id && entry.referenceId === notice.id && entry.type === 'CAMPUS_NOTICE')
        if (notifications.length) for (const notification of notifications) notification.readAt ||= now
        else {
          notice.readBy ??= {}
          notice.readBy[user.id] ||= now
        }
        return { notice: publicCampusNotice(notice, user.id, notifications[0]?.readAt || notice.readBy?.[user.id] || now) }
      })
      return json(response, 200, updated)
    }

    const noticeDetailsRoute = pathname.match(/^\/api\/notices\/([^/]+)$/)
    if (pathname === '/api/notices/options' && request.method === 'GET') {
      if (!noticeIssuerRole(user)) return reject(response, 403, 'Your role cannot issue campus notices.')
      const options = { categories: NOTICE_CATEGORIES, departments: DEPARTMENTS, courses: [], semesters: ['Semester 1', 'Semester 2', 'Semester 3', 'Semester 4', 'Semester 5', 'Semester 6', 'Semester 7', 'Semester 8', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6'], sports: [], teams: [], events: [], hostels: [] }
      if ([ROLES.ADMIN, ROLES.SPORTS].includes(user.role)) {
        const data = await store.read()
        options.sports = (data.sports ?? DEFAULT_SPORTS_DATA).filter((entry) => entry.active !== false && ['Sport', 'Team'].includes(entry.kind)).map(({ id, title }) => ({ id, title }))
        options.teams = data.sportsTeams.filter((entry) => entry.status === 'ACTIVE').map(({ id, name }) => ({ id, name }))
        options.events = data.sportsEvents.filter((entry) => !['CANCELLED', 'COMPLETED'].includes(entry.status)).map(({ id, name }) => ({ id, name }))
      }
      return json(response, 200, { options })
    }
    if (pathname === '/api/notices' && request.method === 'GET') {
      const data = await store.transact((current) => {
        initializeCampusNotices(current)
        deliverDueNoticeNotifications(current)
        return current
      })
      const now = Date.now()
      const notices = campusNotices(data).filter((notice) =>
        (notice.recipientIds?.includes(user.id) || notice.createdBy === user.id) &&
        Date.parse(notice.publishAt || notice.createdAt) <= now &&
        (!notice.expiresAt || Date.parse(notice.expiresAt) >= now))
      return json(response, 200, { notices: notices.map((notice) => {
        const notification = (data.notifications || []).find((entry) => entry.recipientUserId === user.id && entry.referenceId === notice.id && entry.type === 'CAMPUS_NOTICE')
        return publicCampusNotice(notice, user.id, notification?.readAt || notice.readBy?.[user.id] || null)
      }) })
    }
    if (noticeDetailsRoute && request.method === 'GET') {
      const data = await store.transact((current) => {
        initializeCampusNotices(current)
        deliverDueNoticeNotifications(current)
        return current
      })
      const notice = campusNotices(data).find((entry) => entry.id === safeDecodeURIComponent(noticeDetailsRoute[1]) &&
        (entry.recipientIds?.includes(user.id) || entry.createdBy === user.id))
      if (!notice || Date.parse(notice.publishAt || notice.createdAt) > Date.now() || notice.expiresAt && Date.parse(notice.expiresAt) < Date.now()) return reject(response, 404, 'Notice not found.')
      const notification = (data.notifications || []).find((entry) => entry.recipientUserId === user.id && entry.referenceId === notice.id && entry.type === 'CAMPUS_NOTICE')
      return json(response, 200, { notice: publicCampusNotice(notice, user.id, notification?.readAt || notice.readBy?.[user.id] || null) })
    }
    if (pathname === '/api/notices' && request.method === 'POST') {
      if (!noticeIssuerRole(user)) return reject(response, 403, 'Your role cannot issue campus notices.')
      const input = await body(request)
      const notice = validateCampusNotice(input, user)
      const created = await store.transact((data) => {
        initializeCampusNotices(data)
        const recipients = campusNoticeRecipients(notice, data)
        if (!recipients.length) throw Object.assign(new Error('No active users match this notice audience.'), { status: 400 })
        notice.id = randomUUID()
        notice.createdBy = user.id
        notice.issuerName = user.name
        notice.issuerRole = user.role
        notice.recipientIds = recipients
        notice.readBy = {}
        notice.createdAt = new Date().toISOString()
        campusNotices(data).unshift(notice)
        deliverDueNoticeNotifications(data)
        return notice
      })
      return json(response, 201, { notice: publicCampusNotice(created, user.id, null), recipientCount: created.recipientIds.length })
    }
    if (noticeDetailsRoute && ['PATCH', 'DELETE'].includes(request.method)) return reject(response, 403, 'Published notices are retained; only authorized issuers may create notices.')
    if (pathname.startsWith('/api/notices/')) return reject(response, 404, 'Notice API route not found.')

    if (pathname === '/api/auth/logout' && request.method === 'POST') {
      await store.transact((data) => {
        const current = data.users.find((candidate) => candidate.id === user.id && candidate.active && candidate.sessionVersion === user.sessionVersion)
        if (current) current.sessionVersion += 1
      })
      return json(response, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(secureRequest(request)) })
    }

    if (pathname === '/api/auth/me' && request.method === 'GET') {
      return json(response, 200, { user: publicUser(user), modules: modulesForUser(user) })
    }

    if (pathname === '/api/auth/password' && request.method === 'POST') {
      const input = await body(request)
      if (!await verifyPassword(input.currentPassword, user.credentials)) return reject(response, 400, 'Your current password is incorrect.')
      if (!validatePassword(input.newPassword)) return reject(response, 400, 'Choose a password with at least 12 characters.')
      if (input.newPassword === input.currentPassword) return reject(response, 400, 'Your new password must be different from the current password.')
      const credentials = await hashPassword(input.newPassword)
      const updated = await store.transact((data) => {
        const target = data.users.find((candidate) => candidate.id === user.id && candidate.active && candidate.sessionVersion === user.sessionVersion)
        if (!target) throw Object.assign(new Error('Your session has expired. Sign in again.'), { status: 401 })
        target.credentials = credentials
        target.mustChangePassword = false
        target.sessionVersion += 1
        return target
      })
      saveSession(response, updated, request)
      return json(response, 200, { user: publicUser(updated), modules: modulesForUser(updated) })
    }

    if ((pathname === '/api/canteen/cart' || pathname === '/api/food/cart') && request.method === 'GET') {
      if (user.role !== ROLES.STUDENT) return reject(response, 403, 'Student cart access is required.')
      const data = await store.read()
      const cart = (data.carts || []).find((entry) => entry.user_id === user.id)
      return json(response, 200, { cart: cart ? publicCartSummary(cart) : { id: '', user_id: user.id, created_at: null, updated_at: null, total: 0, subtotal: 0, item_count: 0, items: [] } })
    }

    if ((pathname === '/api/canteen/cart/items' || pathname === '/api/food/cart/items') && request.method === 'POST') {
      if (user.role !== ROLES.STUDENT) return reject(response, 403, 'Only students can manage their cart.')
      const input = await body(request)
      const foodItemId = String(input.food_item_id || input.foodItemId || '').trim()
      if (!foodItemId) return reject(response, 400, 'Select a food item to add.')
      if (!Number.isInteger(Number(input.quantity ?? 1)) || Number(input.quantity ?? 1) <= 0) return reject(response, 400, 'Quantity must be a positive integer.')
      const result = await store.transact((data) => {
        data.foodItems ??= structuredClone(DEFAULT_CANTEEN_CATALOG)
        const item = data.foodItems.find((candidate) => candidate.id === foodItemId)
        if (!item) throw Object.assign(new Error('Food item not found.'), { status: 404 })
        if (item.available === false) throw Object.assign(new Error('This item is unavailable right now.'), { status: 409 })
        const variant = parseCanteenVariant(input.variant || input.itemVariant, item)
        const price = foodItemPrice(item, variant)
        data.carts ??= []
        let cart = data.carts.find((entry) => entry.user_id === user.id)
        if (!cart) {
          cart = { id: randomUUID(), user_id: user.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), items: [] }
          data.carts.push(cart)
        }
        const existing = cart.items.find((entry) => entry.food_item_id === foodItemId && entry.variant === variant)
        const quantity = Number(input.quantity)
        if (existing) {
          existing.quantity += quantity
          existing.line_total = existing.price * existing.quantity
        } else {
          cart.items.push({
            id: randomUUID(), food_item_id: foodItemId, food_name: item.name, category: item.category,
            variant, price, quantity, line_total: price * quantity,
          })
        }
        cart.updated_at = new Date().toISOString()
        return { cart: publicCartSummary(cart) }
      })
      return json(response, 201, result)
    }

    if ((pathname === '/api/canteen/cart/items' || pathname === '/api/food/cart/items') && request.method === 'PATCH') {
      if (user.role !== ROLES.STUDENT) return reject(response, 403, 'Only students can manage their cart.')
      const input = await body(request)
      const itemId = String(input.id || input.itemId || '').trim()
      if (!itemId) return reject(response, 400, 'Choose a cart item to update.')
      const result = await store.transact((data) => {
        data.carts ??= []
        const cart = data.carts.find((entry) => entry.user_id === user.id)
        if (!cart) throw Object.assign(new Error('Your cart is empty.'), { status: 404 })
        const entry = cart.items.find((candidate) => candidate.id === itemId)
        if (!entry) throw Object.assign(new Error('Cart item not found.'), { status: 404 })
        if (input.quantity !== undefined) {
          if (!Number.isInteger(Number(input.quantity)) || Number(input.quantity) <= 0) throw Object.assign(new Error('Quantity must be a positive integer.'), { status: 400 })
          entry.quantity = Number(input.quantity)
        }
        if (input.variant !== undefined) {
          const item = (data.foodItems || structuredClone(DEFAULT_CANTEEN_CATALOG)).find((candidate) => candidate.id === entry.food_item_id)
          if (!item) throw Object.assign(new Error('Food item not found.'), { status: 404 })
          entry.variant = parseCanteenVariant(input.variant, item)
        }
        entry.price = Number(entry.price || 0)
        entry.line_total = entry.price * entry.quantity
        cart.updated_at = new Date().toISOString()
        return { cart: publicCartSummary(cart) }
      })
      return json(response, 200, result)
    }

    if ((pathname === '/api/canteen/cart/items' || pathname === '/api/food/cart/items') && request.method === 'DELETE') {
      if (user.role !== ROLES.STUDENT) return reject(response, 403, 'Only students can manage their cart.')
      const input = await body(request)
      const itemId = String(input.id || input.itemId || '').trim()
      if (!itemId) return reject(response, 400, 'Choose a cart item to remove.')
      const result = await store.transact((data) => {
        data.carts ??= []
        const cart = data.carts.find((entry) => entry.user_id === user.id)
        if (!cart) throw Object.assign(new Error('Your cart is empty.'), { status: 404 })
        const index = cart.items.findIndex((entry) => entry.id === itemId)
        if (index === -1) throw Object.assign(new Error('Cart item not found.'), { status: 404 })
        cart.items.splice(index, 1)
        cart.updated_at = new Date().toISOString()
        return { cart: publicCartSummary(cart) }
      })
      return json(response, 200, result)
    }

    if ((pathname === '/api/canteen/checkout' || pathname === '/api/food/checkout') && request.method === 'POST') {
      if (user.role !== ROLES.STUDENT) return reject(response, 403, 'Only students can place canteen orders.')
      const input = await body(request)
      const fullName = safeText(input.full_name || input.fullName || user.name, 120)
      const contactNumber = safeText(input.contact_number || input.contactNumber || user.mobile || '', 24)
      const course = safeText(input.course || user.course || '', 100)
      const department = safeText(input.department || user.department || '', 100)
      const paymentMethod = String((input.payment_method || input.paymentMethod || 'OFFLINE')).trim().toUpperCase()
      if (!fullName || !contactNumber || !course || !department) return reject(response, 400, 'Full name, contact number, course, and department are required.')
      if (!/^\+?[\d\s().-]{7,20}$/.test(contactNumber)) return reject(response, 400, 'Enter a valid contact number.')
      if (!['UPI', 'OFFLINE', 'ONLINE', 'ONLINE_UPI', 'PAY_AT_CANTEEN'].includes(paymentMethod) && !['UPI', 'OFFLINE'].includes(paymentMethod)) return reject(response, 400, 'Choose a valid payment method.')
      const normalizedPaymentMethod = paymentMethod === 'ONLINE' || paymentMethod === 'ONLINE_UPI' ? 'UPI' : paymentMethod === 'PAY_AT_CANTEEN' ? 'OFFLINE' : paymentMethod
      const result = await store.transact((data) => {
        data.foodItems ??= structuredClone(DEFAULT_CANTEEN_CATALOG)
        data.carts ??= []
        const cart = data.carts.find((entry) => entry.user_id === user.id)
        if (!cart || !cart.items.length) throw Object.assign(new Error('Your cart is empty.'), { status: 400 })
        const orderItems = []
        let subtotal = 0
        for (const entry of cart.items) {
          const item = data.foodItems.find((candidate) => candidate.id === entry.food_item_id)
          if (!item || item.available === false) throw Object.assign(new Error(`${entry.food_name || 'This food item'} is unavailable.`), { status: 409 })
          const priceSnapshot = Number(entry.price || 0)
          const quantity = Number(entry.quantity || 0)
          const lineSubtotal = priceSnapshot * quantity
          subtotal += lineSubtotal
          orderItems.push({
            id: randomUUID(), food_item_id: entry.food_item_id, food_name_snapshot: entry.food_name, variant: entry.variant, price_snapshot: priceSnapshot, quantity, subtotal: lineSubtotal,
          })
        }
        const order = {
          id: randomUUID(), order_number: `CM-${String(Math.floor(Date.now() / 1000) % 900000 + 1000)}`,
          student_id: user.id, student_name: fullName, contact_number: contactNumber, course, department,
          subtotal, total_amount: subtotal, payment_method: normalizedPaymentMethod,
          payment_status: 'PENDING', payment_submitted_at: null, payment_verified_at: null, payment_verified_by: null,
          order_status: 'PLACED', estimated_ready_time: null, rejection_reason: null, staff_note: '',
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(), accepted_at: null,
          preparing_at: null, ready_at: null, completed_at: null, cancelled_at: null, items: orderItems,
        }
        data.orders ??= []
        data.orders.unshift(order)
        cart.items = []
        cart.updated_at = new Date().toISOString()
        const orderNotification = addCanteenNotification(data, {
          recipientUserId: '',
          title: '🔔 NEW CANTEEN ORDER',
          message: `Order #${order.order_number}\nStudent: ${fullName}\nCourse: ${course}\nDepartment: ${department}\nItems: ${orderItems.map((item) => `${item.food_name_snapshot} × ${item.quantity}`).join(', ')}\nTotal: ₹${subtotal}\nPayment: ${normalizedPaymentMethod}`,
          referenceId: order.id,
          target: 'canteen-orders',
          type: 'staff',
          orderId: order.id,
        })
        addNotification(data, {
          recipientUserId: user.id,
          title: 'Order placed',
          message: `Your order #${order.order_number} has been placed successfully.`,
          referenceId: order.id,
          target: 'order',
        })
        return { order: publicOrder(order), notification: orderNotification }
      })
      return json(response, 201, result)
    }

    if (pathname === '/api/canteen/menu' && request.method === 'GET') {
      if (![ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.ADMIN, ROLES.CANTEEN].includes(user.role)) return reject(response, 403, 'Your role cannot browse the Canteen menu.')
      const data = await store.transact((current) => {
        current.canteenMenu ??= INITIAL_CANTEEN_MENU.map((item) => ({ ...item, id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
        return current.canteenMenu
      })
      return json(response, 200, { items: data, categories: CANTEEN_CATEGORIES })
    }

    if (pathname === '/api/canteen/menu' && request.method === 'POST') {
      if (user.role !== ROLES.CANTEEN) return reject(response, 403, 'Canteen Staff access is required to manage the menu.')
      const item = validateCanteenItem(await body(request))
      item.id = randomUUID()
      item.createdAt = item.updatedAt = new Date().toISOString()
      const created = await store.transact((data) => {
        data.canteenMenu ??= []
        data.canteenMenu.unshift(item)
        return item
      })
      return json(response, 201, { item: created })
    }

    const canteenMenuRoute = pathname.match(/^\/api\/canteen\/menu\/([^/]+)$/)
    if (canteenMenuRoute && request.method === 'PATCH') {
      if (user.role !== ROLES.CANTEEN) return reject(response, 403, 'Canteen Staff access is required to manage the menu.')
      const patch = validateCanteenItem(await body(request))
      const item = await store.transact((data) => {
        const existing = (data.canteenMenu || []).find((candidate) => candidate.id === safeDecodeURIComponent(canteenMenuRoute[1]))
        if (!existing) throw Object.assign(new Error('Canteen menu item not found.'), { status: 404 })
        Object.assign(existing, patch, { updatedAt: new Date().toISOString() })
        return existing
      })
      return json(response, 200, { item })
    }

    if (pathname === '/api/canteen/orders' && request.method === 'GET') {
      if (![ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.ADMIN, ROLES.CANTEEN].includes(user.role)) return reject(response, 403, 'Your role cannot view Canteen orders.')
      const data = await store.read()
      const orders = data.canteenOrders || []
      const visible = user.role === ROLES.CANTEEN ? orders : orders.filter((order) => (order.customerUserId || order.userId) === user.id)
      return json(response, 200, { orders: visible.map(publicCanteenOrder) })
    }

    if (pathname === '/api/canteen/orders' && request.method === 'POST') {
      if (![ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.ADMIN].includes(user.role)) return reject(response, 403, 'Only Campus One customer roles can place Canteen pre-orders.')
      const input = await body(request)
      if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) return reject(response, 400, 'Add between 1 and 30 menu items to your order.')
      const order = await store.transact((data) => {
        data.canteenMenu ??= INITIAL_CANTEEN_MENU.map((item) => ({ ...item, id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
        const orderItems = input.items.map((line) => {
          const item = data.canteenMenu.find((candidate) => candidate.id === line.itemId && candidate.available)
          const quantity = Number(line.quantity)
          if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > 50 || (line.size || '') !== (item.size || '')) {
            throw Object.assign(new Error('An item is unavailable or the order details are invalid. Refresh the menu and try again.'), { status: 400 })
          }
          if (line.price !== undefined && line.price !== item.price) {
            throw Object.assign(new Error('A menu price changed. Review the refreshed menu and confirm your order again.'), { status: 409 })
          }
          return { itemId: item.id, name: item.name, diet: item.diet, category: item.category, size: item.size || '', price: item.price, quantity, subtotal: item.price * quantity }
        })
        const total = orderItems.reduce((sum, line) => sum + line.subtotal, 0)
        const highest = (data.canteenOrders || []).reduce((max, record) => Math.max(max, Number(/^ORD-(\d+)$/.exec(record.orderNumber)?.[1] || 0)), Number(data.canteenOrderCounter) || 0)
        data.canteenOrderCounter = highest + 1
        const now = new Date().toISOString()
        const created = {
          id: randomUUID(), orderNumber: `ORD-${String(data.canteenOrderCounter).padStart(6, '0')}`,
          userId: user.id, studentName: user.name, studentId: user.id,
          customerUserId: user.id, customerName: user.name, customerRole: user.role,
          items: orderItems,
          total, status: 'PENDING', createdAt: now, updatedAt: now,
          history: [{ status: 'PENDING', changedAt: now, changedBy: user.id }],
        }
        data.canteenOrders ??= []
        data.canteenOrders.unshift(created)
        for (const recipient of data.users.filter((candidate) => candidate.active && candidate.role === ROLES.CANTEEN)) {
          addNotification(data, { recipientUserId: recipient.id, title: 'New Canteen pre-order', message: `${created.orderNumber} · ${user.name} · ₹${total}`, referenceId: created.id, target: 'canteen' })
        }
        addNotification(data, { recipientUserId: user.id, title: 'Canteen order placed', message: `${created.orderNumber} is pending staff confirmation.`, referenceId: created.id, target: 'canteen' })
        return created
      })
      return json(response, 201, { order: publicCanteenOrder(order) })
    }

    const canteenOrderRoute = pathname.match(/^\/api\/canteen\/orders\/([^/]+)$/)
    if (canteenOrderRoute && request.method === 'PATCH') {
      if (user.role !== ROLES.CANTEEN) return reject(response, 403, 'Only Canteen Staff can update order status.')
      const input = await body(request)
      const transitions = { PENDING: ['ACCEPTED', 'REJECTED'], ACCEPTED: ['PREPARING'], PREPARING: ['READY'], READY: ['COMPLETED'] }
      const result = await store.transact((data) => {
        const order = (data.canteenOrders || []).find((candidate) => candidate.id === safeDecodeURIComponent(canteenOrderRoute[1]))
        if (!order) throw Object.assign(new Error('Canteen order not found.'), { status: 404 })
        if (!transitions[order.status]?.includes(input.status)) throw Object.assign(new Error('That order status transition is not allowed.'), { status: 409 })
        const now = new Date().toISOString()
        order.status = input.status
        order.updatedAt = now
        order.history.push({ status: input.status, changedAt: now, changedBy: user.id })
        const titles = { ACCEPTED: 'Canteen order accepted', REJECTED: 'Canteen order rejected', PREPARING: 'Canteen order is being prepared', READY: 'Canteen order is ready', COMPLETED: 'Canteen order completed' }
        addNotification(data, { recipientUserId: order.userId, title: titles[input.status], message: `${order.orderNumber} · ${input.status.toLowerCase()}.`, referenceId: order.id, target: 'canteen' })
        return order
      })
      return json(response, 200, { order: publicCanteenOrder(result) })
    }

    if (pathname === '/api/mess' && request.method === 'GET') {
      if (!canAccess(user, 'food')) return reject(response, 403, 'Your role cannot access College Mess information.')
      const data = await store.read()
      return json(response, 200, { settings: normalizeMessSettings(data.messSettings) })
    }

    if (pathname === '/api/mess/settings' && request.method === 'PATCH') {
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required to manage College Mess settings.')
      const settings = validateMessSettings(await body(request))
      await store.transact((data) => { data.messSettings = settings })
      return json(response, 200, { settings })
    }

    if (pathname === '/api/food/orders' && request.method === 'GET') {
      if (![ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.ADMIN].includes(user.role)) return reject(response, 403, 'Only Campus One customer roles can access canteen orders.')
      const data = await store.read()
      const orders = data.foodOrders || []
      const visible = orders.filter((order) => (order.customerUserId || order.userId) === user.id)
      return json(response, 200, { orders: visible.map(publicFoodOrder) })
    }

    if (pathname === '/api/food/orders' && request.method === 'POST') {
      if (![ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.ADMIN].includes(user.role)) return reject(response, 403, 'Only Campus One customer roles can place canteen pre-orders.')
      const input = await body(request)
      if (!Object.hasOwn(CANTEEN_MENU, input.meal) || !CANTEEN_MENU[input.meal].includes(input.item)) return reject(response, 400, 'Choose an available item from the selected campus menu.')
      const order = {
        id: randomUUID(), orderNumber: `FO-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`,
        userId: user.id, customerUserId: user.id, customerName: user.name, customerRole: user.role,
        meal: input.meal, item: input.item, status: 'Placed',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }
      await store.transact((data) => {
        data.foodOrders ??= []
        data.foodOrders.unshift(order)
      })
      return json(response, 201, { order: publicFoodOrder(order) })
    }

    const legacyCanteenOrderRoute = pathname.match(/^\/api\/food\/orders\/([^/]+)$/)
    if (legacyCanteenOrderRoute && request.method === 'PATCH') {
      const orderId = safeDecodeURIComponent(legacyCanteenOrderRoute[1])
      const input = await body(request)
      const updated = await store.transact((data) => {
        const foodOrder = (data.foodOrders || []).find((candidate) => candidate.id === orderId)
        if (foodOrder) {
          if (user.role !== ROLES.CANTEEN) throw Object.assign(new Error('Canteen Staff access is required to manage customer orders.'), { status: 403 })
          const statuses = { PLACED: 'Placed', PREPARING: 'Preparing', READY: 'Ready', COLLECTED: 'Collected', CANCELLED: 'Cancelled' }
          const requestedStatus = String(input.status ?? input.order_status ?? '').trim()
          const nextStatus = statuses[requestedStatus.toUpperCase()]
          if (!nextStatus) throw Object.assign(new Error('Choose a valid order status.'), { status: 400 })
          foodOrder.status = nextStatus
          foodOrder.updatedAt = new Date().toISOString()
          return { order: foodOrder, isFoodOrder: true }
        }
        data.orders ??= []
        const existing = (data.orders || []).find((candidate) => candidate.id === orderId)
        if (!existing) throw Object.assign(new Error('Order not found.'), { status: 404 })
        const nextStatus = String(input.order_status || input.status || existing.order_status).trim().toUpperCase()
        const nextPaymentStatus = input.payment_status !== undefined ? String(input.payment_status).trim().toUpperCase() : existing.payment_status
        if (nextStatus && nextStatus !== existing.order_status) {
          if (![ROLES.ADMIN, ROLES.STAFF].includes(user.role) && !(user.role === ROLES.STUDENT && existing.student_id === user.id && nextStatus === 'CANCELLED')) {
            throw Object.assign(new Error('You cannot change this order status.'), { status: 403 })
          }
          if (!canChangeOrderStatus(existing.order_status, nextStatus)) throw Object.assign(new Error(`Invalid order status transition: ${existing.order_status} → ${nextStatus}`), { status: 400 })
          existing.order_status = nextStatus
          if (nextStatus === 'ACCEPTED') existing.accepted_at = new Date().toISOString()
          if (nextStatus === 'PREPARING') existing.preparing_at = new Date().toISOString()
          if (nextStatus === 'READY') existing.ready_at = new Date().toISOString()
          if (nextStatus === 'COMPLETED') existing.completed_at = new Date().toISOString()
          if (nextStatus === 'CANCELLED' || nextStatus === 'REJECTED') existing.cancelled_at = new Date().toISOString()
          if (input.rejection_reason !== undefined) existing.rejection_reason = safeText(String(input.rejection_reason), 500)
          if (input.estimated_ready_time !== undefined) existing.estimated_ready_time = input.estimated_ready_time
          if (input.staff_note !== undefined) existing.staff_note = safeText(String(input.staff_note), 500)
        }
        if (nextPaymentStatus && nextPaymentStatus !== existing.payment_status) {
          ensureValidPaymentStatus(nextPaymentStatus)
          if (user.role === ROLES.STUDENT && existing.student_id === user.id && nextPaymentStatus === 'PAYMENT_SUBMITTED') {
            existing.payment_status = nextPaymentStatus
            existing.payment_submitted_at = new Date().toISOString()
          } else if ([ROLES.ADMIN, ROLES.STAFF].includes(user.role)) {
            existing.payment_status = nextPaymentStatus
            if (nextPaymentStatus === 'PAID') existing.payment_verified_at = new Date().toISOString(); existing.payment_verified_by = user.id
            if (nextPaymentStatus === 'PAYMENT_FAILED') existing.payment_verified_at = null
          } else {
            throw Object.assign(new Error('You cannot change payment status.'), { status: 403 })
          }
        }
        existing.updated_at = new Date().toISOString()
        return { order: existing, isFoodOrder: false }
      })
      return json(response, 200, { order: updated.isFoodOrder ? publicFoodOrder(updated.order) : publicOrder(updated.order) })
    }

    const canteenItemRoute = pathname.match(/^\/api\/(?:canteen|food)\/items\/([^/]+)$/)
    if (canteenItemRoute && request.method === 'PATCH') {
      if (![ROLES.ADMIN, ROLES.STAFF].includes(user.role)) return reject(response, 403, 'Menu management requires staff or administration access.')
      const input = await body(request)
      const itemId = decodeURIComponent(canteenItemRoute[1])
      const result = await store.transact((data) => {
        data.foodItems ??= structuredClone(DEFAULT_CANTEEN_CATALOG)
        const item = data.foodItems.find((candidate) => candidate.id === itemId)
        if (!item) throw Object.assign(new Error('Food item not found.'), { status: 404 })
        if (input.name !== undefined) item.name = safeText(input.name, 120)
        if (input.description !== undefined) item.description = safeText(input.description, 500)
        if (input.category !== undefined) item.category = safeText(input.category, 80)
        if (input.menu_type !== undefined) item.menu_type = String(input.menu_type).toLowerCase()
        if (input.price !== undefined) item.price = input.price === null ? null : Number(input.price)
        if (input.half_price !== undefined) item.half_price = input.half_price === null ? null : Number(input.half_price)
        if (input.full_price !== undefined) item.full_price = input.full_price === null ? null : Number(input.full_price)
        if (input.available !== undefined) item.available = Boolean(input.available)
        if (input.preparation_time !== undefined) item.preparation_time = Number(input.preparation_time)
        if (input.image !== undefined) item.image = String(input.image || '')
        item.updated_at = new Date().toISOString()
        return publicFoodItem(item)
      })
      return json(response, 200, { item: result })
    }

    if ((pathname === '/api/canteen/items' || pathname === '/api/food/items') && request.method === 'GET') {
      if (![ROLES.ADMIN, ROLES.STAFF].includes(user.role)) return reject(response, 403, 'Menu management requires staff or administration access.')
      const data = await store.read()
      return json(response, 200, { items: (data.foodItems || []).map(publicFoodItem), contact: CANTEEN_CONTACT })
    }

    if ((pathname === '/api/canteen/items' || pathname === '/api/food/items') && request.method === 'POST') {
      if (![ROLES.ADMIN, ROLES.STAFF].includes(user.role)) return reject(response, 403, 'Menu management requires staff or administration access.')
      const input = await body(request)
      const item = {
        id: input.id || `food-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`,
        name: safeText(input.name, 120),
        description: safeText(input.description, 500),
        category: safeText(input.category, 80),
        menu_type: String(input.menu_type || input.menuType || 'veg').toLowerCase(),
        price: input.price === undefined || input.price === null || input.price === '' ? null : Number(input.price),
        half_price: input.half_price === undefined || input.half_price === null || input.half_price === '' ? null : Number(input.half_price),
        full_price: input.full_price === undefined || input.full_price === null || input.full_price === '' ? null : Number(input.full_price),
        image: String(input.image || ''),
        available: input.available !== false,
        preparation_time: Number(input.preparation_time ?? 10),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (!item.name || !item.category) return reject(response, 400, 'A food name and category are required.')
      if (item.price === null && (item.half_price === null || item.full_price === null)) return reject(response, 400, 'Enter a valid price or half/full pricing.')
      const created = await store.transact((data) => {
        data.foodItems ??= structuredClone(DEFAULT_CANTEEN_CATALOG)
        data.foodItems.unshift(item)
        return publicFoodItem(item)
      })
      return json(response, 201, { item: created })
    }

    if (canteenItemRoute && request.method === 'DELETE') {
      if (![ROLES.ADMIN, ROLES.STAFF].includes(user.role)) return reject(response, 403, 'Menu management requires staff or administration access.')
      const id = decodeURIComponent(canteenItemRoute[1])
      const updated = await store.transact((data) => {
        data.foodItems ??= structuredClone(DEFAULT_CANTEEN_CATALOG)
        const item = data.foodItems.find((entry) => entry.id === id)
        if (!item) throw Object.assign(new Error('Food item not found.'), { status: 404 })
        item.available = false
        item.updated_at = new Date().toISOString()
        return publicFoodItem(item)
      })
      return json(response, 200, { item: updated })
    }

    if (pathname === '/api/users' && request.method === 'GET') {
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required.')
      const data = await store.read()
      return json(response, 200, { users: data.users.map(publicUser) })
    }

    const userRoute = pathname.match(/^\/api\/users\/([^/]+)(?:\/(reset-password))?$/)
    if (userRoute && request.method === 'PATCH') {
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required.')
      const targetId = safeDecodeURIComponent(userRoute[1])
      const input = await body(request)
      if (input.role !== undefined) return reject(response, 400, 'Campus roles cannot be changed by editing an account; review a pending access request instead.')
      const updated = await store.transact((data) => {
        const target = data.users.find((candidate) => candidate.id === targetId)
        if (!target) throw Object.assign(new Error('User not found.'), { status: 404 })
        if (target.id === user.id && input.active === false) throw Object.assign(new Error('You cannot deactivate your own administrator account.'), { status: 400 })
        if (input.active === false && target.role === ROLES.ADMIN && data.users.filter((candidate) => candidate.role === ROLES.ADMIN && candidate.active).length <= 1) throw Object.assign(new Error('At least one active administrator account is required.'), { status: 400 })

        if (input.name !== undefined || input.email !== undefined) {
          const details = validUserDetails({ name: input.name ?? target.name, email: input.email ?? target.email })
          uniqueEmail(data.users, details.email, target.id)
          Object.assign(target, details)
        }
        if (input.modules !== undefined && target.role === ROLES.STAFF) {
          target.modules = normalizeStaffModules(input.modules)
        }
        if (input.active !== undefined) {
          if (typeof input.active !== 'boolean') throw Object.assign(new Error('Account status must be active or inactive.'), { status: 400 })
          if (input.active && !target.credentials) throw Object.assign(new Error('This account must complete its own password setup before it can be activated.'), { status: 400 })
          target.active = input.active
          if (!target.active) target.sessionVersion += 1
        }
        return target
      })
      return json(response, 200, { user: publicUser(updated) })
    }

    if (userRoute && !userRoute[2] && request.method === 'DELETE') {
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required.')
      const targetId = safeDecodeURIComponent(userRoute[1])
      const deleted = await store.transact((data) => {
        const targetIndex = data.users.findIndex((candidate) => candidate.id === targetId)
        if (targetIndex < 0) throw Object.assign(new Error('User not found.'), { status: 404 })
        const target = data.users[targetIndex]
        if (target.id === user.id) throw Object.assign(new Error('You cannot permanently delete your own Administration account.'), { status: 400 })
        if (target.role === ROLES.ADMIN && target.active && data.users.filter((candidate) => candidate.role === ROLES.ADMIN && candidate.active).length <= 1) {
          throw Object.assign(new Error('At least one active Administration account must remain.'), { status: 400 })
        }
        data.issuedUserIds ??= []
        if (!data.issuedUserIds.includes(target.id)) data.issuedUserIds.push(target.id)
        data.users.splice(targetIndex, 1)
        return { id: target.id }
      })
      return json(response, 200, { deleted: true, userId: deleted.id })
    }

    if (userRoute && userRoute[2] === 'reset-password') return reject(response, 410, 'Users change their own password through their campus account.')

    const hostelRoute = pathname.match(/^\/api\/hostel(?:\/([^/]+))?(?:\/([^/]+))?$/)
    if (hostelRoute) {
      if (!canAccess(user, 'hostel')) return reject(response, 403, 'Your role cannot access Hostel services.')
      const [, resource, resourceId] = hostelRoute

      if (!resource && request.method === 'GET') {
        const data = await store.read()
        if (user.role === ROLES.ADMIN) {
          const students = data.users.filter((candidate) => candidate.role === ROLES.STUDENT && candidate.active)
          const studentById = new Map(students.map((student) => [student.id, student]))
          const allotments = (data.hostelAllotments || []).map((allotment) => ({
            ...publicHostelAllotment(allotment),
            studentName: studentById.get(allotment.studentId)?.name || 'Inactive student',
          }))
          const residents = allotments
            .filter((allotment) => allotment.status === 'ALLOTTED')
            .map((allotment) => ({
              studentId: allotment.studentId,
              name: allotment.studentName,
              department: studentById.get(allotment.studentId)?.department || '',
              hostelName: allotment.hostelName,
              block: allotment.block,
              floor: allotment.floor,
              roomNumber: allotment.roomNumber,
            }))
          const hostelDetails = (data.hostelDetails || []).map((entry) => ({
            ...publicHostelDetails(entry),
            studentName: studentById.get(entry.studentId)?.name || 'Inactive student',
          }))
          return json(response, 200, {
            rooms: (data.hostelRooms || []).map(publicHostelRoom),
            allotments,
            residents,
            hostelDetails,
            maintenance: (data.hostelMaintenance || []).map((requestEntry) => ({
              ...publicHostelMaintenance(requestEntry),
              studentName: studentById.get(requestEntry.studentId)?.name || 'Inactive student',
            })),
            students: students.map(({ id, name, department }) => ({ id, name, department: department || '' })),
          })
        }
        return json(response, 200, studentHostelView(data, user))
      }

      if (resource === 'details' && !resourceId && request.method === 'POST') {
        if (user.role !== ROLES.STUDENT) return reject(response, 403, 'Only students can submit their own Hostel details.')
        const details = validateHostelDetails(await body(request))
        const saved = await store.transact((data) => {
          data.hostelDetails ??= []
          const existing = data.hostelDetails.find((entry) => entry.studentId === user.id)
          const now = new Date().toISOString()
          if (existing) {
            Object.assign(existing, details, { updatedAt: now })
            return existing
          }
          const created = { ...details, studentId: user.id, createdAt: now, updatedAt: now }
          data.hostelDetails.push(created)
          return created
        })
        return json(response, 200, { hostelDetails: publicHostelDetails(saved) })
      }

      const hostelDetailsRoute = resource === 'details' && resourceId
      if (hostelDetailsRoute && request.method === 'PATCH') {
        if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required to manage Hostel details.')
        const studentId = safeDecodeURIComponent(resourceId)
        const details = validateHostelDetails(await body(request))
        const saved = await store.transact((data) => {
          data.hostelDetails ??= []
          const existing = data.hostelDetails.find((entry) => entry.studentId === studentId)
          if (!existing) throw Object.assign(new Error('Hostel details not found for this student.'), { status: 404 })
          Object.assign(existing, details, { updatedAt: new Date().toISOString() })
          return existing
        })
        const student = (await store.read()).users.find((candidate) => candidate.id === studentId)
        return json(response, 200, {
          hostelDetails: { ...publicHostelDetails(saved), studentName: student?.name || 'Inactive student' },
        })
      }

      if (resource === 'rooms' && !resourceId && request.method === 'POST') {
        if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required to manage hostel rooms.')
        const room = validateHostelRoom(await body(request))
        const created = await store.transact((data) => {
          data.hostelRooms ??= []
          if (data.hostelRooms.some((entry) => sameHostelRoom(entry, room))) {
            throw Object.assign(new Error('A room with this hostel, block, floor, and room number already exists.'), { status: 409 })
          }
          room.id = randomUUID()
          room.createdAt = new Date().toISOString()
          data.hostelRooms.unshift(room)
          return room
        })
        return json(response, 201, { room: publicHostelRoom(created) })
      }

      const roomRoute = resource === 'rooms' && resourceId
      if (roomRoute && request.method === 'PATCH') {
        if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required to manage hostel rooms.')
        const patch = validateHostelRoom(await body(request))
        const updated = await store.transact((data) => {
          data.hostelRooms ??= []
          const room = data.hostelRooms.find((entry) => entry.id === safeDecodeURIComponent(resourceId))
          if (!room) throw Object.assign(new Error('Hostel room not found.'), { status: 404 })
          if (data.hostelRooms.some((entry) => entry.id !== room.id && sameHostelRoom(entry, patch))) {
            throw Object.assign(new Error('A room with this hostel, block, floor, and room number already exists.'), { status: 409 })
          }
          const occupancy = (data.hostelAllotments || []).filter((entry) => entry.roomId === room.id && entry.status === 'ALLOTTED').length
          if (patch.capacity < occupancy) throw Object.assign(new Error('Room capacity cannot be lower than its current occupancy.'), { status: 400 })
          Object.assign(room, patch, { updatedAt: new Date().toISOString() })
          return room
        })
        return json(response, 200, { room: publicHostelRoom(updated) })
      }

      if (resource === 'allotments' && !resourceId && request.method === 'POST') {
        if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required to manage hostel allotments.')
        const input = await body(request)
        if (hasHostelBedFields(input)) return reject(response, 400, 'Bed and seat numbers are not part of hostel allotments.')
        const studentId = safeText(input.studentId, 64)
        const roomId = safeText(input.roomId, 64)
        if (!studentId || !roomId) return reject(response, 400, 'Choose a student and a hostel room.')
        const created = await store.transact((data) => {
          data.hostelRooms ??= []
          data.hostelAllotments ??= []
          const student = data.users.find((candidate) => candidate.id === studentId && candidate.role === ROLES.STUDENT && candidate.active)
          if (!student) throw Object.assign(new Error('Choose an active student account.'), { status: 400 })
          const room = data.hostelRooms.find((candidate) => candidate.id === roomId)
          if (!room) throw Object.assign(new Error('Choose a valid hostel room.'), { status: 400 })
          const previous = data.hostelAllotments.find((entry) => entry.studentId === student.id && entry.status === 'ALLOTTED')
          if (previous?.roomId === room.id) throw Object.assign(new Error('This student is already allotted to that room.'), { status: 409 })
          const occupancy = data.hostelAllotments.filter((entry) => entry.roomId === room.id && entry.status === 'ALLOTTED').length
          if (occupancy >= room.capacity) throw Object.assign(new Error('This room is at capacity.'), { status: 409 })
          const now = new Date().toISOString()
          if (previous) {
            previous.status = 'TRANSFERRED'
            previous.endedAt = now
          }
          const allotment = {
            id: randomUUID(),
            studentId: student.id,
            roomId: room.id,
            hostelName: room.hostelName,
            block: room.block,
            floor: room.floor,
            roomNumber: room.roomNumber,
            status: 'ALLOTTED',
            createdAt: now,
            endedAt: '',
          }
          data.hostelAllotments.unshift(allotment)
          return { ...allotment, studentName: student.name }
        })
        return json(response, 201, { allotment: { ...publicHostelAllotment(created), studentName: created.studentName } })
      }

      if (resource === 'maintenance' && !resourceId && request.method === 'POST') {
        if (user.role !== ROLES.STUDENT) return reject(response, 403, 'Only students can submit hostel maintenance requests.')
        const requestEntry = validateHostelMaintenance(await body(request), user)
        const created = await store.transact((data) => {
          data.hostelMaintenance ??= []
          requestEntry.id = randomUUID()
          requestEntry.createdAt = new Date().toISOString()
          data.hostelMaintenance.unshift(requestEntry)
          return requestEntry
        })
        return json(response, 201, { request: publicHostelMaintenance(created) })
      }

      const maintenanceRoute = resource === 'maintenance' && resourceId
      if (maintenanceRoute && request.method === 'PATCH') {
        if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required to update hostel maintenance requests.')
        const input = await body(request)
        if (!HOSTEL_MAINTENANCE_STATUSES.includes(input.status)) return reject(response, 400, 'Choose a valid maintenance request status.')
        const updated = await store.transact((data) => {
          data.hostelMaintenance ??= []
          const entry = data.hostelMaintenance.find((candidate) => candidate.id === safeDecodeURIComponent(resourceId))
          if (!entry) throw Object.assign(new Error('Hostel maintenance request not found.'), { status: 404 })
          entry.status = input.status
          entry.updatedAt = new Date().toISOString()
          return entry
        })
        return json(response, 200, { request: publicHostelMaintenance(updated) })
      }

      return reject(response, 404, 'Hostel service route not found.')
    }

    const campusRoute = pathname.match(/^\/api\/campus\/([^/]+)(?:\/([^/]+))?$/)
    if (campusRoute) {
      const collection = safeDecodeURIComponent(campusRoute[1])
      if (!MANAGEMENT_COLLECTIONS.includes(collection)) return reject(response, 404, 'Campus collection not found.')
      if (!canAccess(user, CAMPUS_MODULES[collection])) return reject(response, 403, 'Your role cannot access this campus service.')
      if (request.method === 'GET') {
        const data = await store.read()
        const records = collection === 'emergency' && user.role === ROLES.ADMIN
          ? campusRecords(data, collection)
          : campusRecords(data, collection).filter(isRecordActive)
        if (collection === 'emergency') {
          records.sort((left, right) => (Number(left.display_order ?? left.priority ?? 999) - Number(right.display_order ?? right.priority ?? 999)) || String(left.name || left.title).localeCompare(String(right.name || right.title)))
        }
        const visible = records.filter((record) => collection === 'emergency' && user.role === ROLES.ADMIN || isRecordActive(record))
          .filter((record) => collection !== 'notices' || !record.recipientIds || record.recipientIds.includes(user.id))
        return json(response, 200, {
          records: visible.map((record) => collection === 'notices' ? publicCampusNotice(record, user.id) : collection === 'food' ? publicCampusFoodRecord(record) : record),
        })
      }
      if (collection === 'notices') return reject(response, 403, 'Use the role-scoped Notices & Announcements system to issue notices.')
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required to manage campus data.')
      if (request.method === 'POST' && !campusRoute[2]) {
        const input = await body(request)
        if (collection === 'food' && hasRemovedCrowdFields(input)) return reject(response, 400, 'Crowd estimates are no longer supported in campus food records.')
        const record = validateCampusCollectionRecord(collection, input)
        const created = await store.transact((data) => {
          const records = campusRecords(data, collection)
          record.id = randomUUID()
          if (collection === 'emergency') {
            record.created_at = new Date().toISOString()
            record.updated_at = record.created_at
            record.created_by = user.id
            record.title = record.name
            record.description = `${record.designation || 'Campus support'}${record.location ? ` · ${record.location}` : ''}${record.description ? ` · ${record.description}` : ''}`.trim()
            record.priority = Number(record.priority ?? record.display_order ?? 1) || 1
          }
          records.unshift(record)
          if (records.length > 200) throw Object.assign(new Error('This campus collection is full.'), { status: 400 })
          return record
        })
        return json(response, 201, { record: collection === 'food' ? publicCampusFoodRecord(created) : created })
      }
      if (campusRoute[2] && request.method === 'PATCH') {
        const input = await body(request)
        if (collection === 'food' && hasRemovedCrowdFields(input)) return reject(response, 400, 'Crowd estimates are no longer supported in campus food records.')
        const existingRecord = campusRecords(await store.read(), collection).find((candidate) => candidate.id === safeDecodeURIComponent(campusRoute[2]))
        const patch = validateCampusCollectionRecord(collection, input, existingRecord || {})
        const updated = await store.transact((data) => {
          const record = campusRecords(data, collection).find((candidate) => candidate.id === safeDecodeURIComponent(campusRoute[2]))
          if (!record) throw Object.assign(new Error('Campus record not found.'), { status: 404 })
          if (collection === 'emergency') {
            record.name = patch.name
            record.category = patch.category
            record.phone_number = patch.phone_number
            record.alternate_phone = patch.alternate_phone
            record.designation = patch.designation
            record.description = patch.description
            record.location = patch.location
            record.location_url = patch.location_url
            record.hostel_name = patch.hostel_name
            record.priority = patch.priority
            record.available_24x7 = patch.available_24x7
            record.is_primary = patch.is_primary
            record.is_active = patch.is_active
            record.active = patch.active
            record.display_order = patch.display_order
            record.title = patch.name
            record.updated_at = new Date().toISOString()
            return record
          }
          record.title = patch.title
          record.description = patch.description
          return record
        })
        return json(response, 200, { record: collection === 'food' ? publicCampusFoodRecord(updated) : updated })
      }
      if (campusRoute[2] && request.method === 'DELETE') {
        const id = safeDecodeURIComponent(campusRoute[2])
        const found = await store.transact((data) => {
          const record = campusRecords(data, collection).find((candidate) => candidate.id === id)
          if (!record) return false
          record.active = false
          if (collection === 'emergency') {
            record.is_active = false
            record.is_primary = false
          }
          return true
        })
        return found ? json(response, 200, { ok: true }) : reject(response, 404, 'Campus record not found.')
      }
      return reject(response, 405, 'This operation is not available.')
    }

    if (pathname === '/api/lost-found' && request.method === 'GET') {
      if (!canAccess(user, 'lost-found')) return reject(response, 403, 'Your role cannot access Lost & Found.')
      const data = await store.read()
      const search = safeText(searchParams.get('q'), 120).toLowerCase().split(/\s+/).filter(Boolean)
      const visible = (data.lostFoundReports || [])
        .filter((record) => canViewLostFound(user, record))
        .filter((record) => searchParams.get('mine') !== '1' || record.reporterId === user.id)
        .filter((record) => !searchParams.get('type') || record.type === searchParams.get('type'))
        .filter((record) => !searchParams.get('status') || record.status === searchParams.get('status'))
        .filter((record) => !searchParams.get('category') || record.category === searchParams.get('category'))
        .filter((record) => !searchParams.get('date') || record.itemDate === searchParams.get('date') || record.createdAt.slice(0, 10) === searchParams.get('date'))
        .filter((record) => !search.length || search.every((term) =>
          [record.itemName, record.category, record.location, record.description].join(' ').toLowerCase().includes(term)))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      const serialized = visible.map((record) => publicLostFoundReport(record, user))
      const requests = (data.lostFoundReports || []).flatMap((record) => {
        const maySeeClaims = isLostFoundManager(user, record) || record.reporterId === user.id
        const visibleClaims = (record.claimRequests || []).filter((claim) => claim.claimantId === user.id || maySeeClaims)
        if (!maySeeClaims && !canViewLostFound(user, record) && !visibleClaims.length) return []
        return visibleClaims
          .map((claim) => ({ report: { id: record.id, itemName: record.itemName, category: record.category, status: record.status }, claim: publicLostFoundClaim(claim, user, record, false) }))
      })
      return json(response, 200, {
        reports: serialized,
        claimRequests: requests,
        counts: Object.fromEntries(LOST_FOUND_STATUSES.map((status) => [status, serialized.filter((record) => record.status === status).length])),
        categories: LOST_FOUND_CATEGORIES,
      })
    }

    if (pathname === '/api/lost-found' && request.method === 'POST') {
      if (!canAccess(user, 'lost-found')) return reject(response, 403, 'Your role cannot submit Lost & Found reports.')
      const input = await body(request)
      const report = validateLostFoundReport(input, user)
      const result = await store.transact(async (data) => {
        data.lostFoundReports ??= []
        const duplicate = data.lostFoundReports.find((item) => item.reporterId === user.id && item.submissionKey === report.submissionKey)
        if (duplicate) return { report: duplicate, created: false }
        const highestIssuedNumber = data.lostFoundReports.reduce((highest, item) => {
          const match = /^LF-(\d+)$/.exec(item.id)
          return match ? Math.max(highest, Number(match[1])) : highest
        }, Number.isSafeInteger(data.lostFoundCounter) ? data.lostFoundCounter : 0)
        data.lostFoundCounter = highestIssuedNumber + 1
        report.id = `LF-${String(data.lostFoundCounter).padStart(6, '0')}`
        if (report.photo) report.photo = await store.saveLostFoundPhoto(randomUUID(), report.photo.mimeType, report.photo.bytes)
        const now = new Date().toISOString()
        report.createdAt = now
        report.status = report.type
        report.claimRequests = []
        report.activity = [lostFoundActivity(user, now, `${report.type === 'LOST' ? 'Lost' : 'Found'} report submitted`, report.status)]
        data.lostFoundReports.unshift(report)
        notifyLostFoundAuthorities(data, addNotification, report)

        const match = data.lostFoundReports.find((item) =>
          item.id !== report.id
          && item.type !== report.type
          && item.status === item.type
          && item.category === report.category
          && normalizeItemName(item.itemName) === normalizeItemName(report.itemName))
        if (match) {
          const matchTime = new Date().toISOString()
          for (const item of [report, match]) {
            item.status = 'MATCHED'
            item.matchedReportId = item.id === report.id ? match.id : report.id
            item.activity.push(lostFoundActivity(null, matchTime, `Possible match found with ${item.matchedReportId}`, 'MATCHED'))
            addNotification(data, {
              recipientUserId: item.reporterId,
              title: 'Possible Lost & Found match',
              message: `A possible match was found for ${item.id} · ${item.itemName}.`,
              referenceId: item.id,
              target: 'lost-found',
            })
          }
          notifyLostFoundAuthorities(data, addNotification, report)
        }
        return { report, created: true }
      })
      return json(response, result.created ? 201 : 200, {
        report: publicLostFoundReport(result.report, user),
        duplicate: !result.created,
      })
    }

    const lostFoundPhotoRoute = pathname.match(/^\/api\/lost-found\/([^/]+)\/photo$/)
    if (lostFoundPhotoRoute && request.method === 'GET') {
      const data = await store.read()
      const report = (data.lostFoundReports || []).find((item) => item.id === safeDecodeURIComponent(lostFoundPhotoRoute[1]))
      if (!report || !canViewLostFound(user, report) || !report.photo) return reject(response, 404, 'Lost-and-found photo not found.')
      let photo
      try { photo = await store.readLostFoundPhoto(report.photo.photoId, report.photo.mimeType) } catch (error) {
        if (error.code === 'ENOENT') return reject(response, 404, 'Lost-and-found photo not found.')
        throw error
      }
      response.writeHead(200, {
        'Cache-Control': 'private, no-store',
        'Content-Type': report.photo.mimeType,
        'Content-Length': photo.length,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      })
      return response.end(photo)
    }

    const lostFoundClaimsRoute = pathname.match(/^\/api\/lost-found\/([^/]+)\/claims(?:\/([^/]+))?$/)
    if (lostFoundClaimsRoute && !lostFoundClaimsRoute[2] && request.method === 'POST') {
      const input = await body(request)
      const details = safeText(input.details, 2000)
      const submissionKey = safeText(input.submissionKey, 64)
      if (details.length < 15) return reject(response, 400, 'Provide at least 15 characters of identifying details.')
      if (!/^[a-f\d-]{36}$/i.test(submissionKey)) return reject(response, 400, 'Refresh the claim form and submit again.')
      const updated = await store.transact((data) => {
        const report = (data.lostFoundReports || []).find((item) => item.id === safeDecodeURIComponent(lostFoundClaimsRoute[1]))
        if (!report) throw Object.assign(new Error('Lost & Found report not found.'), { status: 404 })
        if (!canViewLostFound(user, report)) throw Object.assign(new Error('Lost & Found report not found.'), { status: 404 })
        if (report.type !== 'FOUND' || report.reporterId === user.id || ['RETURNED', 'CLOSED', 'CLAIM_VERIFIED'].includes(report.status)) {
          throw Object.assign(new Error('This item cannot receive another claim.'), { status: 409 })
        }
        report.claimRequests ??= []
        const duplicate = report.claimRequests.find((claim) => claim.claimantId === user.id && claim.submissionKey === submissionKey)
        if (duplicate) return { report, claim: duplicate, created: false }
        const now = new Date().toISOString()
        const claim = {
          id: randomUUID(), claimantId: user.id, claimantName: user.name, claimantRole: user.role,
          details, status: 'PENDING', submissionKey, createdAt: now, reviewedAt: null, reviewedBy: null,
        }
        report.claimRequests.unshift(claim)
        report.status = 'CLAIM_REQUESTED'
        report.activity.push(lostFoundActivity(user, now, 'Claim request received', 'CLAIM_REQUESTED'))
        const matched = (data.lostFoundReports || []).find((item) => item.id === report.matchedReportId)
        if (matched && matched.status === 'MATCHED') {
          matched.status = 'CLAIM_REQUESTED'
          matched.activity.push(lostFoundActivity(user, now, `Claim request received for matched item ${report.id}`, 'CLAIM_REQUESTED'))
        }
        addLostFoundReportUpdateNotifications(data, addNotification, report, user, 'Claim request received', `A claim request was submitted for ${report.id} · ${report.itemName}.`)
        notifyLostFoundAuthorities(data, addNotification, report)
        return { report, claim, created: true }
      })
      return json(response, updated.created ? 201 : 200, {
        report: publicLostFoundReport(updated.report, user),
        claim: publicLostFoundClaim(updated.claim, user, updated.report, false),
        duplicate: !updated.created,
      })
    }

    if (lostFoundClaimsRoute && lostFoundClaimsRoute[2] && request.method === 'PATCH') {
      const input = await body(request)
      if (!['VERIFIED', 'REJECTED'].includes(input.decision)) return reject(response, 400, 'Choose whether to verify or reject this claim.')
      const result = await store.transact((data) => {
        const report = (data.lostFoundReports || []).find((item) => item.id === safeDecodeURIComponent(lostFoundClaimsRoute[1]))
        if (!report) throw Object.assign(new Error('Lost & Found report not found.'), { status: 404 })
        if (!isLostFoundManager(user, report)) throw Object.assign(new Error('This report is outside your authorized management scope.'), { status: 403 })
        const claim = (report.claimRequests || []).find((item) => item.id === safeDecodeURIComponent(lostFoundClaimsRoute[2]))
        if (!claim) throw Object.assign(new Error('Claim request not found.'), { status: 404 })
        if (claim.status !== 'PENDING' || report.status !== 'CLAIM_REQUESTED') throw Object.assign(new Error('This claim has already been reviewed.'), { status: 409 })
        const now = new Date().toISOString()
        claim.status = input.decision
        claim.reviewedAt = now
        claim.reviewedBy = lostFoundActor(user)
        report.activity.push(lostFoundActivity(user, now, `Claim ${input.decision.toLowerCase()}`, input.decision === 'VERIFIED' ? 'CLAIM_VERIFIED' : 'CLAIM_REQUESTED'))
        if (input.decision === 'VERIFIED') {
          rejectPendingLostFoundClaims(data, report, claim.id, user, now, addNotification, 'Another claim was verified for this item.')
          report.status = 'CLAIM_VERIFIED'
          report.activity.push(lostFoundActivity(user, now, 'Claim verified', 'CLAIM_VERIFIED'))
        } else if (!report.claimRequests.some((item) => item.status === 'PENDING')) {
          report.status = report.matchedReportId ? 'MATCHED' : 'FOUND'
        }
        const matched = (data.lostFoundReports || []).find((item) => item.id === report.matchedReportId)
        if (matched && isLostFoundManager(user, matched)) {
          matched.status = report.status
          matched.activity.push(lostFoundActivity(user, now, `Matched report ${report.id} is now ${report.status.toLowerCase().replaceAll('_', ' ')}`, report.status))
        }
        addNotification(data, {
          recipientUserId: claim.claimantId,
          title: input.decision === 'VERIFIED' ? 'Claim verified' : 'Claim not verified',
          message: `Your claim for ${report.id} · ${report.itemName} was ${input.decision.toLowerCase()}.`,
          referenceId: report.id,
          target: 'lost-found',
        })
        addLostFoundReportUpdateNotifications(data, addNotification, report, user, `Claim ${input.decision.toLowerCase()}`, `${report.id} · ${report.itemName} claim status was updated.`)
        return { report, claim }
      })
      return json(response, 200, {
        report: publicLostFoundReport(result.report, user),
        claim: publicLostFoundClaim(result.claim, user, result.report, true),
      })
    }

    const lostFoundNoteRoute = pathname.match(/^\/api\/lost-found\/([^/]+)\/notes$/)
    if (lostFoundNoteRoute && request.method === 'POST') {
      if (!isLostFoundManager(user, null)) return reject(response, 403, 'Only authorized Staff, HOD, Sports Captain, and Administration can add official notes.')
      const message = safeText((await body(request)).message, 2000)
      if (message.length < 2) return reject(response, 400, 'Add an official note of at least two characters.')
      const report = await store.transact((data) => {
        const item = (data.lostFoundReports || []).find((candidate) => candidate.id === safeDecodeURIComponent(lostFoundNoteRoute[1]))
        if (!item) throw Object.assign(new Error('Lost & Found report not found.'), { status: 404 })
        if (!isLostFoundManager(user, item)) throw Object.assign(new Error('This report is outside your authorized management scope.'), { status: 403 })
        const now = new Date().toISOString()
        item.activity.push({ ...lostFoundActivity(user, now, message, item.status), type: 'note' })
        addLostFoundReportUpdateNotifications(data, addNotification, item, user, 'Report update', `An official update was added to ${item.id}.`)
        return item
      })
      return json(response, 201, { report: publicLostFoundReport(report, user) })
    }

    const lostFoundReportRoute = pathname.match(/^\/api\/lost-found\/([^/]+)$/)
    if (lostFoundReportRoute && request.method === 'GET') {
      const data = await store.read()
      const report = (data.lostFoundReports || []).find((item) => item.id === safeDecodeURIComponent(lostFoundReportRoute[1]))
      if (!report || !canViewLostFound(user, report)) return reject(response, 404, 'Lost & Found report not found.')
      return json(response, 200, { report: publicLostFoundReport(report, user) })
    }

    if (lostFoundReportRoute && request.method === 'PATCH') {
      if (!isLostFoundManager(user, null)) return reject(response, 403, 'Your role cannot manage Lost & Found reports.')
      const input = await body(request)
      if (Object.keys(input).length !== 1 || !['RETURNED', 'CLOSED'].includes(input.status)) return reject(response, 400, 'Choose an allowed Lost & Found status update.')
      const report = await store.transact((data) => {
        const item = (data.lostFoundReports || []).find((candidate) => candidate.id === safeDecodeURIComponent(lostFoundReportRoute[1]))
        if (!item) throw Object.assign(new Error('Lost & Found report not found.'), { status: 404 })
        if (!isLostFoundManager(user, item)) throw Object.assign(new Error('This report is outside your authorized management scope.'), { status: 403 })
        if (input.status === 'RETURNED' && item.status !== 'CLAIM_VERIFIED') throw Object.assign(new Error('Verify a claim before marking an item returned.'), { status: 409 })
        if (input.status === 'CLOSED' && item.status === 'CLOSED') throw Object.assign(new Error('This report is already closed.'), { status: 409 })
        const now = new Date().toISOString()
        item.status = input.status
        item.activity.push(lostFoundActivity(user, now, input.status === 'RETURNED' ? 'Item marked returned' : 'Report closed', input.status))
        rejectPendingLostFoundClaims(data, item, '', user, now, addNotification, `The item was marked ${input.status.toLowerCase()}.`)
        const matched = (data.lostFoundReports || []).find((candidate) => candidate.id === item.matchedReportId)
        if (matched && isLostFoundManager(user, matched) && matched.status !== input.status) {
          matched.status = input.status
          matched.activity.push(lostFoundActivity(user, now, `Matched report ${item.id} is now ${input.status.toLowerCase()}`, input.status))
        }
        addLostFoundReportUpdateNotifications(data, addNotification, item, user, `Lost & Found ${input.status === 'RETURNED' ? 'item returned' : 'report closed'}`, `${item.id} · ${item.itemName} is now ${input.status.toLowerCase()}.`)
        for (const claim of item.claimRequests || []) {
          if (claim.status === 'PENDING') {
            addNotification(data, {
              recipientUserId: claim.claimantId,
              title: 'Lost & Found report updated',
              message: `${item.id} · ${item.itemName} was updated to ${input.status.toLowerCase()}.`,
              referenceId: item.id,
              target: 'lost-found',
            })
          }
        }
        return item
      })
      return json(response, 200, { report: publicLostFoundReport(report, user) })
    }

    if (pathname === '/api/complaints' && request.method === 'GET') {
      if (!canAccess(user, 'complaints')) return reject(response, 403, 'Your role cannot access complaint records.')
      const data = await store.read()
      const visible = (data.complaints || [])
        .map((record) => normalizeComplaint(record, data.users))
        .filter((record) => canViewComplaint(user, record))
        .filter((record) => !searchParams.get('status') || record.status === searchParams.get('status'))
        .filter((record) => !searchParams.get('category') || record.category === searchParams.get('category'))
        .filter((record) => !searchParams.get('department') || sameDepartment(record.department, searchParams.get('department')))
        .filter((record) => !searchParams.get('role') || record.submitterRole === searchParams.get('role'))
        .filter((record) => !searchParams.get('date') || record.createdAt.slice(0, 10) === searchParams.get('date'))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      return json(response, 200, {
        complaints: visible.map((record) => publicComplaint(record)),
        counts: Object.fromEntries(COMPLAINT_STATUSES.map((status) => [status, visible.filter((record) => record.status === status).length])),
        categories: COMPLAINT_CATEGORIES,
      })
    }

    if (pathname === '/api/complaints' && request.method === 'POST') {
      if (!canAccess(user, 'complaints')) return reject(response, 403, 'Your role cannot submit complaints.')
      const input = await body(request)
      const complaint = validateComplaint(input, user)
      const result = await store.transact(async (data) => {
        data.complaints ??= []
        const duplicate = data.complaints.find((record) => record.submitterId === user.id && record.submissionKey === complaint.submissionKey)
        if (duplicate) return { complaint: normalizeComplaint(duplicate, data.users), created: false }

        const highestIssuedNumber = data.complaints.reduce((highest, record) => {
          const match = /^CMP-(\d+)$/.exec(record.id)
          return match ? Math.max(highest, Number(match[1])) : highest
        }, Number.isSafeInteger(data.complaintCounter) ? data.complaintCounter : 0)
        data.complaintCounter = highestIssuedNumber + 1
        complaint.id = `CMP-${String(data.complaintCounter).padStart(6, '0')}`
        if (complaint.photo) {
          complaint.photo = await store.saveComplaintPhoto(randomUUID(), complaint.photo.mimeType, complaint.photo.bytes)
        }
        const timestamp = new Date().toISOString()
        complaint.createdAt = timestamp
        complaint.status = 'SUBMITTED'
        complaint.assignedTo = null
        complaint.handledBy = null
        complaint.activity = [{
          id: randomUUID(), type: 'status', status: 'SUBMITTED', message: 'Complaint submitted',
          authorId: user.id, authorName: user.name, authorRole: user.role, createdAt: timestamp,
        }]
        data.complaints.unshift(complaint)

        for (const recipient of complaintAuthorities(data.users, complaint)) addNotification(data, {
          recipientUserId: recipient.id,
          title: 'New campus complaint',
          message: `${complaint.category} · ${complaint.title}`,
          referenceId: complaint.id,
          target: 'complaints',
        })
        return { complaint, created: true }
      })
      return json(response, result.created ? 201 : 200, { complaint: publicComplaint(result.complaint), duplicate: !result.created })
    }

    const complaintPhotoRoute = pathname.match(/^\/api\/complaints\/([^/]+)\/photo$/)
    if (complaintPhotoRoute && request.method === 'GET') {
      const data = await store.read()
      const record = data.complaints.find((item) => item.id === safeDecodeURIComponent(complaintPhotoRoute[1]))
      if (!record || !canViewComplaint(user, normalizeComplaint(record, data.users))) return reject(response, 404, 'Complaint photo not found.')
      const complaint = normalizeComplaint(record, data.users)
      if (!complaint.photo) return reject(response, 404, 'Complaint photo not found.')
      let photo
      try { photo = await store.readComplaintPhoto(complaint.photo.photoId, complaint.photo.mimeType) } catch (error) {
        if (error.code === 'ENOENT') return reject(response, 404, 'Complaint photo not found.')
        throw error
      }
      response.writeHead(200, {
        'Cache-Control': 'private, no-store',
        'Content-Type': complaint.photo.mimeType,
        'Content-Length': photo.length,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      })
      return response.end(photo)
    }

    const complaintRoute = pathname.match(/^\/api\/complaints\/([^/]+)(?:\/(notes))?$/)
    if (complaintRoute && request.method === 'GET') {
      const data = await store.read()
      const record = data.complaints.find((item) => item.id === safeDecodeURIComponent(complaintRoute[1]))
      if (!record) return reject(response, 404, 'Complaint not found.')
      const complaint = normalizeComplaint(record, data.users)
      if (!canViewComplaint(user, complaint)) return reject(response, 404, 'Complaint not found.')
      return json(response, 200, { complaint: publicComplaint(complaint) })
    }

    if (complaintRoute && complaintRoute[2] === 'notes' && request.method === 'POST') {
      if (!isComplaintManager(user)) return reject(response, 403, 'Your role cannot add official complaint updates.')
      const message = safeText((await body(request)).message, 2000)
      if (message.length < 2) return reject(response, 400, 'Add an official update of at least two characters.')
      const updated = await store.transact((data) => {
        const record = data.complaints.find((item) => item.id === safeDecodeURIComponent(complaintRoute[1]))
        if (!record) throw Object.assign(new Error('Complaint not found.'), { status: 404 })
        const complaint = normalizeComplaint(record, data.users)
        if (!canManageComplaint(user, complaint)) throw Object.assign(new Error('This complaint is outside your authorized scope.'), { status: 403 })
        const now = new Date().toISOString()
        complaint.activity.push({
          id: randomUUID(), type: 'note', message,
          authorId: user.id, authorName: user.name, authorRole: user.role, createdAt: now,
        })
        complaint.handledBy = { id: user.id, name: user.name, role: user.role }
        Object.assign(record, complaint)
        addComplaintSubmitterNotification(data, addNotification, complaint, 'Complaint update', 'An official added an update to your complaint.')
        return complaint
      })
      return json(response, 201, { complaint: publicComplaint(updated) })
    }

    if (complaintRoute && !complaintRoute[2] && request.method === 'PATCH') {
      if (!isComplaintManager(user)) return reject(response, 403, 'Your role cannot manage complaints.')
      const input = await body(request)
      const keys = Object.keys(input)
      if (!keys.length || keys.some((key) => !['status', 'assignedTo'].includes(key))) return reject(response, 400, 'Choose a status or assignment update.')
      if (input.status !== undefined && !COMPLAINT_STATUSES.includes(input.status)) return reject(response, 400, 'Choose a valid complaint status.')
      if (input.assignedTo !== undefined && user.role !== ROLES.ADMIN) return reject(response, 403, 'Only Administration can assign complaints.')
      if (input.assignedTo !== undefined && input.assignedTo !== null && typeof input.assignedTo !== 'string') return reject(response, 400, 'Choose a valid Staff assignment.')
      const updated = await store.transact((data) => {
        const record = data.complaints.find((item) => item.id === safeDecodeURIComponent(complaintRoute[1]))
        if (!record) throw Object.assign(new Error('Complaint not found.'), { status: 404 })
        const complaint = normalizeComplaint(record, data.users)
        if (!canManageComplaint(user, complaint)) throw Object.assign(new Error('This complaint is outside your authorized scope.'), { status: 403 })
        const now = new Date().toISOString()
        if (input.status !== undefined) {
          const next = input.status
          const allowed = {
            SUBMITTED: ['ACCEPTED', 'REJECTED'],
            ACCEPTED: ['IN_PROGRESS'],
            IN_PROGRESS: ['RESOLVED'],
            RESOLVED: [],
            REJECTED: [],
          }
          if (!allowed[complaint.status]?.includes(next)) throw Object.assign(new Error('That status transition is not allowed.'), { status: 409 })
          complaint.status = next
          complaint.activity.push({
            id: randomUUID(), type: 'status', status: next, message: `Status changed to ${complaintStatusLabel(next)}`,
            authorId: user.id, authorName: user.name, authorRole: user.role, createdAt: now,
          })
          complaint.handledBy = { id: user.id, name: user.name, role: user.role }
          addComplaintSubmitterNotification(data, addNotification, complaint, `Complaint ${complaintStatusLabel(next)}`, `Your complaint status is now ${complaintStatusLabel(next)}.`)
        }
        if (input.assignedTo !== undefined) {
          const assignee = input.assignedTo
            ? data.users.find((candidate) => candidate.id === normalizeUserId(input.assignedTo) && candidate.role === ROLES.STAFF && candidate.active && canAccess(candidate, 'complaints'))
            : null
          if (input.assignedTo && !assignee) throw Object.assign(new Error('Choose an active Staff member assigned to complaints.'), { status: 400 })
          complaint.assignedTo = assignee ? { id: assignee.id, name: assignee.name, role: assignee.role } : null
          complaint.activity.push({
            id: randomUUID(), type: 'assignment',
            message: assignee ? `Assigned to ${assignee.name} (${assignee.id})` : 'Complaint assignment removed',
            authorId: user.id, authorName: user.name, authorRole: user.role, createdAt: now,
          })
          if (assignee) addNotification(data, {
            recipientUserId: assignee.id, title: 'Complaint assigned to you',
            message: `${complaint.category} · ${complaint.title}`, referenceId: complaint.id, target: 'complaints',
          })
        }
        Object.assign(record, complaint)
        return complaint
      })
      return json(response, 200, { complaint: publicComplaint(updated) })
    }

    const sportsManager = [ROLES.SPORTS, ROLES.ADMIN].includes(user.role)
    const studentSportsRole = [ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.ADMIN].includes(user.role)
    const studentEventRegistrationPath = /^\/api\/sports\/events\/[^/]+\/register$/.test(pathname) && request.method === 'POST'
    const publicSportsEventPath = /^\/api\/sports\/events\/[^/]+$/.test(pathname) && request.method === 'GET'
    const studentSportsApplicationPath = pathname === '/api/sports/applications' && request.method === 'POST'
    const studentSportsMembershipApplicationPath = pathname === '/api/sports/membership-applications' && request.method === 'POST'
    const sportsApplicationCancelPath = /^\/api\/sports\/applications\/[^/]+$/.test(pathname) && request.method === 'PATCH'
    const sportsManagementPath = pathname.startsWith('/api/sports/')
      && pathname !== '/api/sports/student'
      && !(pathname === '/api/sports/events' && request.method === 'GET')
      && !publicSportsEventPath
      && !studentEventRegistrationPath
      && !studentSportsMembershipApplicationPath
      && !studentSportsApplicationPath
      && !sportsApplicationCancelPath
    if (sportsManagementPath && !sportsManager) return reject(response, 403, 'Sports Captain or Administration access is required.')

    if (pathname === '/api/sports' && request.method === 'GET') {
      if (!canAccess(user, 'sports')) return reject(response, 403, 'Sports information is not assigned to your role.')
      const data = await store.read()
      return json(response, 200, { records: data.sports ?? DEFAULT_SPORTS_DATA })
    }

    if (pathname === '/api/sports/student' && request.method === 'GET') {
      if (!studentSportsRole) return reject(response, 403, 'Student Sports access is not assigned to your role.')
      const data = await readSportsData(store)
      const ownRegistrations = data.sportsRegistrations.filter((entry) => entry.studentId === user.id)
        .map((entry) => publicSportsRegistration(entry, data))
      const ownMembershipApplications = data.sportsMembershipApplications.filter((entry) => entry.studentId === user.id)
      const activeTeams = data.sportsTeams.filter((team) => team.status === 'ACTIVE' && sportFor(data, team.sportId))
      const participations = activeSportsParticipations(data, user.id)
      const sportIds = new Set(participations.map((entry) => entry.sportId))
      const authorizedTeams = data.sportsTeams.filter((team) => sportIds.has(team.sportId) && team.status === 'ACTIVE')
      const registrationIds = new Set(ownRegistrations.filter((entry) => sportIds.has(entry.sportId)).map((entry) => entry.id))
      const noticeIds = new Set(data.sportsNotices.filter((notice) => notice.recipientIds?.includes(user.id)).map((notice) => notice.id))
      return json(response, 200, {
        sports: data.sports ?? DEFAULT_SPORTS_DATA,
        events: data.sportsEvents.filter(isPublicSportsEvent).map((entry) => ({
          ...publicSportsEvent(entry),
          registrationCount: data.sportsRegistrations.filter((registration) =>
            registration.eventId === entry.id && (registration.applicationType !== 'SPORTS_EVENT' || SPORTS_EVENT_CAPACITY_STATUSES.includes(registration.status))).length,
          registrationStatus: ownRegistrations.find((registration) => registration.eventId === entry.id)?.status || '',
          registrationEligible: validEventEligibility(entry, user),
          registrationAvailable: SPORTS_EVENT_VISIBLE_STATUSES.includes(sportsEventStatus(entry))
            && Date.parse(`${entry.registrationDeadline}T23:59:59`) >= Date.now()
            && sportsEventStartsAt(entry) >= Date.now()
            && validEventEligibility(entry, user)
            && !(entry.maxParticipants && data.sportsRegistrations.filter((registration) =>
              registration.eventId === entry.id && (registration.applicationType !== 'SPORTS_EVENT' || SPORTS_EVENT_CAPACITY_STATUSES.includes(registration.status))).length >= entry.maxParticipants)
            && !ownRegistrations.some((registration) => registration.eventId === entry.id),
        })),
        sportsEventRegistrations: ownRegistrations.filter((entry) => entry.applicationType === 'SPORTS_EVENT'),
        registrations: ownRegistrations,
        membershipApplications: ownMembershipApplications,
        availableTeams: activeTeams.map(({ id, name, sportId, sportName, category, teamType, description }) => ({ id, name, sportId, sportName, category, teamType, description })),
        participations,
        mySports: [...sportIds].map((sportId) => {
          const sport = (data.sports ?? DEFAULT_SPORTS_DATA).find((entry) => entry.id === sportId)
          return { sportId, sportName: sport?.title || participations.find((entry) => entry.sportId === sportId)?.sportName || '', teams: authorizedTeams.filter((team) => team.sportId === sportId).map((team) => publicSportsTeam(team, data.users)) }
        }),
        teams: authorizedTeams.map((team) => ({ ...publicSportsTeam(team, data.users), myMembership: (team.members || []).find((member) => member.studentId === user.id) || null })),
        schedules: data.sportsSchedules.filter((entry) => sportIds.has(entry.sportId) && (!entry.teamId || authorizedTeams.some((team) => team.id === entry.teamId))),
        attendance: data.sportsAttendance.filter((entry) => entry.studentId === user.id && sportIds.has(sportsAttendanceSportId(entry, data))).map((entry) => ({ ...entry, sportId: sportsAttendanceSportId(entry, data) })),
        results: data.sportsResults.filter((entry) => sportIds.has(entry.sportId) && (entry.playerIds?.includes(user.id) || entry.teamIds?.some((id) => authorizedTeams.some((team) => team.id === id)) || entry.registrationIds?.some((id) => registrationIds.has(id)))),
        achievements: data.sportsAchievements.filter((entry) => sportIds.has(entry.sportId) && (entry.studentId === user.id || entry.published === true && Boolean(entry.teamId || entry.sportId))),
        notices: data.sportsNotices.filter((entry) => noticeIds.has(entry.id)).map(publicSportsNotice),
      })
    }

    if (studentSportsMembershipApplicationPath) {
      if (![ROLES.STUDENT, ROLES.SPORTS].includes(user.role)) return reject(response, 403, 'Only students can apply to join a sport or team.')
      const input = await body(request)
      const application = await store.transact((data) => {
        data.sportsMembershipApplications ??= []
        const teamId = safeText(input.teamId, 64)
        const requestedSportId = safeText(input.sportId, 64)
        if (Boolean(teamId) === Boolean(requestedSportId)) throw Object.assign(new Error('Choose exactly one sport or team to apply for.'), { status: 400 })
        const team = teamId ? data.sportsTeams.find((entry) => entry.id === teamId && entry.status === 'ACTIVE') : null
        if (teamId && !team) throw Object.assign(new Error('Choose an active sports team.'), { status: 404 })
        const sport = sportFor(data, team?.sportId || requestedSportId)
        if (!sport) throw Object.assign(new Error('Choose an active sport.'), { status: 404 })
        if (team && team.sportId !== sport.id) throw Object.assign(new Error('The selected team does not belong to this sport.'), { status: 400 })
        if (activeSportsParticipations(data, user.id).some((entry) => entry.sportId === sport.id && (!team || entry.teamId === team.id))) {
          throw Object.assign(new Error(team ? 'You are already a member of this team.' : 'You are already participating in this sport.'), { status: 409 })
        }
        if (data.sportsMembershipApplications.some((entry) =>
          entry.studentId === user.id &&
          (team ? entry.teamId === team.id : entry.sportId === sport.id && !entry.teamId) &&
          !['REJECTED', 'CANCELLED'].includes(entry.status))) {
          throw Object.assign(new Error('You already have an application for this sport or team.'), { status: 409 })
        }
        const now = new Date().toISOString()
        const created = {
          id: randomUUID(), type: team ? 'TEAM' : 'SPORT',
          sportId: sport.id, sportName: sport.title,
          teamId: team?.id || '', teamName: team?.name || '',
          studentId: user.id, studentName: user.name,
          department: user.department || '', semester: user.semester || '',
          status: 'APPLIED', createdAt: now, updatedAt: now,
        }
        data.sportsMembershipApplications.unshift(created)
        for (const captain of data.users.filter((candidate) => candidate.active && candidate.role === ROLES.SPORTS)) {
          addNotification(data, {
            recipientUserId: captain.id,
            title: 'New sports membership application',
            message: `${user.name} applied to join ${team?.name || sport.title}.`,
            referenceId: created.id, target: 'sports-management',
          })
        }
        return created
      })
      return json(response, 201, { application })
    }

    const sportsMembershipApplicationRoute = pathname.match(/^\/api\/sports\/membership-applications\/([^/]+)$/)
    if (sportsMembershipApplicationRoute && request.method === 'PATCH') {
      const { status } = await body(request)
      if (!['APPROVED', 'REJECTED'].includes(status)) return reject(response, 400, 'Choose Approved or Rejected.')
      const updated = await store.transact((data) => {
        const application = (data.sportsMembershipApplications || []).find((entry) => entry.id === safeDecodeURIComponent(sportsMembershipApplicationRoute[1]))
        if (!application) throw Object.assign(new Error('Sports membership application not found.'), { status: 404 })
        if (application.status !== 'APPLIED') throw Object.assign(new Error('This application has already been reviewed.'), { status: 409 })
        const student = activeStudent(data, application.studentId)
        if (!student) throw Object.assign(new Error('The applicant is no longer an active student.'), { status: 409 })
        if (status === 'APPROVED') {
          const sport = sportFor(data, application.sportId)
          if (!sport) throw Object.assign(new Error('This sport is no longer active.'), { status: 409 })
          if (application.teamId) {
            const team = data.sportsTeams.find((entry) => entry.id === application.teamId && entry.status === 'ACTIVE')
            if (!team || team.sportId !== sport.id) throw Object.assign(new Error('This team is no longer active.'), { status: 409 })
            if (team.members.some((member) => member.studentId === student.id && member.status === 'ACTIVE')) throw Object.assign(new Error('This student is already a member of this team.'), { status: 409 })
            ensureTeamMember(team, student)
            team.updatedAt = new Date().toISOString()
            ensureSportsParticipation(data, student, sport.id, sport.title, { teamId: team.id, source: 'TEAM' })
          } else {
            ensureSportsParticipation(data, student, sport.id, sport.title, { source: 'SPORT' })
          }
        }
        application.status = status
        application.updatedAt = new Date().toISOString()
        addNotification(data, {
          recipientUserId: student.id,
          title: `Sports application ${status.toLowerCase()}`,
          message: `${application.teamName || application.sportName} · ${status.toLowerCase()}.`,
          referenceId: application.id, target: 'sports',
        })
        return application
      })
      return json(response, 200, { application: updated })
    }

    if (sportsApplicationCancelPath) {
      const { status } = await body(request)
      if (status !== 'CANCELLED') return reject(response, 400, 'Applications can only be cancelled.')
      const updated = await store.transact((data) => {
        const application = data.sportsRegistrations.find((entry) => entry.id === safeDecodeURIComponent(pathname.match(/^\/api\/sports\/applications\/([^/]+)$/)[1]))
        if (!application || application.studentId !== user.id) throw Object.assign(new Error('Sports application not found.'), { status: 404 })
        const cancellable = application.applicationType === 'SPORTS_EVENT'
          ? ['PENDING'].includes(application.status)
          : ['APPLIED', 'REGISTERED', 'SHORTLISTED'].includes(application.status)
        if (!cancellable) throw Object.assign(new Error('This application can no longer be cancelled.'), { status: 409 })
        application.status = 'CANCELLED'
        application.updatedAt = new Date().toISOString()
        return application
      })
      return json(response, 200, { application: publicSportsRegistration(updated, await store.read()) })
    }

    if (studentSportsApplicationPath) {
      if (!studentSportsRole) return reject(response, 403, 'Your role cannot apply for sports.')
      const input = await body(request)
      const application = await store.transact((data) => {
        const sport = sportFor(data, input.sportId)
        if (!sport) throw Object.assign(new Error('Choose an active sport.'), { status: 400 })
        data.sportsRegistrations ??= []
        if (data.sportsRegistrations.some((entry) =>
          entry.applicationType === 'SPORT' && entry.studentId === user.id && entry.sportId === sport.id &&
          ['SUBMITTED', 'SHORTLISTED', 'SELECTED'].includes(entry.status))) {
          throw Object.assign(new Error('You already have an active application for this sport.'), { status: 409 })
        }
        const details = safeText(input.details, 2000)
        if (details.length < 10) throw Object.assign(new Error('Add at least 10 characters of relevant details.'), { status: 400 })
        const now = new Date().toISOString()
        const created = {
          id: randomUUID(), applicationType: 'SPORT', eventId: '', eventName: '',
          sportId: sport.id, sportName: sport.title, studentId: user.id,
          studentName: user.name, department: user.department || '',
          semester: user.semester || '', mobile: user.mobile || '',
          position: safeText(input.position, 80), details,
          status: 'SUBMITTED', createdAt: now, updatedAt: now,
        }
        data.sportsRegistrations.unshift(created)
        return created
      })
      return json(response, 201, { application: publicSportsRegistration(application, await store.read()) })
    }

    if (pathname === '/api/sports/management' && request.method === 'GET') {
      const data = await readSportsData(store)
      const upcomingEvents = data.sportsEvents.filter((entry) => SPORTS_EVENT_VISIBLE_STATUSES.includes(sportsEventStatus(entry)) && sportsEventStartsAt(entry) >= Date.now())
      const upcomingMatches = data.sportsSchedules.filter((entry) => entry.kind === 'MATCH' && Date.parse(`${entry.date}T${entry.time || '23:59'}:00`) >= Date.now())
      const activities = [
        ...data.sportsRegistrations.map((entry) => ({ id: entry.id, type: 'Application', title: `${entry.studentName} applied for ${entry.eventName || entry.sportName}`, createdAt: entry.createdAt })),
        ...(data.sportsMembershipApplications || []).map((entry) => ({ id: entry.id, type: 'Membership application', title: `${entry.studentName} applied to join ${entry.teamName || entry.sportName}`, createdAt: entry.createdAt })),
        ...data.sportsEvents.map((entry) => ({ id: entry.id, type: 'Event', title: entry.name, createdAt: entry.createdAt })),
        ...data.sportsTeams.map((entry) => ({ id: entry.id, type: 'Team', title: `Team created: ${entry.name}`, createdAt: entry.createdAt })),
        ...data.sportsSchedules.map((entry) => ({ id: entry.id, type: 'Schedule', title: `Scheduled: ${entry.title}`, createdAt: entry.createdAt })),
        ...data.sportsResults.map((entry) => ({ id: entry.id, type: 'Result', title: `Result: ${entry.eventName || entry.sportName} · ${entry.winner}`, createdAt: entry.createdAt })),
        ...data.sportsAchievements.map((entry) => ({ id: entry.id, type: 'Achievement', title: `${entry.studentName} · ${entry.competition}`, createdAt: entry.createdAt })),
        ...data.sportsNotices.map((entry) => ({ id: entry.id, type: 'Notice', title: entry.title, createdAt: entry.createdAt })),
      ]
      return json(response, 200, {
        sports: data.sports ?? DEFAULT_SPORTS_DATA,
        events: data.sportsEvents.map(publicSportsEvent),
        registrations: data.sportsRegistrations.map((entry) => publicSportsRegistration(entry, data)),
        departments: SPORTS_DEPARTMENTS,
        membershipApplications: data.sportsMembershipApplications || [],
        teams: data.sportsTeams.map((team) => publicSportsTeam(team, data.users)),
        schedules: data.sportsSchedules,
        attendance: data.sportsAttendance,
        results: data.sportsResults,
        achievements: data.sportsAchievements.map((entry) => publicSportsAchievement(entry, data.users)),
        notices: data.sportsNotices.map(publicSportsNotice),
        students: data.users.filter((candidate) => candidate.active && [ROLES.STUDENT, ROLES.SPORTS].includes(candidate.role)).map(publicSportsStudent),
        dashboard: {
          totalSports: (data.sports ?? DEFAULT_SPORTS_DATA).filter((entry) => entry.active !== false && ['Sport', 'Team'].includes(entry.kind)).length,
          totalPlayers: new Set(data.sportsTeams.flatMap((team) => (team.members || []).filter((entry) => entry.status === 'ACTIVE' && activeStudent(data, entry.studentId)).map((entry) => entry.studentId))).size,
          totalTeams: data.sportsTeams.length,
          upcomingEvents: upcomingEvents.length + upcomingMatches.length,
          pendingRegistrations: data.sportsRegistrations.filter((entry) => ['SUBMITTED', 'APPLIED', 'REGISTERED', 'SHORTLISTED', 'PENDING'].includes(entry.status)).length + (data.sportsMembershipApplications || []).filter((entry) => entry.status === 'APPLIED').length,
          pendingMembershipApplications: (data.sportsMembershipApplications || []).filter((entry) => entry.status === 'APPLIED').length,
          activeTeams: data.sportsTeams.filter((team) => team.status === 'ACTIVE').length,
          recentActivities: activities.filter((entry) => entry.createdAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
        },
      })
    }

    if (pathname === '/api/sports' && request.method === 'POST') {
      if (!sportsManager) return reject(response, 403, 'Sports Captain or Administration access is required.')
      const input = await body(request)
      const record = validateSportsRecord(input)
      const created = await store.transact((data) => {
        data.sports ??= [...DEFAULT_SPORTS_DATA]
        if (data.sports.length >= 150) throw Object.assign(new Error('The sports directory is full.'), { status: 400 })
        if (record.kind === 'Sport' && data.sports.some((entry) => ['Sport', 'Team'].includes(entry.kind) && entry.title.toLowerCase() === record.title.toLowerCase())) throw Object.assign(new Error('This sport already exists.'), { status: 409 })
        record.id = randomUUID()
        data.sports.unshift(record)
        return record
      })
      return json(response, 201, { record: created })
    }

    const sportsRoute = pathname.match(/^\/api\/sports\/([^/]+)$/)
    if (sportsRoute && (request.method === 'PATCH' || request.method === 'DELETE')) {
      if (!sportsManager) return reject(response, 403, 'Sports Captain or Administration access is required.')
      const id = safeDecodeURIComponent(sportsRoute[1])
      if (request.method === 'DELETE') return reject(response, 409, 'Sports records are retained for historical references. Deactivate the sport instead.')
      const input = await body(request)
      const updated = await store.transact((data) => {
        data.sports ??= [...DEFAULT_SPORTS_DATA]
        const record = data.sports.find((candidate) => candidate.id === id)
        if (!record) throw Object.assign(new Error('Sports record not found.'), { status: 404 })
        const patch = validateSportsRecord({ ...record, ...input })
        if (patch.kind === 'Sport' && data.sports.some((entry) => entry.id !== id && ['Sport', 'Team'].includes(entry.kind) && entry.title.toLowerCase() === patch.title.toLowerCase())) throw Object.assign(new Error('This sport already exists.'), { status: 409 })
        Object.assign(record, patch)
        return record
      })
      return json(response, 200, { record: updated })
    }

    if (pathname === '/api/sports/students' && request.method === 'GET') {
      const data = await store.read()
      return json(response, 200, { students: data.users.filter((candidate) => candidate.active && candidate.role === ROLES.STUDENT).map(publicSportsStudent) })
    }

    if (pathname === '/api/sports/events' && request.method === 'GET') {
      if (!studentSportsRole) return reject(response, 403, 'Student Sports access is not assigned to your role.')
      const data = await readSportsData(store)
      return json(response, 200, { events: data.sportsEvents.filter(isPublicSportsEvent).map(publicSportsEvent) })
    }

    const sportsEventRoute = pathname.match(/^\/api\/sports\/events\/([^/]+)$/)
    if (sportsEventRoute && request.method === 'GET') {
      if (!studentSportsRole) return reject(response, 403, 'Student Sports access is not assigned to your role.')
      const data = await readSportsData(store)
      const event = data.sportsEvents.find((entry) => entry.id === decodeURIComponent(sportsEventRoute[1]))
      if (!event || !sportsManager && !isPublicSportsEvent(event)) return reject(response, 404, 'Sports event not found.')
      return json(response, 200, { event: publicSportsEvent(event) })
    }

    if (pathname === '/api/sports/events' && request.method === 'POST') {
      const input = await body(request)
      const created = await store.transact((data) => {
        const event = validateSportsEvent(input, data)
        event.id = randomUUID()
        event.createdAt = new Date().toISOString()
        event.updatedAt = event.createdAt
        data.sportsEvents.unshift(event)
        if (SPORTS_EVENT_VISIBLE_STATUSES.includes(event.status)) notifySportsEventAudience(data, event, addNotification)
        return event
      })
      return json(response, 201, { event: publicSportsEvent(created) })
    }

    if (sportsEventRoute && request.method === 'PATCH') {
      const eventId = safeDecodeURIComponent(sportsEventRoute[1])
      const input = await body(request)
      const updated = await store.transact((data) => {
        const event = data.sportsEvents.find((entry) => entry.id === eventId)
        if (!event) throw Object.assign(new Error('Sports event or trial not found.'), { status: 404 })
        const normalizedStatus = input.status === 'OPEN' ? 'REGISTRATION_OPEN' : input.status === 'CLOSED' ? 'REGISTRATION_CLOSED' : input.status
        const mergedInput = { ...event, ...input, ...(normalizedStatus === undefined ? {} : { status: normalizedStatus }) }
        if (input.time !== undefined && input.startTime === undefined) mergedInput.startTime = input.time
        const patch = validateSportsEvent(mergedInput, data, { partial: true })
        const wasPublished = SPORTS_EVENT_PUBLISHED_STATUSES.includes(sportsEventStatus(event))
        Object.assign(event, patch, { updatedAt: new Date().toISOString() })
        if (!wasPublished && SPORTS_EVENT_VISIBLE_STATUSES.includes(event.status)) notifySportsEventAudience(data, event, addNotification)
        return event
      })
      return json(response, 200, { event: publicSportsEvent(updated) })
    }

    const sportsRegistrationRoute = pathname.match(/^\/api\/sports\/events\/([^/]+)\/register$/)
    if (sportsRegistrationRoute && request.method === 'POST') {
      if (![ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS].includes(user.role)) return reject(response, 403, 'Your role cannot apply for sports events.')
      const registration = await store.transact((data) => {
        const event = data.sportsEvents.find((entry) => entry.id === safeDecodeURIComponent(sportsRegistrationRoute[1]))
        if (event) normalizeStoredSportsEvent(event)
        for (const entry of data.sportsRegistrations.filter((candidate) => candidate.eventId === event?.id && candidate.applicationType === 'SPORTS_EVENT')) {
          normalizeSportsEventRegistration(entry)
        }
        if (!event || !SPORTS_EVENT_VISIBLE_STATUSES.includes(sportsEventStatus(event))) throw Object.assign(new Error('This event is not open for registration.'), { status: 409 })
        if (event.registrationRequired === false) throw Object.assign(new Error('This event or trial does not require registration.'), { status: 409 })
        if (!sportFor(data, event.sportId)) throw Object.assign(new Error('This event’s sport is no longer active.'), { status: 409 })
        if (!validEventEligibility(event, user)) throw Object.assign(new Error('You are not eligible to register for this event.'), { status: 403 })
        const now = new Date()
        if (Date.parse(`${event.registrationDeadline}T23:59:59`) < now.getTime()) throw Object.assign(new Error('The registration deadline has passed.'), { status: 409 })
        if (sportsEventStartsAt(event) < now.getTime()) throw Object.assign(new Error('This event has already started.'), { status: 409 })
        if (data.sportsRegistrations.some((entry) => entry.eventId === event.id && entry.studentId === user.id)) throw Object.assign(new Error('You already have a registration for this event.'), { status: 409 })
        if (event.maxParticipants && data.sportsRegistrations.filter((entry) => entry.eventId === event.id && (entry.applicationType !== 'SPORTS_EVENT' || SPORTS_EVENT_CAPACITY_STATUSES.includes(entry.status))).length >= event.maxParticipants) throw Object.assign(new Error('This event has reached its participant limit.'), { status: 409 })
        const registeredAt = now.toISOString()
        const created = {
          id: randomUUID(), applicationType: 'SPORTS_EVENT', eventId: event.id,
          eventName: event.name, sportId: event.sportId, sportName: event.sportName,
          studentId: user.id, studentName: user.name, userId: user.id, userName: user.name,
          department: normalizeSportsDepartment(user.department) || user.department || '', course: user.course || '',
          semester: user.semester || user.admissionYear || '', mobile: user.mobile || '',
          status: SPORTS_EVENT_REGISTRATION_STATUS.PENDING, registrationDateTime: registeredAt,
          createdAt: registeredAt, updatedAt: registeredAt,
        }
        data.sportsRegistrations.unshift(created)
        return created
      })
      return json(response, 201, { registration: publicSportsRegistration(registration, await store.read()) })
    }

    if (pathname === '/api/sports/registrations' && request.method === 'GET') {
      const data = await store.read()
      return json(response, 200, { registrations: data.sportsRegistrations.map((entry) => publicSportsRegistration(entry, data)) })
    }

    const sportsParticipantRoute = pathname.match(/^\/api\/sports\/registrations\/([^/]+)$/)
    if (sportsParticipantRoute && request.method === 'PATCH') {
      const { status } = await body(request)
      const updated = await store.transact((data) => {
        const registration = data.sportsRegistrations.find((entry) => entry.id === safeDecodeURIComponent(sportsParticipantRoute[1]))
        const isSportsEvent = registration?.applicationType === 'SPORTS_EVENT'
        const transitions = isSportsEvent
          ? { [SPORTS_EVENT_REGISTRATION_STATUS.PENDING]: [SPORTS_EVENT_REGISTRATION_STATUS.ACCEPTED, SPORTS_EVENT_REGISTRATION_STATUS.REJECTED] }
          : registration?.applicationType === 'SPORT'
          ? { SUBMITTED: ['SHORTLISTED', 'REJECTED'], SHORTLISTED: ['SELECTED', 'REJECTED'], SELECTED: [], REJECTED: [] }
          : { APPLIED: ['SHORTLISTED', 'REJECTED'], REGISTERED: ['SHORTLISTED', 'REJECTED'], SHORTLISTED: ['SELECTED', 'REJECTED'], SELECTED: ['REJECTED'], REJECTED: [], CANCELLED: [] }
        if (!registration) throw Object.assign(new Error('Sports registration not found.'), { status: 404 })
        if (!transitions[registration.status]?.includes(status)) throw Object.assign(new Error('That player selection transition is not allowed.'), { status: 409 })
        registration.status = status
        registration.updatedAt = new Date().toISOString()
        if (!isSportsEvent && (status === 'SELECTED' || status === 'REJECTED')) {
          const source = registration.applicationType === 'SPORT' ? 'APPLICATION' : 'EVENT'
          const existing = data.sportsParticipations.find((entry) =>
            entry.userId === registration.studentId && entry.sportId === registration.sportId &&
            (source === 'APPLICATION' ? entry.source === source && entry.applicationId === registration.id : entry.source === source && entry.eventId === registration.eventId))
          const participation = existing || {
            id: randomUUID(), userId: registration.studentId, sportId: registration.sportId,
            sportName: registration.sportName, eventId: registration.eventId,
            eventName: registration.eventName, applicationId: source === 'APPLICATION' ? registration.id : '',
            source, createdAt: registration.createdAt,
          }
          participation.status = status
          participation.active = status === 'SELECTED'
          participation.selectedAt = status === 'SELECTED' ? new Date().toISOString() : participation.selectedAt || null
          participation.updatedAt = new Date().toISOString()
          if (!existing) data.sportsParticipations.unshift(participation)
        }
        const student = data.users.find((candidate) => candidate.id === registration.studentId && candidate.active)
        if (student) {
          const title = isSportsEvent ? `Sports Event registration ${status.toLowerCase()}` : registration.applicationType === 'SPORT' ? `Sports application ${status.toLowerCase()}` : `Sports trial ${status.toLowerCase()}`
          const message = isSportsEvent
            ? `${registration.eventName} · ${registration.sportName} · Your registration was ${status.toLowerCase()}.`
            : status === 'SELECTED'
            ? registration.applicationType === 'SPORT' ? 'You are now an active participant in this sport.' : 'You are eligible for team selection.'
            : `${registration.sportName}${registration.eventName ? ` · ${registration.eventName}` : ''} · Your status is ${status.toLowerCase()}.`
          addNotification(data, { recipientUserId: student.id, title, message, referenceId: registration.eventId || registration.id, target: 'sports' })
        }
        return registration
      })
      return json(response, 200, { registration: publicSportsRegistration(updated, await store.read()) })
    }

    if (pathname === '/api/sports/teams' && request.method === 'GET') {
      const data = await store.read()
      return json(response, 200, { teams: data.sportsTeams.map((team) => publicSportsTeam(team, data.users)) })
    }

    if (pathname === '/api/sports/teams' && request.method === 'POST') {
      const input = await body(request)
      const created = await store.transact((data) => {
        const team = validateSportsTeam(input, data)
        const captain = activeStudent(data, team.captainId)
        const vice = team.viceCaptainId ? activeStudent(data, team.viceCaptainId) : null
        if (!captain || team.viceCaptainId && !vice) throw Object.assign(new Error('Captain and vice-captain must be existing active Student accounts.'), { status: 400 })
        if (team.captainId === team.viceCaptainId) throw Object.assign(new Error('Captain and vice-captain must be different students.'), { status: 400 })
        if (data.sportsTeams.some((entry) => entry.name.toLowerCase() === team.name.toLowerCase() && entry.status !== 'ARCHIVED')) throw Object.assign(new Error('An active or inactive team with this name already exists.'), { status: 409 })
        const now = new Date().toISOString()
        team.id = randomUUID()
        team.status = 'ACTIVE'
        team.createdAt = team.updatedAt = now
        team.members = [captain, ...(vice ? [vice] : [])].map((student) => ({ studentId: student.id, name: student.name, department: student.department || '', semester: student.semester || '', course: student.course || '', position: student.id === team.captainId ? 'Captain' : 'Vice-Captain', status: 'ACTIVE', dateAdded: now }))
        for (const student of [captain, ...(vice ? [vice] : [])]) ensureSportsParticipation(data, student, team.sportId, team.sportName, { teamId: team.id, source: 'TEAM' })
        data.sportsTeams.unshift(team)
        return team
      })
      return json(response, 201, { team: publicSportsTeam(created, (await store.read()).users) })
    }

    const sportsTeamRoute = pathname.match(/^\/api\/sports\/teams\/([^/]+)$/)
    if (sportsTeamRoute && request.method === 'GET') {
      const data = await store.read()
      const team = data.sportsTeams.find((entry) => entry.id === safeDecodeURIComponent(sportsTeamRoute[1]))
      return team ? json(response, 200, { team: publicSportsTeam(team, data.users) }) : reject(response, 404, 'Sports team not found.')
    }
    if (sportsTeamRoute && request.method === 'PATCH') {
      const input = await body(request)
      const updated = await store.transact((data) => {
        const team = data.sportsTeams.find((entry) => entry.id === safeDecodeURIComponent(sportsTeamRoute[1]))
        if (!team) throw Object.assign(new Error('Sports team not found.'), { status: 404 })
        const next = validateSportsTeam({ ...team, ...input }, data, { partial: true })
        if (input.status !== undefined && !['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(input.status)) throw Object.assign(new Error('Choose ACTIVE, INACTIVE, or ARCHIVED team status.'), { status: 400 })
        if (input.captainId !== undefined || input.viceCaptainId !== undefined) {
          const captainId = next.captainId
          const viceCaptainId = next.viceCaptainId
          const captain = activeStudent(data, captainId)
          const vice = viceCaptainId ? activeStudent(data, viceCaptainId) : null
          if (!captain || viceCaptainId && !vice) throw Object.assign(new Error('Captain and vice-captain must be existing active Student accounts.'), { status: 400 })
          if (captainId === viceCaptainId) throw Object.assign(new Error('Captain and vice-captain must be different students.'), { status: 400 })
          ensureTeamMember(team, captain)
          if (vice) ensureTeamMember(team, vice)
          ensureSportsParticipation(data, captain, team.sportId, team.sportName, { teamId: team.id, source: 'TEAM' })
          if (vice) ensureSportsParticipation(data, vice, team.sportId, team.sportName, { teamId: team.id, source: 'TEAM' })
          for (const member of team.members) {
            if (member.studentId === captainId) member.position = 'Captain'
            else if (member.studentId === viceCaptainId) member.position = 'Vice-Captain'
            else if (['Captain', 'Vice-Captain'].includes(member.position)) member.position = 'Player'
          }
        }
        Object.assign(team, next, { updatedAt: new Date().toISOString() })
        for (const member of team.members) syncTeamParticipation(data, team, member.studentId)
        return team
      })
      return json(response, 200, { team: publicSportsTeam(updated, (await store.read()).users) })
    }

    const sportsMembersRoute = pathname.match(/^\/api\/sports\/teams\/([^/]+)\/members(?:\/([^/]+))?$/)
    if (sportsMembersRoute && request.method === 'POST' && !sportsMembersRoute[2]) {
      const input = await body(request)
      const updated = await store.transact((data) => {
        const team = data.sportsTeams.find((entry) => entry.id === safeDecodeURIComponent(sportsMembersRoute[1]))
        if (!team) throw Object.assign(new Error('Sports team not found.'), { status: 404 })
        if (team.status !== 'ACTIVE') throw Object.assign(new Error('Players can only be added to an active team.'), { status: 409 })
        const student = activeStudent(data, input.studentId)
        if (!student) throw Object.assign(new Error('Choose an existing active Student account.'), { status: 400 })
        if (team.members.some((entry) => entry.studentId === student.id)) throw Object.assign(new Error('This student is already on the team.'), { status: 409 })
        if (input.registrationId) {
          const selection = data.sportsRegistrations.find((entry) => entry.id === input.registrationId && entry.studentId === student.id && entry.status === 'SELECTED' && entry.sportId === team.sportId)
          if (!selection) throw Object.assign(new Error('Only a student selected for this sport can be added from a trial.'), { status: 400 })
        }
        team.members.push({ studentId: student.id, name: student.name, department: student.department || '', semester: student.semester || '', course: student.course || '', position: safeText(input.position, 60) || 'Player', status: 'ACTIVE', dateAdded: new Date().toISOString() })
        const sport = sportFor(data, team.sportId)
        ensureSportsParticipation(data, student, team.sportId, sport?.title || team.sportName, { teamId: team.id, source: 'TEAM' })
        team.updatedAt = new Date().toISOString()
        return team
      })
      return json(response, 201, { team: publicSportsTeam(updated, (await store.read()).users) })
    }
    if (sportsMembersRoute && sportsMembersRoute[2] && request.method === 'PATCH') {
      const input = await body(request)
      const updated = await store.transact((data) => {
        const team = data.sportsTeams.find((entry) => entry.id === safeDecodeURIComponent(sportsMembersRoute[1]))
        const member = team?.members.find((entry) => entry.studentId === normalizeUserId(sportsMembersRoute[2]))
        if (!team || !member) throw Object.assign(new Error('Team player not found.'), { status: 404 })
        if (!['ACTIVE', 'INACTIVE'].includes(input.status)) throw Object.assign(new Error('Choose ACTIVE or INACTIVE player status.'), { status: 400 })
        if (input.status === 'INACTIVE' && [team.captainId, team.viceCaptainId].includes(member.studentId)) throw Object.assign(new Error('Assign a different captain or vice-captain before deactivating this player.'), { status: 409 })
        member.status = input.status
        member.position = input.position === undefined ? member.position : safeText(input.position, 60) || 'Player'
        syncTeamParticipation(data, team, member.studentId)
        team.updatedAt = new Date().toISOString()
        return team
      })
      return json(response, 200, { team: publicSportsTeam(updated, (await store.read()).users) })
    }
    if (sportsMembersRoute && sportsMembersRoute[2] && request.method === 'DELETE') {
      const updated = await store.transact((data) => {
        const team = data.sportsTeams.find((entry) => entry.id === safeDecodeURIComponent(sportsMembersRoute[1]))
        const studentId = normalizeUserId(sportsMembersRoute[2])
        if (!team || !team.members.some((entry) => entry.studentId === studentId)) throw Object.assign(new Error('Team player not found.'), { status: 404 })
        if ([team.captainId, team.viceCaptainId].includes(studentId)) throw Object.assign(new Error('Assign a different captain or vice-captain before removing this player.'), { status: 409 })
        team.members = team.members.filter((entry) => entry.studentId !== studentId)
        syncTeamParticipation(data, team, studentId, false)
        team.updatedAt = new Date().toISOString()
        return team
      })
      return json(response, 200, { team: publicSportsTeam(updated, (await store.read()).users) })
    }

    if (pathname === '/api/sports/schedules' && request.method === 'GET') {
      const data = await store.read()
      return json(response, 200, { schedules: data.sportsSchedules })
    }
    if (pathname === '/api/sports/schedules' && request.method === 'POST') {
      const input = await body(request)
      const created = await store.transact((data) => {
        const schedule = validateSportsSchedule(input, data)
        schedule.id = randomUUID()
        schedule.createdAt = new Date().toISOString()
        data.sportsSchedules.unshift(schedule)
        return schedule
      })
      return json(response, 201, { schedule: created })
    }
    const sportsScheduleRoute = pathname.match(/^\/api\/sports\/schedules\/([^/]+)$/)
    if (sportsScheduleRoute && request.method === 'PATCH') {
      const input = await body(request)
      const updated = await store.transact((data) => {
        const schedule = data.sportsSchedules.find((entry) => entry.id === safeDecodeURIComponent(sportsScheduleRoute[1]))
        if (!schedule) throw Object.assign(new Error('Sports schedule not found.'), { status: 404 })
        Object.assign(schedule, validateSportsSchedule({ ...schedule, ...input }, data, { partial: true }), { updatedAt: new Date().toISOString() })
        return schedule
      })
      return json(response, 200, { schedule: updated })
    }

    if (pathname === '/api/sports/attendance' && request.method === 'GET') {
      const data = await store.read()
      return json(response, 200, { attendance: data.sportsAttendance.map((entry) => ({ ...entry, student: publicSportsStudent(data.users.find((candidate) => candidate.id === entry.studentId)) })) })
    }
    if (pathname === '/api/sports/attendance' && request.method === 'POST') {
      const input = await body(request)
      if (!Array.isArray(input.records) || !input.records.length) return reject(response, 400, 'Provide at least one attendance record.')
      const updated = await store.transact((data) => {
        const subject = input.scheduleId ? data.sportsSchedules.find((entry) => entry.id === input.scheduleId) : data.sportsEvents.find((entry) => entry.id === input.eventId)
        if (!subject) throw Object.assign(new Error('Choose an existing sports event or schedule.'), { status: 400 })
        const now = new Date().toISOString()
        for (const item of input.records) {
          if (!['PRESENT', 'ABSENT'].includes(item.status)) throw Object.assign(new Error('Attendance must be PRESENT or ABSENT.'), { status: 400 })
          const student = activeStudent(data, item.studentId)
          if (!student) throw Object.assign(new Error('Attendance is limited to existing active Student accounts.'), { status: 400 })
          if (input.eventId && !data.sportsRegistrations.some((entry) => entry.eventId === subject.id && entry.studentId === student.id && entry.status !== 'REJECTED')) throw Object.assign(new Error('Event attendance is limited to registered participants.'), { status: 400 })
          if (input.scheduleId && subject.teamId && !data.sportsTeams.find((team) => team.id === subject.teamId)?.members.some((member) => member.studentId === student.id && member.status === 'ACTIVE')) throw Object.assign(new Error('Practice and match attendance is limited to active team members.'), { status: 400 })
          const existing = data.sportsAttendance.find((entry) => entry.studentId === student.id && entry.subjectId === subject.id)
          if (existing) Object.assign(existing, { status: item.status, sportId: subject.sportId, teamId: subject.teamId || '', date: subject.date, updatedAt: now, markedBy: user.id })
          else data.sportsAttendance.unshift({ id: randomUUID(), subjectId: subject.id, subjectName: subject.name || subject.title, subjectType: input.scheduleId ? 'SCHEDULE' : 'EVENT', sportId: subject.sportId, teamId: subject.teamId || '', date: subject.date, studentId: student.id, status: item.status, markedBy: user.id, createdAt: now, updatedAt: now })
        }
        return data.sportsAttendance
      })
      return json(response, 200, { attendance: updated })
    }

    if (pathname === '/api/sports/results' && request.method === 'GET') {
      const data = await store.read()
      return json(response, 200, { results: data.sportsResults })
    }
    if (pathname === '/api/sports/results' && request.method === 'POST') {
      const input = await body(request)
      const created = await store.transact((data) => {
        const result = validateSportsResult(input, data)
        result.id = randomUUID()
        result.createdAt = new Date().toISOString()
        data.sportsResults.unshift(result)
        return result
      })
      return json(response, 201, { result: created })
    }

    if (pathname === '/api/sports/achievements' && request.method === 'GET') {
      const data = await store.read()
      return json(response, 200, { achievements: data.sportsAchievements.map((entry) => publicSportsAchievement(entry, data.users)) })
    }
    if (pathname === '/api/sports/achievements' && request.method === 'POST') {
      const input = await body(request)
      const created = await store.transact((data) => {
        const achievement = validateSportsAchievement(input, data)
        achievement.id = randomUUID()
        achievement.createdAt = new Date().toISOString()
        data.sportsAchievements.unshift(achievement)
        return achievement
      })
      return json(response, 201, { achievement: publicSportsAchievement(created, (await store.read()).users) })
    }
    const sportsAchievementRoute = pathname.match(/^\/api\/sports\/achievements\/([^/]+)$/)
    if (sportsAchievementRoute && request.method === 'PATCH') {
      const input = await body(request)
      const updated = await store.transact((data) => {
        const achievement = data.sportsAchievements.find((entry) => entry.id === safeDecodeURIComponent(sportsAchievementRoute[1]))
        if (!achievement) throw Object.assign(new Error('Sports achievement not found.'), { status: 404 })
        Object.assign(achievement, validateSportsAchievement({ ...achievement, ...input }, data, { partial: true }), { updatedAt: new Date().toISOString() })
        return achievement
      })
      return json(response, 200, { achievement: publicSportsAchievement(updated, (await store.read()).users) })
    }

    if (pathname === '/api/sports/notices' && request.method === 'GET') {
      const data = await store.read()
      return json(response, 200, { notices: data.sportsNotices.map(publicSportsNotice) })
    }
    if (pathname === '/api/sports/notices' && request.method === 'POST') {
      const input = await body(request)
      const notice = validateSportsNotice(input)
      const created = await store.transact((data) => {
        const recipientIds = sportsNoticeRecipients(notice, data)
        if (!recipientIds.length) throw Object.assign(new Error('No active students match this sports notice audience.'), { status: 400 })
        const targetTeam = notice.audienceType === 'TEAM' || notice.audienceType === 'ACTIVE' ? data.sportsTeams.find((entry) => entry.id === notice.audienceId) : null
        const targetEvent = notice.audienceType === 'EVENT' || notice.audienceType === 'ACTIVE' ? data.sportsEvents.find((entry) => entry.id === notice.audienceId) : null
        const targetSport = ['SPORT', 'ACTIVE'].includes(notice.audienceType) ? sportFor(data, notice.audienceId) : null
        notice.sportId = targetSport?.id || targetTeam?.sportId || targetEvent?.sportId || ''
        notice.id = randomUUID()
        notice.createdAt = new Date().toISOString()
        notice.createdBy = user.id
        notice.recipientIds = recipientIds
        data.sportsNotices.unshift(notice)
        for (const recipientUserId of recipientIds) addNotification(data, { recipientUserId, title: notice.title, message: notice.message, referenceId: notice.id, target: 'sports' })
        return notice
      })
      return json(response, 201, { notice: publicSportsNotice(created), recipientCount: created.recipientIds.length })
    }

    return reject(response, 404, 'Campus API route not found.')
  }

  async function serveStatic(request, response, pathname) {
    if (!staticDirectory) return false
    const decodedPathname = safeDecodeURIComponent(pathname)
    if (!decodedPathname || decodedPathname.includes('\0')) return false
    const candidate = resolve(staticDirectory, `.${decodedPathname}`)
    if (!candidate.startsWith(`${resolve(staticDirectory)}/`) && candidate !== resolve(staticDirectory)) return false
    try {
      const info = await stat(candidate)
      if (!info.isFile()) return false
      const content = await readFile(candidate)
      response.writeHead(200, {
        'Cache-Control': basename(candidate) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        'Content-Type': MIME_TYPES[extname(candidate)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      })
      response.end(content)
      return true
    } catch {
      return false
    }
  }

  return async function campusRequestHandler(request, response) {
    const host = String(request.headers.host || '').replace(/:\d+$/, '').toLowerCase()
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(host)
    const forwardedHost = host.endsWith('.app.github.dev') || host.endsWith('.github.dev')
    const configuredHost = process.env.CAMPUS_ALLOWED_HOST && host === process.env.CAMPUS_ALLOWED_HOST.toLowerCase()
    if (!localHost && !forwardedHost && !configuredHost) return reject(response, 403, 'This campus host is not allowed.')
    let pathname
    try { pathname = new URL(request.url, 'http://campus.local').pathname } catch { return reject(response, 400, 'Invalid request URL.') }
    try {
      if (pathname.startsWith('/api/')) {
        return await handleApi(request, response, pathname, new URL(request.url, 'http://campus.local').searchParams)
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return reject(response, 404, 'Page not found.')
      if (viteMiddleware) {
        let middlewareError
        await new Promise((done) => viteMiddleware(request, response, (error) => { middlewareError = error; done() }))
        if (middlewareError) throw middlewareError
        if (response.writableEnded || response.headersSent) return
      } else if (await serveStatic(request, response, pathname)) {
        return
      }
      if (!viteMiddleware && !extname(pathname)) {
        if (await serveStatic(request, response, '/index.html')) return
      }
      return reject(response, 404, 'Page not found.')
    } catch (error) {
      if (response.headersSent) return response.destroy(error)
      if (error.status) return reject(response, error.status, error.message)
      console.error('Campus One request failed:', error.message)
      return reject(response, 500, 'The request could not be completed. Please try again.')
    }
  }
}

function normalizeStaffModules(value) {
  if (!Array.isArray(value)) return []
  const allowed = new Set(STUDENT_MODULES.filter((moduleId) => !STAFF_MODULES.includes(moduleId)))
  return [...new Set(value.filter((moduleId) => allowed.has(moduleId)))].slice(0, 30)
}

function safeText(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function validateRecord(input, existing = {}) {
  const title = safeText(input.title ?? existing.title ?? '', 120)
  const description = safeText(input.description ?? existing.description ?? '', 1200)
  const hasTitle = input.title !== undefined || existing.title !== undefined
  const hasDescription = input.description !== undefined || existing.description !== undefined
  if ((hasTitle || !existing.title) && title.length < 2) throw Object.assign(new Error('Add a title and a description for this campus record.'), { status: 400 })
  if ((hasDescription || !existing.description) && description.length < 3) throw Object.assign(new Error('Add a title and a description for this campus record.'), { status: 400 })
  return { title, description }
}

function emergencyCategoryLabel(value) {
  return EMERGENCY_CONTACT_CATEGORIES[value] || String(value || '').replace(/_/g, ' ')
}

function validateEmergencyContact(input, existing = {}) {
  const name = safeText(input.name ?? input.title ?? existing.name ?? existing.title, 120)
  const category = String(input.category ?? existing.category ?? '').trim().toUpperCase()
  const phoneNumber = safeText(input.phone_number ?? input.phoneNumber ?? input.phone ?? existing.phone_number ?? existing.phoneNumber ?? existing.phone ?? '', 30)
  const alternatePhone = safeText(input.alternate_phone ?? input.alternatePhone ?? existing.alternate_phone ?? existing.alternatePhone ?? '', 30)
  const designation = safeText(input.designation ?? existing.designation ?? '', 120)
  const description = safeText(input.description ?? existing.description ?? '', 500)
  const location = safeText(input.location ?? existing.location ?? '', 160)
  const hostelName = safeText(input.hostel_name ?? input.hostelName ?? existing.hostel_name ?? existing.hostelName ?? '', 120)
  const locationUrl = safeText(input.location_url ?? input.map_url ?? existing.location_url ?? existing.map_url ?? '', 500)
  const available24x7 = input.available_24x7 !== undefined ? Boolean(input.available_24x7) : Boolean(existing.available_24x7 ?? true)
  const isPrimary = input.is_primary !== undefined ? Boolean(input.is_primary) : Boolean(existing.is_primary ?? false)
  const isActive = input.is_active !== undefined ? Boolean(input.is_active) : Boolean(existing.is_active ?? existing.active ?? true)
  const priority = Number.isInteger(Number(input.priority ?? existing.priority ?? input.display_order ?? existing.display_order ?? 1)) ? Number(input.priority ?? existing.priority ?? input.display_order ?? existing.display_order ?? 1) : 1
  const displayOrder = Number.isInteger(Number(input.display_order ?? existing.display_order ?? priority)) ? Number(input.display_order ?? existing.display_order ?? priority) : priority
  const isValidPhone = (value) => {
    const candidate = String(value || '').trim()
    if (!candidate) return false
    if (!/^\+?[\d\s().-]{7,20}$/.test(candidate)) return false
    const digits = candidate.replace(/\D/g, '')
    return digits.length >= 7 && digits.length <= 15
  }

  if (!name) throw Object.assign(new Error('Contact name is required.'), { status: 400 })
  if (!EMERGENCY_CONTACT_CATEGORY_VALUES.includes(category)) throw Object.assign(new Error('Choose a valid emergency contact category.'), { status: 400 })
  if (!isValidPhone(phoneNumber)) throw Object.assign(new Error('Enter a valid emergency phone number.'), { status: 400 })
  if (alternatePhone && !isValidPhone(alternatePhone)) throw Object.assign(new Error('Enter a valid alternate emergency phone number.'), { status: 400 })
  if (locationUrl) {
    try {
      const parsed = new URL(locationUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol')
    } catch {
      throw Object.assign(new Error('Enter a valid map or location URL.'), { status: 400 })
    }
  }

  return {
    id: existing.id || randomUUID(),
    name,
    category,
    phone_number: phoneNumber,
    alternate_phone: alternatePhone,
    designation,
    description,
    location,
    hostel_name: hostelName,
    location_url: locationUrl,
    available_24x7: available24x7,
    is_primary: isPrimary,
    is_active: isActive,
    active: isActive,
    display_order: displayOrder,
    priority,
    title: name,
    created_at: existing.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: existing.created_by || 'admin',
  }
}

function validateCampusCollectionRecord(collection, input, existing = {}) {
  if (collection === 'emergency') return validateEmergencyContact(input, existing)
  return validateRecord(input, existing)
}

function isRecordActive(record) {
  return record && record.active !== false && record.is_active !== false
}

function validDepartment(value) {
  return DEPARTMENTS.includes(value) || LEGACY_DEPARTMENTS.includes(value)
}

function canonicalDepartment(value) {
  if (value === 'CSE') return 'Computer Science'
  if (value === 'ECE') return 'Electrical Engineering'
  if (['Computer Science', 'Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering'].includes(value)) return 'B.Tech'
  if (value === 'Business Administration') return 'Management'
  return value
}

function sameDepartment(left, right) {
  if (left === right) return true
  const legacyDepartments = new Set([...LEGACY_DEPARTMENTS, 'CSE', 'ECE'])
  if (legacyDepartments.has(left) && legacyDepartments.has(right)) {
    const aliases = { CSE: 'Computer Science', ECE: 'Electrical Engineering' }
    return (aliases[left] || left) === (aliases[right] || right)
  }
  return canonicalDepartment(left || '') === canonicalDepartment(right || '')
}

function safeWebAddress(value, field) {
  const address = safeText(value, 2000)
  if (!address) return ''
  if (address.startsWith('/') && !address.startsWith('//')) return address
  if (/^https?:\/\/[^\s]+$/i.test(address)) return address
  throw Object.assign(new Error(`Enter a valid ${field} URL.`), { status: 400 })
}

function validateCampusEvent(input, { partial = false } = {}) {
  const event = {
    name: safeText(input.name, 160),
    category: safeText(input.category, 60),
    description: safeText(input.description, 5000),
    date: safeText(input.date, 10),
    startTime: safeText(input.startTime, 10),
    endTime: safeText(input.endTime, 10),
    venue: safeText(input.venue, 180),
    organizer: safeText(input.organizer, 160),
    contact: safeText(input.contact, 180),
    registrationDeadline: safeText(input.registrationDeadline, 10),
    department: safeText(input.department, 100),
    course: safeText(input.course, 100),
    semester: safeText(input.semester, 60),
    eligibility: safeText(input.eligibility, 1000),
    maxParticipants: input.maxParticipants === '' || input.maxParticipants == null ? null : Number(input.maxParticipants),
    poster: safeWebAddress(input.poster, 'event poster'),
    status: safeText(input.status, 30) || 'DRAFT',
    featured: input.featured === true,
  }
  const statuses = ['DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ONGOING', 'COMPLETED', 'CANCELLED']
  if (partial) {
    for (const key of Object.keys(event)) if (!Object.hasOwn(input, key)) delete event[key]
    for (const key of ['name', 'category', 'description', 'venue', 'organizer']) {
      if (Object.hasOwn(event, key) && event[key].length < (key === 'description' ? 3 : 2)) throw Object.assign(new Error(`Enter a valid event ${key}.`), { status: 400 })
    }
    if (Object.hasOwn(event, 'date') && !validCalendarDate(event.date)) throw Object.assign(new Error('Enter a valid event date.'), { status: 400 })
    if (Object.hasOwn(event, 'registrationDeadline') && event.registrationDeadline && !validCalendarDate(event.registrationDeadline)) throw Object.assign(new Error('Enter a valid registration deadline.'), { status: 400 })
    if (Object.hasOwn(event, 'startTime') && !validEventTime(event.startTime) || Object.hasOwn(event, 'endTime') && !validEventTime(event.endTime)) throw Object.assign(new Error('Enter valid event times.'), { status: 400 })
    if (Object.hasOwn(event, 'department') && event.department && !validDepartment(event.department)) throw Object.assign(new Error('Choose a valid department.'), { status: 400 })
    if (Object.hasOwn(input, 'maxParticipants') && event.maxParticipants !== null && (!Number.isInteger(event.maxParticipants) || event.maxParticipants < 1 || event.maxParticipants > 100000)) throw Object.assign(new Error('Enter a valid participant limit.'), { status: 400 })
    if (event.status && !statuses.includes(event.status)) throw Object.assign(new Error('Choose a valid event status.'), { status: 400 })
    return event
  }
  if (event.name.length < 2 || event.category.length < 2 || event.description.length < 3 || !validCalendarDate(event.date)
    || !validEventTime(event.startTime) || !validEventTime(event.endTime) || !event.venue
    || !event.organizer || event.registrationDeadline && !validCalendarDate(event.registrationDeadline)
    || event.department && !validDepartment(event.department)
    || event.maxParticipants !== null && (!Number.isInteger(event.maxParticipants) || event.maxParticipants < 1 || event.maxParticipants > 100000)
    || !statuses.includes(event.status)) {
    throw Object.assign(new Error('Complete the event name, category, description, date, times, venue, organizer, and valid status.'), { status: 400 })
  }
  return event
}

function validEventTime(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false
  return true
}

function validateCampusClub(input, { partial = false } = {}) {
  const club = {
    name: safeText(input.name, 120),
    category: safeText(input.category, 60),
    description: safeText(input.description, 3000),
    purpose: safeText(input.purpose, 1500),
    activities: safeText(input.activities, 1500),
    coordinator: safeText(input.coordinator, 160),
    contact: safeText(input.contact, 180),
    logo: safeWebAddress(input.logo, 'Club logo'),
    active: input.active !== false,
    requiresApproval: input.requiresApproval === true,
  }
  if (partial) {
    for (const key of Object.keys(club)) if (!Object.hasOwn(input, key)) delete club[key]
    return club
  }
  if (club.name.length < 2 || club.category.length < 2 || club.description.length < 3) throw Object.assign(new Error('Enter the Club name, category, and description.'), { status: 400 })
  return club
}

function notifyEventAudience(data, event, title, addNotification) {
  const eligible = data.users.filter((candidate) => candidate.active
    && [ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.ADMIN].includes(candidate.role)
    && eligibleForCampusEvent(event, candidate))
  for (const recipient of eligible) addNotification(data, {
    recipientUserId: recipient.id, title, message: `${event.name} · ${event.date} · ${event.venue}`,
    referenceId: event.id, target: 'events',
  })
}

function eligibleForCampusEvent(event, user) {
  return (!event.department || sameDepartment(event.department, user.department))
    && (!event.course || event.course === user.course)
    && (!event.semester || event.semester === user.semester)
}

function validateLostFoundReport(input, user) {
  const type = input.type
  const itemName = safeText(input.itemName, 120)
  const category = safeText(input.category, 40)
  const description = safeText(input.description, 2000)
  const location = safeText(input.location, 180)
  const itemDate = safeText(input.itemDate, 10)
  const additionalDetails = safeText(input.additionalDetails, 2000)
  const submissionKey = safeText(input.submissionKey, 64)
  if (!LOST_FOUND_TYPES.includes(type)) throw Object.assign(new Error('Choose Lost or Found.'), { status: 400 })
  if (itemName.length < 2 || !LOST_FOUND_CATEGORIES.includes(category) || description.length < 3 || !location || !validIsoDate(itemDate)) {
    throw Object.assign(new Error('Complete the item name, category, description, location, and date.'), { status: 400 })
  }
  if (!/^[a-f\d-]{36}$/i.test(submissionKey)) throw Object.assign(new Error('Refresh the report form and submit again.'), { status: 400 })
  return {
    submissionKey, type, itemName, category, description, location, itemDate, additionalDetails,
    reporterId: user.id, reporterName: user.name, reporterRole: user.role,
    department: typeof user.department === 'string' ? user.department : '',
    photo: validateLostFoundPhoto(input.photo),
  }
}

function validateLostFoundPhoto(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 1_400_000) throw Object.assign(new Error('Lost & Found photos must be under 1 MB.'), { status: 400 })
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match) throw Object.assign(new Error('Upload a PNG, JPEG, or WebP item photo.'), { status: 400 })
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > LOST_FOUND_PHOTO_BYTES_LIMIT || bytes.toString('base64') !== match[2]) {
    throw Object.assign(new Error('Lost & Found photos must be valid images under 1 MB.'), { status: 400 })
  }
  const signatures = {
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/webp': bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
  }
  if (!signatures[match[1]]) throw Object.assign(new Error('The uploaded file does not match its image type.'), { status: 400 })
  return { mimeType: match[1], bytes }
}

function validIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
    && value <= new Date().toISOString().slice(0, 10)
}

function lostFoundActor(user) {
  return { id: user.id, name: user.name, role: user.role }
}

function lostFoundActivity(user, createdAt, message, status) {
  const actor = user ? lostFoundActor(user) : { id: 'CAMPUS-SYSTEM', name: 'Campus One', role: 'System' }
  return { id: randomUUID(), type: 'status', status, message, authorId: actor.id, authorName: actor.name, authorRole: actor.role, createdAt }
}

function normalizeItemName(value) {
  return value.toLowerCase().replace(/[^a-z\d]/g, '')
}

function isLostFoundManager(user, report) {
  if (!canAccess(user, 'lost-found')) return false
  if (user.role === ROLES.ADMIN || user.role === ROLES.STAFF) return true
  if (user.role === ROLES.HOD) return Boolean(user.department) && (report ? report.department === user.department : true)
  if (user.role === ROLES.SPORTS) return report ? report.category === 'Sports Equipment' : true
  return false
}

function canViewLostFound(user, report) {
  if (report.reporterId === user.id || isLostFoundManager(user, report)) return true
  if (user.role === ROLES.HOD) return Boolean(user.department) && report.department === user.department
  if (user.role === ROLES.SPORTS) return report.category === 'Sports Equipment'
  return canAccess(user, 'lost-found')
}

function publicLostFoundClaim(claim, user, report, includeDetails = false) {
  const mayReadDetails = includeDetails || claim.claimantId === user.id || report.reporterId === user.id || isLostFoundManager(user, report)
  const result = {
    id: claim.id,
    claimantId: claim.claimantId,
    claimantName: claim.claimantName,
    claimantRole: claim.claimantRole,
    status: claim.status,
    createdAt: claim.createdAt,
    reviewedAt: claim.reviewedAt,
    reviewedBy: claim.reviewedBy,
  }
  if (mayReadDetails) result.details = claim.details
  return result
}

function publicLostFoundReport(report, user) {
  const isOwner = report.reporterId === user.id
  const canManage = isLostFoundManager(user, report)
  const maySeeReporter = isOwner || canManage
  return {
    id: report.id,
    type: report.type,
    itemName: report.itemName,
    category: report.category,
    description: report.description,
    location: report.location,
    itemDate: report.itemDate,
    createdAt: report.createdAt,
    status: report.status,
    matchedReportId: report.matchedReportId || null,
    reporterId: maySeeReporter ? report.reporterId : null,
    reporterName: maySeeReporter ? report.reporterName : null,
    reporterRole: maySeeReporter ? report.reporterRole : null,
    department: report.department || '',
    additionalDetails: isOwner || canManage ? report.additionalDetails : '',
    photoUrl: report.photo ? `/api/lost-found/${encodeURIComponent(report.id)}/photo` : null,
    activity: (report.activity || []).map((entry) => {
      const maySeePrivateUpdates = maySeeReporter || (report.claimRequests || []).some((claim) => claim.claimantId === user.id)
      const maySeeEntry = maySeePrivateUpdates || entry.type !== 'note'
      return {
        ...entry,
        message: maySeeEntry ? entry.message : 'Official update added',
        authorId: maySeeReporter ? entry.authorId : null,
        authorName: maySeeReporter || entry.authorRole === 'System' ? entry.authorName : 'Campus user',
      }
    }),
    claimRequestCount: (report.claimRequests || []).length,
    claimRequests: (report.claimRequests || [])
      .filter((claim) => claim.claimantId === user.id || report.reporterId === user.id || canManage)
      .map((claim) => publicLostFoundClaim(claim, user, report)),
    lastUpdatedAt: report.activity?.at(-1)?.createdAt || report.createdAt,
  }
}

function notifyLostFoundAuthorities(data, addNotification, report) {
  const authorities = (data.users || []).filter((candidate) => {
    if (!candidate.active || !canAccess(candidate, 'lost-found')) return false
    if ([ROLES.ADMIN, ROLES.STAFF].includes(candidate.role)) return true
    if (candidate.role === ROLES.HOD) return Boolean(report.department) && candidate.department === report.department
    return candidate.role === ROLES.SPORTS && report.category === 'Sports Equipment'
  })
  for (const recipient of authorities) addNotification(data, {
    recipientUserId: recipient.id,
    title: 'Lost & Found update',
    message: `${report.id} · ${report.itemName} (${report.status.toLowerCase().replaceAll('_', ' ')}).`,
    referenceId: report.id,
    target: 'lost-found',
  })
}

function addLostFoundReportUpdateNotifications(data, addNotification, report, actor, title, message) {
  const recipientIds = new Set([report.reporterId])
  if (report.matchedReportId) {
    const matched = data.lostFoundReports.find((item) => item.id === report.matchedReportId)
    if (matched) recipientIds.add(matched.reporterId)
  }
  for (const claim of report.claimRequests || []) recipientIds.add(claim.claimantId)
  recipientIds.delete(actor.id)
  for (const recipientUserId of recipientIds) addNotification(data, {
    recipientUserId, title, message, referenceId: report.id, target: 'lost-found',
  })
}

function rejectPendingLostFoundClaims(data, report, exceptClaimId, actor, now, addNotification, reason) {
  for (const claim of report.claimRequests || []) {
    if (claim.id === exceptClaimId || claim.status !== 'PENDING') continue
    claim.status = 'REJECTED'
    claim.reviewedAt = now
    claim.reviewedBy = lostFoundActor(actor)
    report.activity.push(lostFoundActivity(actor, now, 'Pending claim request closed', report.status))
    addNotification(data, {
      recipientUserId: claim.claimantId,
      title: 'Lost & Found claim closed',
      message: `${report.id} · ${report.itemName}: ${reason}`,
      referenceId: report.id,
      target: 'lost-found',
    })
  }
}

function hasRemovedCrowdFields(input) {
  return ['crowdLevel', 'occupancyPercent', 'estimatedWaitMinutes', 'crowdUpdatedAt'].some((field) => Object.hasOwn(input || {}, field))
}

function publicCampusFoodRecord(record) {
  const { crowdLevel, occupancyPercent, estimatedWaitMinutes, crowdUpdatedAt, ...publicRecord } = record
  return publicRecord
}

function campusRecords(data, collection) {
  data.campus ??= {}
  data.campus[collection] ??= structuredClone(DEFAULT_CAMPUS_DATA[collection] ?? [])
  return data.campus[collection]
}

function validateHostelRoom(input) {
  if (hasHostelBedFields(input)) throw Object.assign(new Error('Bed and seat numbers are not part of hostel room records.'), { status: 400 })
  const hostelName = safeText(input.hostelName, 100)
  const block = safeText(input.block, 80)
  const floor = safeText(input.floor, 40)
  const roomNumber = safeText(input.roomNumber, 40)
  const capacity = input.capacity
  if (!hostelName || !block || !floor || !roomNumber || !Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
    throw Object.assign(new Error('Enter the hostel, block, floor, room number, and a capacity from 1 to 20.'), { status: 400 })
  }
  return { hostelName, block, floor, roomNumber, capacity }
}

function hasHostelBedFields(input) {
  return Object.hasOwn(input || {}, 'bedNumber') || Object.hasOwn(input || {}, 'seatNumber')
}

function validateHostelDetails(input) {
  if (hasHostelBedFields(input) || Object.hasOwn(input || {}, 'facilities')) {
    throw Object.assign(new Error('Bed, seat, and facilities fields are not part of Hostel details.'), { status: 400 })
  }
  const hostelName = hostelText(input.hostelName, 2)
  const roomNumber = hostelText(input.roomNumber, 40)
  const floor = hostelText(input.floor, 40)
  const roomType = hostelText(input.roomType, 20)
  const roomCooling = hostelText(input.roomCooling, 20)
  const roommateNamesInput = input.roommateNames === undefined ? [] : input.roommateNames
  const wardenName = safeText(input.wardenName, 100)
  const wardenContact = safeText(input.wardenContact, 40)
  const additionalInformation = safeText(input.additionalInformation, 1000)
  if (!HOSTEL_NAMES.includes(hostelName)) throw Object.assign(new Error('Choose a valid Hostel Name: B1, B2, B3, B4, G1, or G2.'), { status: 400 })
  if (!roomNumber) throw Object.assign(new Error('Enter a valid Room Number.'), { status: 400 })
  if (!floor) throw Object.assign(new Error('Enter a valid Floor.'), { status: 400 })
  if (!HOSTEL_ROOM_TYPES.includes(roomType)) throw Object.assign(new Error('Choose a valid Room Type: Single, Double, Triple, 4 Sharing, or Shared.'), { status: 400 })
  if (roomCooling && !HOSTEL_ROOM_COOLING_OPTIONS.includes(roomCooling)) {
    throw Object.assign(new Error('Choose AC or Non-AC room cooling.'), { status: 400 })
  }
  if (!Array.isArray(roommateNamesInput) || roommateNamesInput.length > HOSTEL_ROOMMATE_LIMITS.Shared) {
    throw Object.assign(new Error('Enter roommate names using the roommate list.'), { status: 400 })
  }
  const roommateNames = roommateNamesInput.map((name) => safeText(name, 100)).filter(Boolean)
  if (roommateNames.length > HOSTEL_ROOMMATE_LIMITS[roomType]) {
    throw Object.assign(new Error(`A ${roomType} room allows at most ${HOSTEL_ROOMMATE_LIMITS[roomType]} roommate names.`), { status: 400 })
  }
  if (wardenContact && !/^\+?[\d\s().-]{7,20}$/.test(wardenContact)) {
    throw Object.assign(new Error('Enter a valid warden contact number.'), { status: 400 })
  }
  return { hostelName, roomNumber, floor, roomType, roomCooling, roommateNames, wardenName, wardenContact, additionalInformation }
}

function hostelText(value, maximum) {
  if (typeof value === 'string') return value.trim().slice(0, maximum)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).slice(0, maximum)
  return ''
}

function publicHostelDetails(details) {
  return {
    studentId: details.studentId,
    hostelName: details.hostelName,
    roomNumber: details.roomNumber,
    floor: details.floor,
    roomType: details.roomType,
    roomCooling: details.roomCooling || '',
    roommateNames: Array.isArray(details.roommateNames)
      ? details.roommateNames.filter((name) => typeof name === 'string').map((name) => name.trim()).filter(Boolean)
      : [],
    wardenName: details.wardenName || '',
    wardenContact: details.wardenContact || '',
    additionalInformation: details.additionalInformation || '',
    createdAt: details.createdAt,
    updatedAt: details.updatedAt || details.createdAt,
  }
}

function sameHostelRoom(left, right) {
  return ['hostelName', 'block', 'floor', 'roomNumber']
    .every((key) => left[key].toLocaleLowerCase() === right[key].toLocaleLowerCase())
}

function publicHostelRoom(room) {
  return {
    id: room.id,
    hostelName: room.hostelName,
    block: room.block,
    floor: room.floor,
    roomNumber: room.roomNumber,
    capacity: room.capacity,
    createdAt: room.createdAt,
    ...(room.updatedAt ? { updatedAt: room.updatedAt } : {}),
  }
}

function publicHostelAllotment(allotment) {
  return {
    id: allotment.id,
    studentId: allotment.studentId,
    roomId: allotment.roomId,
    hostelName: allotment.hostelName,
    block: allotment.block,
    floor: allotment.floor,
    roomNumber: allotment.roomNumber,
    status: allotment.status,
    createdAt: allotment.createdAt,
    endedAt: allotment.endedAt || '',
  }
}

function validateHostelMaintenance(input, user) {
  const category = safeText(input.category, 40)
  const description = safeText(input.description, 2000)
  if (!HOSTEL_MAINTENANCE_CATEGORIES.includes(category) || description.length < 5) {
    throw Object.assign(new Error('Choose a category and enter a description of at least 5 characters.'), { status: 400 })
  }
  return {
    studentId: user.id,
    category,
    description,
    status: 'SUBMITTED',
  }
}

function publicHostelMaintenance(requestEntry) {
  return {
    id: requestEntry.id,
    studentId: requestEntry.studentId,
    category: requestEntry.category,
    description: requestEntry.description,
    status: requestEntry.status,
    createdAt: requestEntry.createdAt,
    ...(requestEntry.updatedAt ? { updatedAt: requestEntry.updatedAt } : {}),
  }
}

function studentHostelView(data, user) {
  const userAllotments = (data.hostelAllotments || [])
    .filter((allotment) => allotment.studentId === user.id)
    .map(publicHostelAllotment)
  const currentAllotment = userAllotments.find((allotment) => allotment.status === 'ALLOTTED') || null
  const roommates = currentAllotment
    ? (data.hostelAllotments || [])
      .filter((allotment) => allotment.roomId === currentAllotment.roomId && allotment.status === 'ALLOTTED' && allotment.studentId !== user.id)
      .map((allotment) => (data.users || []).find((candidate) => candidate.id === allotment.studentId && candidate.role === ROLES.STUDENT && candidate.active)?.name)
      .filter(Boolean)
      .map((name) => ({ name }))
    : []
  return {
    hostelDetails: (data.hostelDetails || []).find((entry) => entry.studentId === user.id)
      ? publicHostelDetails(data.hostelDetails.find((entry) => entry.studentId === user.id))
      : null,
    currentAllotment,
    allotments: userAllotments,
    roommates,
    maintenance: (data.hostelMaintenance || [])
      .filter((requestEntry) => requestEntry.studentId === user.id)
      .map(publicHostelMaintenance),
  }
}

function validateComplaint(input, user) {
  const title = safeText(input.title, 120)
  const description = safeText(input.description, 5000)
  const category = safeText(input.category, 40)
  const submissionKey = safeText(input.submissionKey, 64)
  if (title.length < 3 || description.length < 10) throw Object.assign(new Error('Add a title and a description of at least 10 characters.'), { status: 400 })
  if (!COMPLAINT_CATEGORIES.includes(category)) throw Object.assign(new Error('Choose a valid complaint category.'), { status: 400 })
  if (!/^[a-f\d-]{36}$/i.test(submissionKey)) throw Object.assign(new Error('Refresh the form and submit again.'), { status: 400 })

  let photo = null
  if (input.photo !== undefined && input.photo !== null && input.photo !== '') {
    if (typeof input.photo !== 'string' || input.photo.length > PHOTO_LIMIT) throw Object.assign(new Error('Complaint photos must be under 1 MB.'), { status: 400 })
    const match = input.photo.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
    if (!match) throw Object.assign(new Error('Upload a PNG, JPEG, or WebP complaint photo.'), { status: 400 })
    const bytes = Buffer.from(match[2], 'base64')
    if (!bytes.length || bytes.length > COMPLAINT_PHOTO_BYTES_LIMIT || bytes.toString('base64') !== match[2]) {
      throw Object.assign(new Error('Complaint photos must be a valid image under 1 MB.'), { status: 400 })
    }
    const signatures = {
      'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
      'image/webp': bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
    }
    if (!signatures[match[1]]) throw Object.assign(new Error('The uploaded file does not match its image type.'), { status: 400 })
    photo = { mimeType: match[1], bytes }
  }

  return {
    submissionKey, title, description, category, photo,
    submitterId: user.id,
    submitterName: user.name,
    submitterRole: user.role,
    department: typeof user.department === 'string' ? user.department : '',
  }
}

function normalizeComplaint(complaint, users = []) {
  const submitterId = complaint.submitterId || complaint.userId || ''
  const submitter = users.find((user) => user.id === submitterId)
  const legacyStatuses = { Open: 'SUBMITTED', Accepted: 'ACCEPTED', 'In progress': 'IN_PROGRESS', Resolved: 'RESOLVED', Rejected: 'REJECTED' }
  const status = COMPLAINT_STATUSES.includes(complaint.status) ? complaint.status : legacyStatuses[complaint.status] || 'SUBMITTED'
  const createdAt = complaint.createdAt || new Date(0).toISOString()
  const assignedTo = typeof complaint.assignedTo === 'string'
    ? (users.find((user) => user.id === complaint.assignedTo) ? {
      id: complaint.assignedTo,
      name: users.find((user) => user.id === complaint.assignedTo).name,
      role: ROLES.STAFF,
    } : null)
    : complaint.assignedTo || null
  return {
    ...complaint,
    submitterId,
    submitterName: complaint.submitterName || submitter?.name || 'Campus user',
    submitterRole: complaint.submitterRole || submitter?.role || 'Student',
    department: complaint.department || submitter?.department || '',
    category: COMPLAINT_CATEGORIES.includes(complaint.category) ? complaint.category : 'Other',
    status,
    createdAt,
    assignedTo,
    handledBy: complaint.handledBy || null,
    photo: complaint.photo?.photoId ? complaint.photo : null,
    activity: Array.isArray(complaint.activity) && complaint.activity.length
      ? complaint.activity
      : [{
        id: `legacy-${complaint.id}`, type: 'status', status: 'SUBMITTED', message: 'Complaint submitted',
        authorId: submitterId, authorName: complaint.submitterName || submitter?.name || 'Campus user',
        authorRole: complaint.submitterRole || submitter?.role || 'Student', createdAt,
      }],
  }
}

function publicComplaint(complaint) {
  const {
    id, submitterId, submitterName, submitterRole, department, category, title,
    description, status, createdAt, assignedTo, handledBy, activity, photo,
  } = complaint
  return {
    id, submitterId, submitterName, submitterRole, department, category, title,
    description, status, createdAt, assignedTo, handledBy, activity,
    photoUrl: photo ? `/api/complaints/${encodeURIComponent(id)}/photo` : null,
    lastUpdatedAt: activity.at(-1)?.createdAt || createdAt,
  }
}

function complaintStatusLabel(status) {
  return ({ SUBMITTED: 'Submitted', ACCEPTED: 'Accepted', IN_PROGRESS: 'In Progress', RESOLVED: 'Resolved', REJECTED: 'Rejected' })[status] || status
}

function isComplaintManager(user) {
  return [ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.ADMIN].includes(user.role) && canAccess(user, 'complaints')
}

function canManageComplaint(user, complaint) {
  if (!isComplaintManager(user)) return false
  if (user.role === ROLES.ADMIN) return true
  if (user.role === ROLES.HOD) return Boolean(user.department) && complaint.department === user.department
  if (user.role === ROLES.SPORTS) return complaint.category === 'Sports'
  if (user.role === ROLES.STAFF) {
    if (complaint.assignedTo && complaint.assignedTo.id !== user.id) return false
    return complaint.assignedTo?.id === user.id || Boolean(user.department) && complaint.department === user.department
  }
  return false
}

function canViewComplaint(user, complaint) {
  return complaint.submitterId === user.id || canManageComplaint(user, complaint)
}

function complaintAuthorities(users, complaint) {
  const active = users.filter((candidate) => candidate.active)
  const authorities = active.filter((candidate) => candidate.role === ROLES.ADMIN)
  if (complaint.category === 'Sports') {
    authorities.push(...active.filter((candidate) => candidate.role === ROLES.SPORTS))
  } else if (complaint.department) {
    authorities.push(...active.filter((candidate) =>
      candidate.department === complaint.department && [ROLES.HOD, ROLES.STAFF].includes(candidate.role)))
  } else {
    authorities.push(...active.filter((candidate) => [ROLES.HOD, ROLES.STAFF].includes(candidate.role)))
  }
  return [...new Map(authorities.map((candidate) => [candidate.id, candidate])).values()]
}

function addComplaintSubmitterNotification(data, addNotification, complaint, title, message) {
  addNotification(data, {
    recipientUserId: complaint.submitterId,
    title,
    message,
    referenceId: complaint.id,
    target: 'complaints',
  })
}

function publicFoodOrder(order) {
  const { id, orderNumber, userId, customerUserId, customerName, customerRole, meal, item, status, createdAt, updatedAt } = order
  return {
    id, orderNumber, ...(userId ? { userId } : {}),
    ...(customerUserId ? { customerUserId, customerName, customerRole } : {}),
    meal, item, status, createdAt, updatedAt,
  }
}

function validateCanteenItem(input) {
  const diet = safeText(input.diet, 16)
  const category = safeText(input.category, 50)
  const name = safeText(input.name, 120)
  const description = safeText(input.description, 500)
  const size = safeText(input.size, 12)
  const price = Number(input.price)
  if (!Object.hasOwn(CANTEEN_CATEGORIES, diet) || !CANTEEN_CATEGORIES[diet].includes(category)) {
    throw Object.assign(new Error('Choose a valid Canteen diet and category.'), { status: 400 })
  }
  if (name.length < 2 || !Number.isSafeInteger(price) || price < 1 || price > 100000) {
    throw Object.assign(new Error('Enter a food name and a whole-number price greater than zero.'), { status: 400 })
  }
  if (size && !['Half', 'Full'].includes(size)) throw Object.assign(new Error('Choose Half or Full size.'), { status: 400 })
  const imageUrl = safeText(input.imageUrl, 500)
  if (imageUrl && !/^https:\/\/[^\s]+$/i.test(imageUrl)) throw Object.assign(new Error('Food images must use a secure HTTPS URL.'), { status: 400 })
  return { diet, category, name, description, size, price, imageUrl, available: input.available !== false }
}

function defaultMessSettings() {
  return { timings: Object.fromEntries(MESS_MEALS.map((meal) => [meal, { start: '', end: '' }])) }
}

function normalizeMessSettings(settings) {
  const defaults = defaultMessSettings()
  const timings = settings && typeof settings === 'object' ? settings.timings : null
  return {
    timings: Object.fromEntries(MESS_MEALS.map((meal) => {
      const value = timings?.[meal] || {}
      const start = typeof value.start === 'string' ? value.start : ''
      const end = typeof value.end === 'string' ? value.end : ''
      const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) && start !== end
      return [meal, valid ? { start, end } : { start: '', end: '' }]
    })),
  }
}

function validateTimeWindow(value, label) {
  const start = typeof value?.start === 'string' ? value.start : ''
  const end = typeof value?.end === 'string' ? value.end : ''
  if (!start && !end) return { start: '', end: '' }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start === end) {
    throw Object.assign(new Error(`${label} needs a valid start and end time. End times before the start are treated as overnight.`), { status: 400 })
  }
  return { start, end }
}

function validateMessSettings(input) {
  if (!input || typeof input !== 'object') throw Object.assign(new Error('Provide College Mess meal timings.'), { status: 400 })
  return {
    timings: Object.fromEntries(MESS_MEALS.map((meal) => [meal, validateTimeWindow(input.timings?.[meal], `${meal} timing`)])),
  }
}

function publicCanteenOrder(order) {
  const {
    id, orderNumber, userId, studentName, studentId, customerUserId, customerName,
    customerRole, items, total, status, createdAt, updatedAt, history,
  } = order
  return {
    id, orderNumber, userId, studentName, studentId,
    customerUserId: customerUserId || userId,
    customerName: customerName || studentName || 'Campus customer',
    customerRole: customerRole || 'Student',
    items, total, status, createdAt, updatedAt, history,
  }
}

function publicOrder(order) {
  return {
    id: order.id,
    order_number: order.order_number,
    student_id: order.student_id,
    student_name: order.student_name,
    contact_number: order.contact_number,
    course: order.course,
    department: order.department,
    subtotal: Number(order.subtotal || 0),
    total_amount: Number(order.total_amount || 0),
    payment_method: order.payment_method,
    payment_status: order.payment_status,
    payment_submitted_at: order.payment_submitted_at || null,
    payment_verified_at: order.payment_verified_at || null,
    payment_verified_by: order.payment_verified_by || null,
    order_status: order.order_status,
    estimated_ready_time: order.estimated_ready_time || null,
    rejection_reason: order.rejection_reason || null,
    staff_note: order.staff_note || null,
    created_at: order.created_at,
    updated_at: order.updated_at,
    accepted_at: order.accepted_at || null,
    preparing_at: order.preparing_at || null,
    ready_at: order.ready_at || null,
    completed_at: order.completed_at || null,
    cancelled_at: order.cancelled_at || null,
    items: (order.items || []).map((item) => ({
      id: item.id,
      food_item_id: item.food_item_id,
      food_name_snapshot: item.food_name_snapshot,
      variant: item.variant,
      price_snapshot: Number(item.price_snapshot || 0),
      quantity: Number(item.quantity || 0),
      subtotal: Number(item.subtotal || 0),
    })),
  }
}

function validateSportsRecord(input, existing = {}) {
  const kind = safeText(input.kind ?? existing.kind ?? '', 40)
  const title = safeText(input.title ?? existing.title ?? '', 100)
  const description = safeText(input.description ?? existing.description ?? '', 1000)
  const rules = safeText(input.rules ?? existing.rules ?? '', 4000)
  const hasKind = input.kind !== undefined || existing.kind !== undefined
  const hasTitle = input.title !== undefined || existing.title !== undefined
  const hasDescription = input.description !== undefined || existing.description !== undefined
  if ((hasKind || !existing.kind) && !['Sport', 'Team', 'Player', 'Sports event', 'Participation', 'Equipment', 'Announcement', 'Information'].includes(kind)) throw Object.assign(new Error('Choose a valid sports information category.'), { status: 400 })
  if ((hasTitle || !existing.title) && title.length < 2) throw Object.assign(new Error('Add a title and details for this sports record.'), { status: 400 })
  if ((hasDescription || !existing.description) && description.length < 3) throw Object.assign(new Error('Add a title and details for this sports record.'), { status: 400 })
  return { kind, title, description, rules, active: input.active !== undefined ? input.active !== false : existing.active !== false }
}

function publicNotification(notification) {
  const { id, title, message, referenceId, target, readAt, createdAt, type } = notification
  return { id, title, message, referenceId, target, readAt, createdAt, type }
}

const NOTICE_CATEGORIES = Object.freeze(['Academic', 'Examination', 'Department', 'Events', 'Sports', 'Hostel', 'Transport', 'Canteen', 'Library', 'Emergency', 'General', 'Other'])
const NOTICE_PRIORITIES = Object.freeze(['Normal', 'Important', 'Urgent'])
const NOTICE_ISSUER_ROLES = Object.freeze([ROLES.ADMIN, ROLES.HOD, ROLES.STAFF, ROLES.SPORTS])
const CAMPUS_NOTICE_ROLES = Object.freeze([ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.ADMIN])

function campusNotices(data) {
  data.campus ??= {}
  data.campus.notices ??= []
  return data.campus.notices
}

function initializeCampusNotices(data) {
  data.campus ??= {}
  if (!Array.isArray(data.campus.notices)) data.campus.notices = [...(DEFAULT_CAMPUS_DATA.notices || [])]
  const campusNoticeIds = new Set(data.campus.notices.map((notice) => notice.id))
  const studentIds = data.users.filter((candidate) => candidate.active && candidate.role === ROLES.STUDENT).map((candidate) => candidate.id)
  const now = new Date().toISOString()
  for (const legacy of data.messNotices || []) {
    const id = `mess-legacy-${legacy.id}`
    if (!legacy.active || !legacy.id || campusNoticeIds.has(id)) continue
    const createdAt = Number.isFinite(Date.parse(legacy.createdAt)) ? legacy.createdAt : now
    data.campus.notices.push({
      id,
      title: typeof legacy.title === 'string' ? legacy.title : 'College Mess announcement',
      description: typeof legacy.description === 'string' ? legacy.description : '',
      category: 'Canteen',
      priority: 'Normal',
      pinned: false,
      important: false,
      target: { type: 'ROLE', role: ROLES.STUDENT },
      publishAt: createdAt,
      expiresAt: '',
      attachmentUrl: '',
      attachmentName: '',
      active: true,
      createdBy: '',
      issuerName: 'College Mess',
      issuerRole: ROLES.ADMIN,
      recipientIds: studentIds,
      readBy: {},
      createdAt,
    })
    campusNoticeIds.add(id)
  }
  const eligible = data.users.filter((candidate) => candidate.active && CAMPUS_NOTICE_ROLES.includes(candidate.role))
  for (const notice of campusNotices(data)) {
    if (!notice.recipientIds) {
      notice.category ||= /exam/i.test(notice.title) ? 'Examination' : 'General'
      notice.priority ||= 'Normal'
      notice.pinned ??= false
      notice.target ||= { type: 'EVERYONE' }
      notice.issuerName ||= 'Campus One'
      notice.issuerRole ||= 'Administration'
      notice.createdAt ||= now
      notice.publishAt ||= notice.createdAt
      notice.recipientIds = eligible.map((candidate) => candidate.id)
      notice.readBy ??= {}
    }
  }
}

function deliverDueNoticeNotifications(data) {
  const now = Date.now()
  for (const notice of campusNotices(data)) {
    if (!notice.createdBy) continue
    if (Date.parse(notice.publishAt || notice.createdAt) > now || notice.expiresAt && Date.parse(notice.expiresAt) < now) continue
    for (const recipientUserId of notice.recipientIds || []) {
      const recipient = data.users.find((candidate) => candidate.id === recipientUserId && candidate.active && CAMPUS_NOTICE_ROLES.includes(candidate.role))
      if (!recipient) continue
      addNoticeNotification(data, recipientUserId, notice)
    }
  }
}

function addNoticeNotification(data, recipientUserId, notice) {
  const existing = (data.notifications || []).find((entry) => entry.recipientUserId === recipientUserId && entry.referenceId === notice.id && entry.type === 'CAMPUS_NOTICE')
  if (existing) return existing
  data.notifications ??= []
  const notification = {
    id: randomUUID(), recipientUserId, recipientRequestId: '', title: notice.title,
    message: notice.description, referenceId: notice.id, target: 'notices',
    type: 'CAMPUS_NOTICE', readAt: notice.readBy?.[recipientUserId] || null,
    createdAt: notice.publishAt || notice.createdAt,
  }
  data.notifications.unshift(notification)
  if (data.notifications.length > 5000) data.notifications.length = 5000
  return notification
}

function publicCampusNotice(notice, userId, readAt = null) {
  const { recipientIds, readBy, ...record } = notice
  return { ...record, isRead: Boolean(readAt), readAt }
}

function noticeIssuerRole(user) {
  return NOTICE_ISSUER_ROLES.includes(user.role)
}

function validateCampusNotice(input, user) {
  const title = safeText(input.title, 180)
  const description = safeText(input.description, 10000)
  const category = safeText(input.category, 32)
  const priority = safeText(input.priority || 'Normal', 16)
  const target = input.target && typeof input.target === 'object' ? {
    type: safeText(input.target.type, 20).toUpperCase(),
    department: safeText(input.target.department, 100),
    course: safeText(input.target.course, 100),
    semester: safeText(input.target.semester, 40),
    role: safeText(input.target.role, 40),
    sportId: safeText(input.target.sportId, 64),
    teamId: safeText(input.target.teamId, 64),
    eventId: safeText(input.target.eventId, 64),
    hostel: safeText(input.target.hostel, 100),
  } : { type: '' }
  const publishAt = safeText(input.publishAt, 40) || new Date().toISOString()
  const expiresAt = safeText(input.expiresAt, 40)
  const attachmentUrl = safeText(input.attachmentUrl, 1000)
  const attachmentName = safeText(input.attachmentName, 160)
  if (title.length < 3 || description.length < 3) throw Object.assign(new Error('Enter a notice title and description.'), { status: 400 })
  if (!NOTICE_CATEGORIES.includes(category)) throw Object.assign(new Error('Choose a valid notice category.'), { status: 400 })
  if (!NOTICE_PRIORITIES.includes(priority)) throw Object.assign(new Error('Choose Normal, Important, or Urgent priority.'), { status: 400 })
  if (!Number.isFinite(Date.parse(publishAt))) throw Object.assign(new Error('Choose a valid publish date and time.'), { status: 400 })
  if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(publishAt))) throw Object.assign(new Error('Expiry must be after the publish date and time.'), { status: 400 })
  if (attachmentUrl && (!/^https:\/\/[^\s]+$/i.test(attachmentUrl) || !/\.pdf(?:$|[?#])/i.test(attachmentUrl))) throw Object.assign(new Error('Notice attachments must be secure HTTPS PDF links.'), { status: 400 })
  if (attachmentName && !attachmentUrl) throw Object.assign(new Error('Provide an attachment URL with its name.'), { status: 400 })
  const audienceTypes = ['EVERYONE', 'STUDENTS', 'STAFF', 'HODS', 'ROLE', 'DEPARTMENT', 'COURSE', 'SEMESTER', 'PROFILE', 'SPORTS', 'SPORT', 'TEAM', 'EVENT', 'ACTIVE', 'HOSTEL']
  if (!audienceTypes.includes(target.type)) throw Object.assign(new Error('Choose a valid notice audience.'), { status: 400 })

  if (user.role === ROLES.SPORTS) {
    if (category !== 'Sports' || !['SPORTS', 'SPORT', 'TEAM', 'EVENT', 'ACTIVE'].includes(target.type)) throw Object.assign(new Error('Sports Captain can issue Sports notices only to sports audiences.'), { status: 403 })
  } else if ([ROLES.HOD, ROLES.STAFF].includes(user.role)) {
    if (!['Academic', 'Examination', 'Department'].includes(category) || !['DEPARTMENT', 'COURSE', 'SEMESTER', 'PROFILE'].includes(target.type)) throw Object.assign(new Error('Your role can issue department-scoped academic notices only.'), { status: 403 })
    if (!user.department) throw Object.assign(new Error('A department must be assigned to issue department notices.'), { status: 403 })
    if (target.department && !sameDepartment(target.department, user.department)) throw Object.assign(new Error('You cannot issue a notice for another department.'), { status: 403 })
    target.department = user.department
    if (target.type === 'COURSE' && !target.course || target.type === 'SEMESTER' && !target.semester || target.type === 'PROFILE' && !target.semester) throw Object.assign(new Error('Choose the required course or semester audience.'), { status: 400 })
  }
  if (['COURSE', 'SEMESTER', 'PROFILE'].includes(target.type) && target.type === 'COURSE' && !target.course) throw Object.assign(new Error('Choose a course audience.'), { status: 400 })
  if (['SEMESTER', 'PROFILE'].includes(target.type) && !target.semester) throw Object.assign(new Error('Choose a semester or year audience.'), { status: 400 })
    if (target.type === 'PROFILE' && !target.course) throw Object.assign(new Error('Choose a course for the course, department, and semester audience.'), { status: 400 })
    if (target.type === 'DEPARTMENT' && !target.department || target.type === 'HOSTEL' && !target.hostel) throw Object.assign(new Error('Choose the required audience group.'), { status: 400 })
    if (target.type === 'ROLE' && ![ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.ADMIN].includes(target.role)) throw Object.assign(new Error('Choose an eligible campus role.'), { status: 400 })
    if (category === 'Emergency' && target.type !== 'EVERYONE') throw Object.assign(new Error('Emergency notices must target everyone.'), { status: 400 })
    if (target.type === 'SPORT' && !target.sportId || target.type === 'TEAM' && !target.teamId || target.type === 'EVENT' && !target.eventId) throw Object.assign(new Error('Choose the specific sports audience.'), { status: 400 })
    if (target.type === 'ACTIVE' && [target.sportId, target.teamId, target.eventId].filter(Boolean).length !== 1) throw Object.assign(new Error('Choose exactly one sport, team, or event for selected/active participants.'), { status: 400 })
  return {
    title, description, category, priority, target, publishAt, expiresAt,
    attachmentUrl, attachmentName, pinned: Boolean(input.pinned) || priority !== 'Normal',
    important: priority !== 'Normal' || Boolean(input.pinned), active: true,
  }
}

function campusNoticeRecipients(notice, data) {
  const target = notice.target
  let users = data.users.filter((candidate) => candidate.active && CAMPUS_NOTICE_ROLES.includes(candidate.role))
  if (target.type === 'EVERYONE' || notice.category === 'Emergency') return users.map((candidate) => candidate.id)
  if (['STUDENTS', 'STAFF', 'HODS', 'ROLE'].includes(target.type)) {
    const role = target.type === 'STUDENTS' ? [ROLES.STUDENT, ROLES.SPORTS]
      : target.type === 'STAFF' ? [ROLES.STAFF]
        : target.type === 'HODS' ? [ROLES.HOD]
          : [target.role]
    users = users.filter((candidate) => role.includes(candidate.role))
  } else if (target.type === 'SPORTS') {
    users = users.filter((candidate) => activeSportsParticipations(data, candidate.id).length > 0)
  } else if (target.type === 'SPORT') {
    const sport = sportFor(data, target.sportId)
    if (!sport) throw Object.assign(new Error('Choose an existing active sport.'), { status: 400 })
    users = users.filter((candidate) => activeSportsParticipations(data, candidate.id).some((entry) => entry.sportId === sport.id))
  } else if (target.type === 'TEAM') {
    const team = data.sportsTeams.find((entry) => entry.id === target.teamId && entry.status === 'ACTIVE')
    if (!team) throw Object.assign(new Error('Choose an active team.'), { status: 400 })
    users = users.filter((candidate) => team.members.some((member) => member.studentId === candidate.id && member.status === 'ACTIVE') && activeSportsParticipations(data, candidate.id).some((entry) => entry.sportId === team.sportId))
  } else if (target.type === 'EVENT') {
    const event = data.sportsEvents.find((entry) => entry.id === target.eventId)
    if (!event) throw Object.assign(new Error('Choose an existing sports event or trial.'), { status: 400 })
    users = users.filter((candidate) => data.sportsRegistrations.some((application) => application.eventId === event.id && application.studentId === candidate.id && !['REJECTED', 'CANCELLED'].includes(application.status)))
  } else if (target.type === 'ACTIVE') {
    const event = data.sportsEvents.find((entry) => entry.id === target.eventId)
    const team = data.sportsTeams.find((entry) => entry.id === target.teamId)
    const sport = sportFor(data, target.sportId)
    const sportId = event?.sportId || team?.sportId || sport?.id
    if (!sportId || target.eventId && !event || target.teamId && !team || target.sportId && !sport) throw Object.assign(new Error('Choose an existing sport, team, or event.'), { status: 400 })
    users = users.filter((candidate) =>
      activeSportsParticipations(data, candidate.id).some((entry) => entry.sportId === sportId && (!event || entry.eventId === event.id || entry.source === 'TEAM')) &&
      (!event || data.sportsRegistrations.some((application) => application.eventId === event.id && application.studentId === candidate.id && application.status === 'SELECTED')) &&
      (!team || team.members.some((member) => member.studentId === candidate.id && member.status === 'ACTIVE')))
  } else if (target.type === 'HOSTEL') {
    users = users.filter((candidate) => sameNoticeValue(candidate.hostel || candidate.hostelName || '', target.hostel))
  }
  if (target.department) users = users.filter((candidate) => sameDepartment(candidate.department || '', target.department))
  if (target.course) users = users.filter((candidate) => sameNoticeValue(candidate.course || '', target.course))
  if (target.semester) users = users.filter((candidate) => sameSemester(candidate.semester || candidate.year || '', target.semester))
  return [...new Set(users.map((candidate) => candidate.id))]
}

function sameNoticeValue(left, right) {
  return noticeToken(left) === noticeToken(right)
}

function noticeToken(value) {
  const token = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return ({ cse: 'computer science', cs: 'computer science', ece: 'electrical engineering', ee: 'electrical engineering', ce: 'civil engineering', mech: 'mechanical engineering' })[token] || token
}

function sameSemester(left, right) {
  const parse = (value) => {
    const normalized = String(value || '').toLowerCase()
    const number = normalized.match(/\d+/)?.[0]
    return number ? `${normalized.includes('year') ? 'year' : 'semester'}-${Number(number)}` : normalized.replace(/\s+/g, ' ').trim()
  }
  return parse(left) === parse(right)
}

function sportsError(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

function activeStudent(data, id) {
  const normalized = normalizeUserId(id)
  return data.users.find((candidate) => candidate.id === normalized && [ROLES.STUDENT, ROLES.SPORTS].includes(candidate.role) && candidate.active)
}

function publicSportsStudent(user) {
  if (!user) return null
  return { id: user.id, name: user.name, department: normalizeSportsDepartment(user.department) || user.department || '', semester: user.semester || '', course: user.course || '', mobile: user.mobile || '', email: user.email || '' }
}

function publicSportsTeam(team, users) {
  const members = (team.members || []).map((member) => {
    const student = users.find((candidate) => candidate.id === member.studentId)
    return { ...member, name: student?.name || member.name, department: student?.department || member.department || '', semester: student?.semester || member.semester || '', course: student?.course || member.course || '',     status: student?.active && [ROLES.STUDENT, ROLES.SPORTS].includes(student.role) ? member.status : 'INACTIVE' }
  })
  const currentMember = (id) => members.find((entry) => entry.studentId === id && entry.status === 'ACTIVE')
  return {
    id: team.id, name: team.name, sportId: team.sportId, sportName: team.sportName,
    category: team.category, teamType: team.teamType, description: team.description,
    captainId: team.captainId, captain: currentMember(team.captainId) || null,
    viceCaptainId: team.viceCaptainId || '', viceCaptain: currentMember(team.viceCaptainId) || null,
    members, playerCount: members.filter((entry) => entry.status === 'ACTIVE').length,
    status: team.status, createdAt: team.createdAt, updatedAt: team.updatedAt,
  }
}

function publicSportsRegistration(entry, data) {
  const student = data.users.find((candidate) => candidate.id === entry.studentId)
  const profileDepartment = student?.department || entry.department || ''
  return {
    ...entry, studentName: student?.name || entry.studentName,
    department: entry.applicationType === 'SPORTS_EVENT'
      ? normalizeSportsDepartment(profileDepartment) || profileDepartment
      : profileDepartment,
    course: student?.course || entry.course || '',
    semester: student?.semester || entry.semester || '',
    mobile: student?.mobile || entry.mobile || '',
    status: entry.status === 'REGISTERED' ? 'APPLIED' : entry.status,
    studentActive: Boolean(student?.active && [ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS].includes(student.role)),
  }
}

function activeSportsParticipations(data, userId) {
  const participant = data.users.find((entry) => entry.id === userId && entry.active)
  if (!participant) return []
  return (data.sportsParticipations || []).filter((entry) => entry.userId === userId && entry.active && ['ACTIVE', 'SELECTED'].includes(entry.status))
}

async function readSportsData(store) {
  const data = await store.read()
  const legacyEvents = data.sportsEvents.some(sportsEventNeedsMigration)
  const legacyEventRegistrations = data.sportsRegistrations.some((entry) =>
    entry.applicationType === 'SPORTS_EVENT' && !SPORTS_EVENT_REGISTRATION_STATUSES.includes(entry.status))
  const legacyMembers = data.sportsTeams.some((team) => team.status === 'ACTIVE' && (team.members || []).some((member) =>
    member.status === 'ACTIVE' && activeStudent(data, member.studentId) &&
    !data.sportsParticipations.some((entry) => entry.userId === member.studentId && entry.sportId === team.sportId && entry.source === 'TEAM' && entry.teamId === team.id)))
  if (!legacyMembers && !legacyEvents && !legacyEventRegistrations) return data
  return store.transact((current) => {
    current.sportsEvents.forEach(normalizeStoredSportsEvent)
    for (const registration of current.sportsRegistrations) {
      if (registration.applicationType !== 'SPORTS_EVENT') continue
      normalizeSportsEventRegistration(registration)
    }
    for (const team of current.sportsTeams) {
      if (team.status !== 'ACTIVE') continue
      for (const member of team.members || []) {
        const student = member.status === 'ACTIVE' ? activeStudent(current, member.studentId) : null
        if (student && !current.sportsParticipations.some((entry) => entry.userId === student.id && entry.sportId === team.sportId && entry.source === 'TEAM' && entry.teamId === team.id)) {
          ensureSportsParticipation(current, student, team.sportId, team.sportName, { teamId: team.id, source: 'TEAM' })
        }
      }
    }
    return current
  })
}

function sportsEventNeedsMigration(event) {
  const status = normalizeSportsEventStatus(event.status)
  const startTime = normalizeSportsTime(event.startTime || event.time)
  const endTime = normalizeSportsTime(event.endTime)
  const departments = Array.isArray(event.eligibleDepartments) ? event.eligibleDepartments : []
  const normalizedDepartments = departments.includes('All Departments')
    ? []
    : departments.map((department) => normalizeSportsDepartment(department) || department)
  return status !== event.status
    || !SPORTS_EVENT_STATUSES.includes(status)
    || !event.startTime && Boolean(startTime)
    || Boolean(event.startTime || event.time) && !startTime
    || Boolean(event.time)
    || Boolean(endTime && endTime !== event.endTime)
    || JSON.stringify(normalizedDepartments) !== JSON.stringify(departments)
    || status !== SPORTS_EVENT_STATUS.DRAFT && normalizedDepartments.some((department) => !SPORTS_DEPARTMENTS.includes(department))
}

function normalizeStoredSportsEvent(event) {
  const normalizedStatus = normalizeSportsEventStatus(event.status)
  if (SPORTS_EVENT_STATUSES.includes(normalizedStatus)) event.status = normalizedStatus
  else {
    console.warn(`Sports event ${event.id} had an unsupported status and was moved to DRAFT.`)
    event.status = SPORTS_EVENT_STATUS.DRAFT
  }

  const startTime = normalizeSportsTime(event.startTime || event.time)
  if (startTime) event.startTime = startTime
  else if (event.startTime || event.time) {
    console.warn(`Sports event ${event.id} had an invalid legacy start time and was moved to DRAFT.`)
    event.startTime = ''
    event.status = SPORTS_EVENT_STATUS.DRAFT
  }
  const endTime = normalizeSportsTime(event.endTime)
  if (endTime) event.endTime = endTime
  else if (event.endTime) {
    console.warn(`Sports event ${event.id} had an invalid legacy end time and was moved to DRAFT.`)
    event.endTime = ''
    event.status = SPORTS_EVENT_STATUS.DRAFT
  }
  delete event.time

  if (Array.isArray(event.eligibleDepartments)) {
    event.eligibleDepartments = event.eligibleDepartments.includes(ALL_DEPARTMENTS)
      ? []
      : event.eligibleDepartments.map((department) => normalizeSportsDepartment(department) || department)
  } else event.eligibleDepartments = []
  if (event.eligibleDepartments.some((department) => !SPORTS_DEPARTMENTS.includes(department))) {
    console.warn(`Sports event ${event.id} has an unrecognized legacy department; it remains restricted until edited.`)
    event.status = SPORTS_EVENT_STATUS.DRAFT
  }
}

function normalizeSportsEventRegistration(registration) {
  if (['REGISTERED', 'APPLIED', 'SHORTLISTED', 'SUBMITTED'].includes(registration.status)) {
    registration.status = SPORTS_EVENT_REGISTRATION_STATUS.PENDING
  } else if (registration.status === 'SELECTED') {
    registration.status = SPORTS_EVENT_REGISTRATION_STATUS.ACCEPTED
  } else if (!SPORTS_EVENT_REGISTRATION_STATUSES.includes(registration.status)) {
    console.warn(`Sports Event registration ${registration.id} had an unsupported status and was moved to PENDING.`)
    registration.status = SPORTS_EVENT_REGISTRATION_STATUS.PENDING
  }
}

function ensureSportsParticipation(data, participant, sportId, sportName, { eventId = '', teamId = '', source = 'TEAM' } = {}) {
  data.sportsParticipations ??= []
  const existing = data.sportsParticipations.find((entry) => entry.userId === participant.id && entry.sportId === sportId && entry.source === source && (source === 'EVENT' ? entry.eventId === eventId : entry.teamId === teamId))
  const now = new Date().toISOString()
  if (existing) Object.assign(existing, { sportName, eventId, teamId, status: 'ACTIVE', active: true, updatedAt: now })
  else data.sportsParticipations.unshift({ id: randomUUID(), userId: participant.id, sportId, sportName, eventId, teamId, source, status: 'ACTIVE', active: true, selectedAt: now, createdAt: now, updatedAt: now })
}

function syncTeamParticipation(data, team, userId, memberPresent = true) {
  const member = (team.members || []).find((entry) => entry.studentId === userId)
  const participation = (data.sportsParticipations || []).find((entry) => entry.userId === userId && entry.sportId === team.sportId && entry.source === 'TEAM' && entry.teamId === team.id)
  if (!participation) return
  participation.active = Boolean(memberPresent && team.status === 'ACTIVE' && member?.status === 'ACTIVE')
  participation.status = participation.active ? 'ACTIVE' : 'INACTIVE'
  participation.updatedAt = new Date().toISOString()
}

function sportsAttendanceSportId(attendance, data) {
  if (attendance.sportId) return attendance.sportId
  const collection = attendance.subjectType === 'SCHEDULE' ? data.sportsSchedules : data.sportsEvents
  return collection.find((entry) => entry.id === attendance.subjectId)?.sportId || ''
}

function publicSportsAchievement(entry, users) {
  const student = users.find((candidate) => candidate.id === entry.studentId)
  return { ...entry, studentName: student?.name || entry.studentName, studentActive: Boolean(student?.active && [ROLES.STUDENT, ROLES.SPORTS].includes(student.role)) }
}

function publicSportsNotice(notice) {
  const { recipientIds, ...publicNotice } = notice
  return publicNotice
}

function sportFor(data, value) {
  const records = data.sports ?? DEFAULT_SPORTS_DATA
  const key = safeText(value, 100)
  return records.find((entry) => entry.active !== false && ['Sport', 'Team'].includes(entry.kind) && (entry.id === key || entry.title.toLowerCase() === key.toLowerCase()))
}

function validEventEligibility(event, user) {
  const departments = event.eligibleDepartments || []
  if (!departments.length || departments.includes(ALL_DEPARTMENTS)) return true
  const userDepartment = normalizeSportsDepartment(user.department) || normalizeSportsDepartment(user.course)
  return Boolean(userDepartment && departments.some((department) => normalizeSportsDepartment(department) === userDepartment))
}

function validateSportsEvent(input, data, { partial = false } = {}) {
  let contract
  try {
    contract = normalizeSportsEventContract(input)
  } catch (error) {
    throw sportsError(error.message)
  }
  const name = safeText(contract.name, 120)
  const sport = sportFor(data, contract.sportId || contract.sportName)
  const date = safeText(contract.date, 10)
  const { startTime, endTime, status, kind, eligibleDepartments, audienceType } = contract
  const registrationDeadline = safeText(contract.registrationDeadline, 10)
  const registrationRequired = contract.registrationRequired !== false
  const venue = safeText(contract.venue, 160)
  const eligibility = safeText(contract.eligibility, 300)
  const description = safeText(contract.description, 2000)
  const instructions = safeText(contract.instructions, 2000)
  const eventImage = validateSportsPoster(contract.eventImage || '')
  const maxParticipants = input.maxParticipants === '' || input.maxParticipants === undefined ? 0 : Number(input.maxParticipants)
  const audienceId = audienceType === 'SPORT' ? (sport?.id || '') : audienceType === 'TEAM' ? safeText(input.audienceId, 64) : ''
  if ((!partial || input.name !== undefined) && name.length < 2) throw sportsError('Enter an event or trial name.')
  if (!sport && (!partial || input.sportId !== undefined || input.sportName !== undefined)) throw sportsError('Choose an active sport.')
  if ((!partial || input.date !== undefined) && !validCalendarDate(date)) throw sportsError('Choose a valid event date.')
  if ((!partial || input.startTime !== undefined || input.time !== undefined) && !isNormalizedSportsTime(startTime)) throw sportsError('Choose a valid start time.')
  if (input.endTime !== undefined && !isNormalizedSportsTime(endTime)) throw sportsError('Choose a valid end time.')
  if (endTime && startTime >= endTime) throw sportsError('End time must be after start time.')
  if ((!partial || input.registrationDeadline !== undefined) && (registrationRequired ? !validCalendarDate(registrationDeadline) : Boolean(registrationDeadline) && !validCalendarDate(registrationDeadline))) throw sportsError('Choose a valid registration deadline.')
  if (contract.registrationRequired !== undefined && typeof contract.registrationRequired !== 'boolean') throw sportsError('Choose whether event registration is required.')
  if (date && registrationDeadline && registrationDeadline > date) throw sportsError('Registration deadline cannot be after the event date.')
  if ((!partial || input.venue !== undefined) && !venue) throw sportsError('Enter an event venue.')
  if ((!partial || input.description !== undefined) && description.length < 3) throw sportsError('Add an event description.')
  if ((!partial || input.maxParticipants !== undefined) && (!Number.isInteger(maxParticipants) || maxParticipants < 0 || maxParticipants > 10000)) throw sportsError('Maximum participants must be a whole number from 0 to 10,000.')
  if ((!partial || input.eligibility !== undefined) && !eligibility) throw sportsError('Describe who is eligible for this event.')
  if (audienceType === 'SPORT' && (!sport || audienceId !== sport.id)) throw sportsError('Sports Event notifications must target the event sport.')
  if (audienceType === 'TEAM') {
    const team = data.sportsTeams.find((entry) => entry.id === audienceId && entry.status === 'ACTIVE')
    if (!team || team.sportId !== sport?.id) throw sportsError('Choose an active team for the event sport.')
  }
  return {
    ...(partial && input.name === undefined ? {} : { name }),
    ...(partial && input.sportId === undefined && input.sportName === undefined ? {} : { sportId: sport.id, sportName: sport.title }),
    ...(partial && input.date === undefined ? {} : { date }),
    ...(partial && input.time === undefined && input.startTime === undefined ? {} : { startTime }),
    ...(partial && input.endTime === undefined && input.startTime === undefined && input.time === undefined ? {} : { endTime }),
    ...(partial && input.registrationDeadline === undefined ? {} : { registrationDeadline }),
    ...(partial && input.venue === undefined ? {} : { venue }),
    ...(partial && input.maxParticipants === undefined ? {} : { maxParticipants }),
    ...(partial && input.eligibility === undefined ? {} : { eligibility }),
    ...(partial && input.eligibleDepartments === undefined ? {} : { eligibleDepartments }),
    ...(partial && input.description === undefined ? {} : { description }),
    ...(partial && input.instructions === undefined ? {} : { instructions }),
    ...(partial && input.eventImage === undefined ? {} : { eventImage }),
    ...(partial && input.kind === undefined ? {} : { kind }),
    ...(partial && input.status === undefined ? {} : { status }),
    ...(partial && input.audienceType === undefined ? {} : { audienceType }),
    ...(partial && input.audienceId === undefined && audienceType !== 'SPORT' ? {} : { audienceId }),
    ...(partial && input.registrationRequired === undefined ? {} : { registrationRequired }),
  }
}

function validateSportsPoster(value) {
  if (!value) return ''
  if (typeof value !== 'string' || value.length > 1_400_000) throw sportsError('Event posters must be under 1 MB.')
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || Buffer.from(value.split(',')[1], 'base64').length > 1_000_000) {
    throw sportsError('Upload a PNG, JPEG, or WebP event poster under 1 MB.')
  }
  return value
}

function sportsEventStatus(event) {
  return normalizeSportsEventStatus(event.status)
}

function isPublicSportsEvent(event) {
  return SPORTS_EVENT_VISIBLE_STATUSES.includes(sportsEventStatus(event))
}

function publicSportsEvent(event) {
  const record = { ...event }
  delete record.time
  const startTime = normalizeSportsTime(event.startTime || event.time)
  const endTime = normalizeSportsTime(event.endTime)
  return {
    ...record, status: sportsEventStatus(event),
    eligibleDepartments: Array.isArray(event.eligibleDepartments) ? event.eligibleDepartments : [],
    registrationRequired: event.registrationRequired !== false,
    startTime: startTime || event.startTime || event.time || '',
    endTime: endTime || event.endTime || '',
  }
}

function sportsEventStartsAt(event) {
  const time = normalizeSportsTime(event.startTime || event.time) || '23:59'
  return Date.parse(`${event.date}T${time}:00`)
}

function notifySportsEventAudience(data, event, addNotification) {
  const audienceType = event.audienceType || 'SPORT'
  const audienceId = event.audienceId || (audienceType === 'SPORT' ? event.sportId : event.id)
  const eventAudience = audienceType === 'ALL'
    ? activeSportsUsers(data).map((candidate) => candidate.id)
    : sportsNoticeRecipients({ audienceType, audienceId }, data)
  const recipientIds = [...new Set(eventAudience)]
    .filter((id) => {
      const recipient = data.users.find((candidate) => candidate.id === id && candidate.active)
      return recipient && validEventEligibility(event, recipient)
    })
  event.publishedAt ||= new Date().toISOString()
  for (const recipientUserId of recipientIds) {
    const alreadyNotified = (data.notifications || []).some((notification) =>
      notification.recipientUserId === recipientUserId && notification.referenceId === event.id && notification.type === 'SPORTS_EVENT')
    if (alreadyNotified) continue
    addNotification(data, {
      recipientUserId, title: `Sports Event: ${event.name}`,
      message: `${event.sportName} · ${event.date} · ${formatSportsTime(event.startTime || event.time)} · ${event.venue}`,
      referenceId: event.id, target: 'sports', type: 'SPORTS_EVENT',
    })
  }
}

function validateSportsTeam(input, data, { partial = false } = {}) {
  const name = safeText(input.name, 100)
  const sport = sportFor(data, input.sportId || input.sportName)
  const category = safeText(input.category, 20)
  const teamType = safeText(input.teamType, 30)
  const description = safeText(input.description, 1000)
  const captainId = normalizeUserId(input.captainId)
  const viceCaptainId = normalizeUserId(input.viceCaptainId)
  if ((!partial || input.name !== undefined) && name.length < 2) throw sportsError('Enter a team name.')
  if (!sport && (!partial || input.sportId !== undefined || input.sportName !== undefined)) throw sportsError('Choose an active sport.')
  if ((!partial || input.category !== undefined) && !['Men', 'Women', 'Mixed', 'Other'].includes(category)) throw sportsError('Choose Men, Women, Mixed, or Other team category.')
  if ((!partial || input.teamType !== undefined) && !['College Team', 'Practice Team'].includes(teamType)) throw sportsError('Choose College Team or Practice Team.')
  if ((!partial || input.description !== undefined) && description.length < 3) throw sportsError('Add a team description.')
  if ((!partial || input.captainId !== undefined) && !captainId) throw sportsError('Select an active Student as captain.')
  if ((!partial || input.viceCaptainId !== undefined) && !viceCaptainId) throw sportsError('Select an active Student as vice-captain.')
  if (viceCaptainId && viceCaptainId === captainId) throw sportsError('Captain and vice-captain must be different students.')
  return {
    ...(partial && input.name === undefined ? {} : { name }),
    ...(partial && input.sportId === undefined && input.sportName === undefined ? {} : { sportId: sport.id, sportName: sport.title }),
    ...(partial && input.category === undefined ? {} : { category }),
    ...(partial && input.teamType === undefined ? {} : { teamType }),
    ...(partial && input.description === undefined ? {} : { description }),
    ...(partial && input.captainId === undefined ? {} : { captainId }),
    ...(partial && input.viceCaptainId === undefined ? {} : { viceCaptainId }),
  }
}

function ensureTeamMember(team, student) {
  let member = team.members.find((entry) => entry.studentId === student.id)
  if (!member) {
    member = { studentId: student.id, name: student.name, department: student.department || '', semester: student.semester || '', course: student.course || '', position: 'Player', status: 'ACTIVE', dateAdded: new Date().toISOString() }
    team.members.push(member)
  } else {
    member.status = 'ACTIVE'
    member.name = student.name
  }
  return member
}

function validateSportsSchedule(input, data, { partial = false } = {}) {
  const sport = sportFor(data, input.sportId || input.sportName)
  const team = input.teamId ? data.sportsTeams.find((entry) => entry.id === input.teamId) : null
  const event = input.eventId ? data.sportsEvents.find((entry) => entry.id === input.eventId) : null
  const date = safeText(input.date, 10)
  const time = safeText(input.time, 5)
  const venue = safeText(input.venue, 160)
  const opponent = safeText(input.opponent, 100)
  const instructions = safeText(input.instructions, 1000)
  const title = safeText(input.title || input.name, 120)
  const kind = safeText(input.kind || 'MATCH', 20).toUpperCase()
  if (!sport && (!partial || input.sportId !== undefined || input.sportName !== undefined)) throw sportsError('Choose an active sport.')
  if (input.teamId && (!team || team.sportId !== sport?.id)) throw sportsError('Choose an existing team for this sport.')
  if (input.eventId && (!event || event.sportId !== sport?.id)) throw sportsError('Choose an existing event for this sport.')
  if ((!partial || input.title !== undefined || input.name !== undefined) && title.length < 2) throw sportsError('Enter a schedule title.')
  if ((!partial || input.date !== undefined) && !validCalendarDate(date)) throw sportsError('Choose a valid schedule date.')
  if ((!partial || input.time !== undefined) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw sportsError('Choose a valid schedule time.')
  if ((!partial || input.venue !== undefined) && !venue) throw sportsError('Enter a venue.')
  if ((!partial || input.kind !== undefined) && !['MATCH', 'PRACTICE', 'EVENT'].includes(kind)) throw sportsError('Choose MATCH, PRACTICE, or EVENT.')
  return {
    ...(partial && input.sportId === undefined && input.sportName === undefined ? {} : { sportId: sport.id, sportName: sport.title }),
    ...(partial && input.teamId === undefined ? {} : { teamId: team?.id || '' }),
    ...(partial && input.eventId === undefined ? {} : { eventId: event?.id || '' }),
    ...(partial && input.title === undefined && input.name === undefined ? {} : { title }),
    ...(partial && input.date === undefined ? {} : { date }),
    ...(partial && input.time === undefined ? {} : { time }),
    ...(partial && input.venue === undefined ? {} : { venue }),
    ...(partial && input.opponent === undefined ? {} : { opponent }),
    ...(partial && input.instructions === undefined ? {} : { instructions }),
    ...(partial && input.kind === undefined ? {} : { kind }),
  }
}

function validateSportsResult(input, data) {
  const event = input.eventId ? data.sportsEvents.find((entry) => entry.id === input.eventId) : null
  const sport = sportFor(data, input.sportId || input.sportName || event?.sportId)
  const teamIds = Array.isArray(input.teamIds) ? [...new Set(input.teamIds.map((id) => safeText(id, 64)))] : []
  const playerIds = Array.isArray(input.playerIds) ? [...new Set(input.playerIds.map(normalizeUserId))] : []
  const registrationIds = Array.isArray(input.registrationIds) ? [...new Set(input.registrationIds.map((id) => safeText(id, 64)))] : []
  if (input.eventId && !event) throw sportsError('Choose an existing sports event.')
  if (!sport) throw sportsError('Choose an active sport.')
  if (event && event.sportId !== sport.id) throw sportsError('The result event must belong to the selected sport.')
  if (teamIds.some((id) => !data.sportsTeams.some((team) => team.id === id))) throw sportsError('Choose existing teams for the result.')
  if (teamIds.some((id) => data.sportsTeams.find((team) => team.id === id).sportId !== sport.id)) throw sportsError('Result teams must belong to the selected sport.')
  if (playerIds.some((id) => !activeStudent(data, id))) throw sportsError('Result players must be existing active Student accounts.')
  if (registrationIds.some((id) => !data.sportsRegistrations.some((entry) => entry.id === id))) throw sportsError('Choose existing event registrations.')
  const winner = safeText(input.winner, 120)
  const score = safeText(input.score, 120)
  const remarks = safeText(input.remarks, 1000)
  const date = safeText(input.date, 10)
  const venue = safeText(input.venue, 160)
  if (!winner || !score || !validCalendarDate(date)) throw sportsError('Enter the winner, result/score, and a valid date.')
  return { eventId: event?.id || '', eventName: event?.name || safeText(input.eventName, 120), sportId: sport.id, sportName: sport.title, teamIds, playerIds, registrationIds, winner, score, date, venue, remarks }
}

function validateSportsAchievement(input, data, { partial = false } = {}) {
  const student = input.studentId ? activeStudent(data, input.studentId) : null
  const team = input.teamId ? data.sportsTeams.find((entry) => entry.id === input.teamId) : null
  const sport = sportFor(data, input.sportId || input.sportName || team?.sportId)
  const competition = safeText(input.competition, 120)
  const position = safeText(input.position, 80)
  const year = Number(input.year)
  const achievement = safeText(input.achievement, 1000)
  const certificateUrl = safeText(input.certificateUrl, 500)
  const published = input.published === true
  if (!student && (!partial || input.studentId !== undefined)) throw sportsError('Choose an existing active Student account.')
  if (input.teamId && (!team || team.status === 'ARCHIVED')) throw sportsError('Choose an existing non-archived team.')
  if (team && sport && team.sportId !== sport.id) throw sportsError('The selected team must belong to this sport.')
  if (!sport && (!partial || input.sportId !== undefined || input.sportName !== undefined)) throw sportsError('Choose an active sport.')
  if ((!partial || input.competition !== undefined) && !competition) throw sportsError('Enter the competition name.')
  if ((!partial || input.position !== undefined) && !position) throw sportsError('Enter the achievement position.')
  if ((!partial || input.year !== undefined) && (!Number.isInteger(year) || year < 1900 || year > 2100)) throw sportsError('Enter a valid achievement year.')
  if ((!partial || input.achievement !== undefined) && !achievement) throw sportsError('Describe the achievement.')
  if (certificateUrl && !/^https:\/\/[^\s]+$/i.test(certificateUrl)) throw sportsError('Achievement certificates must use a secure HTTPS URL.')
  return {
    ...(partial && input.studentId === undefined ? {} : { studentId: student.id, studentName: student.name }),
    ...(partial && input.teamId === undefined ? {} : { teamId: team?.id || '', teamName: team?.name || '' }),
    ...(partial && input.sportId === undefined && input.sportName === undefined ? {} : { sportId: sport.id, sportName: sport.title }),
    ...(partial && input.competition === undefined ? {} : { competition }),
    ...(partial && input.position === undefined ? {} : { position }),
    ...(partial && input.year === undefined ? {} : { year }),
    ...(partial && input.achievement === undefined ? {} : { achievement }),
    ...(partial && input.certificateUrl === undefined ? {} : { certificateUrl }),
    ...(partial && input.published === undefined ? {} : { published }),
  }
}

function validateSportsNotice(input) {
  const title = safeText(input.title, 120)
  const message = safeText(input.message, 2000)
  const audienceType = safeText(input.audienceType, 20).toUpperCase()
  const audienceId = safeText(input.audienceId, 64)
  if (title.length < 2 || message.length < 3) throw sportsError('Enter a notice title and message.')
  if (!['ALL', 'SPORT', 'TEAM', 'EVENT', 'ACTIVE'].includes(audienceType)) throw sportsError('Choose an all-sports, sport, team, event/trial, or selected/active participant audience.')
  if (audienceType !== 'ALL' && !audienceId) throw sportsError('Choose the specific sports notice audience.')
  return { title, message, audienceType, audienceId }
}

function validCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function sportsNoticeRecipients(notice, data) {
  if (notice.audienceType === 'ALL') return activeSportsUsers(data)
    .filter((candidate) => activeSportsParticipations(data, candidate.id).length > 0)
    .map((candidate) => candidate.id)
  if (notice.audienceType === 'TEAM') {
    const team = data.sportsTeams.find((entry) => entry.id === notice.audienceId)
    if (!team) throw sportsError('Choose an existing team for this notice.')
    return [...new Set(team.members.filter((entry) => entry.status === 'ACTIVE' && activeStudent(data, entry.studentId) && activeSportsParticipations(data, entry.studentId).some((membership) => membership.sportId === team.sportId)).map((entry) => entry.studentId))]
  }
  if (notice.audienceType === 'EVENT') {
    const event = data.sportsEvents.find((entry) => entry.id === notice.audienceId)
    if (!event) throw sportsError('Choose an existing event or trial for this notice.')
    return [...new Set(data.sportsRegistrations.filter((entry) => entry.eventId === event.id && !['REJECTED', 'CANCELLED'].includes(entry.status) && activeSportsUser(data, entry.studentId)).map((entry) => entry.studentId))]
  }
  if (notice.audienceType === 'ACTIVE') {
    const event = data.sportsEvents.find((entry) => entry.id === notice.audienceId)
    const team = data.sportsTeams.find((entry) => entry.id === notice.audienceId)
    const sport = sportFor(data, notice.audienceId)
    if (!event && !team && !sport) throw sportsError('Choose an existing sport, team, or event for selected/active participants.')
    const sportId = event?.sportId || team?.sportId || sport?.id
    const selectedEventUsers = event
      ? data.sportsRegistrations.filter((entry) => entry.eventId === event.id && entry.status === 'SELECTED').map((entry) => entry.studentId)
      : null
    return [...new Set(activeSportsUsers(data).filter((candidate) =>
      activeSportsParticipations(data, candidate.id).some((membership) => membership.sportId === sportId && (!event || membership.eventId === event.id || membership.source === 'TEAM')) &&
      (!selectedEventUsers || selectedEventUsers.includes(candidate.id)) &&
      (!team || team.members.some((member) => member.studentId === candidate.id && member.status === 'ACTIVE'))).map((candidate) => candidate.id))]
  }
  const sport = sportFor(data, notice.audienceId)
  if (!sport) throw sportsError('Choose an active sport for this notice.')
  return activeSportsUsers(data).filter((candidate) => activeSportsParticipations(data, candidate.id).some((membership) => membership.sportId === sport.id)).map((candidate) => candidate.id)
}

function activeSportsUsers(data) {
  return data.users.filter((candidate) => candidate.active && [ROLES.STUDENT, ROLES.STAFF, ROLES.HOD, ROLES.SPORTS, ROLES.ADMIN].includes(candidate.role))
}

function activeSportsUser(data, userId) {
  return activeSportsUsers(data).some((candidate) => candidate.id === userId)
}