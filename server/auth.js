import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const SESSION_LIFETIME_SECONDS = 60 * 60 * 8
const PASSWORD_HASH_BYTES = 64
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export function normalizeUserId(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

export function publicUser(user, { includePhoto = false } = {}) {
  const { id, name, role, email, active, modules, mustChangePassword, createdAt, department, designation, joiningYear, gender, profilePhoto, rollNumber, course, semester, admissionYear, sport, teamCategory, mobile } = user
  return {
    id, name, role, email, active, modules, mustChangePassword, createdAt,
    department, designation, joiningYear, gender, rollNumber, course,
    semester, admissionYear, sport, teamCategory, mobile,
    ...(includePhoto && profilePhoto ? { profilePhoto } : {}),
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const derivedKey = await scrypt(password, salt, PASSWORD_HASH_BYTES, SCRYPT_OPTIONS)
  return { salt: salt.toString('hex'), hash: derivedKey.toString('hex'), scheme: 'scrypt-32768' }
}

export async function verifyPassword(password, credentials) {
  if (!credentials || credentials.scheme !== 'scrypt-32768') return false
  if (typeof password !== 'string' || !/^[a-f0-9]{32}$/i.test(credentials.salt || '') || !/^[a-f0-9]{128}$/i.test(credentials.hash || '')) return false
  const actual = await scrypt(password, Buffer.from(credentials.salt, 'hex'), PASSWORD_HASH_BYTES, SCRYPT_OPTIONS)
  const expected = Buffer.from(credentials.hash, 'hex')
  return timingSafeEqual(actual, expected)
}

export function validatePassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128
}

function safeEqualText(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function signSession(user, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, ver: user.sessionVersion, exp: Math.floor(now / 1000) + SESSION_LIFETIME_SECONDS })).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  if (!safeEqualText(signature, expected)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof session.sub !== 'string' || !Number.isInteger(session.ver) || !Number.isInteger(session.exp) || session.exp < Math.floor(now / 1000)) return null
    return session
  } catch {
    return null
  }
}

export function sessionCookie(session, secure) {
  return `campus_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_LIFETIME_SECONDS}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(secure) {
  return `campus_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`
}