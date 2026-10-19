function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function normalizeHostelResponse(response, isAdministrator) {
  const payload = response && typeof response === 'object' && !Array.isArray(response) ? response : {}
  const collections = isAdministrator
    ? ['rooms', 'allotments', 'residents', 'hostelDetails', 'maintenance', 'students']
    : ['allotments', 'roommates', 'maintenance']
  const normalized = { ...payload }
  for (const key of collections) normalized[key] = asArray(payload[key])
  normalized.hostelDetails = isAdministrator
    ? asArray(payload.hostelDetails)
    : payload.hostelDetails && typeof payload.hostelDetails === 'object' && !Array.isArray(payload.hostelDetails)
      ? payload.hostelDetails
      : null
  return normalized
}

export function hostelCollection(value) {
  return asArray(value)
}

export function getStudentRoom(currentAllotment, hostelDetails) {
  if (currentAllotment) return currentAllotment
  return hostelDetails?.hostelName && hostelDetails?.roomNumber ? hostelDetails : null
}

export function getStudentRoommateNames(currentRoommates, hostelDetails) {
  const names = [
    ...(Array.isArray(currentRoommates) ? currentRoommates.map((roommate) => roommate?.name) : []),
    ...(Array.isArray(hostelDetails?.roommateNames) ? hostelDetails.roommateNames : []),
  ]
  const unique = []
  const seen = new Set()
  for (const candidate of names) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue
    const name = candidate.trim()
    const key = name.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(name)
  }
  return unique
}
