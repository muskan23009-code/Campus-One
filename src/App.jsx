import { useEffect, useState } from 'react'
import { ArrowRight, Check, MessageSquarePlus, Sparkles, X } from 'lucide-react'
import Dashboard from './components/Dashboard.jsx'
import LoginView from './components/LoginView.jsx'
import ModuleView from './components/ModuleView.jsx'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import { navigationGroups } from './data/campusData'
import SecureApp from './SecureApp.jsx'

const titles = Object.fromEntries(navigationGroups.flatMap((group) => group.items.map((item) => [item.id, item.label])))
titles.profile = 'My account'

function LegacyDemoApp() {
  const [activePage, setActivePage] = useState('overview')
  const [authenticated, setAuthenticated] = useState(true)
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [adminView, setAdminView] = useState(false)
  const [modal, setModal] = useState('')
  const [noticeText, setNoticeText] = useState('')
  const title = titles[activePage] || 'Overview'

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(''), 3400)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    document.title = `${title} | Campus One`
  }, [title])

  function navigate(page) {
    if (page === 'profile') { setModal('Your student account'); return }
    if (page === 'analytics' && !adminView) setAdminView(true)
    setActivePage(page)
    setMobileNav(false)
  }

  function handleAction(message) {
    if (message.includes('Tell us') || message.includes('new request') || message.includes('suggestion')) {
      setModal('Share with your campus')
      return
    }
    setToast(message)
  }

  function submitFeedback(event) {
    event.preventDefault()
    if (!noticeText.trim()) return
    setModal('')
    setToast('Your message has been sent to the student support team.')
    setNoticeText('')
  }

  return (
    <div className="app-shell">
      {authenticated ? <>
        <Sidebar activePage={activePage} onNavigate={navigate} mobileOpen={mobileNav} onClose={() => setMobileNav(false)} />
        <main className="main-area">
          <TopBar pageTitle={title} onNavigate={navigate} onAction={handleAction} studentView={!adminView} onToggleView={() => { setAdminView(!adminView); setToast(adminView ? 'Student experience is ready.' : 'Campus administrator overview is ready.') }} onMobileMenu={() => setMobileNav(true)} />
          {activePage === 'overview' ? <Dashboard onNavigate={navigate} onAction={handleAction} adminView={adminView} /> : <ModuleView page={activePage} onAction={handleAction} />}
        </main>
      </> : <LoginView onLogin={(role) => { setAdminView(role === 'admin'); setAuthenticated(true); setActivePage('overview'); setToast(`Welcome to your ${role === 'admin' ? 'campus administrator' : 'student'} account.`) }} />}

      {toast && <div className="toast-notice"><span className="toast-icon"><Check size={14} /></span><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}

      {modal && <div className="modal-scrim" onClick={(event) => event.target === event.currentTarget && setModal('')}><section className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="modal-top"><span className={`modal-icon ${modal === 'Your student account' ? 'account-modal-icon' : ''}`}>{modal === 'Your student account' ? <span>AK</span> : <MessageSquarePlus size={19} />}</span><button className="icon-btn" onClick={() => setModal('')} aria-label="Close dialog"><X size={18} /></button></div>{modal === 'Your student account' ? <><span className="section-eyebrow">PURAN MURTI VIDYAPEETH</span><h2 id="dialog-title">Hello, Ananya.</h2><p>Your student account is connected. Keep campus services and updates close at hand.</p><div className="account-information"><span>STUDENT EMAIL</span><strong>ananya.kapoor@student.puranmurti.edu.in</strong><span>PROGRAMME</span><strong>Computer Science · Year 2</strong></div><div className="modal-actions account-actions"><button type="button" className="modal-cancel" onClick={() => { setModal(''); setAuthenticated(false) }}>Sign out</button><button className="module-primary" onClick={() => setModal('')}>Done <Check size={14} /></button></div></> : <><span className="section-eyebrow">WE’RE LISTENING</span><h2 id="dialog-title">{modal}</h2><p>Your message goes directly to the right campus team. You’ll be able to track its progress in Help & feedback.</p><form onSubmit={submitFeedback}><label htmlFor="feedback-message">WHAT WOULD YOU LIKE US TO KNOW?</label><textarea id="feedback-message" value={noticeText} onChange={(event) => setNoticeText(event.target.value)} placeholder="Tell us a little more..." rows={4} required /><div className="modal-actions"><button type="button" className="modal-cancel" onClick={() => setModal('')}>Cancel</button><button className="module-primary" type="submit"><ArrowRight size={14} /> Send message</button></div></form><span className="modal-private"><Sparkles size={12} /> Your message stays with campus support.</span></>}</section></div>}
    </div>
  )
}

export default function App() {
  return <SecureApp />
}