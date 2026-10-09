export const ROLES = Object.freeze({
  STUDENT: 'Student',
  STAFF: 'Staff',
  HOD: 'HOD',
  ADMIN: 'Administration',
  SPORTS: 'Sports Captain',
  CANTEEN: 'Canteen Staff',
})

export const ROLE_VALUES = Object.freeze(Object.values(ROLES))

export const USER_ID_FORMATS = Object.freeze({
  [ROLES.STUDENT]: { prefix: 'PM-S', start: 1001, width: 4 },
  [ROLES.STAFF]: { prefix: 'PM-ST', start: 1, width: 3 },
  [ROLES.HOD]: { prefix: 'PM-HOD', start: 1, width: 3 },
  [ROLES.SPORTS]: { prefix: 'PM-SC', start: 1, width: 3 },
  [ROLES.ADMIN]: { prefix: 'PM-AD', start: 1, width: 3 },
  [ROLES.CANTEEN]: { prefix: 'PM-CS', start: 1, width: 3 },
})

export const STUDENT_MODULES = Object.freeze([
  'overview', 'copilot', 'notices', 'food', 'canteen', 'navigation', 'directory',
  'complaints', 'sports', 'events', 'hostel',
  'lost-found', 'emergency',
])

export const STAFF_MODULES = Object.freeze([
  'overview', 'notices', 'complaints', 'events', 'hostel', 'canteen',
  'directory', 'food', 'lost-found', 'emergency', 'sports',
])

export const CANTEEN_STAFF_MODULES = Object.freeze(['canteen'])

export const HOD_MODULES = Object.freeze([
  'overview', 'notices', 'complaints', 'lost-found', 'canteen', 'department-requests', 'department-students', 'sports',
])

export const ALL_MODULES = Object.freeze([
  ...STUDENT_MODULES, 'analytics', 'users', 'campus-management',
  'sports-management',
])

export function modulesForUser(user) {
  if (user.role === ROLES.ADMIN) return ALL_MODULES
  if (user.role === ROLES.CANTEEN) return CANTEEN_STAFF_MODULES
  if (user.role === ROLES.STUDENT) return STUDENT_MODULES
  if (user.role === ROLES.HOD) return HOD_MODULES
  if (user.role === ROLES.STAFF) {
    return [...new Set([...STAFF_MODULES, ...(user.modules || [])])]
  }
  if (user.role === ROLES.SPORTS) {
    return [...new Set([...STUDENT_MODULES, 'sports-management'])]
  }
  return []
}

export const CANTEEN_CATEGORIES = Object.freeze({
    Veg: Object.freeze([
      'Tea & Coffee', 'Sandwich', 'Shakes & Drinks', 'Burger', 'Patty & Samosa',
      'Paneer Momos', 'Maggi', 'French Fries', 'Pizza', 'Chinese', 'Add On',
    ]),
    'Non-Veg': Object.freeze([
      'Burger', 'Sandwich', 'Chicken Momos', 'Eggs', 'Patty', 'Continental',
      'Add On', 'Chinese',
    ]),
  })

export const INITIAL_CANTEEN_MENU = Object.freeze([
    ['Veg', 'Tea & Coffee', 'Milk Tea', 20], ['Veg', 'Tea & Coffee', 'Black Coffee', 30],
    ['Veg', 'Tea & Coffee', 'Ginger Tea', 20], ['Veg', 'Tea & Coffee', 'Hot Coffee', 30],
    ['Veg', 'Tea & Coffee', 'Black Tea', 20],
    ['Veg', 'Sandwich', 'Veg Cold Sandwich', 80], ['Veg', 'Sandwich', 'Grilled Sandwich', 100],
    ['Veg', 'Sandwich', 'Cheese Panner', 130],
    ['Veg', 'Shakes & Drinks', 'Virgin Mojito', 70], ['Veg', 'Shakes & Drinks', 'Masala Mojito', 70],
    ['Veg', 'Shakes & Drinks', 'Banana Shake', 80], ['Veg', 'Shakes & Drinks', 'Mango Shake', 90],
    ['Veg', 'Shakes & Drinks', 'Chocolate Shake', 90], ['Veg', 'Shakes & Drinks', 'Kit Kat Shake', 90],
    ['Veg', 'Shakes & Drinks', 'Vanilla Shake', 90], ['Veg', 'Shakes & Drinks', 'Hot Chocolate', 90],
    ['Veg', 'Burger', 'Allo Patty Burger', 40], ['Veg', 'Burger', 'Veg Burger', 55],
    ['Veg', 'Burger', 'Cheese Burger', 75], ['Veg', 'Burger', 'Double Patty Burger', 75],
    ['Veg', 'Burger', 'Panner Burger', 90],
    ['Veg', 'Patty & Samosa', 'Allo Patty', 30], ['Veg', 'Patty & Samosa', 'Masala Patty', 45],
    ['Veg', 'Patty & Samosa', 'Panner Patty', 55], ['Veg', 'Patty & Samosa', 'Samosa', 20],
    ['Veg', 'Paneer Momos', 'Steam Momos (10 Pcs)', 120], ['Veg', 'Paneer Momos', 'Fried Momos (10 Pcs)', 120],
    ['Veg', 'Paneer Momos', 'Kurkure Momos (8 Pcs)', 120], ['Veg', 'Paneer Momos', 'Chilly Gravy (05 Pcs)', 120],
    ['Veg', 'Paneer Momos', 'Butter Gravy (05 Pcs)', 120],
    ['Veg', 'Maggi', 'Plain Maggi', 50], ['Veg', 'Maggi', 'Veg Maggi', 60],
    ['Veg', 'Maggi', 'Cheese Maggi', 70], ['Veg', 'Maggi', 'Veg & Cheese', 85],
    ['Veg', 'French Fries', 'Salted', 100], ['Veg', 'French Fries', 'Cheesy', 120],
    ['Veg', 'French Fries', 'Perry-Perry', 120], ['Veg', 'French Fries', 'Loaded', 140],
    ['Veg', 'Chinese', 'Panner Fried Rice', 170], ['Veg', 'Chinese', 'Schezwan Rice', 150],
    ['Veg', 'Chinese', 'Burnt Garlic Rice', 150], ['Veg', 'Chinese', 'Chilli Garlic Rice', 150],
    ['Veg', 'Chinese', 'Woke Rice', 150], ['Veg', 'Chinese', 'Combination Rice', 150],
    ['Veg', 'Chinese', 'Panner Noodles', 150], ['Veg', 'Chinese', 'Chilli Garlic Noodles', 150],
    ['Veg', 'Chinese', 'Singapuri Noodles', 150], ['Veg', 'Chinese', 'Schezwan Noodles', 150],
    ['Veg', 'Chinese', 'Chilli Panner Dry', 220], ['Veg', 'Chinese', 'Chilli Panner Gravy', 200],
    ['Veg', 'Chinese', 'Honey Chilli Potato', 170],
    ['Veg', 'Pizza', 'Onion', 150], ['Veg', 'Pizza', 'Sweet Corn', 160],
    ['Veg', 'Pizza', 'Onion & Capsicum', 180], ['Veg', 'Pizza', 'Cheese Pizza', 200],
    ['Veg', 'Pizza', 'Panner', 220], ['Veg', 'Pizza', 'Mushroom', 220], ['Veg', 'Pizza', 'Farm House', 250],
    ['Veg', 'Add On', 'Grilled Bread', 20], ['Veg', 'Add On', 'Grilled Bread', 10],
    ['Veg', 'Add On', 'Red Sauce Pasta', 120, 'Half'], ['Veg', 'Add On', 'Red Sauce Pasta', 200, 'Full'],
    ['Veg', 'Add On', 'White Sauce Pasta', 120, 'Half'], ['Veg', 'Add On', 'White Sauce Pasta', 200, 'Full'],
    ['Veg', 'Add On', 'Pink Sauce Pasta', 130, 'Half'], ['Veg', 'Add On', 'Pink Sauce Pasta', 220, 'Full'],
    ['Non-Veg', 'Burger', 'Chicken Burger', 100], ['Non-Veg', 'Burger', 'Chicken Pop Corn', 120],
    ['Non-Veg', 'Sandwich', 'Tandoori Chicken', 150], ['Non-Veg', 'Sandwich', 'Chicken Sandwich', 130],
    ['Non-Veg', 'Chicken Momos', 'Steam Momos (10 Pcs)', 150],
    ['Non-Veg', 'Chicken Momos', 'Fried Momos (10 Pcs)', 150],
    ['Non-Veg', 'Chicken Momos', 'Kurkure Momos (8 Pcs)', 150],
    ['Non-Veg', 'Chicken Momos', 'Chilly Gravy (05 Pcs)', 150],
    ['Non-Veg', 'Chicken Momos', 'Butter Gravy (05 Pcs)', 150],
    ['Non-Veg', 'Patty', 'Stuffed Chicken', 60], ['Non-Veg', 'Patty', 'Egg Patty', 50],
    ['Non-Veg', 'Eggs', 'Omelette (02 Egg)', 60], ['Non-Veg', 'Eggs', 'Omelette (03 Egg)', 75],
    ['Non-Veg', 'Eggs', 'Bhurji (02 Egg)', 60], ['Non-Veg', 'Eggs', 'Bhurji (03 Egg)', 75],
    ['Non-Veg', 'Eggs', 'Boiled Egg', 15],
    ['Non-Veg', 'Continental', 'Crispy Fried Leg (04 Pcs)', 200],
    ['Non-Veg', 'Continental', 'Chicken Pop Corn (15 Pcs)', 200],
    ['Non-Veg', 'Continental', 'Chicken Kurkure (15 Pcs)', 200],
    ['Non-Veg', 'Continental', 'Creamy Chicken', 150, 'Half'],
    ['Non-Veg', 'Continental', 'Creamy Chicken', 250, 'Full'],
    ['Non-Veg', 'Continental', 'Chicken Finger (15 Pcs)', 200],
    ['Non-Veg', 'Continental', 'Chicken White Sauce', 120, 'Half'],
    ['Non-Veg', 'Continental', 'Chicken White Sauce', 200, 'Full'],
    ['Non-Veg', 'Continental', 'Chicken Red Sauce', 120, 'Half'],
    ['Non-Veg', 'Continental', 'Chicken Red Sauce', 200, 'Full'],
    ['Non-Veg', 'Chinese', 'Chicken Fried Rice', 120, 'Half'],
    ['Non-Veg', 'Chinese', 'Chicken Fried Rice', 200, 'Full'],
    ['Non-Veg', 'Chinese', 'Schezwan Rice', 130, 'Half'], ['Non-Veg', 'Chinese', 'Schezwan Rice', 220, 'Full'],
    ['Non-Veg', 'Chinese', 'Burnt Garlic Rice', 120, 'Half'],
    ['Non-Veg', 'Chinese', 'Burnt Garlic Rice', 200, 'Full'],
    ['Non-Veg', 'Chinese', 'Chilli Garlic Rice', 130, 'Half'],
    ['Non-Veg', 'Chinese', 'Chilli Garlic Rice', 220, 'Full'],
    ['Non-Veg', 'Chinese', 'Woke Rice', 150, 'Half'], ['Non-Veg', 'Chinese', 'Woke Rice', 250, 'Full'],
    ['Non-Veg', 'Chinese', 'Combination Rice', 130, 'Half'],
    ['Non-Veg', 'Chinese', 'Combination Rice', 220, 'Full'],
    ['Non-Veg', 'Chinese', 'Chicken Noodles', 120, 'Half'],
    ['Non-Veg', 'Chinese', 'Chicken Noodles', 200, 'Full'],
    ['Non-Veg', 'Chinese', 'Chilli Garlic Noodles', 130, 'Half'],
    ['Non-Veg', 'Chinese', 'Chilli Garlic Noodles', 220, 'Full'],
    ['Non-Veg', 'Chinese', 'Singapuri Noodles', 120, 'Half'],
    ['Non-Veg', 'Chinese', 'Singapuri Noodles', 200, 'Full'],
    ['Non-Veg', 'Chinese', 'Schezwan Noodles', 120, 'Half'],
    ['Non-Veg', 'Chinese', 'Schezwan Noodles', 200, 'Full'],
    ['Non-Veg', 'Chinese', 'Chilli Chicken Dry', 170, 'Half'],
    ['Non-Veg', 'Chinese', 'Chilli Chicken Dry', 270, 'Full'],
    ['Non-Veg', 'Chinese', 'Chilli Chicken Gravy', 150, 'Half'],
    ['Non-Veg', 'Chinese', 'Chilli Chicken Gravy', 250, 'Full'],
    ['Non-Veg', 'Chinese', 'Triple Rice', 350],
    ['Non-Veg', 'Chinese', 'Manchurian Dry', 130, 'Half'],
    ['Non-Veg', 'Chinese', 'Manchurian Dry', 230, 'Full'],
    ['Non-Veg', 'Add On', 'Grilled Bun', 20], ['Non-Veg', 'Add On', 'Grilled Bread', 10],
  ].map(([diet, category, name, price, size]) => Object.freeze({
    diet, category, name, price, size: size || '', available: true, description: '',
  })))
export function canAccess(user, moduleId) {
  if (moduleId === 'library' || moduleId === 'transport') return false
  return modulesForUser(user).includes(moduleId)
}

export const MANAGEMENT_COLLECTIONS = Object.freeze([
  'notices', 'food', 'events', 'hostel',
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
  ],
  food: [
    { id: 'food-mess', title: 'North student mess', description: 'Lunch · 12:00–2:30 pm · Manual campus estimate', active: true, crowdLevel: 'Moderate', occupancyPercent: 68, estimatedWaitMinutes: 8, crowdUpdatedAt: '2026-10-04T09:00:00.000Z' },
    { id: 'food-canteen', title: 'Sunrise canteen', description: 'Grilled paneer wrap · ₹90 · About 12 minutes', active: true },
  ],
  events: [
    { id: 'event-design', title: 'Design week · Opening night', description: 'Thursday · 5:00 pm · Main auditorium', active: true },
    { id: 'event-openmic', title: 'Open mic at the courtyard', description: 'Friday · 6:30 pm · Student courtyard', active: true },
  ],
  hostel: [
    { id: 'hostel-maintenance', title: 'Room maintenance', description: 'Track a repair request or report an issue.', active: true },
    { id: 'hostel-notices', title: 'Residence notices', description: 'Updates from your hostel community.', active: true },
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