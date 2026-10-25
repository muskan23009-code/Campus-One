import { useEffect, useRef, useState } from 'react'
import {
  BadgeCheck, BriefcaseBusiness, CalendarDays, Camera, CircleAlert,
  GraduationCap, IdCard, KeyRound, LockKeyhole, Mail, Phone, Save, ShieldCheck,
  UserRound, UsersRound, X,
} from 'lucide-react'
import { api } from '../api/client'
import { isStudentExperienceRole } from '../auth/access'

export default function ProfilePage({ user, onUserChange, onNotify }) {
  const [profile, setProfile] = useState(user)
  const [mobile, setMobile] = useState(user.mobile || '')
  const [photo, setPhoto] = useState(user.profilePhoto || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const fileInput = useRef(null)

  useEffect(() => {
    let active = true
    api('/api/auth/profile').then((result) => {
      if (!active) return
      setProfile(result.user)
      setMobile(result.user.mobile || '')
      setPhoto(result.user.profilePhoto || '')
      onUserChange(result.user)
    }).catch((reason) => {
      if (active) setProfileError(reason.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [onUserChange])

  function choosePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setPhotoError('')
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) {
      setPhotoError('Choose a PNG, JPEG, or WebP image under 1 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPhoto(String(reader.result))
    reader.onerror = () => setPhotoError('The selected image could not be read. Please try another file.')
    reader.readAsDataURL(file)
  }

  async function saveProfile(event) {
    event.preventDefault()
    setSavingProfile(true)
    setProfileError('')
    try {
      const result = await api('/api/auth/profile', { method: 'PATCH', body: { mobile, profilePhoto: photo } })
      setProfile(result.user)
      setMobile(result.user.mobile || '')
      setPhoto(result.user.profilePhoto || '')
      onUserChange(result.user)
      onNotify('Your profile has been updated.')
    } catch (reason) {
      setProfileError(reason.message)
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePassword(event) {
    event.preventDefault()
    setPasswordError('')
    if (newPassword !== confirmation) {
      setPasswordError('The new passwords do not match.')
      return
    }
    setChangingPassword(true)
    try {
      const result = await api('/api/auth/password', {
        method: 'POST',
        body: { currentPassword, newPassword, confirmNewPassword: confirmation },
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      setProfile(result.user)
      onUserChange(result.user)
      onNotify('Your password has been changed successfully.')
    } catch (reason) {
      setPasswordError(reason.message)
    } finally {
      setChangingPassword(false)
    }
  }

  const initials = (profile.name || '').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const studentExperience = isStudentExperienceRole(profile.role)
  const idLabel = studentExperience ? 'User ID' : 'Employee / User ID'
  const details = [
    { label: idLabel, value: profile.id, Icon: IdCard },
    ...(studentExperience && profile.rollNumber ? [{ label: 'Student ID', value: profile.rollNumber, Icon: GraduationCap }] : []),
    ...(profile.department ? [{ label: 'Department', value: profile.department, Icon: UsersRound }] : []),
    ...(profile.email ? [{ label: 'Email', value: profile.email, Icon: Mail }] : []),
    ...(profile.mobile ? [{ label: 'Phone', value: profile.mobile, Icon: Phone }] : []),
    ...(profile.designation ? [{ label: 'Designation', value: profile.designation, Icon: BriefcaseBusiness }] : []),
    ...(profile.course ? [{ label: 'Course', value: profile.course, Icon: GraduationCap }] : []),
    ...(profile.semester ? [{ label: 'Semester', value: profile.semester, Icon: CalendarDays }] : []),
    ...(profile.admissionYear ? [{ label: 'Admission year', value: profile.admissionYear, Icon: CalendarDays }] : []),
    ...(profile.joiningYear ? [{ label: 'Joining year', value: profile.joiningYear, Icon: CalendarDays }] : []),
    ...(profile.sport ? [{ label: 'Sport', value: profile.sport, Icon: BadgeCheck }] : []),
    ...(profile.teamCategory ? [{ label: 'Team / category', value: profile.teamCategory, Icon: BadgeCheck }] : []),
  ]

  return <section className="profile-page page-enter">
    <header className="profile-page-heading">
      <div>
        <span className="profile-eyebrow"><ShieldCheck size={14}/> CAMPUS IDENTITY</span>
        <h1>My Profile</h1>
        <p>Manage your personal information and account security</p>
      </div>
    </header>

    <section className="profile-identity-card" aria-label="Campus identity card">
      <div className="profile-identity-glow"/>
      <div className="profile-identity-content">
        <div className="profile-identity-avatar">
          {photo ? <img src={photo} alt={`${profile.name}'s profile`} /> : <span>{initials || <UserRound size={34}/>}</span>}
        </div>
        <div className="profile-identity-copy">
          <span className="profile-identity-label">CAMPUS IDENTITY</span>
          <h2>{profile.name}</h2>
          <div className="profile-identity-meta">
            <span className={`profile-role-badge profile-role-${roleClass(profile.role)}`}>{profile.role}</span>
            {profile.department && <span className="profile-identity-department">{profile.department}</span>}
          </div>
          <span className="profile-identity-id"><IdCard size={14}/>{studentExperience && profile.rollNumber ? profile.rollNumber : profile.id}</span>
        </div>
        <span className="profile-seal"><ShieldCheck size={22}/><small>VERIFIED<br/>ACCOUNT</small></span>
      </div>
    </section>

    {profileError && <p className="profile-alert" role="alert"><CircleAlert size={16}/>{profileError}</p>}
    {loading && <p className="profile-loading">Refreshing your account details…</p>}

    <div className="profile-content-grid">
      <section className="profile-panel profile-personal-panel">
        <div className="profile-panel-heading">
          <span className="profile-panel-icon profile-icon-blue"><UserRound size={18}/></span>
          <div><h2>Personal Information</h2><p>Your details associated with this campus account</p></div>
        </div>
        <div className="profile-detail-grid">
          {details.map(({ label, value, Icon }) => <article className="profile-detail" key={label}>
            <span className="profile-detail-icon"><Icon size={16}/></span>
            <span className="profile-detail-copy"><small>{label}</small><strong>{value}</strong></span>
          </article>)}
        </div>
        <form className="profile-edit-form" onSubmit={saveProfile}>
          <div className="profile-edit-heading"><Camera size={16}/><strong>Edit permitted details</strong></div>
          <label htmlFor="profile-phone">Phone number</label>
          <input id="profile-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={24} value={mobile} onChange={(event) => setMobile(event.target.value)} required/>
          <div className="profile-photo-edit">
            <div>
              <strong>Profile photo</strong>
              <span>PNG, JPEG, or WebP · under 1 MB</span>
            </div>
            <div className="profile-photo-actions">
              <button type="button" className="profile-secondary-button" onClick={() => fileInput.current?.click()}><Camera size={15}/>Choose photo</button>
              {photo && <button type="button" className="profile-remove-photo" onClick={() => { setPhoto(''); setPhotoError('') }} aria-label="Remove profile photo"><X size={15}/></button>}
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={choosePhoto} hidden/>
            </div>
          </div>
          {photoError && <p className="profile-form-error" role="alert">{photoError}</p>}
          <p className="profile-protected-note"><LockKeyhole size={14}/>Your ID, role, department, and email are protected and cannot be changed here.</p>
          <button className="profile-save-button" type="submit" disabled={savingProfile || loading}><Save size={16}/>{savingProfile ? 'Saving…' : 'Save personal details'}</button>
        </form>
      </section>

      <div className="profile-side-panels">
        <section className="profile-panel profile-account-panel">
          <div className="profile-panel-heading">
            <span className="profile-panel-icon profile-icon-gold"><BadgeCheck size={18}/></span>
            <div><h2>Account Information</h2><p>Campus access and account status</p></div>
          </div>
          <div className="profile-account-row"><span>Role</span><strong>{profile.role}</strong></div>
          {profile.department && <div className="profile-account-row"><span>Department</span><strong>{profile.department}</strong></div>}
          <div className="profile-account-row"><span>Account status</span><strong className={profile.active ? 'profile-status-active' : 'profile-status-inactive'}><i/>{profile.active ? 'Active' : 'Inactive'}</strong></div>
          {profile.createdAt && <div className="profile-account-row"><span>Member since</span><strong>{new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</strong></div>}
        </section>

        <section className="profile-panel profile-security-panel">
          <div className="profile-panel-heading">
            <span className="profile-panel-icon profile-icon-purple"><KeyRound size={18}/></span>
            <div><h2>Security &amp; Password</h2><p>Keep your account secure with a private password</p></div>
          </div>
          <form className="profile-password-form" onSubmit={changePassword}>
            <label htmlFor="profile-current-password">Current Password</label>
            <input id="profile-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required/>
            <label htmlFor="profile-new-password">New Password</label>
            <input id="profile-new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 12 characters" required/>
            <label htmlFor="profile-confirm-password">Confirm New Password</label>
            <input id="profile-confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required/>
            {passwordError && <p className="profile-form-error" role="alert"><CircleAlert size={14}/>{passwordError}</p>}
            <p className="profile-password-note"><LockKeyhole size={14}/>Your password is securely encrypted and never shown here.</p>
            <button className="profile-password-button" type="submit" disabled={changingPassword}><KeyRound size={16}/>{changingPassword ? 'Updating password…' : 'Update password'}</button>
          </form>
        </section>
      </div>
    </div>
  </section>
}

function roleClass(role) {
  return ({ Student: 'student', Staff: 'staff', HOD: 'hod', Administration: 'admin', 'Sports Captain': 'sports', 'Canteen Staff': 'canteen' })[role] || 'default'
}
