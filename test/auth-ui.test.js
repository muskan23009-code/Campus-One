import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import test from 'node:test'
import { createServer } from 'vite'
import { LOGIN_ROLES } from '../src/auth/access.js'

test('five-role login screen and role-specific registration forms render the expected fields', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { PasswordCreatedView, RegistrationStatus, RoleChooser, RegistrationView, RoleLoginView } = await vite.ssrLoadModule('/src/components/AuthViews.jsx')
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
    for (const role of ['Student', 'HOD', 'Staff', 'Sports Captain']) {
      const contacts = render(role, 2)
      assert.match(contacts, /MOBILE NUMBER/)
      assert.match(contacts, /EMAIL/)
      assert.equal(contacts.includes('name="password"'), false, `${role} registration does not ask for a password`)
      assert.equal(contacts.includes('name="confirmPassword"'), false, `${role} registration does not ask for password confirmation`)
    }
    for (const setupAvailability of [true, undefined]) {
      const approvedSetup = renderToStaticMarkup(React.createElement(RegistrationStatus, {
        status: {
          application: {
            id: 'request-123',
            role: 'Student',
            status: 'Approved',
            userId: 'PM-S1001',
            ...(setupAvailability === undefined ? {} : { passwordSetupAvailable: setupAvailability }),
          },
          requestToken: 'a'.repeat(43),
        },
        onBack() {},
        onPasswordCreated() {},
      }))
      assert.match(approvedSetup, /Request Approved/)
      assert.match(approvedSetup, /PM-S1001/)
      assert.match(approvedSetup, /CREATE YOUR PASSWORD/)
      assert.match(approvedSetup, /CONFIRM PASSWORD/)
      assert.match(approvedSetup, /Create Password/)
    }
    let loginNavigated = false
    const passwordCreatedElement = PasswordCreatedView({ onLogin() { loginNavigated = true } })
    const confirmationButton = passwordCreatedElement.props.children.find((child) => React.isValidElement(child) && child.props.className === 'login-submit')
    assert.equal(confirmationButton.props.children[0].trim(), 'Login')
    confirmationButton.props.onClick()
    assert.equal(loginNavigated, true, 'the Login button triggers navigation to the existing login page')
    const postSetupMarkup = renderToStaticMarkup(passwordCreatedElement)
    assert.match(postSetupMarkup, /Password created successfully/)
    assert.match(postSetupMarkup, /class="login-submit">Login/)
    const postSetupLogin = renderToStaticMarkup(React.createElement(RoleLoginView, {
      role: 'Student',
      onBack() {},
      onRegister() {},
      onSubmit() {},
    }))
    assert.match(postSetupLogin, /CAMPUS USER ID/)
    assert.match(postSetupLogin, /PASSWORD/)
  } finally {
    await vite.close()
  }
})