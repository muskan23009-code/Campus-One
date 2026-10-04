import { randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export function createStore(dataDirectory) {
  const directory = resolve(dataDirectory)
  const databasePath = resolve(directory, 'campus-one.json')
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
      data.sports ??= null
      data.foodOrders ??= []
      data.campus ??= {}
      data.registrationRequests ??= []
      data.notifications ??= []
      data.registrationTokens ??= {}
      data.issuedUserIds ??= []
      data.idCounters ??= {}
      return data
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      return { users: [], complaints: [], sports: null, foodOrders: [], campus: {}, registrationRequests: [], notifications: [], registrationTokens: {}, issuedUserIds: [], idCounters: {} }
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

  async function clear() {
    await rm(directory, { recursive: true, force: true })
  }

  return { read, write, transact, getSessionSecret, clear }
}