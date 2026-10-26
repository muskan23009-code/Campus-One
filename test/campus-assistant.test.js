import assert from 'node:assert/strict'
import test from 'node:test'
import { answerCampusQuestion } from '../src/assistant/campusAssistant.js'
import { APP_ROLES } from '../src/auth/access.js'

function account(role) {
  return { id: 'test-user', role, modules: [] }
}

test('Campus Assistant returns only current-user-visible notices', async () => {
  let requested
  const answer = await answerCampusQuestion('Show latest notices', {
    user: account(APP_ROLES.STUDENT),
    api: async (path) => {
      requested = path
      return { notices: [{ title: 'Exam update', priority: 'Important', createdAt: '2026-10-01' }] }
    },
  })
  assert.equal(requested, '/api/notices')
  assert.match(answer.message, /Exam update/)
  assert.equal(answer.destination.page, 'notices')
})

test('Campus Assistant answers a Roman Hindi notice question with account-visible records', async () => {
  const answer = await answerCampusQuestion('Latest notices dikhao.', {
    user: account(APP_ROLES.STUDENT),
    api: async (path) => {
      assert.equal(path, '/api/notices')
      return { notices: [{ title: 'Exam update', priority: 'Important', createdAt: '2026-10-01' }] }
    },
  })
  assert.match(answer.message, /Yeh latest notices aapke liye hain:/)
  assert.match(answer.message, /Exam update/)
})

test('Campus Assistant uses real upcoming Events & Clubs API records', async () => {
  const upcomingDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const answer = await answerCampusQuestion('What events are coming up?', {
    user: account(APP_ROLES.STUDENT),
    api: async (path) => {
      assert.equal(path, '/api/events-clubs')
      return { events: [{ name: 'Campus seminar', date: upcomingDate, status: 'PUBLISHED' }] }
    },
  })
  assert.match(answer.message, /Campus seminar/)
})

test('Campus Assistant answers a Hinglish events question with real campus events', async () => {
  const upcomingDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const answer = await answerCampusQuestion('Aaj campus mein kya events hain?', {
    user: account(APP_ROLES.STUDENT),
    api: async (path) => {
      assert.equal(path, '/api/events-clubs')
      return { events: [{ name: 'Campus seminar', date: upcomingDate, status: 'PUBLISHED' }] }
    },
  })
  assert.match(answer.message, /Aaj aur aane wale campus events yeh hain:/)
  assert.match(answer.message, /Campus seminar/)
})

test('Campus Assistant reports actual Canteen menu items and prices', async () => {
  const answer = await answerCampusQuestion("What's available in the canteen?", {
    user: account(APP_ROLES.STUDENT),
    api: async (path) => {
      assert.equal(path, '/api/canteen/menu')
      return { items: [{ name: 'Tea', price: 20, available: true }, { name: 'Unavailable', price: 5, available: false }] }
    },
  })
  assert.match(answer.message, /Tea · ₹20/)
  assert.doesNotMatch(answer.message, /Unavailable/)
})

test('Campus Assistant routes Hostel help without exposing resident records', async () => {
  const answer = await answerCampusQuestion('How do I access Hostel?', {
    user: account(APP_ROLES.SPORTS),
    api: async () => { throw new Error('Hostel API must not be read for generic help') },
  })
  assert.equal(answer.destination.page, 'hostel')
  assert.doesNotMatch(answer.message, /student id|resident names/i)
})

test('Campus Assistant describes Faculty Review anonymity without requesting private reviews', async () => {
  const answer = await answerCampusQuestion('How does Faculty Review work?', {
    user: account(APP_ROLES.STUDENT),
    api: async () => { throw new Error('Review API must not be read for general guidance') },
  })
  assert.match(answer.message, /anonymous/i)
  assert.equal(answer.destination.page, 'teacher-review')
})

test('Campus Assistant never navigates to a module unavailable to the current role', async () => {
  const answer = await answerCampusQuestion('Where is Complaint?', {
    user: account(APP_ROLES.STAFF),
    api: async () => { throw new Error('No data request should be made') },
  })
  assert.match(answer.message, /doesn't have access/i)
  assert.equal(answer.destination, null)
})

test('Campus Assistant uses a clear fallback for unsupported campus questions', async () => {
  const answer = await answerCampusQuestion('What is the moon made of?', {
    user: account(APP_ROLES.STUDENT),
    api: async () => { throw new Error('No data request should be made') },
  })
  assert.equal(answer.message, "I couldn't find that information in Campus One right now.")
})
