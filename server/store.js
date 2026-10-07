import { randomBytes } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export function createStore(dataDirectory) {
  const directory = resolve(dataDirectory)
  const databasePath = resolve(directory, 'campus-one.json')
  const complaintPhotoDirectory = resolve(directory, 'complaint-photos')
  const lostFoundPhotoDirectory = resolve(directory, 'lost-found-photos')
  let transactionQueue = Promise.resolve()

  async function ensureDirectory() {
    await mkdir(directory, { recursive: true, mode: 0o700 })
  }

  async function read() {
    await ensureDirectory()
    try {
      const data = JSON.parse(await readFile(databasePath, 'utf8'))
      data.users ??= []
      data.complaints ??= []
      data.lostFoundReports ??= []
      data.sports ??= null
      data.sportsEvents ??= []
      data.sportsRegistrations ??= []
      data.sportsParticipations ??= []
      data.sportsTeams ??= []
      data.sportsSchedules ??= []
      data.sportsAttendance ??= []
      data.sportsResults ??= []
      data.sportsAchievements ??= []
      data.sportsNotices ??= []
      data.foodOrders ??= []
      data.canteenOrders ??= []
      data.canteenMenu ??= null
      data.campus ??= {}
      data.registrationRequests ??= []
      data.notifications ??= []
      data.registrationTokens ??= {}
      data.issuedUserIds ??= []
      data.idCounters ??= {}
      return data
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      return { users: [], complaints: [], lostFoundReports: [], sports: null, sportsEvents: [], sportsRegistrations: [], sportsParticipations: [], sportsTeams: [], sportsSchedules: [], sportsAttendance: [], sportsResults: [], sportsAchievements: [], sportsNotices: [], foodOrders: [], canteenOrders: [], canteenMenu: null, campus: {}, registrationRequests: [], notifications: [], registrationTokens: {}, issuedUserIds: [], idCounters: {} }
    }
  }

  async function write(data) {
    await ensureDirectory()
    const temporaryPath = `${databasePath}.${randomBytes(8).toString('hex')}.tmp`
    const handle = await open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(JSON.stringify(data, null, 2), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, databasePath)
  }

  function transact(action) {
    const operation = transactionQueue.then(async () => {
      const data = await read()
      const result = await action(data)
      await write(data)
      return result
    })
    transactionQueue = operation.catch(() => {})
    return operation
  }

  async function getSessionSecret() {
    await ensureDirectory()
    const secretPath = resolve(dirname(databasePath), 'session-secret')
    try {
      return await readFile(secretPath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      const secret = randomBytes(32)
      try {
        const handle = await open(secretPath, 'wx', 0o600)
        try { await handle.writeFile(secret); await handle.sync() } finally { await handle.close() }
        return secret
      } catch (writeError) {
        if (writeError.code !== 'EEXIST') throw writeError
        return readFile(secretPath)
      }
    }
  }

  async function saveComplaintPhoto(photoId, mimeType, bytes) {
    const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
    const extension = extensions[mimeType]
    if (!extension || !/^[a-f\d-]{36}$/i.test(photoId)) throw new Error('Invalid complaint photo metadata.')
    await mkdir(complaintPhotoDirectory, { recursive: true, mode: 0o700 })
    await chmod(complaintPhotoDirectory, 0o700)
    const path = resolve(complaintPhotoDirectory, `${photoId}${extension}`)
    const handle = await open(path, 'wx', 0o600)
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    return { photoId, mimeType }
  }

  async function readComplaintPhoto(photoId, mimeType) {
    const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
    const extension = extensions[mimeType]
    if (!extension || !/^[a-f\d-]{36}$/i.test(photoId)) {
      const error = new Error('Complaint photo not found.')
      error.code = 'ENOENT'
      throw error
    }
    return readFile(resolve(complaintPhotoDirectory, `${photoId}${extension}`))
  }

  async function saveLostFoundPhoto(photoId, mimeType, bytes) {
    const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
    const extension = extensions[mimeType]
    if (!extension || !/^[a-f\d-]{36}$/i.test(photoId)) throw new Error('Invalid lost-and-found photo metadata.')
    await mkdir(lostFoundPhotoDirectory, { recursive: true, mode: 0o700 })
    await chmod(lostFoundPhotoDirectory, 0o700)
    const path = resolve(lostFoundPhotoDirectory, `${photoId}${extension}`)
    const handle = await open(path, 'wx', 0o600)
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    return { photoId, mimeType }
  }

  async function readLostFoundPhoto(photoId, mimeType) {
    const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
    const extension = extensions[mimeType]
    if (!extension || !/^[a-f\d-]{36}$/i.test(photoId)) {
      const error = new Error('Lost-and-found photo not found.')
      error.code = 'ENOENT'
      throw error
    }
    return readFile(resolve(lostFoundPhotoDirectory, `${photoId}${extension}`))
  }

  async function clear() {
    await rm(directory, { recursive: true, force: true })
  }

  return { read, write, transact, getSessionSecret, saveComplaintPhoto, readComplaintPhoto, saveLostFoundPhoto, readLostFoundPhoto, clear }
}