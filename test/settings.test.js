import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultUiPreferences, LAYOUT_DENSITIES, loadUiPreferences, saveUiPreferences, THEMES, UI_PREFERENCES_KEY } from '../src/settings/preferences.js'

function withStorage(storage, action) {
  const originalWindow = globalThis.window
  globalThis.window = { localStorage: storage }
  try { return action() } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
}

test('appearance preferences load safely and accept only supported values', () => {
  assert.deepEqual(THEMES, ['system', 'light', 'dark'])
  assert.deepEqual(LAYOUT_DENSITIES, ['comfortable', 'compact'])
  assert.deepEqual(withStorage({ getItem: () => null }, loadUiPreferences), {
    preferences: defaultUiPreferences(),
    storageAvailable: true,
  })
  const loaded = withStorage({
    getItem: (key) => {
      assert.equal(key, UI_PREFERENCES_KEY)
      return JSON.stringify({ theme: 'dark', reduceMotion: true, layoutDensity: 'compact', userId: 'someone-else', token: 'not-a-preference' })
    },
  }, loadUiPreferences)
  assert.deepEqual(loaded, { preferences: { theme: 'dark', reduceMotion: true, layoutDensity: 'compact' }, storageAvailable: true })

  const invalid = withStorage({ getItem: () => JSON.stringify({ theme: 'neon', reduceMotion: 'yes' }) }, loadUiPreferences)
  assert.deepEqual(invalid, { preferences: defaultUiPreferences(), storageAvailable: true })
  assert.deepEqual(withStorage({ getItem: () => 'corrupt setting data' }, loadUiPreferences), {
    preferences: defaultUiPreferences(),
    storageAvailable: true,
  })
})

test('appearance persistence stores only UI preferences and reports storage failures', () => {
  let storedKey
  let storedValue
  const safe = withStorage({
    setItem: (key, value) => { storedKey = key; storedValue = value },
  }, () => saveUiPreferences({
    theme: 'light',
    reduceMotion: true,
    layoutDensity: 'compact',
    password: 'never-store',
    token: 'never-store',
    rememberedLogin: true,
  }))
  assert.deepEqual(safe, { theme: 'light', reduceMotion: true, layoutDensity: 'compact' })
  assert.equal(storedKey, UI_PREFERENCES_KEY)
  assert.deepEqual(JSON.parse(storedValue), { theme: 'light', reduceMotion: true, layoutDensity: 'compact' })
  assert.equal(storedValue.includes('password'), false)
  assert.equal(storedValue.includes('token'), false)
  assert.equal(storedValue.includes('rememberedLogin'), false)

  assert.throws(() => withStorage({
    setItem: () => { throw new Error('storage unavailable') },
  }, () => saveUiPreferences({ theme: 'dark', reduceMotion: false })), /storage unavailable/)
  const unavailable = withStorage({
    getItem: () => { throw new Error('storage unavailable') },
  }, loadUiPreferences)
  assert.deepEqual(unavailable, { preferences: defaultUiPreferences(), storageAvailable: false })
})
