export const campusMapLocations = Object.freeze([
  // x/y are editable schematic canvas positions, not surveyed indoor coordinates.
  { id: 'btech-building', name: 'BTech Building', category: 'academic', icon: 'building', x: 400, y: 135 },
  { id: 'law-block', name: 'Law Block', category: 'academic', icon: 'law', x: 650, y: 135 },
  { id: 'pharma-block', name: 'Pharma Block', category: 'academic', icon: 'pharma', x: 400, y: 285 },
  { id: 'girls-hostel', name: 'Girls Hostel', category: 'hostel', icon: 'hostel', x: 850, y: 320 },
  { id: 'boys-hostel', name: 'Boys Hostel', category: 'hostel', icon: 'hostel', x: 160, y: 330 },
  { id: 'canteen', name: 'Canteen', category: 'canteen', icon: 'canteen', x: 400, y: 435 },
  { id: 'ground', name: 'Ground', category: 'ground', icon: 'ground', x: 650, y: 500 },
  { id: 'reception', name: 'Reception', category: 'reception', icon: 'reception', x: 160, y: 510 },
  { id: 'parking', name: 'Parking', category: 'parking', icon: 'parking', x: 880, y: 515 },
  { id: 'hanger', name: 'Hanger', category: 'academic', icon: 'hanger', x: 850, y: 135 },
  { id: 'puran-murti-global-school', name: 'Puran Murti Global School', category: 'academic', icon: 'school', x: 160, y: 150 },
])

// Approximate schematic walkways only; update these connections when a verified campus plan is available.
export const campusWalkways = Object.freeze([
  { from: 'reception', to: 'btech-building' },
  { from: 'reception', to: 'boys-hostel' },
  { from: 'reception', to: 'puran-murti-global-school' },
  { from: 'boys-hostel', to: 'puran-murti-global-school' },
  { from: 'boys-hostel', to: 'pharma-block' },
  { from: 'puran-murti-global-school', to: 'btech-building' },
  { from: 'btech-building', to: 'pharma-block' },
  { from: 'btech-building', to: 'law-block' },
  { from: 'law-block', to: 'hanger' },
  { from: 'law-block', to: 'canteen' },
  { from: 'hanger', to: 'girls-hostel' },
  { from: 'girls-hostel', to: 'parking' },
  { from: 'pharma-block', to: 'canteen' },
  { from: 'canteen', to: 'ground' },
  { from: 'ground', to: 'parking' },
])

export const campusGeographicalLocation = Object.freeze({
  address: 'Puran Murti Vidyapeeth, Kami Road, Sonipat, Haryana 131001',
  latitude: 29.0506023,
  longitude: 77.01168,
  sourceUrl: 'https://www.google.com/maps/search/?api=1&query=Puran+Murti+Vidyapeeth%2C+Kami+Road%2C+Sonipat%2C+Haryana+131001',
  addressSourceUrl: 'https://www.puranmurti.com/contact-us.php',
})
