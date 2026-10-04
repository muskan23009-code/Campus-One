import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { basename, extname, resolve } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import {
  clearSessionCookie, hashPassword, normalizeUserId, publicUser,
  sessionCookie, signSession, validatePassword, verifyPassword,
  verifySession,
} from './auth.js'
import {
  CANTEEN_MENU, DEFAULT_CAMPUS_DATA, DEFAULT_SPORTS_DATA, DEPARTMENTS,
  MANAGEMENT_COLLECTIONS, ROLE_VALUES, ROLES, STAFF_MODULES,
  STUDENT_MODULES, USER_ID_FORMATS, canAccess, modulesForUser,
} from './policy.js'

const BODY_LIMIT = 2_000_000
const PHOTO_LIMIT = 1_400_000
const PASSWORD_ATTEMPT_LIMIT = 10
const PASSWORD_ATTEMPT_WINDOW = 15 * 60 * 1000
const CAMPUS_MODULES = {
  notices: 'notices', food: 'food', events: 'events', library: 'library',
  hostel: 'hostel', transport: 'transport', 'lost-found': 'lost-found',
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
    if (!ROLE_VALUES.includes(input.role)) throw Object.assign(new Error('Choose one of the five campus roles.'), { status: 400 })
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
      if (!rollNumber || !course || !semester || !DEPARTMENTS.includes(department)) throw Object.assign(new Error('Complete your enrollment, course, department, and semester details.'), { status: 400 })
      Object.assign(fields, { dateOfBirth, rollNumber, course, department, semester, admissionYear })
    } else if ([ROLES.STAFF, ROLES.HOD].includes(input.role)) {
      const department = safeText(input.department, 100)
      const designation = safeText(input.designation, 100)
      const joiningYear = validYear(input.joiningYear, 'joining year')
      if (!DEPARTMENTS.includes(department) || !designation) throw Object.assign(new Error('Choose your department and enter your designation.'), { status: 400 })
      Object.assign(fields, { department, designation, joiningYear })
    } else if (input.role === ROLES.SPORTS) {
      const department = safeText(input.department, 100)
      const sport = safeText(input.sport, 80)
      const teamCategory = safeText(input.teamCategory, 100)
      if ((department && !DEPARTMENTS.includes(department)) || !sport || !teamCategory) throw Object.assign(new Error('Enter your sport and team or category, and choose a valid department if applicable.'), { status: 400 })
      Object.assign(fields, { department, sport, teamCategory })
    } else if (input.role === ROLES.ADMIN) {
      const designation = safeText(input.designation, 100)
      if (!designation) throw Object.assign(new Error('Enter your Administration designation.'), { status: 400 })
      Object.assign(fields, { designation })
    }

    if (!validatePassword(input.password)) throw Object.assign(new Error('Choose a password with at least 12 characters.'), { status: 400 })
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

  function createApprovedUser(application, data) {
    const user = {
      ...application.fields,
      id: userIdForRole(application.role, data),
      role: application.role,
      active: true,
      modules: [],
      credentials: application.credentials,
      sessionVersion: 1,
      mustChangePassword: false,
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
    if (data.users.some((user) => user.email === fields.email) || data.registrationRequests.some((application) => application.fields.email === fields.email)) {
      throw Object.assign(new Error('An account or application already uses this email address.'), { status: 409 })
    }
    if (fields.rollNumber && (data.users.some((user) => user.role === ROLES.STUDENT && (user.rollNumber || '').toLowerCase() === fields.rollNumber.toLowerCase()) || data.registrationRequests.some((application) => application.role === ROLES.STUDENT && application.status !== 'Rejected' && application.fields.rollNumber.toLowerCase() === fields.rollNumber.toLowerCase()))) {
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

  function addNotification(data, { recipientUserId = '', recipientRequestId = '', title, message, referenceId = '', target = '' }) {
    data.notifications ??= []
    const notification = {
      id: randomUUID(), recipientUserId, recipientRequestId, title, message,
      referenceId, target, readAt: null, createdAt: new Date().toISOString(),
    }
    data.notifications.unshift(notification)
    if (data.notifications.length > 5000) data.notifications.length = 5000
    return notification
  }

  function notifyApprovers(data, role, fields, application) {
    const recipients = role === ROLES.STUDENT
      ? data.users.filter((candidate) => candidate.active && candidate.role === ROLES.HOD && candidate.department === fields.department)
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

  async function handleApi(request, response, pathname, searchParams) {
    if (request.method !== 'GET' && !sameOrigin(request)) return reject(response, 403, 'This request origin is not allowed.')

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
      const credentials = await hashPassword(input.password)
      const requestToken = role === ROLES.ADMIN ? '' : randomBytes(32).toString('base64url')
      const result = await store.transact((data) => {
        assertRegistrationUnique(data, fields)
        if (role === ROLES.ADMIN) {
          return { user: createApprovedUser({ role, fields, credentials, id: randomUUID() }, data) }
        }
        data.registrationRequests ??= []
        const application = {
          id: randomUUID(), role, fields, credentials, status: 'Pending',
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
        },
        notifications: (data.notifications || []).filter((notification) => notification.recipientRequestId === application.id).map(publicNotification),
      })
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
        const students = data.users.filter((candidate) => candidate.active && candidate.role === ROLES.STUDENT && candidate.department === user.department)
        return json(response, 200, { department: user.department, students: students.map((student) => publicUser(student)) })
      }
      if (hodQueue[1] === 'requests' && request.method === 'GET' && !hodQueue[2]) {
        const requests = data.registrationRequests.filter((application) => application.role === ROLES.STUDENT && application.status === 'Pending' && application.fields.department === user.department)
        return json(response, 200, { department: user.department, requests: requests.map(publicRegistration) })
      }
      if (hodQueue[1] === 'requests' && hodQueue[2] && request.method === 'PATCH') {
        const input = await body(request)
        if (!['Accepted', 'Rejected'].includes(input.status)) return reject(response, 400, 'Choose Accept or Reject.')
        const result = await store.transact((current) => {
          const application = current.registrationRequests.find((candidate) => candidate.id === decodeURIComponent(hodQueue[2]))
          if (!application || application.role !== ROLES.STUDENT || application.fields.department !== user.department) throw Object.assign(new Error('This student request is not in your department.'), { status: 404 })
          if (application.status !== 'Pending') throw Object.assign(new Error('This request has already been reviewed.'), { status: 409 })
          application.status = input.status
          application.reviewedAt = new Date().toISOString()
          if (input.status === 'Accepted') {
            const student = createApprovedUser(application, current)
            application.assignedUserId = student.id
            application.credentials = null
            addNotification(current, {
              recipientUserId: student.id,
              recipientRequestId: application.id,
              title: 'Student registration approved',
              message: `Your account is active. Your Student ID is ${student.id}. You can now sign in.`,
              referenceId: application.id,
              target: 'login',
            })
            return { application: publicRegistration(application), userId: student.id }
          }
          application.credentials = null
          addNotification(current, {
            recipientRequestId: application.id,
            title: 'Student registration rejected',
            message: 'Your department HOD reviewed your registration request. Contact your department for next steps.',
            referenceId: application.id,
            target: 'login',
          })
          return { application: publicRegistration(application), userId: null }
        })
        return json(response, 200, result)
      }
      return reject(response, 404, 'Department route not found.')
    }

    if (pathname === '/api/admin/requests' && request.method === 'GET') {
      const user = await authenticatedUser(request)
      if (!user) return reject(response, 401, 'Sign in to continue.')
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required.')
      const data = await store.read()
      const requests = data.registrationRequests.filter((application) => [ROLES.STAFF, ROLES.HOD, ROLES.SPORTS].includes(application.role) && ['Pending', 'Accepted', 'Rejected'].includes(application.status))
      return json(response, 200, { requests: requests.map(publicRegistration) })
    }

    const adminRequest = pathname.match(/^\/api\/admin\/requests\/([^/]+)$/)
    if (adminRequest && request.method === 'PATCH') {
      const user = await authenticatedUser(request)
      if (!user) return reject(response, 401, 'Sign in to continue.')
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required.')
      const input = await body(request)
      if (!['Accepted', 'Rejected'].includes(input.status)) return reject(response, 400, 'Choose Allow/Accept or Reject.')
      const result = await store.transact((data) => {
        const application = data.registrationRequests.find((candidate) => candidate.id === decodeURIComponent(adminRequest[1]))
        if (!application || ![ROLES.STAFF, ROLES.HOD, ROLES.SPORTS].includes(application.role)) throw Object.assign(new Error('This Administration request was not found.'), { status: 404 })
        if (application.status !== 'Pending') throw Object.assign(new Error('This request has already been reviewed.'), { status: 409 })
        application.status = input.status
        application.reviewedAt = new Date().toISOString()
        if (input.status === 'Accepted') {
          const approved = createApprovedUser(application, data)
          application.assignedUserId = approved.id
          application.credentials = null
          notifyPendingDepartmentRequests(data, approved)
          addNotification(data, {
            recipientUserId: approved.id,
            recipientRequestId: application.id,
            title: `${application.role} access approved`,
            message: `Your account is active. Your User ID is ${approved.id}. You can now sign in.`,
            referenceId: application.id,
            target: 'login',
          })
          return { request: publicRegistration(application), userId: approved.id }
        }
        application.credentials = null
        addNotification(data, {
          recipientRequestId: application.id,
          title: `${application.role} access rejected`,
          message: 'Administration reviewed your access request. Contact the campus office for next steps.',
          referenceId: application.id,
          target: 'login',
        })
        return { request: publicRegistration(application), userId: null }
      })
      return json(response, 200, result)
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
        return reject(response, 401, 'User ID or password is incorrect.')
      }
      loginAttempts.delete(attemptKey)
      saveSession(response, candidate, request)
      return json(response, 200, { user: publicUser(candidate), modules: modulesForUser(candidate) })
    }

    const user = await authenticatedUser(request)
    if (!user) return reject(response, 401, 'Sign in to continue.')

    if (pathname === '/api/notifications' && request.method === 'GET') {
      const data = await store.read()
      const notifications = (data.notifications || []).filter((notification) => notification.recipientUserId === user.id).slice(0, 100)
      return json(response, 200, { notifications: notifications.map(publicNotification), unreadCount: notifications.filter((notification) => !notification.readAt).length })
    }

    if (pathname === '/api/notifications/read-all' && request.method === 'POST') {
      const now = new Date().toISOString()
      const updated = await store.transact((data) => {
        let count = 0
        for (const notification of data.notifications || []) {
          if (notification.recipientUserId === user.id && !notification.readAt) { notification.readAt = now; count += 1 }
        }
        return count
      })
      return json(response, 200, { markedRead: updated })
    }

    const notificationRoute = pathname.match(/^\/api\/notifications\/([^/]+)$/)
    if (notificationRoute && request.method === 'PATCH') {
      const updated = await store.transact((data) => {
        const notification = (data.notifications || []).find((item) => item.id === decodeURIComponent(notificationRoute[1]) && item.recipientUserId === user.id)
        if (!notification) throw Object.assign(new Error('Notification not found.'), { status: 404 })
        notification.readAt ||= new Date().toISOString()
        return notification
      })
      return json(response, 200, { notification: publicNotification(updated) })
    }

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

    if (pathname === '/api/food/orders' && request.method === 'GET') {
      if (![ROLES.STUDENT, ROLES.ADMIN].includes(user.role)) return reject(response, 403, 'Only students and Administration can access canteen orders.')
      const data = await store.read()
      const orders = data.foodOrders || []
      const visible = user.role === ROLES.ADMIN ? orders : orders.filter((order) => order.userId === user.id)
      return json(response, 200, { orders: visible.map(publicFoodOrder) })
    }

    if (pathname === '/api/food/orders' && request.method === 'POST') {
      if (user.role !== ROLES.STUDENT) return reject(response, 403, 'Only students can place canteen pre-orders.')
      const input = await body(request)
      if (!Object.hasOwn(CANTEEN_MENU, input.meal) || !CANTEEN_MENU[input.meal].includes(input.item)) return reject(response, 400, 'Choose an available item from the selected campus menu.')
      const order = {
        id: randomUUID(), orderNumber: `FO-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`,
        userId: user.id, meal: input.meal, item: input.item, status: 'Placed',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }
      await store.transact((data) => { data.foodOrders ??= []; data.foodOrders.unshift(order) })
      return json(response, 201, { order: publicFoodOrder(order) })
    }

    const foodOrderRoute = pathname.match(/^\/api\/food\/orders\/([^/]+)$/)
    if (foodOrderRoute && request.method === 'PATCH') {
      const input = await body(request)
      const allowedStatus = ['Placed', 'Preparing', 'Ready', 'Collected', 'Cancelled']
      if (!allowedStatus.includes(input.status)) return reject(response, 400, 'Choose a valid order status.')
      const order = await store.transact((data) => {
        const existing = (data.foodOrders || []).find((candidate) => candidate.id === decodeURIComponent(foodOrderRoute[1]))
        if (!existing) throw Object.assign(new Error('Canteen order not found.'), { status: 404 })
        if (user.role === ROLES.ADMIN) existing.status = input.status
        else if (user.role === ROLES.STUDENT && existing.userId === user.id && input.status === 'Cancelled' && ['Placed', 'Preparing'].includes(existing.status)) existing.status = 'Cancelled'
        else throw Object.assign(new Error('You cannot change this order.'), { status: 403 })
        existing.updatedAt = new Date().toISOString()
        return existing
      })
      return json(response, 200, { order: publicFoodOrder(order) })
    }

    if (pathname === '/api/users' && request.method === 'GET') {
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required.')
      const data = await store.read()
      return json(response, 200, { users: data.users.map(publicUser) })
    }

    const userRoute = pathname.match(/^\/api\/users\/([^/]+)(?:\/(reset-password))?$/)
    if (userRoute && request.method === 'PATCH') {
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required.')
      const targetId = decodeURIComponent(userRoute[1])
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
          target.active = input.active
          if (!target.active) target.sessionVersion += 1
        }
        return target
      })
      return json(response, 200, { user: publicUser(updated) })
    }

    if (userRoute && userRoute[2] === 'reset-password') return reject(response, 410, 'Users change their own password through their campus account.')

    const campusRoute = pathname.match(/^\/api\/campus\/([^/]+)(?:\/([^/]+))?$/)
    if (campusRoute) {
      const collection = decodeURIComponent(campusRoute[1])
      if (!MANAGEMENT_COLLECTIONS.includes(collection)) return reject(response, 404, 'Campus collection not found.')
      if (!canAccess(user, CAMPUS_MODULES[collection])) return reject(response, 403, 'Your role cannot access this campus service.')
      if (request.method === 'GET') {
        const data = await store.read()
        const records = data.campus?.[collection] ?? DEFAULT_CAMPUS_DATA[collection] ?? []
        return json(response, 200, { records: records.filter((record) => record.active) })
      }
      if (user.role !== ROLES.ADMIN) return reject(response, 403, 'Administration access is required to manage campus data.')
      if (request.method === 'POST' && !campusRoute[2]) {
        const input = await body(request)
        const record = validateRecord(input)
        if (collection === 'food' && hasManualCrowd(input)) Object.assign(record, validateManualCrowd(input))
        const created = await store.transact((data) => {
          const records = campusRecords(data, collection)
          record.id = randomUUID()
          records.unshift(record)
          if (records.length > 200) throw Object.assign(new Error('This campus collection is full.'), { status: 400 })
          return record
        })
        return json(response, 201, { record: created })
      }
      if (campusRoute[2] && request.method === 'PATCH') {
        const input = await body(request)
        const patch = validateRecord(input)
        if (collection === 'food' && hasManualCrowd(input)) Object.assign(patch, validateManualCrowd(input))
        const updated = await store.transact((data) => {
          const record = campusRecords(data, collection).find((candidate) => candidate.id === decodeURIComponent(campusRoute[2]))
          if (!record) throw Object.assign(new Error('Campus record not found.'), { status: 404 })
          record.title = patch.title
          record.description = patch.description
          if (collection === 'food' && hasManualCrowd(input)) {
            record.crowdLevel = patch.crowdLevel
            record.occupancyPercent = patch.occupancyPercent
            record.estimatedWaitMinutes = patch.estimatedWaitMinutes
            record.crowdUpdatedAt = patch.crowdUpdatedAt
          }
          return record
        })
        return json(response, 200, { record: updated })
      }
      if (campusRoute[2] && request.method === 'DELETE') {
        const id = decodeURIComponent(campusRoute[2])
        const found = await store.transact((data) => {
          const record = campusRecords(data, collection).find((candidate) => candidate.id === id)
          if (!record) return false
          record.active = false
          return true
        })
        return found ? json(response, 200, { ok: true }) : reject(response, 404, 'Campus record not found.')
      }
      return reject(response, 405, 'This operation is not available.')
    }

    if (pathname === '/api/complaints' && request.method === 'GET') {
      if (!canAccess(user, 'complaints')) return reject(response, 403, 'Your role cannot access complaint records.')
      const data = await store.read()
      const records = data.complaints || []
      const visible = user.role === ROLES.ADMIN ? records
        : user.role === ROLES.STAFF ? records.filter((record) => record.assignedTo === user.id)
          : records.filter((record) => record.userId === user.id)
      return json(response, 200, { complaints: visible.map((record) => publicComplaint(record, user.role !== ROLES.STUDENT)) })
    }

    if (pathname === '/api/complaints' && request.method === 'POST') {
      if (!canAccess(user, 'complaints')) return reject(response, 403, 'Your role cannot submit complaints.')
      const input = await body(request)
      const title = safeText(input.title, 120)
      const description = safeText(input.description, 2000)
      if (title.length < 3 || description.length < 10) return reject(response, 400, 'Add a subject and a description of at least 10 characters.')
      const complaint = { id: randomUUID(), title, description, userId: user.id, assignedTo: '', status: 'Open', createdAt: new Date().toISOString() }
      await store.transact((data) => { data.complaints ??= []; data.complaints.unshift(complaint) })
      return json(response, 201, { complaint: publicComplaint(complaint, user.role !== ROLES.STUDENT) })
    }

    const complaintRoute = pathname.match(/^\/api\/complaints\/([^/]+)$/)
    if (complaintRoute && request.method === 'PATCH') {
      if (![ROLES.ADMIN, ROLES.STAFF].includes(user.role) || !canAccess(user, 'complaints')) return reject(response, 403, 'Complaint management is not assigned to your role.')
      const input = await body(request)
      if (input.status !== undefined && !['Open', 'In progress', 'Resolved'].includes(input.status)) return reject(response, 400, 'Choose a valid complaint status.')
      const updated = await store.transact((data) => {
        const complaint = (data.complaints || []).find((record) => record.id === decodeURIComponent(complaintRoute[1]))
        if (!complaint) throw Object.assign(new Error('Complaint not found.'), { status: 404 })
        if (user.role === ROLES.STAFF && complaint.assignedTo && complaint.assignedTo !== user.id) throw Object.assign(new Error('This request is assigned to another staff member.'), { status: 403 })
        if (input.status) complaint.status = input.status
        if (input.assignedTo !== undefined) {
          if (user.role !== ROLES.ADMIN) throw Object.assign(new Error('Only administration can assign complaints.'), { status: 403 })
          const assignee = data.users.find((candidate) => candidate.id === normalizeUserId(input.assignedTo) && candidate.role === ROLES.STAFF && candidate.active && canAccess(candidate, 'complaints'))
          if (input.assignedTo && !assignee) throw Object.assign(new Error('Choose an active staff member assigned to complaints.'), { status: 400 })
          complaint.assignedTo = assignee?.id || ''
        }
        return complaint
      })
      return json(response, 200, { complaint: publicComplaint(updated, true) })
    }

    if (pathname === '/api/sports' && request.method === 'GET') {
      if (!canAccess(user, 'sports')) return reject(response, 403, 'Sports information is not assigned to your role.')
      const data = await store.read()
      return json(response, 200, { records: data.sports ?? DEFAULT_SPORTS_DATA })
    }

    if (pathname === '/api/sports' && request.method === 'POST') {
      if (![ROLES.SPORTS, ROLES.ADMIN].includes(user.role)) return reject(response, 403, 'Sports Captain or Administration access is required.')
      const input = await body(request)
      const record = validateSportsRecord(input)
      const created = await store.transact((data) => {
        data.sports ??= [...DEFAULT_SPORTS_DATA]
        if (data.sports.length >= 150) throw Object.assign(new Error('The sports directory is full.'), { status: 400 })
        record.id = randomUUID()
        data.sports.unshift(record)
        return record
      })
      return json(response, 201, { record: created })
    }

    const sportsRoute = pathname.match(/^\/api\/sports\/([^/]+)$/)
    if (sportsRoute && (request.method === 'PATCH' || request.method === 'DELETE')) {
      if (![ROLES.SPORTS, ROLES.ADMIN].includes(user.role)) return reject(response, 403, 'Sports Captain or Administration access is required.')
      const id = decodeURIComponent(sportsRoute[1])
      if (request.method === 'DELETE') {
        const removed = await store.transact((data) => {
          data.sports ??= [...DEFAULT_SPORTS_DATA]
          const index = data.sports.findIndex((record) => record.id === id)
          if (index < 0) return false
          data.sports.splice(index, 1)
          return true
        })
        return removed ? json(response, 200, { ok: true }) : reject(response, 404, 'Sports record not found.')
      }
      const patch = validateSportsRecord(await body(request))
      const updated = await store.transact((data) => {
        data.sports ??= [...DEFAULT_SPORTS_DATA]
        const record = data.sports.find((candidate) => candidate.id === id)
        if (!record) throw Object.assign(new Error('Sports record not found.'), { status: 404 })
        Object.assign(record, patch)
        return record
      })
      return json(response, 200, { record: updated })
    }

    return reject(response, 404, 'Campus API route not found.')
  }

  async function serveStatic(request, response, pathname) {
    if (!staticDirectory) return false
    const candidate = resolve(staticDirectory, `.${decodeURIComponent(pathname)}`)
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

function validateRecord(input) {
  const title = safeText(input.title, 120)
  const description = safeText(input.description, 1200)
  if (title.length < 2 || description.length < 3) throw Object.assign(new Error('Add a title and a description for this campus record.'), { status: 400 })
  return { title, description }
}

function validateManualCrowd(input) {
  const crowdLevel = input.crowdLevel || 'Moderate'
  const occupancyPercent = input.occupancyPercent === undefined || input.occupancyPercent === '' ? 68 : Number(input.occupancyPercent)
  const estimatedWaitMinutes = input.estimatedWaitMinutes === undefined || input.estimatedWaitMinutes === '' ? 8 : Number(input.estimatedWaitMinutes)
  if (!['Low', 'Moderate', 'Busy'].includes(crowdLevel)) throw Object.assign(new Error('Choose a valid manual crowd estimate.'), { status: 400 })
  if (!Number.isInteger(occupancyPercent) || occupancyPercent < 0 || occupancyPercent > 100) throw Object.assign(new Error('Manual estimated occupancy must be between 0 and 100%. '), { status: 400 })
  if (!Number.isInteger(estimatedWaitMinutes) || estimatedWaitMinutes < 0 || estimatedWaitMinutes > 180) throw Object.assign(new Error('Manual estimated wait must be between 0 and 180 minutes.'), { status: 400 })
  return { crowdLevel, occupancyPercent, estimatedWaitMinutes, crowdUpdatedAt: new Date().toISOString() }
}

function hasManualCrowd(input) {
  return ['crowdLevel', 'occupancyPercent', 'estimatedWaitMinutes'].some((field) => input[field] !== undefined)
}

function campusRecords(data, collection) {
  data.campus ??= {}
  data.campus[collection] ??= structuredClone(DEFAULT_CAMPUS_DATA[collection] ?? [])
  return data.campus[collection]
}

function publicComplaint(complaint, includeIdentity) {
  const { id, title, description, assignedTo, status, createdAt, userId } = complaint
  return { id, title, description, status, createdAt, ...(includeIdentity ? { userId, assignedTo } : {}) }
}

function publicFoodOrder(order) {
  const { id, orderNumber, userId, meal, item, status, createdAt, updatedAt } = order
  return { id, orderNumber, ...(userId ? { userId } : {}), meal, item, status, createdAt, updatedAt }
}

function publicNotification(notification) {
  const { id, title, message, referenceId, target, readAt, createdAt } = notification
  return { id, title, message, referenceId, target, readAt, createdAt }
}

function validateSportsRecord(input) {
  const kind = safeText(input.kind, 40)
  const title = safeText(input.title, 100)
  const description = safeText(input.description, 1000)
  if (!['Team', 'Player', 'Sports event', 'Participation', 'Equipment', 'Announcement', 'Information'].includes(kind)) throw Object.assign(new Error('Choose a valid sports information category.'), { status: 400 })
  if (title.length < 2 || description.length < 3) throw Object.assign(new Error('Add a title and details for this sports record.'), { status: 400 })
  return { kind, title, description, active: input.active !== false }
}