# Campus One

A responsive campus management experience for Puran Murti Vidyapeeth, built with React and Vite.

## Getting started

Requirements: Node.js 20 or newer.

```sh
npm install
npm run dev
```

Create a production build with `npm run build`; `npm run preview` builds and serves the complete production application, including its API. `npm test` exercises authentication, role permissions, user management, and protected API operations.

## Project structure

- `src/SecureApp.jsx` restores signed server sessions and protects role-specific application routes; `src/App.jsx` mounts it.
- `src/components/` contains the independently composed dashboard, sign-in, feature views, navigation, and global header.
- `src/api/client.js` provides the same-origin API client.
- `src/auth/access.js` drives visible navigation; `server/policy.js` independently validates all permissions on the server.
- `server/app.js` implements account registration, approvals, department scopes, complaints, sports, and campus-data endpoints using the Node HTTP server.
- `server/auth.js` hashes passwords with scrypt and validates signed, HttpOnly, SameSite session cookies.
- `server/store.js` stores account and campus records in an atomic, access-restricted JSON database.
- `src/data/campusData.js` defines campus navigation and fallback service content.
- `src/styles.css` contains the responsive design system and layouts.

## Campus services

The student overview connects to AI Campus Copilot, notice intelligence, campus dining, campus navigation, the service directory, confidential student feedback, sports and wellness, events, the library, hostel, transport, lost and found, and emergency contacts. The responsive campus-insights dashboard also includes a faculty and administrator view.

The opening screen offers Student, Staff, HOD, Sports Captain, and Administration login. Student, Staff, HOD, and Sports Captain registration requests retain their email and contact number and do not collect or store a password; pending applicants cannot sign in or receive an assigned user ID. Administration approves/rejects Staff, HOD, and Sports Captain applications, while each department's HOD reviews only student applications for that department. Approval assigns and permanently reserves IDs transactionally: Students `PM-S1001+`, Staff `PM-ST001+`, HOD `PM-HOD001+`, Sports Captains `PM-SC001+`, and Administration `PM-AD001+`. Approved applicants use their private application reference and one-time setup token to create their own password within seven days. Password setup activates the account and invalidates the token; no initial password is sent by email or SMS.

Administration registration requires a secret configured in the server environment; it is never bundled into the browser or written to the data store. Set `CAMPUS_ADMIN_ACCESS_CODE` to a privately generated value of at least 12 characters before first setup. Start development with `CAMPUS_ADMIN_ACCESS_CODE='<private-value>' npm run dev`. Do not commit the value. Set `CAMPUS_DATA_DIR` to a persistent private directory before production deployment; `.data/` is the default development store and must be backed up securely. Keep at least one active administrator account.

Sessions last eight hours, use an HttpOnly signed cookie, and are invalidated by logout, password changes, and account deactivation. Passwords are scrypt-hashed on the server and are never stored as plain text or returned through the API. Administration can approve access, deactivate accounts, and permanently delete an exact selected account; deleted official IDs remain reserved and historical records are retained. Users create and change their own passwords. HOD student-review endpoints verify the HOD's department on the server. Email and contact details remain in registration records and user profiles for future communication and account-recovery features; they are not used to deliver an initial password. For multi-instance production deployments, replace the JSON store and in-process rate limiter with a shared database, shared session/key management, and centralized rate limiting.

AI responses, live dining occupancy, maps, notifications, and campus service content still require their respective institutional providers. No sports-booking workflow is provided.
