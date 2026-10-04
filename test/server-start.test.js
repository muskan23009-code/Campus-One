import { request as httpRequest } from 'node:http'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { startServer } from '../server/index.js'

function forwardedRequest(target, { host, method = 'GET', origin, secure, cookie, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host }
    if (origin) headers.Origin = origin
    if (secure) headers['X-Forwarded-Proto'] = 'https'
    if (cookie) headers.Cookie = cookie
    if (body) headers['Content-Type'] = 'application/json'
    const request = httpRequest(target, { method, headers }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        text: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    request.on('error', reject)
    if (body) request.write(JSON.stringify(body))
    request.end()
  })
}

test('the full Vite and auth server serves a Codespaces forwarded host', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'campus-one-server-'))
  const instance = await startServer({ port: 0, dataDirectory })
  const url = `http://127.0.0.1:${instance.server.address().port}`
  const host = 'campus-5173.app.github.dev'
  try {
    let response = await forwardedRequest(`${url}/`, { host })
    assert.equal(response.status, 200, 'the forwarded hostname serves the React app')
    assert.match(response.text, /Campus One \| Puran Murti Vidyapeeth/)

    response = await forwardedRequest(`${url}/src/main.jsx`, { host })
    assert.equal(response.status, 200, 'the forwarded hostname receives Vite-transformed React modules')
    assert.match(response.text, /createRoot/)

    response = await forwardedRequest(`${url}/api/auth/bootstrap-status`, { host })
    const setup = JSON.parse(response.text)
    assert.equal(setup.setupRequired, true)
    assert.equal(setup.adminAccessConfigured, false)
    assert.ok(setup.departments.includes('Computer Science'))

    response = await forwardedRequest(`${url}/api/registrations`, {
      host,
      method: 'POST',
      origin: `https://${host}`,
      secure: true,
      body: {
        role: 'Student', name: 'Forwarded Student', gender: 'Prefer not to say',
        mobile: '9876543210', email: 'forwarded-student@example.edu',
        dateOfBirth: '2005-01-15', rollNumber: 'FWD-001', course: 'B.Tech',
        department: 'Computer Science', semester: 'Semester 1', admissionYear: 2025,
        password: 'a-secure-forwarded-campus-password',
      },
    })
    assert.equal(response.status, 201, response.text)
    const application = JSON.parse(response.text)
    assert.equal(application.application.status, 'Pending')
    assert.ok(application.application.id)
    assert.equal(application.application.assignedUserId, '')
    assert.ok(application.requestToken.length >= 32)

    response = await forwardedRequest(`${url}/api/registrations/status`, {
      host, method: 'POST', origin: `https://${host}`, secure: true,
      body: { requestId: application.application.id, requestToken: application.requestToken },
    })
    assert.equal(response.status, 200, 'the private application status is available through the forwarded API')
    assert.equal(JSON.parse(response.text).application.status, 'Pending')
  } finally {
    await instance.close()
    await instance.store.clear()
  }
})