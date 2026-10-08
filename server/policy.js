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
  'overview', 'notices', 'department-requests', 'department-students',
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
    return ['overview', 'notices', 'events', 'sports', 'sports-management']
  }
  return []
}

export function canAccess(user, moduleId) {
  return modulesForUser(user).includes(moduleId)
}

export const MANAGEMENT_COLLECTIONS = Object.freeze([
  'notices', 'food', 'events', 'library', 'hostel', 'transport',
  'lost-found', 'directory', 'emergency',
])

export const DEPARTMENTS = Object.freeze([
  'Computer Science', 'Civil Engineering', 'Mechanical Engineering',
  'Electrical Engineering', 'Business Administration', 'Pharmacy',
])

export const EMERGENCY_CONTACT_CATEGORIES = Object.freeze({
  MEDICAL: 'Medical / Ambulance',
  SECURITY: 'Campus Security',
  FIRE: 'Fire Emergency',
  POLICE: 'Police',
  WOMEN_SAFETY: 'Women Safety / Harassment',
  STUDENT_SUPPORT: 'Student Support / Counselor',
  ADMIN: 'Admin Help Desk',
  OTHER: 'Other Emergency',
})

export const EMERGENCY_CONTACT_CATEGORY_VALUES = Object.freeze(Object.keys(EMERGENCY_CONTACT_CATEGORIES))

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
  'lost-found': [
    { id: 'lost-water-bottle', title: 'Blue water bottle', description: 'Found · Engineering Block A', active: true },
    { id: 'lost-earbuds', title: 'Wireless earbuds', description: 'Reported lost · Sports complex', active: true },
  ],
  directory: [
    { id: 'directory-engineering', title: 'School of Engineering', description: 'Academic Block A · Mon–Fri, 9 am–4 pm', active: true },
    { id: 'directory-student-affairs', title: 'Student affairs', description: 'Administration building · Mon–Sat, 9 am–5 pm', active: true },
  ],
  emergency: [
    {
      id: 'emergency-security',
      name: 'Security Control Room',
      category: 'SECURITY',
      phone_number: '9876543210',
      alternate_phone: '011-24567890',
      designation: 'Security Officer',
      description: '24x7 campus security assistance',
      location: 'Main Security Gate',
      available_24x7: true,
      is_primary: true,
      is_active: true,
      active: true,
      display_order: 1,
      title: 'Security Control Room',
      created_at: '2026-10-01T08:00:00.000Z',
      updated_at: '2026-10-01T08:00:00.000Z',
      created_by: 'system',
    },
    {
      id: 'emergency-health',
      name: 'Campus Medical Centre',
      category: 'MEDICAL',
      phone_number: '9812345678',
      alternate_phone: '011-22334455',
      designation: 'Medical Support',
      description: 'Campus infirmary and emergency ambulance referral',
      location: 'Student Services Building',
      available_24x7: false,
      is_primary: true,
      is_active: true,
      active: true,
      display_order: 2,
      title: 'Campus Medical Centre',
      created_at: '2026-10-01T08:05:00.000Z',
      updated_at: '2026-10-01T08:05:00.000Z',
      created_by: 'system',
    },
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

export const CANTEEN_CONTACT = Object.freeze({
  name: 'Sagar Kumar',
  phone: '9068598099',
  canteenName: 'Puran Murti Vidyapeeth Canteen',
})

export const DEFAULT_CANTEEN_CATALOG = Object.freeze([
  { id: 'veg-milk-tea', name: 'Milk Tea', description: 'Fresh milk tea', category: 'Tea & Coffee', menu_type: 'veg', price: 20, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-black-coffee', name: 'Black Coffee', description: 'Strong brewed coffee', category: 'Tea & Coffee', menu_type: 'veg', price: 30, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-ginger-tea', name: 'Ginger Tea', description: 'Warm ginger tea', category: 'Tea & Coffee', menu_type: 'veg', price: 20, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-hot-coffee', name: 'Hot Coffee', description: 'Warm hot coffee', category: 'Tea & Coffee', menu_type: 'veg', price: 30, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-black-tea', name: 'Black Tea', description: 'Classic black tea', category: 'Tea & Coffee', menu_type: 'veg', price: 20, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-allo-patty-burger', name: 'Allo Patty Burger', description: 'Crispy potato burger', category: 'Burger', menu_type: 'veg', price: 40, half_price: null, full_price: null, image: '', available: true, preparation_time: 10 },
  { id: 'veg-burger', name: 'Veg Burger', description: 'Classic veg burger', category: 'Burger', menu_type: 'veg', price: 55, half_price: null, full_price: null, image: '', available: true, preparation_time: 10 },
  { id: 'veg-cheese-burger', name: 'Cheese Burger', description: 'Loaded cheese burger', category: 'Burger', menu_type: 'veg', price: 75, half_price: null, full_price: null, image: '', available: true, preparation_time: 10 },
  { id: 'veg-double-patty-burger', name: 'Double Patty Burger', description: 'Double patty veg burger', category: 'Burger', menu_type: 'veg', price: 75, half_price: null, full_price: null, image: '', available: true, preparation_time: 10 },
  { id: 'veg-paneer-burger', name: 'Panner Burger', description: 'Paneer patty burger', category: 'Burger', menu_type: 'veg', price: 90, half_price: null, full_price: null, image: '', available: true, preparation_time: 12 },
  { id: 'veg-cold-sandwich', name: 'Veg Cold Sandwich', description: 'Fresh veg sandwich', category: 'Sandwich', menu_type: 'veg', price: 80, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'veg-grilled-sandwich', name: 'Grilled Sandwich', description: 'Warm grilled sandwich', category: 'Sandwich', menu_type: 'veg', price: 100, half_price: null, full_price: null, image: '', available: true, preparation_time: 10 },
  { id: 'veg-cheese-paneer-sandwich', name: 'Cheese Panner', description: 'Paneer and cheese sandwich', category: 'Sandwich', menu_type: 'veg', price: 130, half_price: null, full_price: null, image: '', available: true, preparation_time: 10 },
  { id: 'veg-virgin-mojito', name: 'Virgin Mojito', description: 'Refreshing mocktail', category: 'Drinks', menu_type: 'veg', price: 70, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-masala-mojito', name: 'Masala Mojito', description: 'Spiced mojito', category: 'Drinks', menu_type: 'veg', price: 70, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-banana-shake', name: 'Banana Shake', description: 'Chilled banana shake', category: 'Drinks', menu_type: 'veg', price: 80, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-mango-shake', name: 'Mango Shake', description: 'Sweet mango shake', category: 'Drinks', menu_type: 'veg', price: 90, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-chocolate-shake', name: 'Chocolate Shake', description: 'Chocolate delight', category: 'Drinks', menu_type: 'veg', price: 90, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-kitkat-shake', name: 'Kit Kat Shake', description: 'KitKat chocolate shake', category: 'Drinks', menu_type: 'veg', price: 90, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-vanilla-shake', name: 'Vanilla Shake', description: 'Vanilla chilled shake', category: 'Drinks', menu_type: 'veg', price: 90, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-hot-chocolate', name: 'Hot Chocolate', description: 'Creamy hot chocolate', category: 'Drinks', menu_type: 'veg', price: 90, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-allo-patty', name: 'Allo Patty', description: 'Potato snack patty', category: 'Patty & Samosa', menu_type: 'veg', price: 30, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'veg-masala-patty', name: 'Masala Patty', description: 'Spicy vegetable patty', category: 'Patty & Samosa', menu_type: 'veg', price: 45, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'veg-paneer-patty', name: 'Panner Patty', description: 'Paneer patty', category: 'Patty & Samosa', menu_type: 'veg', price: 55, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'veg-samosa', name: 'Samosa', description: 'Classic crispy samosa', category: 'Patty & Samosa', menu_type: 'veg', price: 20, half_price: null, full_price: null, image: '', available: true, preparation_time: 6 },
  { id: 'veg-paneer-momos-steam', name: 'Steam Momos (10 pcs)', description: 'Steamed paneer momos', category: 'Momos', menu_type: 'veg', price: 120, half_price: null, full_price: null, image: '', available: true, preparation_time: 12 },
  { id: 'veg-paneer-momos-fried', name: 'Fried Momos (10 pcs)', description: 'Crispy fried momos', category: 'Momos', menu_type: 'veg', price: 120, half_price: null, full_price: null, image: '', available: true, preparation_time: 12 },
  { id: 'veg-paneer-momos-kurkure', name: 'Kurkure Momos (8 pcs)', description: 'Crunchy kurkure momos', category: 'Momos', menu_type: 'veg', price: 120, half_price: null, full_price: null, image: '', available: true, preparation_time: 12 },
  { id: 'veg-maggi-plain', name: 'Plain Maggi', description: 'Classic plain maggi', category: 'Maggi', menu_type: 'veg', price: 50, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'veg-maggi', name: 'Veg Maggi', description: 'Veg maggi with vegetables', category: 'Maggi', menu_type: 'veg', price: 60, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'veg-cheese-maggi', name: 'Cheese Maggi', description: 'Cheesy veg maggi', category: 'Maggi', menu_type: 'veg', price: 70, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'veg-maggi-cheese-mix', name: 'Veg & Cheese', description: 'Veg and cheese maggi', category: 'Maggi', menu_type: 'veg', price: 85, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'veg-french-fries-salted', name: 'Salted French Fries', description: 'Salted fries', category: 'French Fries', menu_type: 'veg', price: 100, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'veg-cheesy-fries', name: 'Cheesy French Fries', description: 'Loaded cheesy fries', category: 'French Fries', menu_type: 'veg', price: 120, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'veg-perry-fries', name: 'Perry-Perry French Fries', description: 'Spicy fries', category: 'French Fries', menu_type: 'veg', price: 120, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'veg-loaded-fries', name: 'Loaded French Fries', description: 'Loaded fries platter', category: 'French Fries', menu_type: 'veg', price: 140, half_price: null, full_price: null, image: '', available: true, preparation_time: 10 },
  { id: 'veg-paneer-fried-rice', name: 'Panner Fried Rice', description: 'Paneer fried rice', category: 'Chinese', menu_type: 'veg', price: 170, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-schezwan-rice', name: 'Schezwan Rice', description: 'Spicy schezwan rice', category: 'Chinese', menu_type: 'veg', price: 150, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-burnt-garlic-rice', name: 'Burnt Garlic Rice', description: 'Burnt garlic rice', category: 'Chinese', menu_type: 'veg', price: 150, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-chilli-garlic-rice', name: 'Chilli Garlic Rice', description: 'Garlic chilli rice', category: 'Chinese', menu_type: 'veg', price: 150, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-panner-noodles', name: 'Panner Noodles', description: 'Paneer noodles', category: 'Chinese', menu_type: 'veg', price: 150, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-chilli-paneer-dry', name: 'Chilli Panner Dry', description: 'Dry chilli paneer', category: 'Chinese', menu_type: 'veg', price: 220, half_price: null, full_price: null, image: '', available: true, preparation_time: 18 },
  { id: 'veg-chilli-paneer-gravy', name: 'Chilli Panner Gravy', description: 'Paneer in gravy', category: 'Chinese', menu_type: 'veg', price: 200, half_price: null, full_price: null, image: '', available: true, preparation_time: 18 },
  { id: 'veg-chilli-patato', name: 'Chilli Patato', description: 'Spicy chilli potato', category: 'Chinese', menu_type: 'veg', price: 170, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-honey-chilli-patato', name: 'Honey Chilli Patato', description: 'Sweet spicy potato', category: 'Chinese', menu_type: 'veg', price: 170, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-onion-pizza', name: 'Onion Pizza', description: 'Classic onion pizza', category: 'Pizza', menu_type: 'veg', price: 150, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-corn-pizza', name: 'Sweet Corn Pizza', description: 'Sweet corn pizza', category: 'Pizza', menu_type: 'veg', price: 160, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-onion-capsicum-pizza', name: 'Onion & Capsicum Pizza', description: 'Onion and capsicum pizza', category: 'Pizza', menu_type: 'veg', price: 180, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-cheese-pizza', name: 'Cheese Pizza', description: 'Cheese pizza', category: 'Pizza', menu_type: 'veg', price: 200, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-paneer-pizza', name: 'Panner Pizza', description: 'Paneer pizza', category: 'Pizza', menu_type: 'veg', price: 220, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-mushroom-pizza', name: 'Mushroom Pizza', description: 'Mushroom pizza', category: 'Pizza', menu_type: 'veg', price: 220, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-farmhouse-pizza', name: 'Farm House Pizza', description: 'Farmhouse pizza', category: 'Pizza', menu_type: 'veg', price: 250, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'veg-grilled-bread', name: 'Grilled Bread', description: 'Toasted grilled bread', category: 'Add On', menu_type: 'veg', price: 10, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'veg-grilled-bun', name: 'Grilled Bun/Bread option', description: 'Grilled bun or bread', category: 'Add On', menu_type: 'veg', price: 20, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'non-veg-chicken-burger', name: 'Chicken Burger', description: 'Crispy chicken burger', category: 'Burger', menu_type: 'non-veg', price: 100, half_price: null, full_price: null, image: '', available: true, preparation_time: 12 },
  { id: 'non-veg-chicken-popcorn', name: 'Chicken Pop Corn', description: 'Crispy popcorn chicken', category: 'Burger', menu_type: 'non-veg', price: 120, half_price: null, full_price: null, image: '', available: true, preparation_time: 12 },
  { id: 'non-veg-tandoori-chicken-sandwich', name: 'Tandoori Chicken', description: 'Tandoori chicken sandwich', category: 'Sandwich', menu_type: 'non-veg', price: 150, half_price: null, full_price: null, image: '', available: true, preparation_time: 12 },
  { id: 'non-veg-chicken-sandwich', name: 'Chicken Sandwich', description: 'Chicken sandwich', category: 'Sandwich', menu_type: 'non-veg', price: 130, half_price: null, full_price: null, image: '', available: true, preparation_time: 12 },
  { id: 'non-veg-steam-momos', name: 'Steam Momos (10 pcs)', description: 'Chicken steamed momos', category: 'Momos', menu_type: 'non-veg', price: 150, half_price: null, full_price: null, image: '', available: true, preparation_time: 12 },
  { id: 'non-veg-fried-momos', name: 'Fried Momos (10 pcs)', description: 'Chicken fried momos', category: 'Momos', menu_type: 'non-veg', price: 150, half_price: null, full_price: null, image: '', available: true, preparation_time: 12 },
  { id: 'non-veg-kurkure-momos', name: 'Kurkure Momos (8 pcs)', description: 'Chicken kurkure momos', category: 'Momos', menu_type: 'non-veg', price: 150, half_price: null, full_price: null, image: '', available: true, preparation_time: 12 },
  { id: 'non-veg-omelette-2', name: 'Omelette (02 Egg)', description: 'Two egg omelette', category: 'Eggs', menu_type: 'non-veg', price: 60, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'non-veg-omelette-3', name: 'Omelette (03 Egg)', description: 'Three egg omelette', category: 'Eggs', menu_type: 'non-veg', price: 75, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'non-veg-bhurji-2', name: 'Bhurji (02 Egg)', description: 'Egg bhurji', category: 'Eggs', menu_type: 'non-veg', price: 60, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'non-veg-bhurji-3', name: 'Bhurji (03 Egg)', description: 'Three egg bhurji', category: 'Eggs', menu_type: 'non-veg', price: 75, half_price: null, full_price: null, image: '', available: true, preparation_time: 8 },
  { id: 'non-veg-boiled-egg', name: 'Boiled Egg', description: 'Plain boiled egg', category: 'Eggs', menu_type: 'non-veg', price: 15, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'non-veg-stuffed-chicken', name: 'Stuffed Chicken', description: 'Stuffed chicken patty', category: 'Patty', menu_type: 'non-veg', price: 60, half_price: null, full_price: null, image: '', available: true, preparation_time: 10 },
  { id: 'non-veg-egg-patty', name: 'Egg Patty', description: 'Egg patty', category: 'Patty', menu_type: 'non-veg', price: 50, half_price: null, full_price: null, image: '', available: true, preparation_time: 10 },
  { id: 'non-veg-crispy-fried-leg', name: 'Crispy Fried Leg (04 pcs)', description: 'Crispy fried chicken leg', category: 'Continental', menu_type: 'non-veg', price: 200, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-chicken-popcorn-15', name: 'Chicken Pop Corn (15 pcs)', description: 'Crispy chicken popcorn', category: 'Continental', menu_type: 'non-veg', price: 200, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-chicken-kurkure', name: 'Chicken Kurkure (15 pcs)', description: 'Chicken kurkure bites', category: 'Continental', menu_type: 'non-veg', price: 200, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-creamy-chicken', name: 'Creamy Chicken', description: 'Creamy chicken dish', category: 'Continental', menu_type: 'non-veg', price: 150, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-chicken-finger', name: 'Chicken Finger (15 pcs)', description: 'Chicken finger platter', category: 'Continental', menu_type: 'non-veg', price: 200, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-chicken-white-sauce', name: 'Chicken White Sauce', description: 'Chicken in white sauce', category: 'Continental', menu_type: 'non-veg', price: 120, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-chicken-red-sauce', name: 'Chicken Red Sauce', description: 'Chicken in red sauce', category: 'Continental', menu_type: 'non-veg', price: 120, half_price: null, full_price: null, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-grilled-bun', name: 'Grilled Bun', description: 'Grilled bun layer', category: 'Add On', menu_type: 'non-veg', price: 20, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'non-veg-grilled-bread', name: 'Grilled Bread', description: 'Grilled bread', category: 'Add On', menu_type: 'non-veg', price: 10, half_price: null, full_price: null, image: '', available: true, preparation_time: 5 },
  { id: 'non-veg-chicken-fried-rice', name: 'Chicken Fried Rice', description: 'Classic chicken fried rice', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 120, full_price: 200, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-schezwan-rice', name: 'Schezwan Rice', description: 'Spicy schezwan rice', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 130, full_price: 220, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-burnt-garlic-rice-nv', name: 'Burnt Garlic Rice', description: 'Burnt garlic rice with chicken', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 120, full_price: 200, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-chilli-garlic-rice', name: 'Chilli Garlic Rice', description: 'Chilli garlic chicken rice', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 130, full_price: 220, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-woke-rice', name: 'Woke Rice', description: 'Woke rice with chicken', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 150, full_price: 250, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-combination-rice', name: 'Combination Rice', description: 'Combination chicken rice', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 130, full_price: 220, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-chicken-noodles', name: 'Chicken Noodles', description: 'Chicken noodles', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 120, full_price: 200, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-chilli-garlic-noodles', name: 'Chilli Garlic Noodles', description: 'Spicy garlic noodles', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 130, full_price: 220, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-singapuri-noodles', name: 'Singapuri Noodles', description: 'Singapuri style noodles', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 120, full_price: 200, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-schezwan-noodles', name: 'Schezwan Noodles', description: 'Schezwan chicken noodles', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 120, full_price: 200, image: '', available: true, preparation_time: 15 },
  { id: 'non-veg-chilli-chicken-dry', name: 'Chilli Chicken Dry', description: 'Dry chilli chicken', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 170, full_price: 270, image: '', available: true, preparation_time: 18 },
  { id: 'non-veg-chilli-chicken-gravy', name: 'Chilli Chicken Gravy', description: 'Chicken in gravy', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 150, full_price: 250, image: '', available: true, preparation_time: 18 },
  { id: 'non-veg-triple-rice', name: 'Triple Rice', description: 'Triple rice combo', category: 'Chinese', menu_type: 'non-veg', price: 350, half_price: null, full_price: null, image: '', available: true, preparation_time: 18 },
  { id: 'non-veg-manchurian-dry', name: 'Manchurian Dry', description: 'Dry manchurian', category: 'Chinese', menu_type: 'non-veg', price: null, half_price: 130, full_price: 230, image: '', available: true, preparation_time: 15 },
])