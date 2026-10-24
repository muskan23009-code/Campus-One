import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function loadProjectEnvironment(directory = projectRoot) {
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error('Campus One requires Node.js 20.12 or newer to load environment files.')
  }

  for (const filename of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(resolve(directory, filename))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
}