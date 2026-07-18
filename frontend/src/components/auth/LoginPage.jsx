import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../store'
import { authApi } from '../../services/api'
import toast from 'react-hot-toast'

const TERMS_CONTENT = [
  { heading: 'Acceptance of Terms', body: 'By creating an account on Mneva AI, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree, please do not use this service.' },
  { heading: 'Description of Service', body: 'Mneva AI is an autonomous personal assistant platform built by Swostitech Solutions, Bengaluru, India. It connects to third-party services (Gmail, Google Fit, etc.) on your behalf using OAuth 2.0 and performs actions only with your explicit approval or within your configured trust level.' },
  { heading: 'User Accounts', body: 'You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information during registration. You may not share your account or use another person\'s account without permission.' },
  { heading: 'Autonomous Actions & Trust Levels', body: 'Mneva AI operates on a 4-level trust system (L1–L4). At higher trust levels, the AI may take actions autonomously on your behalf. You are solely responsible for reviewing and approving actions. Swostitech Solutions is not liable for outcomes resulting from autonomous actions you have approved.' },
  { heading: 'Third-Party Integrations', body: 'Mneva AI integrates with Google (Gmail, Google Fit, Calendar), Razorpay, and other services. Your use of these integrations is subject to the respective third-party terms of service. We store OAuth tokens securely and never share them with unauthorized parties.' },
  { heading: 'Data & Privacy', body: 'We collect only the data necessary to provide the service. Health data, financial data, and email content are processed on your behalf and stored securely. We do not sell your personal data. See our Privacy Policy for full details.' },
  { heading: 'Prohibited Use', body: 'You may not use Mneva AI for any unlawful purpose, to harass others, to send spam, to attempt unauthorized access to systems, or to violate any applicable law including the Indian IT Act 2000 and DPDP Act 2023.' },
  { heading: 'Termination', body: 'We reserve the right to suspend or terminate your account if you violate these terms. You may delete your account at any time from Settings. Upon deletion, your data will be permanently removed within 30 days.' },
  { heading: 'Limitation of Liability', body: 'Swostitech Solutions provides this service "as is" without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the service.' },
  { heading: 'Governing Law', body: 'These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Bengaluru, Karnataka, India.' },
  { heading: 'Changes to Terms', body: 'We may update these terms from time to time. Continued use of the service after changes constitutes acceptance of the new terms. We will notify you of significant changes via email.' },
  { heading: 'Contact', body: 'For questions about these terms, contact us at legal@swostitechnologies.com · Swostitech Solutions, Bengaluru, Karnataka, India.' },
]

const PRIVACY_CONTENT = [
  { heading: 'Information We Collect', body: 'We collect: (1) Account information — name, email, hashed password. (2) Health data — steps, heart rate, sleep, weight, height synced from Google Fit or entered manually. (3) Financial data — bill status and payment history you choose to connect. (4) Communication data — email metadata and content accessed via Gmail OAuth. (5) Usage data — actions taken, trust level, agent interactions.' },
  { heading: 'How We Use Your Data', body: 'Your data is used exclusively to operate Mneva AI on your behalf — to generate your daily brief, draft email replies, track health trends, and execute approved actions. We do not use your data for advertising or sell it to third parties.' },
  { heading: 'Data Storage & Security', body: 'All data is stored in a PostgreSQL database with encrypted connections. OAuth tokens are stored encrypted in your user preferences. Passwords are hashed using bcrypt (cost factor 12). Action logs are cryptographically signed with SHA-256.' },
  { heading: 'Google API Data', body: 'Mneva AI uses Google APIs (Gmail, Google Fit, Calendar) under OAuth 2.0. Data fetched from Google is used only to provide features you explicitly enable. We comply with Google API Services User Data Policy including the Limited Use requirements.' },
  { heading: 'Data Retention', body: 'Your data is retained as long as your account is active. Health logs, email drafts, and action ledger entries are kept for 12 months by default. You can delete individual entries or your entire account at any time from Settings.' },
  { heading: 'Your Rights (DPDP Act 2023)', body: 'Under India\'s Digital Personal Data Protection Act 2023, you have the right to: access your personal data, correct inaccurate data, erase your data, and withdraw consent. To exercise these rights, contact privacy@swostitechnologies.com.' },
  { heading: 'Cookies & Local Storage', body: 'We use browser localStorage to store your JWT authentication token. We do not use tracking cookies or third-party analytics cookies.' },
  { heading: 'Third-Party Services', body: 'We integrate with Google (OAuth), Resend (email delivery), and Razorpay (payments). Each has their own privacy policy. We share only the minimum data required for each integration to function.' },
  { heading: 'Children\'s Privacy', body: 'Mneva AI is not intended for users under 18 years of age. We do not knowingly collect personal data from minors.' },
  { heading: 'Changes to This Policy', body: 'We may update this Privacy Policy periodically. We will notify you of material changes via email. The date of the last update is shown at the bottom of this document.' },
  { heading: 'Contact Us', body: 'For privacy-related queries: privacy@swostitechnologies.com · Swostitech Solutions, Bengaluru, Karnataka, India · Last updated: July 2026.' },
]

function PolicyModal({ type, onClose }) {
  const isTerms = type === 'terms'
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy'
  const sections = isTerms ? TERMS_CONTENT : PRIVACY_CONTENT
  const icon = isTerms ? '📋' : '🔒'

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      >
        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 620, maxHeight: '85vh', background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 100px rgba(0,0,0,0.7)' }}
        >
          {/* Header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--rim1)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: 'linear-gradient(135deg, rgba(61,139,255,0.06), rgba(155,114,255,0.06))' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#3D8BFF,#9B72FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>Swostitech Solutions · Bengaluru, India · Effective July 2026</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--rim2)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--ink2)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: 'auto', padding: '24px', flex: 1 }}>
            {sections.map((s, i) => (
              <div key={i} style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(61,139,255,0.12)', border: '1px solid rgba(61,139,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--pulse)', flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink1)' }}>{s.heading}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.7, paddingLeft: 30 }}>{s.body}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--rim1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'var(--depth1)' }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink4)' }}>© 2026 Swostitech Solutions. All rights reserved.</span>
            <button className="btn-primary" onClick={onClose} style={{ fontSize: 12, padding: '8px 20px' }}>Got it ✓</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

const inputStyle = {
  width: '100%', background: 'var(--depth3)', border: '1px solid var(--rim2)',
  borderRadius: 10, padding: '11px 14px', fontSize: 13.5, color: 'var(--ink1)',
  outline: 'none', fontFamily: '"Space Grotesk",sans-serif', boxSizing: 'border-box',
  transition: 'border-color 0.15s',
}
const labelStyle = { fontSize: 12, color: 'var(--ink2)', display: 'block', marginBottom: 6, fontWeight: 500 }
const fieldStyle = { marginBottom: 14 }

function PasswordStrength({ password }) {
  if (!password) return null
  const checks = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)]
  const score = checks.filter(Boolean).length
  const colors = ['#ff4560', '#ff4560', '#ffb020', '#3dffa0', '#3dffa0']
  const labels = ['', 'Weak', 'Weak', 'Fair', 'Strong']
  return (
    <div style={{ marginTop: 6, display: 'flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < score ? colors[score] : 'var(--rim2)', transition: 'background 0.2s' }} />
      ))}
      <span style={{ fontSize: 10.5, color: colors[score], marginLeft: 6, minWidth: 36 }}>{labels[score]}</span>
    </div>
  )
}

// OTP input — 6 boxes
function OtpInput({ value, onChange }) {
  const refs = useRef([])
  const digits = (value + '      ').slice(0, 6).split('')

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      const next = value.slice(0, i) + value.slice(i + 1)
      onChange(next)
      if (i > 0) refs.current[i - 1]?.focus()
      return
    }
    if (e.key === 'ArrowLeft' && i > 0) { refs.current[i - 1]?.focus(); return }
    if (e.key === 'ArrowRight' && i < 5) { refs.current[i + 1]?.focus(); return }
    if (!/^\d$/.test(e.key)) return
    const next = value.slice(0, i) + e.key + value.slice(i + 1)
    onChange(next.slice(0, 6))
    if (i < 5) refs.current[i + 1]?.focus()
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted) { onChange(pasted); refs.current[Math.min(pasted.length, 5)]?.focus() }
    e.preventDefault()
  }

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '20px 0' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => refs.current[i] = el}
          type="text" inputMode="numeric" maxLength={1}
          value={d.trim()}
          onChange={() => {}}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          style={{
            width: 46, height: 54, textAlign: 'center', fontSize: 22, fontWeight: 700,
            background: 'var(--depth3)', border: `2px solid ${d.trim() ? 'var(--pulse)' : 'var(--rim2)'}`,
            borderRadius: 12, color: 'var(--ink1)', outline: 'none',
            fontFamily: 'monospace', transition: 'border-color 0.15s',
          }}
        />
      ))}
    </div>
  )
}

export default function LoginPage() {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'verify'
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', agreedToTerms: false })
  const [otp, setOtp] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [devOtp, setDevOtp] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [policyModal, setPolicyModal] = useState(null) // 'terms' | 'privacy' | null
  const { setAuth } = useAuth()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Cooldown timer for resend
  React.useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const submitLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await authApi.login({ email: form.email, password: form.password })
      setAuth(data.user, data.token)
      window.location.href = '/'
      const firstName = data.user?.name?.split(' ')[0] || data.user?.email || 'there'
      toast.success(`Welcome back, ${firstName}!`)
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'email_not_verified') {
        setPendingEmail(form.email)
        setMode('verify')
        toast('Check your email for the verification code.', { icon: '📧' })
      } else {
        toast.error(err.response?.data?.message || err.response?.data?.error || 'Invalid credentials')
      }
    } finally { setLoading(false) }
  }

  const submitRegister = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return }
    if (!form.agreedToTerms) { toast.error('Please agree to the Terms of Service'); return }
    setLoading(true)
    try {
      const data = await authApi.register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        agreedToTerms: 'true',
      })
      setPendingEmail(form.email.trim())
      setMode('verify')
      if (data.devOtp) {
        setDevOtp(data.devOtp)
        setOtp(data.devOtp)
        toast('📋 OTP auto-filled — domain not verified yet', { icon: '⚠️' })
      } else {
        toast.success('Account created! Check your email for the verification code.')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed')
    } finally { setLoading(false) }
  }

  const submitVerify = async (e) => {
    e.preventDefault()
    if (otp.length < 6) { toast.error('Enter the 6-digit code'); return }
    setLoading(true)
    try {
      const data = await authApi.verifyEmail({ email: pendingEmail, otp })
      setAuth(data.user, data.token)
      toast.success(`Welcome to Mneva AI, ${data.user.name.split(' ')[0]}! 🎉`)
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Verification failed')
    } finally { setLoading(false) }
  }

  const resendOtp = async () => {
    if (resendCooldown > 0) return
    try {
      const data = await authApi.resendOtp({ email: pendingEmail })
      setResendCooldown(60)
      if (data.devOtp) {
        setDevOtp(data.devOtp)
        setOtp(data.devOtp)
        toast('📋 New OTP auto-filled', { icon: '⚠️' })
      } else {
        toast.success('New code sent!')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not resend code')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--void)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'hidden', position: 'relative' }}>
      <div className="orb" style={{ width: 600, height: 600, top: '-150px', left: '-100px', background: 'rgba(61,139,255,0.04)' }} />
      <div className="orb" style={{ width: 400, height: 400, bottom: '-100px', right: '0px', background: 'rgba(155,114,255,0.04)' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(61,139,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(61,139,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        style={{ width: '100%', maxWidth: mode === 'register' ? 460 : 420, position: 'relative', zIndex: 10 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg, #3D8BFF, #9B72FF)', boxShadow: '0 0 40px rgba(61,139,255,0.4)', marginBottom: 16, fontWeight: 700, fontSize: 26, color: '#fff', fontFamily: '"Space Grotesk", sans-serif' }}>
            M
          </motion.div>
          <div style={{ fontFamily: '"Space Grotesk"', fontWeight: 700, fontSize: 26 }}>Mneva<span className="grad-text">AI</span></div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Your AI Chief of Staff</div>
        </div>

        <AnimatePresence mode="wait">

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
              <div style={{ background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 20, padding: 36, boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
                <div style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Sign in</h2>
                  <p style={{ fontSize: 13, color: 'var(--ink3)' }}>Your twin is ready.</p>
                </div>
                <form onSubmit={submitLogin}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Email Address</label>
                    <input style={inputStyle} type="email" placeholder="you@example.com" required value={form.email} onChange={e => set('email', e.target.value)} />
                  </div>
                  <div style={{ ...fieldStyle, marginBottom: 24 }}>
                    <label style={labelStyle}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <input style={{ ...inputStyle, paddingRight: 44 }} type={showPass ? 'text' : 'password'} placeholder="••••••••" required value={form.password} onChange={e => set('password', e.target.value)} />
                      <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15, padding: 0 }}>
                        {showPass ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                  <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', padding: '12px', fontSize: 14, marginBottom: 10 }}>
                    {loading ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink3)' }}>
                  No account?{' '}
                  <span onClick={() => setMode('register')} style={{ color: 'var(--pulse2)', cursor: 'pointer', fontWeight: 600 }}>Create one</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── REGISTER ── */}
          {mode === 'register' && (
            <motion.div key="register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div style={{ background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 20, padding: 36, boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
                <div style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Create account</h2>
                  <p style={{ fontSize: 13, color: 'var(--ink3)' }}>Start your autonomous journey.</p>
                </div>
                <form onSubmit={submitRegister}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Full Name <span style={{ color: '#ff4560' }}>*</span></label>
                    <input style={inputStyle} type="text" placeholder="Surya Kanta Behera" required value={form.name} onChange={e => set('name', e.target.value)} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Email Address <span style={{ color: '#ff4560' }}>*</span></label>
                    <input style={inputStyle} type="email" placeholder="you@example.com" required value={form.email} onChange={e => set('email', e.target.value)} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Password <span style={{ color: '#ff4560' }}>*</span></label>
                    <div style={{ position: 'relative' }}>
                      <input style={{ ...inputStyle, paddingRight: 44 }} type={showPass ? 'text' : 'password'} placeholder="Min. 8 characters" required minLength={8} value={form.password} onChange={e => set('password', e.target.value)} />
                      <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15, padding: 0 }}>
                        {showPass ? '🙈' : '👁️'}
                      </button>
                    </div>
                    <PasswordStrength password={form.password} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Confirm Password <span style={{ color: '#ff4560' }}>*</span></label>
                    <div style={{ position: 'relative' }}>
                      <input
                        style={{ ...inputStyle, paddingRight: 44, borderColor: form.confirmPassword && form.confirmPassword !== form.password ? '#ff4560' : undefined }}
                        type={showConfirm ? 'text' : 'password'} placeholder="Re-enter password" required value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
                      />
                      <button type="button" onClick={() => setShowConfirm(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15, padding: 0 }}>
                        {showConfirm ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {form.confirmPassword && form.confirmPassword !== form.password && (
                      <div style={{ fontSize: 11.5, color: '#ff4560', marginTop: 5 }}>Passwords do not match</div>
                    )}
                  </div>

                  {/* Terms checkbox */}
                  <div style={{ marginBottom: 22, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <input
                      id="terms" type="checkbox" checked={form.agreedToTerms} onChange={e => set('agreedToTerms', e.target.checked)}
                      style={{ marginTop: 2, accentColor: 'var(--pulse)', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                    />
                    <label htmlFor="terms" style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5, cursor: 'pointer' }}>
                      I agree to the{' '}
                      <span onClick={e => { e.preventDefault(); setPolicyModal('terms') }} style={{ color: 'var(--pulse2)', textDecoration: 'underline', cursor: 'pointer' }}>Terms of Service</span>
                      {' '}and{' '}
                      <span onClick={e => { e.preventDefault(); setPolicyModal('privacy') }} style={{ color: 'var(--pulse2)', textDecoration: 'underline', cursor: 'pointer' }}>Privacy Policy</span>
                    </label>
                  </div>

                  <button className="btn-primary" type="submit" disabled={loading || !form.agreedToTerms || (form.confirmPassword && form.confirmPassword !== form.password)} style={{ width: '100%', padding: '12px', fontSize: 14, marginBottom: 10 }}>
                    {loading ? 'Creating account…' : 'Create Account →'}
                  </button>
                </form>
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink3)' }}>
                  Already have an account?{' '}
                  <span onClick={() => setMode('login')} style={{ color: 'var(--pulse2)', cursor: 'pointer', fontWeight: 600 }}>Sign in</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── VERIFY OTP ── */}
          {mode === 'verify' && (
            <motion.div key="verify" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <div style={{ background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 20, padding: 36, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📧</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Verify your email</h2>
                <p style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 4 }}>
                  We sent a 6-digit code to
                </p>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--pulse2)', marginBottom: 4 }}>{pendingEmail}</p>
                <p style={{ fontSize: 12, color: 'var(--ink4)', marginBottom: 0 }}>Check your inbox (and spam folder).</p>

                {devOtp && (
                  <div style={{ margin: '12px 0 0', padding: '10px 14px', background: 'rgba(255,176,32,0.08)', border: '1px solid rgba(255,176,32,0.3)', borderRadius: 10, fontSize: 12, color: '#ffb020', textAlign: 'left' }}>
                    ⚠️ <strong>Dev mode</strong> — Resend domain not verified. Your OTP is auto-filled: <strong style={{ fontFamily: 'monospace', letterSpacing: 2 }}>{devOtp}</strong>
                  </div>
                )}

                <form onSubmit={submitVerify}>
                  <OtpInput value={otp} onChange={setOtp} />
                  <button className="btn-primary" type="submit" disabled={loading || otp.length < 6} style={{ width: '100%', padding: '12px', fontSize: 14, marginBottom: 14 }}>
                    {loading ? 'Verifying…' : 'Verify & Continue →'}
                  </button>
                </form>

                <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
                  Didn't receive it?{' '}
                  <span
                    onClick={resendOtp}
                    style={{ color: resendCooldown > 0 ? 'var(--ink4)' : 'var(--pulse2)', cursor: resendCooldown > 0 ? 'default' : 'pointer', fontWeight: 600 }}>
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </span>
                </div>
                <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink4)' }}>
                  <span onClick={() => setMode('register')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>← Back to sign up</span>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--ink4)' }}>
          Swostitech Solutions · India · 2026
        </div>
      </motion.div>

      {policyModal && <PolicyModal type={policyModal} onClose={() => setPolicyModal(null)} />}
    </div>
  )
}
