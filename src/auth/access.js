export const APP_ROLES = Object.freeze({
  STUDENT: 'Student',
  STAFF: 'Staff',
  HOD: 'HOD',
  ADMIN: 'Administration',
  SPORTS: 'Sports Captain',
  CANTEEN: 'Canteen Staff',
})

export const STAFF_DEFAULT_MODULES = Object.freeze([
  'overview', 'notices', 'complaints', 'events', 'library', 'hostel',
  'transport', 'directory', 'food', 'canteen', 'lost-found', 'emergency', 'sports',
])

export const STUDENT_ALLOWED_MODULES = Object.freeze([
  'overview', 'notices', 'copilot', 'food', 'navigation', 'directory',
  'canteen', 'complaints', 'sports', 'events', 'library', 'hostel', 'transport',
  'lost-found', 'emergency',
])

export const ROLE_START_PAGES = Object.freeze({
  Student: 'overview', Staff: 'overview', HOD: 'overview',
  Administration: 'overview', 'Sports Captain': 'overview', 'Canteen Staff': 'canteen',
})

export const LOGIN_ROLES = Object.freeze([
  { role: APP_ROLES.STUDENT, label: 'Student Login', icon: 'GraduationCap' },
  { role: APP_ROLES.STAFF, label: 'Staff Login', icon: 'BriefcaseBusiness' },
  { role: APP_ROLES.HOD, label: 'HOD Login', icon: 'Building2' },
  { role: APP_ROLES.SPORTS, label: 'Sports Captain Login', icon: 'Trophy' },
  { role: APP_ROLES.ADMIN, label: 'Administration Login', icon: 'ShieldCheck' },
  { role: APP_ROLES.CANTEEN, label: 'Canteen Staff Login', icon: 'Utensils' },
])

export function canSeePage(user, page) {
  if (!user) return false
  if (page === 'sports-management') return [APP_ROLES.SPORTS, APP_ROLES.ADMIN].includes(user.role)
  if (user.role === APP_ROLES.CANTEEN) return page === 'canteen'
  if (user.role === APP_ROLES.ADMIN) {
    return page === 'unauthorized' || page === 'not-found' || page === 'overview' || page === 'profile' || page === 'campus-management' || page === 'sports-management' || page === 'users' || [...STUDENT_ALLOWED_MODULES, 'canteen', 'analytics'].includes(page)
  }
  if (page === 'overview' || page === 'profile' || page === 'unauthorized' || page === 'not-found') return true
  if (user.role === APP_ROLES.STUDENT) return STUDENT_ALLOWED_MODULES.includes(page)
  if (user.role === APP_ROLES.STAFF) return [...STAFF_DEFAULT_MODULES, ...(user.modules || [])].includes(page)
  if (user.role === APP_ROLES.HOD) return ['overview', 'notices', 'complaints', 'lost-found', 'canteen', 'department-requests', 'department-students', 'sports'].includes(page)
  if (user.role === APP_ROLES.SPORTS) return [...STUDENT_ALLOWED_MODULES, 'sports-management'].includes(page)
  return false
}