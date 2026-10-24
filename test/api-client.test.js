import assert from 'node:assert/strict'
import test from 'node:test'
import { api, ApiError } from '../src/api/client.js'

test('API requests with a timeout abort and return a useful timeout error', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (_path, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true })
  })

  try {
    await assert.rejects(
      api('/api/auth/login', { method: 'POST', body: {}, timeoutMs: 5 }),
      (error) => error instanceof ApiError
        && error.message === 'Sign-in timed out. Check your connection and try again.'
        && error.status === 0,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
