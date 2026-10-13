import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer as createViteServer } from 'vite'

let vite
let EventList
let SportsMembershipCatalog
let SportsEventFields

before(async () => {
  vite = await createViteServer({
    configFile: './vite.config.js',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  const studentSports = await vite.ssrLoadModule('/src/components/StudentSports.jsx')
  const sportsManagement = await vite.ssrLoadModule('/src/components/SportsManagement.jsx')
  EventList = studentSports.EventList
  SportsMembershipCatalog = studentSports.SportsMembershipCatalog
  SportsEventFields = sportsManagement.SportsEventFields
})

after(async () => {
  await vite?.close()
})

test('student Sports cards show Apply to Join for eligible sports and teams', () => {
  const markup = renderToStaticMarkup(React.createElement(SportsMembershipCatalog, {
    sports: [{ id: 'sport-cricket', title: 'Cricket', description: 'Outdoor sport' }],
    teams: [{ id: 'team-cricket', name: 'Cricket Team', sportName: 'Cricket', category: 'Mixed', teamType: 'College Team' }],
    applications: [],
    appliedTargets: new Set(),
    canApply: true,
    busy: '',
    onApply() {},
  }))
  assert.equal((markup.match(/Apply to Join/g) || []).length, 2)
  assert.match(markup, /Cricket Team/)

  const readOnlyMarkup = renderToStaticMarkup(React.createElement(SportsMembershipCatalog, {
    sports: [{ id: 'sport-cricket', title: 'Cricket' }],
    teams: [],
    applications: [],
    appliedTargets: new Set(),
    canApply: false,
    busy: '',
    onApply() {},
  }))
  assert.doesNotMatch(readOnlyMarkup, /Apply to Join/)
})

test('student event cards show Apply Now only when registration is open and required', () => {
  const base = {
    id: 'trial-cricket', name: 'Cricket trials', kind: 'TRIAL', sportName: 'Cricket',
    date: '2099-05-12', time: '17:45', venue: 'Sports ground',
    registrationDeadline: '2099-05-10', status: 'OPEN', registrationRequired: true,
    eligibleDepartments: ['btech'],
  }
  const render = (event, user = { role: 'Student', course: 'B.Tech' }) => renderToStaticMarkup(React.createElement(EventList, {
    events: [event], appliedEvents: new Set(), busy: '', onRegister() {}, user,
  }))

  const open = render(base)
  assert.match(open, /Apply Now/)
  assert.match(open, /17:45/)

  const notRequired = render({ ...base, registrationRequired: false })
  assert.doesNotMatch(notRequired, /Apply Now/)
  assert.match(notRequired, /Registration not required/)

  const closed = render({ ...base, status: 'CLOSED' })
  assert.doesNotMatch(closed, /Apply Now/)
  assert.match(closed, /Applications closed/)

  const expired = render({ ...base, registrationDeadline: '2000-01-01' })
  assert.doesNotMatch(expired, /Apply Now/)
  assert.match(expired, /Applications closed/)

  const legacyEvent = render({ ...base, registrationRequired: undefined })
  assert.match(legacyEvent, /Apply Now/)
})

test('organizer create/edit event fields render time picker, registration choice, and all Sports departments', () => {
  const markup = renderToStaticMarkup(React.createElement(SportsEventFields, {
    values: {
      name: '', sportId: '', kind: 'TRIAL', date: '', time: '17:45', venue: '',
      registrationRequired: true, registrationDeadline: '', maxParticipants: '',
      eligibility: '', eligibleDepartments: [], description: '',
    },
    onChange() {},
    sports: [{ id: 'sport-cricket', title: 'Cricket' }],
  }))
  assert.match(markup, /Registration Required\?/)
  assert.match(markup, />Yes</)
  assert.match(markup, />No</)
  assert.match(markup, /type="time" step="60" lang="en-GB" required="" value="17:45"/)
  for (const department of ['BTech', 'BCA', 'Law', 'Pharmacy', 'Diploma', 'Management']) {
    assert.match(markup, new RegExp(`>${department}<\\/option>`))
  }

  const optionalMarkup = renderToStaticMarkup(React.createElement(SportsEventFields, {
    values: {
      name: '', sportId: '', kind: 'EVENT', date: '', time: '', venue: '',
      registrationRequired: false, registrationDeadline: '', maxParticipants: '',
      eligibility: '', eligibleDepartments: [], description: '',
    },
    onChange() {},
    sports: [],
  }))
  assert.match(optionalMarkup, /Registration deadline<input type="date" disabled="" value=""/)
})
