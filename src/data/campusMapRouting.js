import { campusMapLocations, campusWalkways } from './campusMapLocations.js'

export function findCampusRoute(startId, destinationId, walkways = campusWalkways) {
  const locations = new Set(campusMapLocations.map(({ id }) => id))
  if (!locations.has(startId) || !locations.has(destinationId)) return null
  if (startId === destinationId) return [startId]

  const adjacency = new Map([...locations].map((id) => [id, []]))
  for (const { from, to } of walkways) {
    if (!adjacency.has(from) || !adjacency.has(to)) continue
    adjacency.get(from).push(to)
    adjacency.get(to).push(from)
  }

  const queue = [startId]
  const previous = new Map([[startId, null]])
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    for (const neighbor of adjacency.get(current)) {
      if (previous.has(neighbor)) continue
      previous.set(neighbor, current)
      if (neighbor === destinationId) {
        const path = [destinationId]
        for (let step = current; step !== null; step = previous.get(step)) path.unshift(step)
        return path
      }
      queue.push(neighbor)
    }
  }
  return null
}
