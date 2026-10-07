export const ROLES = Object.freeze({
  STUDENT: 'Student',
  STAFF: 'Staff',
  HOD: 'HOD',
  ADMIN: 'Administration',
  SPORTS: 'Sports Captain',
})

export const ROLE_VALUES = Object.freeze(Object.values(ROLES))

export const USER_ID_FORMATS = Object.freeze({
  [ROLES.STUDENT]: { prefix: 'PM-S', start: 1001, width: 4 },
  [ROLES.STAFF]: { prefix: 'PM-ST', start: 1, width: 3 },
  [ROLES.HOD]: { prefix: 'PM-HOD', start: 1, width: 3 },
  [ROLES.SPORTS]: { prefix: 'PM-SC', start: 1, width: 3 },
  [ROLES.ADMIN]: { prefix: 'PM-AD', start: 1, width: 3 },
})

export const STUDENT_MODULES = Object.freeze([
  'overview', 'copilot', 'notices', 'food', 'navigation', 'directory',
  'complaints', 'sports', 'events', 'library', 'hostel', 'transport',
  'lost-found', 'emergency',
])

export const STAFF_MODULES = Object.freeze([
  'overview', 'notices', 'complaints', 'events', 'library', 'hostel',
  'transport', 'directory', 'food', 'lost-found', 'emergency',
])

export const HOD_MODULES = Object.freeze([
  'overview', 'notices', 'complaints', 'lost-found', 'department-requests', 'department-students',
])

export const ALL_MODULES = Object.freeze([
  ...STUDENT_MODULES, 'analytics', 'users', 'campus-management',
  'sports-management',
])

export function modulesForUser(user) {
  if (user.role === ROLES.ADMIN) return ALL_MODULES
  if (user.role === ROLES.STUDENT) return STUDENT_MODULES
  if (user.role === ROLES.HOD) return HOD_MODULES
  if (user.role === ROLES.STAFF) {
    return [...new Set([...STAFF_MODULES, ...(user.modules || [])])]
  }
  if (user.role === ROLES.SPORTS) {
    return ['overview', 'notices', 'complaints', 'lost-found', 'events', 'sports', 'sports-management']
  }
  return []
}

export function canAccess(user, moduleId) {
  return modulesForUser(user).includes(moduleId)
}

export const MANAGEMENT_COLLECTIONS = Object.freeze([
  'notices', 'food', 'events', 'library', 'hostel', 'transport',
  'directory', 'emergency',
])

export const DEPARTMENTS = Object.freeze([
  'Computer Science', 'Civil Engineering', 'Mechanical Engineering',
  'Electrical Engineering', 'Business Administration', 'Pharmacy',
])

export const DEFAULT_CAMPUS_DATA = Object.freeze({
  notices: [
    { id: 'notice-exams', title: 'Mid-semester examination schedule', description: 'Confirm your exam center by Friday, October 9.', active: true },
    { id: 'notice-scholarship', title: 'Scholarship renewal applications', description: 'Student Affairs applications close October 14.', active: true },
    { id: 'notice-library', title: 'Library extended hours this week', description: 'The library closes at 8:00 pm this week.', active: true },
  ],
  food: [
    { id: 'food-mess', title: 'North student mess', description: 'Lunch · 12:00–2:30 pm · Manual campus estimate', active: true, crowdLevel: 'Moderate', occupancyPercent: 68, estimatedWaitMinutes: 8, crowdUpdatedAt: '2026-10-04T09:00:00.000Z' },
    { id: 'food-canteen', title: 'Sunrise canteen', description: 'Grilled paneer wrap · ₹90 · About 12 minutes', active: true },
  ],
  events: [
    { id: 'event-design', title: 'Design week · Opening night', description: 'Thursday · 5:00 pm · Main auditorium', active: true },
    { id: 'event-openmic', title: 'Open mic at the courtyard', description: 'Friday · 6:30 pm · Student courtyard', active: true },
  ],
  library: [
    { id: 'library-central', title: 'Central library', description: 'Open today · Closes at 8:00 pm', active: true },
    { id: 'library-reading-room', title: 'Engineering reading room', description: 'Academic Block A · Quiet study', active: true },
  ],
  hostel: [
    { id: 'hostel-maintenance', title: 'Room maintenance', description: 'Track a repair request or report an issue.', active: true },
    { id: 'hostel-notices', title: 'Residence notices', description: 'Updates from your hostel community.', active: true },
  ],
  transport: [
    { id: 'transport-s04', title: 'Route S-04', description: 'West campus · Library · Student residence', active: true },
    { id: 'transport-shuttle', title: 'Campus shuttle', description: 'Gate 2 · Every 15 minutes', active: true },
  ],
  directory: [
    { id: 'directory-engineering', title: 'School of Engineering', description: 'Academic Block A · Mon–Fri, 9 am–4 pm', active: true },
    { id: 'directory-student-affairs', title: 'Student affairs', description: 'Administration building · Mon–Sat, 9 am–5 pm', active: true },
  ],
  emergency: [
    { id: 'emergency-security', title: 'Campus security', description: 'Main security office · Available 24 hours', active: true },
    { id: 'emergency-health', title: 'Campus infirmary', description: 'Student services building · 8 am–8 pm', active: true },
  ],
})

export const DEFAULT_SPORTS_DATA = Object.freeze([
  { id: 'sports-team-badminton', kind: 'Team', title: 'Badminton', description: 'Open to all students · Sports complex', active: true },
  { id: 'sports-team-football', kind: 'Team', title: 'Football', description: 'Intercollegiate team · Student trials each semester', active: true },
  { id: 'sports-equipment', kind: 'Equipment', title: 'Sports equipment desk', description: 'Student services desk · Open until 6:00 pm', active: true },
  { id: 'sports-event-wellness', kind: 'Sports event', title: 'Campus wellness week', description: 'Student activities · October 12–16', active: true },
])

export const CANTEEN_MENU = Object.freeze({
  Breakfast: Object.freeze(['Idli with sambhar', 'Aloo paratha', 'Masala omelette']),
  Lunch: Object.freeze(['Dal makhani & jeera rice', 'Paneer tikka wrap', 'Seasonal fruit bowl']),
  Dinner: Object.freeze(['Matar paneer & roti', 'Veg noodles', 'Kadhi chawal']),
})