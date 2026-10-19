import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { after, before, test } from 'node:test'
import { createServer as createViteServer } from 'vite'

let vite
let FoodAndDineIn

before(async () => {
  vite = await createViteServer({
    configFile: './vite.config.js',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  FoodAndDineIn = (await vite.ssrLoadModule('/src/components/FoodAndDineIn.jsx')).default
})

after(async () => {
  await vite?.close()
})

test('Food & Dine In presents distinct Canteen and College Mess cards without legacy Mess controls', () => {
  const markup = renderToStaticMarkup(React.createElement(FoodAndDineIn, {
    user: { role: 'Student' },
    onNotify() {},
    onNavigate() {},
  }))
  assert.match(markup, /class="food-dine-hero/)
  assert.match(markup, /class="food-dine-option canteen-option"/)
  assert.match(markup, /class="food-dine-option mess-option"/)
  assert.match(markup, /Half and Full prices/)
  assert.match(markup, /Breakfast, Brunch, Lunch, and Dinner/)
  assert.doesNotMatch(markup, /crowd|occupancy|camera detection|open\/closed|Mess feedback/i)
})
