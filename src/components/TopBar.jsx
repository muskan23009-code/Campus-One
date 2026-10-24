import { useEffect, useRef, useState } from 'react'
import { Bell, Check, ChevronRight, Command, Menu, Search, X } from 'lucide-react'
import { canSeePage } from '../auth/access'
import { api } from '../api/client'

export default function TopBar({ pageTitle, onNavigate, onAction, user, onMobileMenu }) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const searchRef = useRef(null)
  const choices = [
    ['copilot', 'Ask AI Campus Copilot'], ['notices', 'Latest campus notices'],
    ['food', 'Food & dining'], ['navigation', 'Campus map'],
    ['directory', 'People & campus directory'], ['complaints', 'Complaint & Issue Tracker'],
    ['sports', 'Sports & wellness'], ['events', 'Events & clubs'],
    ['hostel', 'Hostel services'], ['lost-found', 'Lost & Found'],
    ['emergency', 'Emergency contacts'], ['analytics', 'Campus insights'],
    ['department-requests', 'Student registration requests'],
    ['department-students', 'Department students'],
    ['sports-management', 'Sports Management'],
  ]

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        setSearchOpen(true)
      }
      if (event.key === 'Escape') { setSearchOpen(false); setNotificationsOpen(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    let active = true
    async function refreshNotifications() {
      try {
        const result = await api('/api/notifications')
        if (active) { setNotifications(result.notifications); setUnreadCount(result.unreadCount) }
      } catch { /* Notification availability must not block the authenticated dashboard. */ }
    }
    refreshNotifications()
    const interval = window.setInterval(refreshNotifications, 4000)
    const onFocus = () => refreshNotifications()
    window.addEventListener('focus', onFocus)
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [])

  const results = choices.filter(([id, label]) => canSeePage(user, id) && label.toLowerCase().includes(query.toLowerCase())).slice(0, 5)

  async function markAllRead() {
    try {
      await api('/api/notifications/read-all', { method: 'POST' })
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })))
      setUnreadCount(0)
    } catch { /* The next refresh restores the authoritative notification state. */ }
  }

  async function openNotification(notification) {
    if (!notification.readAt) {
      try {
        const result = await api(`/api/notifications/${encodeURIComponent(notification.id)}`, { method: 'PATCH' })
        setNotifications((current) => current.map((item) => item.id === notification.id ? result.notification : item))
        setUnreadCount((current) => Math.max(0, current - 1))
      } catch { /* Continue to the role-protected destination. */ }
    }
    setNotificationsOpen(false)
    if (notification.target && canSeePage(user, notification.target)) onNavigate(notification.target, notification.referenceId)
  }

  return (
    <header className="topbar">
      <button className="icon-btn topbar-mobile-toggle" aria-label="Open navigation" onClick={onMobileMenu}><Menu size={20} /></button>
      <div className="breadcrumb"><span>Campus</span><ChevronRight size={13} /><strong>{pageTitle}</strong></div>
      <div className="topbar-actions">
        <div className={`search-wrap ${searchOpen ? 'search-focused' : ''}`}>
          <Search size={16} className="search-icon" />
          <input ref={searchRef} aria-label="Search campus" placeholder="Search anything..." value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true) }} />
          {query ? <button className="search-clear" aria-label="Clear search" onClick={() => { setQuery(''); searchRef.current?.focus() }}><X size={14} /></button> : <span className="shortcut"><Command size={11} /> K</span>}
          {searchOpen && query && <div className="search-results"><span className="popover-label">CAMPUS & SERVICES</span>{results.length ? results.map(([id, label]) => <button key={id} onClick={() => { onNavigate(id); setQuery(''); setSearchOpen(false); searchRef.current?.blur() }}><Search size={14} /><span>{label}</span><ChevronRight size={13} /></button>) : <p>No campus results for “{query}”.</p>}</div>}
        </div>
        <span className={`topbar-role-tag ${user.role === 'Administration' ? 'topbar-role-admin' : ''}`}>{user.role}</span>
        <div className="notification-wrap">
          <button className={`topbar-icon notification-button ${unreadCount ? 'has-unread' : ''}`} aria-label={`${unreadCount} unread notifications`} title={`${unreadCount} unread notifications`} onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={18} />{unreadCount > 0 && <span className="notification-count-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>
          {notificationsOpen && <div className="notification-popover"><div className="notification-heading"><div><strong>Notifications</strong><span>{unreadCount ? `${unreadCount} unread · ` : ''}Campus account updates</span></div>{unreadCount > 0 && <button className="mark-read" onClick={markAllRead}><Check size={13} /> Mark all read</button>}</div>{notifications.length ? notifications.map((notification) => <button className={`notification-card ${notification.readAt ? 'notification-read' : ''}`} key={notification.id} onClick={() => openNotification(notification)}><span className={`notification-card-icon ${notification.readAt ? 'notice-icon-green' : 'notice-icon-amber'}`}>{notification.readAt ? <Check size={15} /> : <Bell size={15} />}</span><span><strong>{notification.title}</strong><span>{notification.message}</span><small>{new Date(notification.createdAt).toLocaleString()}</small><span className="notification-view-link">VIEW REQUEST <ChevronRight size={12}/></span></span><ChevronRight size={14}/></button>) : <div className="notification-empty">You’re all caught up. New campus updates appear here.</div>}</div>}
        </div>
        <button className="topbar-avatar" aria-label="Your account" title={`${user.name} · ${user.id}`} onClick={() => onAction('Your student account')}><span>{initials(user.name)}</span></button>
      </div>
      {searchOpen && <button className="search-outside" aria-label="Close search" onClick={() => setSearchOpen(false)} />}
    </header>
  )
}

function initials(name) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }