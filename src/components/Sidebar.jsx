import { useState } from 'react'
import {
  Activity, Bus, Building2, CalendarDays, ChartNoAxesCombined, ChevronDown,
  ChevronLeft, ContactRound, HeartPulse, LayoutDashboard, LibraryBig,
  Map, Megaphone, MessageSquareWarning, PackageSearch, Settings2, ShieldAlert,
  Sparkles, Trophy, UserRoundCheck, UsersRound, Utensils, X,
} from 'lucide-react'
import { navigationGroups } from '../data/campusData'
import { canSeePage } from '../auth/access'

const icons = { LayoutDashboard, Sparkles, Megaphone, Utensils, Map, ContactRound, MessageSquareWarning, Activity, CalendarDays, LibraryBig, Building2, Bus, PackageSearch, ShieldAlert, ChartNoAxesCombined, UsersRound, Settings2, Trophy, UserRoundCheck }

export default function Sidebar({ activePage, onNavigate, mobileOpen, onClose, user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const [campusOpen, setCampusOpen] = useState(false)

  return (
    <>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={onClose} />}
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="brand-row">
          <span className="brand-mark"><span /><span /><span /><span /></span>
          <span className="brand-name">campus<span>one</span></span>
          <button className="icon-btn collapse-btn" aria-label="Collapse sidebar" title="Collapse sidebar" onClick={() => setCollapsed(!collapsed)}><ChevronLeft size={16} /></button>
          <button className="icon-btn mobile-close" aria-label="Close menu" onClick={onClose}><X size={19} /></button>
        </div>

        <button className="campus-select" onClick={() => setCampusOpen(!campusOpen)} aria-expanded={campusOpen}>
          <span className="institution-mark">P</span>
          <span className="campus-info"><strong>Puran Murti Vidyapeeth</strong><small>Sonipat, Haryana</small></span>
          <ChevronDown size={15} className={`campus-chevron ${campusOpen ? 'rotate' : ''}`} />
        </button>
        {campusOpen && <div className="campus-popover"><strong>Your campus</strong><span>Puran Murti Vidyapeeth</span><span>Sonipat, Haryana, India</span></div>}

        <div className="nav-scroll">
          {navigationGroups.filter((group) => !group.roles || group.roles.includes(user.role)).map((group) => <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {group.items.filter((item) => canSeePage(user, item.id)).map((item) => {
                const Icon = icons[item.icon]
                return (
                  <button key={item.id} className={`nav-item ${activePage === item.id ? 'nav-active' : ''} ${item.id === 'emergency' ? 'nav-emergency' : ''}`} onClick={() => onNavigate(item.id)} title={collapsed ? item.label : undefined}>
                    <Icon size={17} strokeWidth={1.8} />
                    <span className="nav-item-label">{item.label}</span>
                    {item.badge && <span className={`nav-badge ${item.badge === 'AI' ? 'ai-badge' : ''}`}>{item.badge}</span>}
                  </button>
                )
              })}
            </div>)}
        </div>

        <div className="sidebar-bottom">
          {canSeePage(user, 'complaints') && <div className="sidebar-support"><div className="support-orbit"><HeartPulse size={17} /></div><div className="support-copy"><strong>Need a hand?</strong><span>We’re here for you.</span></div><button className="support-arrow" aria-label="Open support" onClick={() => onNavigate('complaints')}>↗</button></div>}
          <button className="sidebar-profile" onClick={() => onNavigate('profile')}>
            <span className="profile-avatar">{initials(user.name)}</span><span className="profile-details"><strong>{user.name}</strong><small>{user.role} · {user.id}</small></span><span className="profile-dots">···</span>
          </button>
          <button className="sidebar-signout" onClick={onLogout}>Sign out</button>
        </div>
      </aside>
    </>
  )
}

function initials(name) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }