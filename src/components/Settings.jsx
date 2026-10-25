import { Building2, Layers3, PanelsTopLeft, SlidersHorizontal, UsersRound } from 'lucide-react'
import packageJson from '../../package.json'

const densityOptions = [
  { value: 'comfortable', label: 'Comfortable', description: 'Normal spacing, larger cards and easier reading.' },
  { value: 'compact', label: 'Compact', description: 'Reduced spacing and more information visible on screen.' },
]

export default function Settings({ density, onDensityChange }) {
  return (
    <div className="module-page settings-page page-enter">
      <div className="module-breadcrumb">CAMPUS <span>›</span> PREFERENCES</div>
      <section className="module-hero">
        <div className="module-title-area">
          <span className="module-icon settings-module-icon"><SlidersHorizontal size={19}/></span>
          <span className="module-eyebrow">YOUR CAMPUS, YOUR WAY</span>
          <h1>Settings<span className="module-title-period">.</span></h1>
          <p>Personalize how Campus One feels and learn more about the platform.</p>
        </div>
      </section>

      <div className="settings-layout">
        <section className="settings-panel settings-appearance" aria-labelledby="appearance-title">
          <div className="settings-panel-heading">
            <span className="settings-panel-icon settings-appearance-icon"><Layers3 size={17}/></span>
            <div>
              <span className="section-eyebrow">DISPLAY</span>
              <h2 id="appearance-title">Appearance</h2>
            </div>
          </div>
          <fieldset className="density-setting">
            <legend>Layout Density</legend>
            <div className="density-options" role="radiogroup" aria-label="Layout density">
              {densityOptions.map((option) => (
                <label
                  className={`density-option${density === option.value ? ' density-option-selected' : ''}`}
                  key={option.value}
                >
                  <span className="density-option-top"><strong>{option.label}</strong><span className="density-radio" aria-hidden="true"><input type="radio" name="layout-density" value={option.value} checked={density === option.value} onChange={() => onDensityChange(option.value)}/></span></span>
                  <span className="density-option-description">{option.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="settings-panel settings-about" aria-labelledby="about-title">
          <div className="about-brand-block">
            <span className="about-brand-icon"><PanelsTopLeft size={22}/></span>
            <div>
              <span className="about-kicker">SMART CAMPUS MANAGEMENT PLATFORM</span>
              <h2 id="about-title">Campus One</h2>
            </div>
          </div>
          <p className="about-description">A unified digital campus platform connecting students, faculty, campus services, activities and communication in one place.</p>
          <div className="about-details">
            <div className="about-detail"><span className="about-detail-icon about-icon-teal"><Building2 size={15}/></span><span><small>INSTITUTION</small><strong>Puran Murti Vidyapeeth</strong></span></div>
            <div className="about-detail"><span className="about-detail-icon about-icon-purple"><UsersRound size={15}/></span><span><small>TEAM</small><strong>THE SUQADNEX</strong></span></div>
            <div className="about-detail"><span className="about-detail-icon about-icon-gold"><Layers3 size={15}/></span><span><small>APPLICATION VERSION</small><strong>v{packageJson.version}</strong></span></div>
          </div>
        </section>
      </div>

      <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Campus services available</span><span>Campus One · Puran Murti Vidyapeeth</span></footer>
    </div>
  )
}