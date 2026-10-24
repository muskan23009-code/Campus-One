import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import test from 'node:test'
import { createServer } from 'vite'

test('each managed role renders its own account actions for active and inactive accounts', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { AccountActions, filterAccounts } = await vite.ssrLoadModule('/src/components/AdministrationUsers.jsx')
    const profiles = [
      ['Student', 'PM-S1001'],
      ['Staff', 'PM-ST001'],
      ['HOD', 'PM-HOD001'],
      ['Sports Captain', 'PM-SC001'],
      ['Administration', 'PM-AD002'],
    ].map(([role, id]) => ({ id, name: `${role} Example`, role, active: true, department: 'Computer Science' }))
    for (const user of profiles) {
      const { role, id } = user
      for (const active of [true, false]) {
        const rowUser = { ...user, active }
        const markup = renderToStaticMarkup(React.createElement(AccountActions, {
          user: rowUser,
          currentUserId: 'PM-AD001',
          busy: false,
          onEdit() {},
          onToggle(id) { assert.equal(id, rowUser.id, `${role} access action is bound to its row ID`) },
          onDelete(id) { assert.equal(id, rowUser.id, `${role} delete action is bound to its row ID`) },
        }))
        const actions = AccountActions({
          user: rowUser,
          currentUserId: 'PM-AD001',
          busy: false,
          onEdit() {},
          onToggle(id) { assert.equal(id, rowUser.id, `${role} access action receives its own ID`) },
          onDelete(id) { assert.equal(id, rowUser.id, `${role} delete action receives its own ID`) },
        })

        assert.match(markup, new RegExp(`data-account-id="${id}"`))
        assert.match(markup, new RegExp(active ? 'Deactivate Access' : 'Reactivate Access'))
        assert.match(markup, /Delete Account/)
        assert.match(markup, new RegExp(`data-user-id="${id}"`, 'g'))
        assert.equal((markup.match(/data-action="delete"/g) || []).length, 1, `${role} has its own delete action`)
        assert.equal((markup.match(new RegExp(`data-action="${active ? 'deactivate' : 'reactivate'}"`, 'g')) || []).length, 1, `${role} has its own access action`)
        const actionButtons = actions.props.children[1].props.children.filter(React.isValidElement)
        actionButtons.forEach((button) => button.props.onClick())
      }
    }
    const filtered = filterAccounts(profiles, {
      query: 'staff example',
      roleFilter: 'Staff',
      departmentFilter: 'Computer Science',
      statusFilter: 'active',
    })
    assert.deepEqual(filtered.map((user) => user.id), ['PM-ST001'])
    const filteredMarkup = renderToStaticMarkup(React.createElement(AccountActions, {
      user: filtered[0],
      currentUserId: 'PM-AD001',
      busy: false,
      onEdit() {},
      onToggle() {},
      onDelete() {},
    }))
    assert.match(filteredMarkup, /data-action="delete"/, 'search and filtering preserve the selected account actions')
    const administrationRow = profiles.find((user) => user.role === 'Administration')
    const administrationMarkup = renderToStaticMarkup(React.createElement(AccountActions, {
      user: administrationRow,
      busy: false,
      onEdit() {},
      onToggle() {},
      onDelete() {},
    }))
    assert.match(administrationMarkup, /Deactivate Access/)
    assert.match(administrationMarkup, /Delete Account/)
  } finally {
    await vite.close()
  }
})
