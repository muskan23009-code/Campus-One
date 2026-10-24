export const SPORTS_DEPARTMENTS = Object.freeze([
  'B.Tech', 'BCA', 'Law', 'Pharmacy', 'Diploma', 'Management',
])

export const ALL_DEPARTMENTS = 'All Departments'
export const SPORTS_DEPARTMENT_OPTIONS = Object.freeze([ALL_DEPARTMENTS, ...SPORTS_DEPARTMENTS])
export const SPORTS_EVENT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  REGISTRATION_OPEN: 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  ONGOING: 'ONGOING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
})
export const SPORTS_EVENT_STATUSES = Object.freeze(Object.values(SPORTS_EVENT_STATUS))
export const SPORTS_EVENT_VISIBLE_STATUSES = Object.freeze([
  SPORTS_EVENT_STATUS.PUBLISHED, SPORTS_EVENT_STATUS.REGISTRATION_OPEN,
])
export const SPORTS_EVENT_PUBLISHED_STATUSES = Object.freeze([
  SPORTS_EVENT_STATUS.PUBLISHED, SPORTS_EVENT_STATUS.REGISTRATION_OPEN,
  SPORTS_EVENT_STATUS.REGISTRATION_CLOSED, SPORTS_EVENT_STATUS.ONGOING,
  SPORTS_EVENT_STATUS.COMPLETED,
])
export const SPORTS_EVENT_STATUS_LABELS = Object.freeze({
  [SPORTS_EVENT_STATUS.DRAFT]: 'Draft',
  [SPORTS_EVENT_STATUS.PUBLISHED]: 'Published',
  [SPORTS_EVENT_STATUS.REGISTRATION_OPEN]: 'Registration Open',
  [SPORTS_EVENT_STATUS.REGISTRATION_CLOSED]: 'Registration Closed',
  [SPORTS_EVENT_STATUS.ONGOING]: 'Ongoing',
  [SPORTS_EVENT_STATUS.COMPLETED]: 'Completed',
  [SPORTS_EVENT_STATUS.CANCELLED]: 'Cancelled',
})
export const SPORTS_EVENT_TYPE = Object.freeze({
  TOURNAMENT: 'TOURNAMENT',
  MATCH: 'MATCH',
  TRIAL: 'TRIAL',
  COMPETITION: 'COMPETITION',
  PRACTICE_SESSION: 'PRACTICE_SESSION',
  TRAINING: 'TRAINING',
  OTHER: 'OTHER',
})
export const SPORTS_EVENT_TYPES = Object.freeze(Object.values(SPORTS_EVENT_TYPE))
export const SPORTS_NOTIFICATION_AUDIENCE = Object.freeze({
  ALL: 'ALL', SPORT: 'SPORT', TEAM: 'TEAM', EVENT: 'EVENT',
})
export const SPORTS_NOTIFICATION_AUDIENCES = Object.freeze(Object.values(SPORTS_NOTIFICATION_AUDIENCE))
export const SPORTS_NOTIFICATION_AUDIENCE_LABELS = Object.freeze({
  [SPORTS_NOTIFICATION_AUDIENCE.ALL]: 'All Sports Users',
  [SPORTS_NOTIFICATION_AUDIENCE.SPORT]: 'Specific Sport',
  [SPORTS_NOTIFICATION_AUDIENCE.TEAM]: 'Specific Team',
  [SPORTS_NOTIFICATION_AUDIENCE.EVENT]: 'Registered Event Participants',
})
export const SPORTS_EVENT_REGISTRATION_STATUS = Object.freeze({
  PENDING: 'PENDING', ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED',
})
export const SPORTS_EVENT_REGISTRATION_STATUSES = Object.freeze(Object.values(SPORTS_EVENT_REGISTRATION_STATUS))
export const SPORTS_EVENT_CAPACITY_STATUSES = Object.freeze([
  SPORTS_EVENT_REGISTRATION_STATUS.PENDING, SPORTS_EVENT_REGISTRATION_STATUS.ACCEPTED,
])
export const SPORTS_TIME_MINUTES = Object.freeze([
  '00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55',
])
export const SPORTS_EVENT_DEFAULT_STATUS = SPORTS_EVENT_STATUS.DRAFT
export const SPORTS_EVENT_DEFAULT_TYPE = SPORTS_EVENT_TYPE.TOURNAMENT
export const SPORTS_EVENT_DEFAULT_AUDIENCE = SPORTS_NOTIFICATION_AUDIENCE.SPORT

const SPORTS_DEPARTMENT_ALIASES = Object.freeze({
  btech: 'B.Tech',
  'b.tech cse': 'B.Tech',
  'b.tech aiml': 'B.Tech',
  'bachelor of technology': 'B.Tech',
  cse: 'B.Tech',
  'computer science': 'B.Tech',
  'civil engineering': 'B.Tech',
  'mechanical engineering': 'B.Tech',
  'electrical engineering': 'B.Tech',
  law: 'Law',
  'law department': 'Law',
  pharmacy: 'Pharmacy',
  'pharmacy department': 'Pharmacy',
  diploma: 'Diploma',
  management: 'Management',
  'management department': 'Management',
  'business administration': 'Management',
})

export function normalizeSportsDepartment(value) {
  if (typeof value !== 'string') return ''
  const department = value.trim()
  return SPORTS_DEPARTMENTS.find((option) => option.toLowerCase() === department.toLowerCase())
    || SPORTS_DEPARTMENT_ALIASES[department.toLowerCase()]
    || ''
}

export function normalizeSportsDepartments(values) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((value) => SPORTS_DEPARTMENTS.includes(value)))]
}

export function normalizeSportsEventStatus(value) {
  const status = String(value || SPORTS_EVENT_DEFAULT_STATUS).trim().toUpperCase()
  const legacyStatuses = {
    OPEN: SPORTS_EVENT_STATUS.REGISTRATION_OPEN,
    CLOSED: SPORTS_EVENT_STATUS.REGISTRATION_CLOSED,
  }
  return legacyStatuses[status] || status
}

export function normalizeSportsEventContract(event) {
  const times = sportsEventTimePayload(event)
  const status = String(event.status ?? SPORTS_EVENT_DEFAULT_STATUS).trim().toUpperCase()
  if (event.status !== undefined && !String(event.status).trim()) throw new Error('Choose a valid Sports Event status.')
  if (!SPORTS_EVENT_STATUSES.includes(status)) throw new Error('Choose a valid Sports Event status.')

  const rawKind = String(event.kind ?? 'OTHER').trim().toUpperCase().replaceAll(' ', '_')
  const kind = ({
    EVENT: SPORTS_EVENT_TYPE.OTHER,
    PRACTICE: SPORTS_EVENT_TYPE.PRACTICE_SESSION,
  })[rawKind] || rawKind
  if (!SPORTS_EVENT_TYPES.includes(kind)) throw new Error('Choose a valid Sports Event type.')

  if (event.eligibleDepartments !== undefined && !Array.isArray(event.eligibleDepartments)) {
    throw new Error(`Choose one or more listed eligible departments, or select ${ALL_DEPARTMENTS}.`)
  }
  const selectedDepartments = [...new Set((event.eligibleDepartments || []).map((value) => String(value).trim()).filter(Boolean))]
  const normalizedDepartments = selectedDepartments.map((value) => {
    if (value === ALL_DEPARTMENTS) return value
    return SPORTS_DEPARTMENTS.find((department) => department.toLowerCase() === value.toLowerCase())
      || (value.toLowerCase() === 'btech' ? 'B.Tech' : '')
  })
  const eligibleDepartments = normalizedDepartments.includes(ALL_DEPARTMENTS)
    ? []
    : [...new Set(normalizedDepartments.filter(Boolean))]
  if (normalizedDepartments.some((value) => !value)) {
    throw new Error(`Choose one or more listed eligible departments from the configured Sports departments, or select ${ALL_DEPARTMENTS}.`)
  }

  const audienceType = String(event.audienceType ?? SPORTS_EVENT_DEFAULT_AUDIENCE).trim().toUpperCase()
  if (!SPORTS_NOTIFICATION_AUDIENCES.includes(audienceType)) {
    throw new Error('Choose a supported Sports Event audience.')
  }

  return { ...event, ...times, status, kind, eligibleDepartments, audienceType }
}

export function normalizeSportsTime(value) {
  if (typeof value !== 'string') return ''
  const time = value.trim()
  const time24 = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (time24) return `${time24[1]}:${time24[2]}`
  const time12 = time.match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i)
  if (!time12) return ''
  const hour = Number(time12[1]) % 12 + (/PM/i.test(time12[3]) ? 12 : 0)
  return `${String(hour).padStart(2, '0')}:${time12[2]}`
}

export function isNormalizedSportsTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function formatSportsTime(value) {
  const normalized = normalizeSportsTime(value)
  if (!normalized) return value || ''
  const [hourText, minute] = normalized.split(':')
  const hour = Number(hourText)
  return `${(hour + 11) % 12 + 1}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`
}

export function sportsEventTimePayload(event) {
  const startTime = normalizeSportsTime(event.startTime || event.time)
  const endTime = normalizeSportsTime(event.endTime)
  if (!startTime) throw new Error('Choose a valid start time.')
  if (event.endTime && !endTime) throw new Error('Choose a valid end time.')
  if (endTime && startTime >= endTime) throw new Error('End time must be after start time.')
  const fields = { ...event }
  delete fields.time
  return { ...fields, startTime, ...(endTime ? { endTime } : {}) }
}
