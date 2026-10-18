import assert from 'node:assert/strict'
import { request as httpRequest, createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { createCampusApp } from '../server/app.js'

let server
let baseUrl
let upstreamResponse
let requestedUrl
const originalFetch = globalThis.fetch

before(async () => {
  globalThis.fetch = async (url) => {
    requestedUrl = String(url)
    return upstreamResponse
  }
  server = createServer(createCampusApp({ store: {}, sessionSecret: Buffer.alloc(32) }))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  globalThis.fetch = originalFetch
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
})

async function requestWeather() {
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${baseUrl}/api/weather`, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }))
    })
    request.on('error', reject)
    request.end()
  })
}

test('the weather API requests Sonipat current conditions and reports unavailable data', async () => {
  upstreamResponse = {
    ok: true,
    json: async () => ({ current: { temperature_2m: 27.4, weather_code: 2 } }),
  }
  let result = await requestWeather()
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { current: { temperatureC: 27.4, weatherCode: 2 } })
  const weatherUrl = new URL(requestedUrl)
  assert.equal(weatherUrl.hostname, 'api.open-meteo.com')
  assert.equal(weatherUrl.searchParams.get('latitude'), '28.9931')
  assert.equal(weatherUrl.searchParams.get('longitude'), '77.0151')
  assert.equal(weatherUrl.searchParams.get('current'), 'temperature_2m,weather_code')
  assert.equal(weatherUrl.searchParams.get('temperature_unit'), 'celsius')

  upstreamResponse = { ok: false, status: 503 }
  result = await requestWeather()
  assert.equal(result.status, 502)
  assert.match(result.body.error, /temporarily unavailable/)

  upstreamResponse = { ok: true, json: async () => null }
  result = await requestWeather()
  assert.equal(result.status, 502)
  assert.match(result.body.error, /weather data is unavailable/)

  upstreamResponse = { ok: true, json: async () => { throw new SyntaxError('Invalid JSON') } }
  result = await requestWeather()
  assert.equal(result.status, 502)
  assert.match(result.body.error, /could not be read/)
})
