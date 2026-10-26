import { canSeePage } from '../auth/access.js'

const UNAVAILABLE = "I couldn't find that information in Campus One right now."

const NAVIGATION_TARGETS = [
  { page: 'hostel', label: 'Hostel', pattern: /\bhostel\b/i },
  { page: 'canteen', label: 'Canteen', pattern: /\bcanteen\b/i },
  { page: 'food', label: 'Food & Dine In', pattern: /\b(mess|dining)\b/i },
  { page: 'events', label: 'Events & Clubs', pattern: /\b(events?|clubs?)\b/i },
  { page: 'sports', label: 'Sports & Wellness', pattern: /\b(sports?|wellness)\b/i },
  { page: 'notices', label: 'Notices & Announcements', pattern: /\b(notices?|announcements?)\b/i },
  { page: 'complaints', label: 'Complaint & Issue Tracker', pattern: /\b(complaints?|issues?)\b/i },
  { page: 'lost-found', label: 'Lost & Found', pattern: /\blost\b|\bfound\b/i },
  { page: 'campus-voice', label: 'Campus Voice', pattern: /\bcampus voice\b/i },
  { page: 'skill-exchange', label: 'Skill Exchange', pattern: /\bskill exchange\b/i },
  { page: 'teacher-review', label: 'Faculty Reviews', pattern: /\b(faculty|teacher) reviews?\b/i },
  { page: 'settings', label: 'Settings', pattern: /\bsettings?\b/i },
  { page: 'profile', label: 'Profile', pattern: /\b(profile|password)\b/i },
]

function unavailable(message = UNAVAILABLE) {
  return { message, destination: null }
}

function isHinglish(question) {
  return /\b(aaj|mein|kya|hain|hai|dikhao|dikhaiye|kaise|karun|karo|batao|bataiye|kahan|mujhe|chahiye)\b/i.test(question)
}

function isNavigationQuestion(question) {
  return /\b(where|open|take me|navigate|access|find|go to|change my password)\b/i.test(question)
}

function destinationFor(question) {
  if (/\b(password|change my password)\b/i.test(question)) {
    return { page: 'profile', label: 'Profile' }
  }
  return NAVIGATION_TARGETS.find((target) => target.pattern.test(question)) || null
}

function formatDate(value) {
  const timestamp = Date.parse(value || '')
  if (!Number.isFinite(timestamp)) return ''
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(timestamp)
}

function eventDescription(event) {
  return [event.category, formatDate(event.date)].filter(Boolean).join(' · ')
}

function listMessage(intro, records, formatRecord, emptyMessage = UNAVAILABLE) {
  const lines = records.map(formatRecord).filter(Boolean)
  return lines.length ? `${intro}\n${lines.join('\n')}` : emptyMessage
}

export async function answerCampusQuestion(question, { user, api }) {
  const text = String(question || '').trim()
  if (!text) return unavailable('Ask a question about your campus to get started.')
  const hinglish = isHinglish(text)

  if (isNavigationQuestion(text)) {
    const destination = destinationFor(text)
    if (!destination) return unavailable()
    if (!canSeePage(user, destination.page)) {
      return unavailable(`Your current role doesn't have access to ${destination.label}.`)
    }
    const instructions = destination.page === 'profile'
      ? hinglish
        ? 'Apna account dekhne aur password change karne ke liye Profile kholiye.'
        : 'Open Profile to review your account and change your password.'
      : hinglish
        ? `${destination.label} ki campus information aur services dekhne ke liye ${destination.label} kholiye.`
        : `Open ${destination.label} from there to view its campus information and services.`
    return { message: instructions, destination }
  }

  if (/\b(notices?|announcements?)\b/i.test(text)) {
    if (!canSeePage(user, 'notices')) return unavailable(`Your current role doesn't have access to Notices & Announcements.`)
    const { notices = [] } = await api('/api/notices')
    const importantOnly = /\bimportant|urgent|pinned\b/i.test(text)
    const records = notices
      .filter((notice) => !importantOnly || notice.important || notice.pinned || ['Important', 'Urgent'].includes(notice.priority))
      .sort((left, right) => Date.parse(right.publishAt || right.createdAt || 0) - Date.parse(left.publishAt || left.createdAt || 0))
      .slice(0, 5)
    const intro = hinglish
      ? importantOnly ? 'Aapke liye important notices:' : 'Yeh latest notices aapke liye hain:'
      : importantOnly ? 'Important notices available to you:' : 'Latest notices available to you:'
    const emptyMessage = hinglish
      ? 'Abhi aapke account ke liye koi matching notices nahi mile.'
      : 'No notices matching that request are available to your account right now.'
    return { message: listMessage(intro, records, (notice) => {
      const date = formatDate(notice.publishAt || notice.createdAt)
      const priority = notice.priority && notice.priority !== 'Normal' ? ` · ${notice.priority}` : ''
      return `• ${notice.title}${date ? ` · ${date}` : ''}${priority}`
    }, emptyMessage), destination: { page: 'notices', label: 'Notices & Announcements' } }
  }

  if (/\b(events?|activities|activity|clubs?)\b/i.test(text)) {
    if (!canSeePage(user, 'events')) return unavailable(`Your current role doesn't have access to Events & Clubs.`)
    const data = await api('/api/events-clubs')
    if (/\bclubs?\b/i.test(text) && !/\bevents?\b/i.test(text)) {
      const clubs = (data.clubs || []).filter((club) => club.active !== false).slice(0, 8)
      return { message: listMessage(hinglish ? 'Yeh clubs aapke liye available hain:' : 'Clubs available to you:', clubs, (club) => `• ${club.name}${club.category ? ` · ${club.category}` : ''}`, hinglish ? 'Abhi koi active club available nahi hai.' : 'No active clubs are available to your account right now.'), destination: { page: 'events', label: 'Events & Clubs' } }
    }
    const today = new Date().toISOString().slice(0, 10)
    const events = (data.events || [])
      .filter((event) => event.date >= today && !['CANCELLED', 'COMPLETED', 'CLOSED'].includes(String(event.status || '').toUpperCase()))
      .sort((left, right) => String(left.date).localeCompare(String(right.date)))
      .slice(0, 6)
    const clubs = /\bclubs?\b/i.test(text) ? (data.clubs || []).filter((club) => club.active !== false).slice(0, 5) : []
    const eventMessage = listMessage(hinglish ? 'Aaj aur aane wale campus events yeh hain:' : 'Upcoming events available to you:', events, (event) => `• ${event.name}${eventDescription(event) ? ` · ${eventDescription(event)}` : ''}`, hinglish ? 'Abhi campus par koi upcoming event publish nahi hua hai.' : 'No upcoming events are currently published for your account.')
    const clubLines = clubs.map((club) => `• ${club.name}${club.category ? ` · ${club.category}` : ''}`)
    return {
      message: `${eventMessage}${clubLines.length ? `\n\nAvailable clubs:\n${clubLines.join('\n')}` : ''}`,
      destination: { page: 'events', label: 'Events & Clubs' },
    }
  }

  if (/\bsports?\b|\bwellness\b/i.test(text)) {
    if (!canSeePage(user, 'sports')) return unavailable(`Your current role doesn't have access to Sports & Wellness.`)
    const { records = [] } = await api('/api/sports')
    const available = records.filter((record) => record.active !== false).slice(0, 8)
    return { message: listMessage(hinglish ? 'Sports aur wellness ki yeh information available hai:' : 'Sports and wellness information available to you:', available, (record) => `• ${record.title || record.name}${record.kind ? ` · ${record.kind}` : ''}`, hinglish ? 'Abhi koi active sports information available nahi hai.' : 'No active sports information is available right now.'), destination: { page: 'sports', label: 'Sports & Wellness' } }
  }

  if (/\bhostel\b/i.test(text)) {
    if (!canSeePage(user, 'hostel')) return unavailable(`Your current role doesn't have access to Hostel services.`)
    return { message: hinglish
      ? 'Hostel mein apne account ke liye residential information aur services dekhein. Student hostel details sirf authorized viewers ko dikhte hain.'
      : 'Use Hostel to view the residential information and services available to your account. Student hostel details remain private to their authorized viewers.', destination: { page: 'hostel', label: 'Hostel' } }
  }

  if (/\bcanteen\b|\bmenu\b|\bfood\b|\bmess\b|\bmeal\b/i.test(text)) {
    const answers = []
    if (/\bcanteen\b|\bmenu\b|\bfood\b/i.test(text)) {
      if (!canSeePage(user, 'canteen')) return unavailable(`Your current role doesn't have access to Canteen information.`)
      const { items = [] } = await api('/api/canteen/menu')
      const available = items.filter((item) => item.available !== false).slice(0, 8)
      const menu = listMessage(hinglish ? 'Canteen mein abhi yeh items available hain:' : 'Available Canteen menu items:', available, (item) => `• ${item.name}${item.size ? ` (${item.size})` : ''} · ₹${item.price}`, hinglish ? 'Abhi Canteen menu mein koi available item nahi mila.' : 'No available Canteen menu items were found right now.')
      answers.push(menu)
    }
    if (/\bmess\b|\bmeal\b|\btiming\b/i.test(text)) {
      if (!canSeePage(user, 'food')) return unavailable(`Your current role doesn't have access to College Mess information.`)
      const { settings } = await api('/api/mess')
      const timings = Object.entries(settings?.timings || {})
        .filter(([, timing]) => timing?.start && timing?.end)
        .map(([meal, timing]) => `• ${meal}: ${timing.start}–${timing.end}`)
      answers.push(timings.length ? `Configured College Mess timings:\n${timings.join('\n')}` : 'College Mess timings have not been announced yet.')
    }
    return { message: answers.length ? answers.join('\n\n') : UNAVAILABLE, destination: { page: /\bcanteen\b|\bmenu\b|\bfood\b/i.test(text) ? 'canteen' : 'food', label: /\bcanteen\b|\bmenu\b|\bfood\b/i.test(text) ? 'Canteen' : 'Food & Dine In' } }
  }

  if (/\bcomplaint|issue tracker\b/i.test(text)) {
    if (!canSeePage(user, 'complaints')) return unavailable(`Your current role doesn't have access to the Complaint module.`)
    return { message: 'Open Complaint & Issue Tracker to submit a request and follow its status. Your complaint details are shown only through the existing role-based access.', destination: { page: 'complaints', label: 'Complaint & Issue Tracker' } }
  }

  if (/\blost\b|\bfound\b/i.test(text)) {
    if (!canSeePage(user, 'lost-found')) return unavailable(`Your current role doesn't have access to Lost & Found.`)
    if (/\bavailable|recent|active|report|reports|item|items\b/i.test(text)) {
      const { reports = [] } = await api('/api/lost-found')
      const activeReports = reports.filter((report) => !['RETURNED', 'CLOSED'].includes(String(report.status || '').toUpperCase())).slice(0, 6)
      return { message: listMessage('Recent Lost & Found reports available to you:', activeReports, (report) => `• ${report.itemName}${report.category ? ` · ${report.category}` : ''}${report.status ? ` · ${report.status}` : ''}`, 'No active Lost & Found reports are available to you right now.'), destination: { page: 'lost-found', label: 'Lost & Found' } }
    }
    return { message: 'Open Lost & Found to browse reports, report a lost or found item, and follow the existing claim process. Report visibility follows the module’s access rules.', destination: { page: 'lost-found', label: 'Lost & Found' } }
  }

  if (/\bcampus voice\b|\bconcern\b|\bsuggestion\b|\bappreciation\b/i.test(text)) {
    if (!canSeePage(user, 'campus-voice')) return unavailable(`Your current role doesn't have access to Campus Voice.`)
    if (/\bstatus|track|my submission|my idea\b/i.test(text)) {
      const { submissions = [] } = await api('/api/campus-voice/submissions')
      return { message: listMessage('Campus Voice submissions available to your account:', submissions, (submission) => submission.isAnonymous
        ? `• Anonymous ${submission.type || 'submission'} · ${submission.status}`
        : `• ${submission.title} · ${submission.status}`, 'No Campus Voice submissions are available to your account yet.'), destination: { page: 'campus-voice', label: 'Campus Voice' } }
    }
    return { message: 'Campus Voice lets you submit a concern, suggestion, or appreciation. Anonymous submissions do not reveal the submitter’s identity; you can track only submissions available to your account.', destination: { page: 'campus-voice', label: 'Campus Voice' } }
  }

  if (/\bskill exchange\b|\bskills?\b|\bhelp (me|with)\b/i.test(text)) {
    if (!canSeePage(user, 'skill-exchange')) return unavailable(`Your current role doesn't have access to Skill Exchange.`)
    const { listings = [] } = await api('/api/skill-exchange/listings')
    const visible = listings.slice(0, 6)
    return { message: listMessage('Active Skill Exchange listings:', visible, (listing) => `• ${listing.kind === 'REQUEST' ? 'Needs help with' : 'Can help with'} ${listing.skill}${listing.category ? ` · ${listing.category}` : ''}`, 'No active Skill Exchange listings are available right now.'), destination: { page: 'skill-exchange', label: 'Skill Exchange' } }
  }

  if (/\bfaculty|teacher review|reviews?\b/i.test(text)) {
    if (!canSeePage(user, 'teacher-review')) return unavailable(`Your current role doesn't have access to Faculty Reviews.`)
    return { message: hinglish
      ? 'Faculty Reviews module se review submit kar sakte hain. Student feedback anonymous hota hai; assistant reviewer ki identity ya individual review history nahi dekhta.'
      : 'Faculty Reviews are submitted through the Faculty Reviews module. Student feedback is anonymous: the assistant does not access or display reviewer identities or individual review history.', destination: { page: 'teacher-review', label: 'Faculty Reviews' } }
  }

  if (/\bcampus one\b|\bcampus services\b|\bwhat can i do\b/i.test(text)) {
    const destinations = [
      ...NAVIGATION_TARGETS,
      { page: 'navigation', label: 'Campus Map' },
      { page: 'profile', label: 'Profile' },
      { page: 'settings', label: 'Settings' },
    ]
    const available = destinations.filter((entry, index) =>
      canSeePage(user, entry.page) && destinations.findIndex((candidate) => candidate.page === entry.page) === index)
    return available.length
      ? { message: `Campus One services available to your account:\n${available.map((entry) => `• ${entry.label}`).join('\n')}`, destination: null }
      : unavailable()
  }

  return unavailable(hinglish ? 'Maaf kijiye, Campus One mein yeh jaankari abhi nahi mil paayi.' : UNAVAILABLE)
}
