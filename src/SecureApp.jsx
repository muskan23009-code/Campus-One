import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, RefreshCw, ShieldAlert, X } from 'lucide-react'
import { api, ApiError } from './api/client'
import { APP_ROLES, ROLE_START_PAGES, canSeePage } from './auth/access'
import { PasswordCreatedView, RegistrationStatus, RegistrationView, RoleChooser, RoleLoginView } from './components/AuthViews.jsx'
import CampusManagement from './components/CampusManagement.jsx'
import ComplaintCenter from './components/ComplaintCenter.jsx'
import Dashboard from './components/Dashboard.jsx'
import DepartmentDashboard from './components/DepartmentDashboard.jsx'
import LostFoundCenter from './components/LostFoundCenter.jsx'
import ModuleView from './components/ModuleView.jsx'
import PasswordChangeView from './components/PasswordChangeView.jsx'
import ProfileDialog from './components/ProfileDialog.jsx'
import Sidebar from './components/Sidebar.jsx'
import SportsManagement from './components/SportsManagement.jsx'
import TopBar from './components/TopBar.jsx'
import AdministrationUsers from './components/AdministrationUsers.jsx'
import { navigationGroups } from './data/campusData'

const titles = Object.fromEntries(navigationGroups.flatMap((group) => group.items.map((item) => [item.id, item.label])))
titles.profile = 'My account'
titles['campus-management'] = 'Campus management'
titles['sports-management'] = 'Sports management'
titles.users = 'User management'
titles['department-requests'] = 'Student registration requests'
titles['department-students'] = 'Department students'
titles.unauthorized = 'Access denied'
titles['not-found'] = 'Page not found'

function requestedPage() {
  const path = window.location.pathname
  if (path === '/unauthorized') return 'unauthorized'
  if (path === '/app' || path === '/app/' || path === '/') return 'overview'
  if (path.startsWith('/app/')) {
    let page
    try { page = decodeURIComponent(path.slice(5).split('/')[0]) } catch { return 'not-found' }
    return titles[page] ? page : 'not-found'
  }
  return 'overview'
}

function pageUrl(page) {
  return page === 'unauthorized' ? '/unauthorized' : `/app/${encodeURIComponent(page)}`
}

export default function SecureApp() {
  const requestedPageRef = useRef(requestedPage())
  const [mode, setMode] = useState('checking')
  const [setupRequired, setSetupRequired] = useState(false)
  const [adminAccessConfigured, setAdminAccessConfigured] = useState(false)
  const [departments, setDepartments] = useState([])
  const [selectedRole, setSelectedRole] = useState(null)
  const [registrationStatus, setRegistrationStatus] = useState(null)
  const [user, setUser] = useState(null)
  const [activePage, setActivePage] = useState('overview')
  const [requestReference, setRequestReference] = useState(() => new URLSearchParams(window.location.search).get('request') || '')
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState('')

  const showToast = useCallback((message) => setToast(message), [])

  const applyRoute = useCallback((page, { replace = false, referenceId = '' } = {}) => {
    if (page === 'profile') { setModal('profile'); return }
    if (user && !canSeePage(user, page)) page = 'unauthorized'
    setRequestReference(referenceId)
    setActivePage(page)
    setMobileNav(false)
    const url = referenceId && ['complaints', 'lost-found'].includes(page)
      ? `${pageUrl(page)}?request=${encodeURIComponent(referenceId)}`
      : referenceId && page === 'users'
      ? `${pageUrl(page)}?view=requests&request=${encodeURIComponent(referenceId)}`
      : referenceId && page === 'department-requests'
        ? `${pageUrl(page)}?request=${encodeURIComponent(referenceId)}`
        : pageUrl(page)
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url)
  }, [user])

  const signOut = useCallback(async () => {
    setError('')
    try {
      await api('/api/auth/logout', { method: 'POST' })
      setUser(null)
      setModal('')
      setMode('roles')
      setActivePage('overview')
      setSelectedRole(null)
      requestedPageRef.current = 'overview'
      window.history.replaceState({}, '', '/')
      showToast('You’ve signed out of your campus account.')
    } catch (reason) { setError(reason.message) }
  }, [showToast])

  useEffect(() => {
    let active = true
    async function restoreSession() {
      setMode('checking')
      setError('')
      try {
        const bootstrap = await api('/api/auth/bootstrap-status')
        if (!active) return
        setSetupRequired(bootstrap.setupRequired)
        setAdminAccessConfigured(bootstrap.adminAccessConfigured)
        setDepartments(bootstrap.departments || [])
        try {
          const result = await api('/api/auth/me')
          if (!active) return
          setUser(result.user)
          const requested = requestedPageRef.current
          const page = result.user.mustChangePassword ? ROLE_START_PAGES[result.user.role] : canSeePage(result.user, requested) ? requested : 'unauthorized'
          setActivePage(page)
          setMode('authenticated')
          window.history.replaceState({}, '', pageUrl(page))
        } catch (reason) {
          if (!active) return
          if (reason instanceof ApiError && reason.status === 401) {
            setUser(null)
            const savedRequest = window.localStorage.getItem('campus-registration-status')
            if (savedRequest) {
              try {
                const saved = JSON.parse(savedRequest)
                if (typeof saved.requestId !== 'string' || typeof saved.requestToken !== 'string') throw new Error('Invalid saved application reference.')
                const status = await api('/api/registrations/status', {
                  method: 'POST',
                  body: { requestId: saved.requestId, requestToken: saved.requestToken },
                })
                if (!active) return
                setRegistrationStatus({ application: status.application, requestToken: saved.requestToken })
                setMode('registration-status')
                return
              } catch {
                window.localStorage.removeItem('campus-registration-status')
              }
            }
            setMode('roles')
          }
          else throw reason
        }
      } catch (reason) {
        if (active) { setError(reason.message); setMode('error') }
      }
    }
    restoreSession()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => { document.title = `${titles[activePage] || 'Campus One'} | Campus One` }, [activePage])

  useEffect(() => {
    if (mode !== 'authenticated') return undefined
    function onPopState() {
      const referenceId = new URLSearchParams(window.location.search).get('request') || ''
      applyRoute(requestedPage(), { replace: true, referenceId })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [applyRoute, mode])

  async function signIn(credentials) {
    setLoading(true)
    setError('')
    setLoginSuccess('')
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: { ...credentials, role: selectedRole } })
      setUser(result.user)
      setMode('authenticated')
      setSetupRequired(false)
      const requested = requestedPageRef.current
      const target = result.user.mustChangePassword ? ROLE_START_PAGES[result.user.role] : canSeePage(result.user, requested) ? requested : 'unauthorized'
      setActivePage(target)
      window.history.replaceState({}, '', pageUrl(target))
      showToast(`Signed in · ${result.user.name} · ${result.user.role}`)
    } catch (reason) { setError(reason.message) } finally { setLoading(false) }
  }

  function acceptCreatedAdministrator(createdUser) {
    setUser(createdUser)
    setSetupRequired(false)
    setMode('authenticated')
    setActivePage('overview')
    window.history.replaceState({}, '', pageUrl('overview'))
    showToast(`Welcome, ${createdUser.name} · Administration · ${createdUser.id}`)
  }

  function acceptRegistration(submission) {
    window.localStorage.setItem('campus-registration-status', JSON.stringify({
      requestId: submission.application.id,
      requestToken: submission.requestToken,
    }))
    setRegistrationStatus(submission)
    setMode('registration-status')
  }

  function acceptPasswordSetup(role) {
    window.localStorage.removeItem('campus-registration-status')
    setRegistrationStatus(null)
    setSelectedRole(role)
    setError('')
    setMode('password-created')
  }

  function handleAction(message) {
    if (message === 'Your student account' || message === 'Your campus account') { setModal('profile'); return }
    if (message.includes('Tell us') || message.includes('new request') || message.includes('suggestion') || message.includes('request')) {
      applyRoute('complaints')
      return
    }
    showToast(message)
  }

  if (mode === 'checking') return <main className="auth-loading"><span className="loading-spinner"/><span>Connecting securely to your campus…</span></main>
  if (mode === 'error') return <main className="auth-loading auth-load-error"><ShieldAlert size={27}/><strong>Campus One is having trouble connecting.</strong><span>{error}</span><button className="module-primary" onClick={() => window.location.reload()}><RefreshCw size={14}/> Try again</button></main>
  if (mode === 'roles') return <RoleChooser onChoose={(role) => { setSelectedRole(role); setError(''); setMode('role-login') }}/>
  if (mode === 'password-created' && selectedRole) return <PasswordCreatedView onLogin={() => { setError(''); setMode('role-login') }}/>
  if (mode === 'role-login' && selectedRole) return <RoleLoginView role={selectedRole} busy={loading} error={error} onBack={() => setMode('roles')} onRegister={() => { setError(''); setMode('register') }} onSubmit={signIn}/>
  if (mode === 'register' && selectedRole) return <RegistrationView role={selectedRole} departments={departments} adminAccessConfigured={adminAccessConfigured} onBack={() => { setError(''); setMode('role-login') }} onAdminCreated={acceptCreatedAdministrator} onSubmitted={acceptRegistration}/>
  if (mode === 'registration-status' && registrationStatus) return <RegistrationStatus status={registrationStatus} onBack={() => { setSelectedRole(null); setMode('roles') }} onPasswordCreated={acceptPasswordSetup}/>
  if (!user) return null

  const title = titles[activePage] || 'Overview'

  return <div className="app-shell">
    {!user.mustChangePassword && <>
      <Sidebar activePage={activePage} user={user} onNavigate={(page) => applyRoute(page)} onLogout={signOut} mobileOpen={mobileNav} onClose={() => setMobileNav(false)}/>
      <main className="main-area">
        <TopBar pageTitle={title} user={user} onNavigate={(page, referenceId) => applyRoute(page, { referenceId })} onAction={handleAction} onMobileMenu={() => setMobileNav(true)}/>
        {activePage === 'overview' && <Dashboard user={user} onNavigate={(page) => applyRoute(page)} onAction={handleAction} adminView={user.role === APP_ROLES.ADMIN}/>}
        {activePage === 'unauthorized' && <AccessNotice onHome={() => applyRoute('overview')} message="Your account doesn’t have permission to open that campus service."/>}
        {activePage === 'not-found' && <AccessNotice onHome={() => applyRoute('overview')} message="That campus page doesn’t exist or is no longer available."/>}
        {activePage === 'users' && user.role === APP_ROLES.ADMIN && <AdministrationUsers currentUser={user} requestId={requestReference} onClearRequest={() => setRequestReference('')} onNotify={showToast}/>}
        {activePage === 'campus-management' && user.role === APP_ROLES.ADMIN && <CampusManagement onNotify={showToast}/>}
        {activePage === 'complaints' && <ComplaintCenter user={user} initialComplaintId={requestReference} onNotify={showToast}/>}
        {activePage === 'lost-found' && <LostFoundCenter user={user} initialReportId={requestReference} onNotify={showToast}/>}
        {activePage === 'sports-management' && [APP_ROLES.SPORTS, APP_ROLES.ADMIN].includes(user.role) && <SportsManagement user={user} onNotify={showToast}/>}
        {['department-requests', 'department-students'].includes(activePage) && user.role === APP_ROLES.HOD && <DepartmentDashboard user={user} page={activePage} requestId={requestReference} onClearRequest={() => setRequestReference('')} onNotify={showToast}/>}
        {titles[activePage] && !['overview', 'complaints', 'lost-found', 'users', 'campus-management', 'sports-management', 'department-requests', 'department-students', 'unauthorized', 'not-found'].includes(activePage) && <ModuleView page={activePage} user={user} onAction={handleAction}/>}
      </main>
    </>}
    {user.mustChangePassword && <PasswordChangeView user={user} onChanged={(updatedUser) => { setUser(updatedUser); setActivePage(ROLE_START_PAGES[updatedUser.role]); window.history.replaceState({}, '', pageUrl(ROLE_START_PAGES[updatedUser.role])); showToast('Your password is set. Welcome to Campus One.') }}/>}
    {error && <div className="toast-notice toast-error"><span className="toast-icon"><ShieldAlert size={14}/></span><span>{error}</span><button aria-label="Dismiss notification" onClick={() => setError('')}><X size={14}/></button></div>}
    {toast && <div className="toast-notice"><span className="toast-icon"><Check size={14}/></span><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14}/></button></div>}
    {modal === 'profile' && <ProfileDialog user={user} onClose={() => setModal('')} onLogout={signOut} onUserChange={setUser} onNotify={showToast}/>}
  </div>
}

function AccessNotice({ message, onHome }) {
  return <div className="access-notice-page page-enter"><span className="access-notice-icon"><ShieldAlert size={22}/></span><span className="section-eyebrow">YOUR CAMPUS ACCOUNT</span><h1>That door is closed.</h1><p>{message}</p><button className="module-primary" onClick={onHome}>Back to your dashboard <ArrowRight size={14}/></button></div>
}