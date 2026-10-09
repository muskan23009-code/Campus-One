export const navigationGroups = [
  {
    label: 'CAMPUS',
    items: [
      { id: 'overview', label: 'Overview', icon: 'LayoutDashboard' },
      { id: 'copilot', label: 'AI Copilot', icon: 'Sparkles', badge: 'AI' },
      { id: 'notices', label: 'Notices & Announcements', icon: 'Megaphone' },
      { id: 'food', label: 'Food & Dine In', icon: 'Utensils' },
      { id: 'navigation', label: 'Campus map', icon: 'Map' },
    ],
  },
  {
    label: 'STUDENT LIFE',
    items: [
      { id: 'directory', label: 'Campus database', icon: 'ContactRound' },
      { id: 'sports', label: 'Sports & wellness', icon: 'Activity' },
      { id: 'events', label: 'Events & clubs', icon: 'CalendarDays' },
    ],
  },
  {
    label: 'CAMPUS SUPPORT',
    items: [
      { id: 'complaints', label: 'Complaint & Issue Tracker', icon: 'MessageSquareWarning' },
      { id: 'lost-found', label: 'Lost & Found', icon: 'PackageSearch' },
    ],
  },
  {
    label: 'MORE',
    items: [
      { id: 'hostel', label: 'Hostel', icon: 'Building2' },
      { id: 'emergency', label: 'Emergency', icon: 'ShieldAlert' },
      { id: 'analytics', label: 'Campus insights', icon: 'ChartNoAxesCombined' },
    ],
  },
  {
    label: 'ADMINISTRATION',
    roles: ['Administration'],
    items: [
      { id: 'users', label: 'User management', icon: 'UsersRound' },
      { id: 'campus-management', label: 'Campus management', icon: 'Settings2' },
    ],
  },
  {
    label: 'SPORTS',
    roles: ['Administration', 'Sports Captain'],
    items: [
      { id: 'sports-management', label: 'Sports management', icon: 'Trophy' },
    ],
  },
  {
    label: 'DEPARTMENT',
    roles: ['HOD'],
    items: [
      { id: 'department-requests', label: 'Student requests', icon: 'UserRoundCheck' },
      { id: 'department-students', label: 'Department students', icon: 'GraduationCap' },
    ],
  },
]

export const moduleDetails = {
  copilot: {
    eyebrow: 'YOUR CAMPUS, IN THE KNOW',
    title: 'AI Campus Copilot',
    description: 'Your round-the-clock campus companion, ready to help with the things that matter.',
    icon: 'Sparkles',
    accent: 'mint',
    stats: [['Always on', 'Available 24/7'], ['Made for you', 'Campus-trained AI'], ['Good to know', 'Private conversations']],
    suggestions: ['Where can I find campus dining?', 'How do I apply for a bonafide certificate?', 'What is happening on campus this week?'],
    rows: [
      ['Academics', 'How to find your next exam, class or assignment deadline.', 'Ask about coursework'],
      ['Campus services', 'Get a straight answer about offices, hours and processes.', 'Find a service'],
      ['Your student life', 'Discover events, activities, clubs and places on campus.', 'Explore campus'],
    ],
  },
  notices: {
    eyebrow: 'IMPORTANT, MADE CLEAR',
    title: 'Notice intelligence',
    description: 'Every official update, thoughtfully organized and translated into your next steps.',
    icon: 'Megaphone',
    accent: 'amber',
    stats: [['3 new', 'Posted today'], ['1 important', 'Action needed'], ['Personalized', 'For your course']],
    rows: [
      ['Mid-semester examination schedule', 'Academics · Today, 10:32 am · Applies to all second-year students', 'Review schedule'],
      ['Scholarship renewal applications', 'Student affairs · Today, 9:15 am · Deadline approaching', 'Submit application'],
      ['Campus blood donation drive', 'Community · Yesterday, 4:40 pm · Voluntary', 'See event details'],
    ],
  },
  food: {
    eyebrow: 'CAMPUS DINING',
    title: 'Food & Dine In',
    description: 'Open the configured Canteen menu or view College Mess information.',
    icon: 'Utensils',
    accent: 'amber',
    stats: [],
    rows: [],
  },
  navigation: {
    eyebrow: 'YOUR NEXT DESTINATION',
    title: 'Campus map',
    description: 'Find your way between classes, discover nearby facilities and get there with ease.',
    icon: 'Map',
    accent: 'mint',
    stats: [['Search', 'Places & buildings'], ['Walking route', 'Available campus-wide'], ['3 locations', 'Saved favorites']],
    rows: [
      ['Academic block A', 'Classrooms · Engineering · First and second floor', 'Get directions'],
      ['North student mess', 'Food · 6-minute walk · Moderate wait', 'Get directions'],
      ['Infirmary', 'Health · Ground floor, student services building', 'Get directions'],
    ],
  },
  directory: {
    eyebrow: 'THE PEOPLE & PLACES THAT MAKE CAMPUS',
    title: 'Campus directory',
    description: 'Find faculty, departments, campus services and the right person to talk to.',
    icon: 'ContactRound', accent: 'blue',
    stats: [['Faculty', 'Search departments'], ['Student services', '8 campus offices'], ['Campus places', 'Always discoverable']],
    rows: [['School of Engineering', 'Academic office · Academic Block A · Mon–Fri, 9 am–4 pm', 'Contact department'], ['Student affairs', 'Student services · Administration building · Mon–Sat, 9 am–5 pm', 'Contact office'], ['Health & wellness', 'Campus infirmary · Student services building · Everyday, 8 am–8 pm', 'Get in touch'], ['Registrar’s office', 'Academic records · Administration building · Mon–Fri, 9 am–4 pm', 'Contact registrar']],
  },
  sports: {
    eyebrow: 'FIND YOUR KIND OF ACTIVE',
    title: 'Sports & wellness',
    description: 'Explore campus teams, events, facilities and wellness information.',
    icon: 'Activity', accent: 'coral',
    stats: [['Sports complex', 'Open until 9 pm'], ['Yoga, today', '5:30 pm · 4 spots'], ['Your activity', '3 sessions this week']],
    rows: [['Badminton team', 'Student team · Sports complex · Information and participation', 'See team information'], ['Campus wellness week', 'Upcoming student wellness activities · October 12–16', 'View event information'], ['Sports equipment desk', 'Equipment information · Student services desk · Open until 6:00 pm', 'Check equipment details'], ['Wellness support', 'Confidential student counseling · Contact campus health services', 'Find wellness support']],
  },
  events: {
    eyebrow: 'THERE’S MORE TO CAMPUS THAN CLASS',
    title: 'Events & clubs',
    description: 'Meet people, try something new and be where campus life is happening.',
    icon: 'CalendarDays', accent: 'coral',
    stats: [['5 upcoming', 'Events this week'], ['12 active', 'Campus clubs'], ['Your calendar', '2 saved events']],
    rows: [['Design week · Opening night', 'Thursday, Oct 8 · 5:00 pm · Main auditorium', 'Explore event'], ['Open mic at the courtyard', 'Friday, Oct 9 · 6:30 pm · Student courtyard', 'Save a place'], ['Photography club walk', 'Saturday, Oct 10 · 7:00 am · Main gate', 'Join the group']],
  },
  hostel: {
    eyebrow: 'MADE FOR YOUR EVERYDAY',
    title: 'Hostel life',
    description: 'Requests, notices, visits and essentials for life at your residence.',
    icon: 'Building2', accent: 'blue',
    stats: [['Your room', 'B-204 · North residence'], ['1 open', 'Maintenance requests'], ['Quiet hours', '10:00 pm onwards']],
    rows: [['Room maintenance', 'Track your repair request or report a new issue.', 'View requests'], ['Hostel visitor registration', 'Register an upcoming guest visit with the warden.', 'Register visitor'], ['Residence notices', 'The latest updates from your hostel community.', 'Read updates']],
  },
  'lost-found': {
    eyebrow: 'FOUND SOMETHING? LOOKING FOR IT?',
    title: 'Lost & found',
    description: 'Reconnect belongings with their owners, with privacy and a campus-wide search.',
    icon: 'PackageSearch', accent: 'amber',
    stats: [],
    rows: [],
  },
  emergency: {
    eyebrow: 'CAMPUS SAFETY, CLOSE AT HAND',
    title: 'Emergency contacts',
    description: 'Reach campus safety and essential help as quickly as possible.',
    icon: 'ShieldAlert', accent: 'coral',
    stats: [['Campus security', 'Available 24 hours'], ['Health centre', 'Open today, 8 am–8 pm'], ['Your safety', 'Safety services on campus']],
    rows: [['Campus security', 'Emergency response · Main security office', 'Call campus security'], ['Campus infirmary', 'Medical help · Student services building', 'Call health centre'], ['Residence warden', 'Hostel support · North residence', 'Contact your warden'], ['National emergency', 'For immediate life-threatening emergencies', 'Call 112']],
  },
  analytics: {
    eyebrow: 'THOUGHTFUL DECISIONS, GROUNDED IN DATA',
    title: 'Campus insights',
    description: 'A clear operational picture for campus teams, with the context behind every number.',
    icon: 'ChartNoAxesCombined', accent: 'blue',
    stats: [['2,418', 'Students on campus'], ['94%', 'Campus services availability'], ['−18%', 'Dining peak wait this month']],
    rows: [['Campus engagement', 'Events, facilities, programs · Updated today', 'View dashboard'], ['Dining & occupancy', 'Meal service demand, wait times, campus capacity', 'Explore insights'], ['Student wellbeing', 'Service usage and resolution trends · Aggregated', 'Review patterns'], ['Operations overview', 'Facilities, campus services and open service requests', 'Open report']],
  },
}

export const notices = [
  { category: 'ACADEMICS', tone: 'notice-amber', title: 'Mid-semester examinations begin October 19', text: 'Your provisional second-year schedule is now available. Confirm your exam center by Friday, October 9.', time: '32 min ago', action: 'View schedule', urgent: true },
  { category: 'STUDENT LIFE', tone: 'notice-green', title: 'Applications open: Student scholarship renewal', text: 'Eligible students can renew their scholarship through Student Affairs before October 14.', time: '1 hr ago', action: 'Check eligibility', urgent: false },
  { category: 'CAMPUS COMMUNITY', tone: 'notice-blue', title: 'Give the gift of life at our campus blood drive', text: 'Join us in Seminar Hall B tomorrow, 10 am–4 pm. Walk-ins are welcome.', time: '3 hrs ago', action: 'Get involved', urgent: false },
]

export const campusPlaces = [
  { category: 'Academic', name: 'Academic Block A', detail: 'Engineering · Classrooms & faculty offices', color: 'place-terracotta', icon: 'GraduationCap' },
  { category: 'Food', name: 'North student mess', detail: 'Dining hall · Moderate occupancy', color: 'place-yellow', icon: 'Utensils' },
  { category: 'Health', name: 'Student health centre', detail: 'Infirmary · 8:00 am–8:00 pm', color: 'place-blue', icon: 'HeartPulse' },
]