import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { after, before, test } from 'node:test'
import { createServer as createViteServer } from 'vite'
import { campusGeographicalLocation, campusMapLocations, campusWalkways } from '../src/data/campusMapLocations.js'
import { findCampusRoute } from '../src/data/campusMapRouting.js'

let vite
let ModuleView

before(async () => {
  vite = await createViteServer({
    configFile: './vite.config.js',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  ModuleView = (await vite.ssrLoadModule('/src/components/ModuleView.jsx')).default
})

after(async () => {
  await vite?.close()
})

test('Campus Map uses the existing navigation module and shows all requested selectable locations', () => {
  const markup = renderToStaticMarkup(React.createElement(ModuleView, {
    page: 'navigation',
    user: { role: 'Student' },
    onAction() {},
    onNavigate() {},
  }))

  for (const { name } of campusMapLocations) {
    assert.match(markup, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(markup, /Schematic Map/)
  assert.match(markup, /Geographical Map/)
  assert.match(markup, /Find My Way/)
  assert.match(markup, /Starting Point/)
  assert.match(markup, /Destination/)
  assert.match(markup, /Find Route/)
  assert.match(markup, /Clear Route/)
  assert.match(markup, /Light Theme/)
  assert.match(markup, /Dark Theme/)
  assert.match(markup, /aria-label="Zoom in"/)
  assert.match(markup, /aria-label="Zoom out"/)
  assert.match(markup, /aria-label="Reset map view"/)
  assert.match(markup, /approximate visual positions/)
  assert.doesNotMatch(markup, /Academic block A|North student mess|Health centre/)
})

test('campus internal positions are explicitly schematic and separate from the campus-level geographic pin', () => {
  assert.equal(campusMapLocations.length, 11)
  assert.ok(campusMapLocations.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)))
  assert.ok(campusMapLocations.every((location) => !('latitude' in location) && !('longitude' in location)))
  assert.equal(campusGeographicalLocation.latitude, 29.0506023)
  assert.equal(campusGeographicalLocation.longitude, 77.01168)
  assert.match(campusGeographicalLocation.addressSourceUrl, /puranmurti\.com\/contact-us\.php/)
})

test('campus routing returns valid forward and reverse paths and no route for disconnected locations', () => {
  const forward = findCampusRoute('reception', 'ground')
  const reverse = findCampusRoute('ground', 'reception')
  assert.equal(forward[0], 'reception')
  assert.equal(forward.at(-1), 'ground')
  assert.equal(reverse[0], 'ground')
  assert.equal(reverse.at(-1), 'reception')
  for (const path of [forward, reverse]) {
    for (let index = 0; index < path.length - 1; index += 1) {
      assert.ok(campusWalkways.some(({ from, to }) => (
        (from === path[index] && to === path[index + 1])
        || (to === path[index] && from === path[index + 1])
      )), 'each route segment must use a configured walkway')
    }
  }
  assert.deepEqual(findCampusRoute('reception', 'reception'), ['reception'])
  assert.equal(findCampusRoute('reception', 'ground', []), null)
  assert.equal(findCampusRoute('unknown', 'ground'), null)
})

test('every configured campus location can be routed to every other location', () => {
  for (const start of campusMapLocations) {
    for (const destination of campusMapLocations) {
      const route = findCampusRoute(start.id, destination.id)
      assert.ok(route, `${start.name} should connect to ${destination.name}`)
      assert.equal(route[0], start.id)
      assert.equal(route.at(-1), destination.id)
      for (let index = 0; index < route.length - 1; index += 1) {
        assert.ok(campusWalkways.some(({ from, to }) => (
          (from === route[index] && to === route[index + 1])
          || (to === route[index] && from === route[index + 1])
        )), 'each route segment must use a configured walkway')
      }
    }
  }
})

test('Campus Map renders its existing preference theme for local theme persistence', () => {
  const markup = renderToStaticMarkup(React.createElement(ModuleView, {
    page: 'navigation',
    user: { role: 'Student' },
    preferences: { theme: 'dark', reduceMotion: false, layoutDensity: 'comfortable' },
    onUpdatePreferences() {},
    onAction() {},
    onNavigate() {},
  }))
  assert.match(markup, /campus-map-theme-dark/)
  assert.match(markup, /aria-pressed="true" class="campus-map-theme-selected"><svg[^>]*>[\s\S]*?<\/svg>Dark Theme/)
})
