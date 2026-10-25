export const UI_PREFERENCES_KEY = 'campus-one-ui-preferences'
export const THEMES = Object.freeze(['system', 'light', 'dark'])
export const LAYOUT_DENSITIES = Object.freeze(['comfortable', 'compact'])

export function defaultUiPreferences() {
  return { theme: 'system', reduceMotion: false, layoutDensity: 'comfortable' }
}

export function loadUiPreferences() {
  const preferences = defaultUiPreferences()
  let saved
  try {
    saved = window.localStorage.getItem(UI_PREFERENCES_KEY)
  } catch {
    return { preferences, storageAvailable: false }
  }
  if (saved) {
    let parsed
    try { parsed = JSON.parse(saved) } catch {
      return { preferences, storageAvailable: true }
    }
    if (parsed && typeof parsed === 'object') {
      if (THEMES.includes(parsed.theme)) preferences.theme = parsed.theme
      if (typeof parsed.reduceMotion === 'boolean') preferences.reduceMotion = parsed.reduceMotion
      if (LAYOUT_DENSITIES.includes(parsed.layoutDensity)) preferences.layoutDensity = parsed.layoutDensity
    }
  }
  return { preferences, storageAvailable: true }
}

export function saveUiPreferences(preferences) {
  const safePreferences = {
    theme: THEMES.includes(preferences.theme) ? preferences.theme : 'system',
    reduceMotion: preferences.reduceMotion === true,
    layoutDensity: LAYOUT_DENSITIES.includes(preferences.layoutDensity) ? preferences.layoutDensity : 'comfortable',
  }
  window.localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify(safePreferences))
  return safePreferences
}
