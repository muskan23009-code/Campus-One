import { canSeePage, isStudentExperienceRole } from '../auth/access'

const quickActions = [
  { id: 'notices', label: 'My notices', prompt: 'What notices are available to me?', page: 'notices', icon: 'Bell', accent: 'blue' },
  { id: 'mess', label: "Today's mess timings", prompt: "What are today's mess timings?", page: 'food', icon: 'Clock3', accent: 'orange' },
  { id: 'hostel', label: 'My hostel details', prompt: 'Show my hostel details.', page: 'hostel', icon: 'Building2', accent: 'purple', studentOnly: true },
  { id: 'events', label: 'Campus events', prompt: 'What events are listed on campus?', page: 'events', icon: 'CalendarDays', accent: 'teal' },
  { id: 'complaints', label: 'My complaints', prompt: 'What is the status of my complaints?', page: 'complaints', icon: 'MessageCircle', accent: 'coral' },
  { id: 'sports', label: 'Sports activities', prompt: 'What sports activities are listed?', page: 'sports', icon: 'Trophy', accent: 'green' },
  { id: 'lost-found', label: 'Lost & Found', prompt: 'Show my Lost & Found reports.', page: 'lost-found', icon: 'PackageSearch', accent: 'gold' },
  { id: 'canteen', label: 'Canteen information', prompt: 'What canteen information is available?', page: 'food', icon: 'Utensils', accent: 'blue' },
]

export function getCampusAIQuickActions(user) {
  return quickActions.filter(({ page, studentOnly }) =>
    canSeePage(user, page) && (!studentOnly || isStudentExperienceRole(user.role)),
  )
}

export function getCampusAIHelpLinks(user) {
  return [
    ['Complaint & Issue Tracker', 'complaints'],
    ['Lost & Found', 'lost-found'],
    ['Notices', 'notices'],
    ['Events & clubs', 'events'],
    ['Emergency', 'emergency'],
  ].filter(([, page]) => canSeePage(user, page))
}
