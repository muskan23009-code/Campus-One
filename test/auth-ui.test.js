import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import test from 'node:test'
import { createServer } from 'vite'
import { LOGIN_ROLES } from '../src/auth/access.js'

test('five-role login screen and role-specific registration forms render the expected fields', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { RoleChooser, RegistrationView } = await vite.ssrLoadModule('/src/components/AuthViews.jsx')
    const landing = renderToStaticMarkup(React.createElement(RoleChooser, { onChoose() {} }))
    assert.equal((landing.match(/class="auth-role-option"/g) || []).length, 5)
    for (const { label } of LOGIN_ROLES) assert.ok(landing.includes(label))
    assert.equal(landing.includes('Register as'), false, 'registration is not an unselected sixth opening option')

    const render = (role, initialStep = 0) => renderToStaticMarkup(React.createElement(RegistrationView, {
      role, departments: ['Computer Science'], adminAccessConfigured: true,
      onBack() {}, onAdminCreated() {}, onSubmitted() {},
      initialStep,
    }))
    const student = render('Student')
    assert.match(student, /DATE OF BIRTH/)
    assert.equal(student.includes('ROLL / ENROLLMENT NUMBER'), false, 'enrollment fields are deferred to student step two')
    const studentEnrollment = render('Student', 1)
    assert.match(studentEnrollment, /ROLL \/ ENROLLMENT NUMBER/)
    assert.match(studentEnrollment, /ADMISSION YEAR/)
    assert.equal(studentEnrollment.includes('DATE OF BIRTH'), false, 'date of birth remains on student step one')
    for (const role of ['Staff', 'HOD', 'Sports Captain', 'Administration']) {
      const form = render(role)
      assert.equal(form.includes('DATE OF BIRTH'), false, `${role} must not be asked for date of birth`)
      assert.equal(form.includes('EMPLOYEE ID'), false, `${role} must not be asked for an employee ID`)
    }
    const staffDetails = render('Staff', 1)
    assert.match(staffDetails, /JOINING YEAR/)
    assert.equal(staffDetails.includes('DATE OF BIRTH'), false)
  } finally {
    await vite.close()
  }
})