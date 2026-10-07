# Campus One

A responsive campus management experience for Puran Murti Vidyapeeth, built with React and Vite.

## Getting started

Requirements: Node.js 20.12 or newer.

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
- `server/app.js` implements account registration, approvals, department scopes, complaints, sports, the Canteen menu/order APIs, and campus-data endpoints using the Node HTTP server.
- `server/auth.js` hashes passwords with scrypt and validates signed, HttpOnly, SameSite session cookies.
- `server/store.js` stores account and campus records in an atomic, access-restricted JSON database.
- `src/data/campusData.js` defines campus navigation and fallback service content.
- `src/styles.css` contains the responsive design system and layouts.

## Campus services

The student overview connects to AI Campus Copilot, notice intelligence, campus dining, campus navigation, the service directory, confidential student feedback, sports and wellness, events, the library, hostel, transport, lost and found, and emergency contacts. The responsive campus-insights dashboard also includes a faculty and administrator view.

Sports uses the existing persistent Campus One store and authenticated notification system. Students, Staff, HODs, and Sports Captains can browse sports, apply for eligible events and trials, review their own applications, and view selected sports. Applications progress from APPLIED to SHORTLISTED and then SELECTED or REJECTED; active sports participation records created by selection are the source of truth for private sport-specific teams, schedules, results, achievements, attendance, and notices. Students and Sports Captains can view only their own attendance and applications. Sports Captains and Administration manage sports and selections, while the backend restricts management APIs to those roles. Canteen Staff receive no Sports access. Team rosters link to existing active Student or Sports Captain accounts, while events and historical records remain stored when teams are deactivated or archived. Sports notifications use the existing notification system and can target all basic Sports users, active members of a sport, a team, event applicants, or selected/active participants. This feature does not reserve venues.

The opening screen offers Student, Staff, HOD, Sports Captain, Canteen Staff, and Administration login. Student, Staff, HOD, Sports Captain, and Canteen Staff registration requests retain their email and contact number and do not collect or store a password; pending applicants cannot sign in or receive an assigned user ID. Administration approves/rejects Staff, HOD, Sports Captain, and Canteen Staff applications, while each department's HOD reviews only student applications for that department. Approval assigns and permanently reserves IDs transactionally: Students `PM-S1001+`, Staff `PM-ST001+`, HOD `PM-HOD001+`, Sports Captains `PM-SC001+`, Canteen Staff `PM-CS001+`, and Administration `PM-AD001+`. Approved applicants use their private application reference and one-time setup token to create their own password within seven days. Password setup activates the account and invalidates the token; no initial password is sent by email or SMS.

Administration registration requires a secret configured in the server environment; it is never bundled into the browser or written to the data store. Set `CAMPUS_ADMIN_ACCESS_CODE` to a privately generated value of at least 12 characters before first setup. For local or Codespaces development, put it in the ignored project-root `.env.local` file (or `.env`); the server loads `.env.local` before `.env` at startup, while values already provided by the process environment take precedence. Do not commit either file or the value. Restart the server after changing a local env file. Set `CAMPUS_DATA_DIR` to a persistent private directory before production deployment; `.data/` is the default development store and must be backed up securely. Keep at least one active administrator account.

The authenticated Complaints & Issues section supports the five original campus roles. Complaints, immutable activity entries, and notification records use the existing private Campus One store; uploaded PNG, JPEG, and WebP photos (up to 1 MB) are stored as owner-only files under `CAMPUS_DATA_DIR/complaint-photos/` and served only after complaint-level authorization. Administration can manage all complaints, HODs and Staff are scoped to their department (Staff can also manage complaints assigned to them), and Sports Captains can manage Sports-category complaints. Students can submit and track only their own complaints.

The standalone Canteen section uses the same private persistent store and notification records. The supplied Puran Murti Vidyapeeth menu is initialized into persistent menu records on first access, including separate Half and Full variants where provided. Students, Staff, HODs, Sports Captains, and Administration use the customer experience to browse, filter, cart, pre-order, and track only their own orders; Administration has no Canteen management dashboard or order-management permissions. Only approved Canteen Staff manage menu items, availability, prices, and order status, and can view every customer order. Canteen Staff are authorized only for Canteen APIs (plus session/password and existing notification APIs); unrelated Campus One APIs are rejected server-side.

The standalone Lost & Found section is available to all five roles and uses persistent report, claim, and activity records in the same private store. It supports lost/found reporting, protected item photos, search and filters, possible-match notifications, private claim details, and append-only review/history. Administration and Staff can manage all reports, HODs can manage reports from their own department, and Sports Captains can manage sports-equipment reports. Private claim details and additional report details are returned only to the claimant, report owner, and authorized managers.

Sessions last eight hours, use an HttpOnly signed cookie, and are invalidated by logout, password changes, and account deactivation. Passwords are scrypt-hashed on the server and are never stored as plain text or returned through the API. Administration can approve access, deactivate accounts, and permanently delete an exact selected account; deleted official IDs remain reserved and historical records are retained. Users create and change their own passwords. HOD student-review endpoints verify the HOD's department on the server. Email and contact details remain in registration records and user profiles for future communication and account-recovery features; they are not used to deliver an initial password. For multi-instance production deployments, replace the JSON store and in-process rate limiter with a shared database, shared session/key management, and centralized rate limiting.

AI responses, live dining occupancy, maps, notifications, and campus service content still require their respective institutional providers. No sports-booking workflow is provided.
