import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { onboardingApi, gmailApi, calendarApi, googleFitApi } from '../../services/api'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'

// ─── Section definitions ────────────────────────────────────────────────────
const PROFILE_SECTIONS = [
  {
    key: 'about',
    icon: '👤',
    title: 'About You',
    pct: '10%',
    purpose: 'Personalization and AI identity.',
    powers: [
      { icon: '👋', label: 'Personalized greetings' },
      { icon: '⏰', label: 'Time-aware reminders' },
      { icon: '📍', label: 'Local recommendations' },
      { icon: '📰', label: 'Regional news' },
      { icon: '🌤️', label: 'Weather' },
      { icon: '💱', label: 'Currency' },
      { icon: '🗓️', label: 'Local holidays' },
    ],
    fields: [
      { name: 'nickname',    label: 'What should MNEVA call you?',        type: 'text',   placeholder: 'e.g. Nivi' },
      { name: 'dateOfBirth', label: 'What is your date of birth?',        type: 'text',   placeholder: 'YYYY-MM-DD' },
      { name: 'gender',      label: 'What is your gender?',               type: 'chips',  single: true, optional: true, options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'] },
      { name: 'country',     label: 'Which country do you live in?',      type: 'text',   placeholder: 'India' },
      { name: 'city',        label: 'Which city do you currently live in?', type: 'text', placeholder: 'Bengaluru' },
      { name: 'language',    label: 'What is your preferred language?',   type: 'text',   placeholder: 'English' },
    ],
  },
  {
    key: 'work',
    icon: '💼',
    title: 'Work & Career',
    pct: '10%',
    purpose: 'Productivity AI.',
    powers: [
      { icon: '✉️', label: 'Email drafting' },
      { icon: '💼', label: 'LinkedIn writing' },
      { icon: '📋', label: 'Meeting preparation' },
      { icon: '🔍', label: 'Follow-up Radar' },
      { icon: '🚀', label: 'Career suggestions' },
    ],
    fields: [
      { name: 'occupation',        label: 'What is your profession?',                    type: 'text',     placeholder: 'Product Manager' },
      { name: 'company',           label: 'Which company do you work for?',              type: 'text',     placeholder: 'Acme Labs' },
      { name: 'industry',          label: 'Which industry do you work in?',              type: 'text',     placeholder: 'Fintech' },
      { name: 'professionalLevel', label: 'Are you a…',                                 type: 'chips',    single: true, options: ['Student', 'Professional', 'Business Owner', 'Freelancer'] },
      { name: 'skills',            label: 'What are your primary skills?',               type: 'textarea', placeholder: 'Product strategy, operations, AI' },
      { name: 'learningTopics',    label: 'What are you currently learning?',            type: 'textarea', placeholder: 'Leadership, design systems' },
      { name: 'careerGoals',       label: 'What are your career goals?',                 type: 'textarea', placeholder: 'Grow into a strategy role' },
    ],
  },
  {
    key: 'interests',
    icon: '❤️',
    title: 'Interests',
    pct: '10%',
    purpose: 'Content and discovery personalization.',
    powers: [
      { icon: '📰', label: 'Personalized News' },
      { icon: '🎵', label: 'Music' },
      { icon: '🎬', label: 'Movies' },
      { icon: '🏆', label: 'Sports' },
      { icon: '🔭', label: 'Discovery' },
    ],
    fields: [
      {
        name: 'interests',
        label: 'Select all that apply',
        type: 'chips',
        options: ['AI', 'Technology', 'Finance', 'Investing', 'Fitness', 'Health', 'Reading', 'Music', 'Movies', 'Sports', 'Travel', 'Photography', 'Cooking', 'Gaming', 'Business', 'Entrepreneurship'],
      },
      {
        name: 'followTopics',
        label: 'Which topics would you like MNEVA to keep you updated on?',
        type: 'chips',
        options: ['AI', 'Technology', 'Finance', 'Investing', 'Fitness', 'Health', 'Reading', 'Music', 'Movies', 'Sports', 'Travel', 'Photography', 'Cooking', 'Gaming', 'Business', 'Entrepreneurship'],
      },
    ],
  },
  {
    key: 'goals',
    icon: '🎯',
    title: 'Goals',
    pct: '10%',
    purpose: 'AI coaching and goal tracking.',
    powers: [
      { icon: '🤖', label: 'AI coaching' },
      { icon: '📊', label: 'Goal tracking' },
      { icon: '📅', label: 'Daily planning' },
    ],
    fields: [
      {
        name: 'goals',
        label: 'What are your current goals? (Choose multiple)',
        type: 'chips',
        options: ['Lose Weight', 'Gain Muscle', 'Improve Sleep', 'Save Money', 'Build Wealth', 'Learn AI', 'Learn Programming', 'Get a Promotion', 'Improve Productivity', 'Reduce Stress', 'Read More Books', 'Travel More'],
      },
      {
        name: 'topGoal',
        label: 'Which goal is your highest priority?',
        type: 'chips',
        single: true,
        options: ['Lose Weight', 'Gain Muscle', 'Improve Sleep', 'Save Money', 'Build Wealth', 'Learn AI', 'Learn Programming', 'Get a Promotion', 'Improve Productivity', 'Reduce Stress', 'Read More Books', 'Travel More'],
      },
    ],
  },
  {
    key: 'lifestyle',
    icon: '📅',
    title: 'Daily Routine',
    pct: '10%',
    purpose: 'Smart scheduling and time-aware AI.',
    powers: [
      { icon: '⏰', label: 'Smart reminders' },
      { icon: '🗓️', label: 'Calendar intelligence' },
      { icon: '🤖', label: 'AI scheduling' },
    ],
    fields: [
      { name: 'wakeTime',          label: 'When do you usually wake up?',                    type: 'time' },
      { name: 'sleepTime',         label: 'When do you usually sleep?',                      type: 'time' },
      { name: 'workingHours',      label: 'What are your working hours?',                    type: 'text',  placeholder: '09:00 - 18:00' },
      { name: 'workMode',          label: 'Do you work remotely?',                           type: 'chips', single: true, options: ['Remote', 'In-Office', 'Hybrid'] },
      { name: 'exerciseFrequency', label: 'How many days do you exercise per week?',         type: 'chips', single: true, options: ['0', '1-2', '3-4', '5+'] },
      { name: 'productiveTime',    label: 'Do you prefer morning or evening productivity?',  type: 'chips', single: true, options: ['Morning', 'Afternoon', 'Evening', 'Night'] },
    ],
  },
  {
    key: 'health',
    icon: '🏥',
    title: 'Health Profile',
    pct: '10%',
    purpose: 'Wellness tracking and health AI.',
    powers: [
      { icon: '📊', label: 'Health Dashboard' },
      { icon: '🥗', label: 'Nutrition' },
      { icon: '🏋️', label: 'Fitness' },
      { icon: '⌚', label: 'Wearables' },
      { icon: '🧘', label: 'Stress' },
      { icon: '😴', label: 'Sleep' },
    ],
    fields: [
      { name: 'height',        label: 'Height',                                                    type: 'text',  placeholder: '172 cm' },
      { name: 'weight',        label: 'Weight',                                                    type: 'text',  placeholder: '68 kg' },
      { name: 'bloodGroup',    label: 'Blood Group',                                               type: 'chips', single: true, options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] },
      { name: 'allergies',     label: 'Allergies',                                                 type: 'text',  placeholder: 'e.g. Peanuts, Dust (or None)' },
      { name: 'medicalConditions', label: 'Medical Conditions', optional: true,                   type: 'text',  placeholder: 'e.g. Diabetes, Hypertension (or None)' },
      { name: 'diet',          label: 'Dietary Preference',                                        type: 'chips', single: true, options: ['Vegetarian', 'Vegan', 'Non-Vegetarian', 'Eggetarian'] },
      { name: 'exerciseLevel', label: 'Exercise Level',                                            type: 'chips', single: true, options: ['Beginner', 'Intermediate', 'Advanced'] },
      { name: 'healthConnect', label: 'Would you like to connect Health Connect or Apple Health?', type: 'chips', single: true, options: ['Yes, connect Health Connect', 'Yes, connect Apple Health', 'Not now'] },
    ],
  },
  {
    key: 'finance',
    icon: '💰',
    title: 'Finance Profile',
    pct: '10%',
    purpose: 'Money monitoring and investment AI.',
    powers: [
      { icon: '🔔', label: 'Bill reminders' },
      { icon: '📈', label: 'Investment monitoring' },
      { icon: '💸', label: 'Forgotten money' },
      { icon: '💡', label: 'Opportunities' },
    ],
    fields: [
      { name: 'financeCountry',      label: 'Which country do you primarily bank in?', type: 'chips', single: true, options: ['India', 'United States', 'United Kingdom', 'UAE', 'Singapore', 'Other'] },
      { name: 'upiApps',             label: 'Which UPI apps do you use?',              type: 'chips', options: ['GPay', 'PhonePe', 'Paytm', 'BHIM', 'Amazon Pay', 'WhatsApp Pay'] },
      { name: 'investmentTypes',     label: 'Do you invest? Select all that apply.',  type: 'chips', options: ['Stocks', 'Mutual Funds', 'SIP', 'Crypto', 'None'] },
      { name: 'investmentPlatforms', label: 'Which investment platforms do you use?', type: 'chips', options: ['Groww', 'Zerodha', 'Angel One', 'Upstox', 'Kite', 'Other'] },
      { name: 'monthlyBudget',       label: 'Monthly budget goal?',                   type: 'text',  placeholder: 'e.g. ₹50,000' },
    ],
  },
  {
    key: 'family',
    icon: '👨‍👩‍👧',
    title: 'Family',
    pct: '10%',
    purpose: 'Family task management and care reminders.',
    powers: [
      { icon: '👨‍👩‍👧', label: 'Family reminders' },
      { icon: '✅', label: 'Shared tasks' },
      { icon: '🐾', label: 'Pet care' },
    ],
    fields: [
      { name: 'familyReminders',      label: 'Do you want MNEVA to help manage family tasks?', type: 'toggle' },
      { name: 'familyMembers',        label: 'Family members (select all that apply)',          type: 'chips',  options: ['Parents', 'Spouse / Partner', 'Children', 'Siblings', 'Pets'], conditional: 'familyReminders' },
      { name: 'schoolReminders',      label: 'School reminders?',                               type: 'toggle', conditional: 'familyReminders' },
      { name: 'medicineReminders',    label: 'Medicine reminders?',                             type: 'toggle', conditional: 'familyReminders' },
      { name: 'vaccinationReminders', label: 'Vaccination reminders?',                          type: 'toggle', conditional: 'familyReminders' },
    ],
  },
  {
    key: 'aiprefs',
    icon: '🤖',
    title: 'AI Preferences',
    pct: '10%',
    purpose: 'Shape the entire AI personality.',
    powers: [
      { icon: '✨', label: 'Entire AI personality' },
    ],
    fields: [
      { name: 'aiPersonality',        label: 'How should MNEVA respond?',              type: 'chips', single: true, options: ['Professional', 'Friendly', 'Coach', 'Mentor', 'Casual'] },
      { name: 'responseLength',       label: 'Answer style',                           type: 'chips', single: true, options: ['Short', 'Medium', 'Detailed'] },
      { name: 'aiVoice',              label: 'Voice',                                  type: 'chips', single: true, options: ['Male', 'Female', 'None'] },
      { name: 'enableMemory',         label: 'Should MNEVA remember conversations?',   type: 'toggle' },
      { name: 'proactiveSuggestions', label: 'Allow proactive suggestions?',           type: 'toggle' },
    ],
  },
]

// ─── All real integrations ───────────────────────────────────────────────────
const ALL_INTEGRATIONS = [
  { id: 'gmail',       icon: '📧', name: 'Gmail',            desc: 'Email drafting, follow-up radar & smart replies',  category: 'Comms' },
  { id: 'calendar',    icon: '📅', name: 'Google Calendar',  desc: 'Smart scheduling, reminders & meeting prep',        category: 'Comms', readOnly: true, note: 'Auto-connects with Gmail' },
  { id: 'googlefit',   icon: '❤️', name: 'Google Fit',       desc: 'Steps, heart rate, sleep & fitness tracking',       category: 'Health' },
  { id: 'zerodha',     icon: '💹', name: 'Zerodha Kite',     desc: 'Stock & trading portfolio monitoring',               category: 'Finance', soon: true },
  { id: 'groww',       icon: '📈', name: 'Groww',            desc: 'Mutual funds & SIP portfolio monitoring',            category: 'Finance', soon: true },
  { id: 'ola',         icon: '🚗', name: 'Ola / Uber',       desc: 'Cab booking with driver & fare estimate',            category: 'Life Ops', soon: true },
  { id: 'swiggy',      icon: '🍛', name: 'Swiggy / Zomato',  desc: 'Food ordering & reorder flows',                     category: 'Life Ops', soon: true },
  { id: 'mygate',      icon: '🏠', name: 'MyGate',           desc: 'Visitor management & delivery approvals',            category: 'Life Ops', soon: true },
  { id: 'pharmeasy',   icon: '💊', name: 'PharmEasy / 1mg',  desc: 'Medicine orders & refill reminders',                 category: 'Health', soon: true },
  { id: 'makemytrip',  icon: '✈️', name: 'MakeMyTrip',       desc: 'Travel bookings & itinerary tracking',               category: 'Life Ops', soon: true },
]

// ─── Per-section fill % (0–100 within section, represents 0–10% of total) ───
function getSectionFillPct(sec, formData) {
  const fields = sec.fields.filter(f => !f.conditional)
  if (!fields.length) return 0
  let filled = 0
  fields.forEach(f => {
    const v = formData[f.name]
    if (f.type === 'toggle') {
      if (v === true) filled += 1  // only count if explicitly turned ON
      return
    }
    if (f.type === 'chips') {
      const val = Array.isArray(v) ? v : (v ? [v] : [])
      if (val.length > 0) filled += 1
      return
    }
    if (typeof v === 'string' && v.trim()) filled += 1
    else if (v && typeof v !== 'string') filled += 1
  })
  return Math.round((filled / fields.length) * 100)
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function parseList(v) {
  if (Array.isArray(v)) return v
  if (!v) return []
  return String(v).split(',').map(i => i.trim()).filter(Boolean)
}

function buildDefaults(profile = {}) {
  const out = {}
  PROFILE_SECTIONS.forEach(sec =>
    sec.fields.forEach(f => {
      const v = profile[f.name]
      if (f.type === 'toggle') out[f.name] = v ?? false
      else if (f.type === 'chips' && f.single) out[f.name] = (v && !Array.isArray(v)) ? v : (Array.isArray(v) ? (v[0] ?? '') : '')
      else if (f.type === 'chips') out[f.name] = Array.isArray(v) ? v : parseList(v)
      else if (f.type === 'textarea') out[f.name] = Array.isArray(v) ? v.join(', ') : (v || '')
      else out[f.name] = v ?? ''
    })
  )
  return out
}

function buildPayload(sec, formData) {
  const out = {}
  sec.fields.forEach(f => {
    const v = formData[f.name]
    if (f.type === 'toggle') out[f.name] = Boolean(v)
    else if (f.type === 'chips' && f.single) out[f.name] = v ?? ''
    else if (f.type === 'chips') out[f.name] = Array.isArray(v) ? v : parseList(v)
    else if (f.type === 'textarea') out[f.name] = typeof v === 'string' ? v : (Array.isArray(v) ? v.join(', ') : '')
    else out[f.name] = v ?? ''
  })
  return out
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const S = {
  input: {
    width: '100%', background: 'var(--depth3)', border: '1px solid var(--rim2)',
    borderRadius: 10, padding: '11px 13px', fontSize: 13.5, color: 'var(--ink1)',
    outline: 'none', fontFamily: '"Space Grotesk",sans-serif', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  label: { fontSize: 12.5, color: 'var(--ink2)', display: 'block', marginBottom: 7, fontWeight: 600 },
  field: { marginBottom: 16 },
}

// ─── Field renderer ──────────────────────────────────────────────────────────
function Field({ field, value, onChange }) {
  if (field.type === 'toggle') {
    const on = Boolean(value)
    return (
      <div style={{ ...S.field, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(61,139,255,0.04)', border: '1px solid rgba(61,139,255,0.14)', borderRadius: 12 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink1)' }}>{field.label}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink4)', marginTop: 3 }}>Tap to toggle</div>
        </div>
        <button type="button" onClick={() => onChange(!on)}
          style={{ width: 46, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, background: on ? 'linear-gradient(135deg,#3D8BFF,#9B72FF)' : 'var(--depth4)', transition: 'background 0.2s' }}>
          <motion.div animate={{ x: on ? 18 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 5, left: 5 }} />
        </button>
      </div>
    )
  }

  if (field.type === 'chips') {
    const isSingle = field.single
    const selected = isSingle ? value : (Array.isArray(value) ? value : [])
    return (
      <div style={S.field}>
        <label style={S.label}>
          {field.label}
          {field.optional && <span style={{ color: 'var(--ink4)', fontWeight: 400, marginLeft: 6 }}>(Optional)</span>}
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {field.options.map(opt => {
            const active = isSingle ? selected === opt : selected.includes(opt)
            return (
              <button key={opt} type="button" onClick={() => {
                if (isSingle) { onChange(opt) }
                else { onChange(active ? selected.filter(x => x !== opt) : [...selected, opt]) }
              }} style={{
                borderRadius: 999, padding: '8px 14px', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                border: active ? '1px solid rgba(61,139,255,0.45)' : '1px solid var(--rim2)',
                background: active ? 'rgba(61,139,255,0.14)' : 'var(--depth3)',
                color: active ? 'var(--pulse2)' : 'var(--ink2)',
              }}>{opt}</button>
            )
          })}
        </div>
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div style={S.field}>
        <label style={S.label}>{field.label}</label>
        <textarea value={value ?? ''} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder} rows={3}
          style={{ ...S.input, resize: 'vertical', minHeight: 88 }} />
      </div>
    )
  }

  return (
    <div style={S.field}>
      <label style={S.label}>{field.label}</label>
      {field.type === 'time' ? (
        <input type="time" value={value ?? ''} onChange={e => onChange(e.target.value)}
          style={{ ...S.input, colorScheme: 'dark' }} />
      ) : (
        <input value={value ?? ''} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder} style={S.input} />
      )}
    </div>
  )
}

// ─── Connected Services card (live status) ──────────────────────────────────
function ConnectionsCard({ saved, onConnectedCountChange }) {
  const [searchParams] = useSearchParams()
  const [gmailStatus,    setGmailStatus]    = useState(null)
  const [fitStatus,      setFitStatus]      = useState(null)
  const [gmailConfig,    setGmailConfig]    = useState(null)
  const [connecting,     setConnecting]     = useState(null)
  const [loadingStatus,  setLoadingStatus]  = useState(true)

  const fetchStatuses = async () => {
    try {
      const [gm, fit, cfg] = await Promise.allSettled([
        gmailApi.status(), googleFitApi.status(), gmailApi.configStatus(),
      ])
      if (gm.status === 'fulfilled')  setGmailStatus(gm.value)
      if (fit.status === 'fulfilled') setFitStatus(fit.value)
      if (cfg.status === 'fulfilled') setGmailConfig(cfg.value)
      // bubble up live count to parent for progress bar
      const count = (gm.value?.connected ? 1 : 0) + (fit.value?.connected ? 1 : 0)
      onConnectedCountChange?.(count)
    } finally { setLoadingStatus(false) }
  }

  useEffect(() => {
    fetchStatuses()
    // handle OAuth redirect back
    const gmailResult    = searchParams.get('gmail')
    const calendarResult = searchParams.get('calendar')
    const errMsg         = searchParams.get('msg')
    if (gmailResult === 'connected')    { toast.success('Gmail connected!');            fetchStatuses() }
    else if (gmailResult === 'error')   { toast.error(errMsg ? decodeURIComponent(errMsg) : 'Gmail connection failed') }
    if (calendarResult === 'connected') { toast.success('Google Calendar connected!'); fetchStatuses() }
    else if (calendarResult === 'error'){ toast.error(errMsg ? decodeURIComponent(errMsg) : 'Calendar connection failed') }
    if (gmailResult || calendarResult || errMsg) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const gmailConnected   = gmailStatus?.connected  || false
  const fitConnected     = fitStatus?.connected    || false
  const gmailConfigured  = gmailConfig?.configured ?? null

  // derive live status for each integration
  const getStatus = (id) => {
    if (id === 'gmail')     return gmailConnected  ? { connected: true,  label: gmailStatus?.email  || 'Connected' } : { connected: false }
    if (id === 'calendar')  return gmailConnected  ? { connected: true,  label: 'Via Gmail' }                        : { connected: false }
    if (id === 'googlefit') return fitConnected    ? { connected: true,  label: fitStatus?.email    || 'Connected' } : { connected: false }
    return { connected: false }
  }

  const handleConnect = async (intg) => {
    if (intg.soon)     { toast('Coming soon — integration in next release 🚀'); return }
    if (intg.readOnly) { toast('Auto-connects when Gmail is connected'); return }
    setConnecting(intg.id)
    try {
      if (intg.id === 'gmail') {
        if (gmailConfig?.configured === false) { toast.error('Gmail OAuth not configured. Add GOOGLE_CLIENT_ID to backend/.env', { duration: 6000 }); return }
        if (gmailConnected) { await gmailApi.disconnect(); toast.success('Gmail disconnected'); await fetchStatuses() }
        else { const { url } = await gmailApi.connect(); window.location.href = url }
      } else if (intg.id === 'googlefit') {
        if (fitConnected) { await googleFitApi.disconnect(); toast.success('Google Fit disconnected'); await fetchStatuses() }
        else { const { url } = await googleFitApi.connect(); window.location.href = url }
      }
    } catch (err) { toast.error(err?.response?.data?.error || err.message || 'Connection failed') }
    finally { setConnecting(null) }
  }

  const connectedCount = ALL_INTEGRATIONS.filter(i => getStatus(i.id).connected).length
  const categories = [...new Set(ALL_INTEGRATIONS.map(i => i.category))]

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, fontSize: 24, background: 'linear-gradient(135deg,rgba(0,227,150,0.2),rgba(61,139,255,0.2))', border: '1px solid rgba(0,227,150,0.25)', display: 'grid', placeItems: 'center' }}>🔗</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink1)' }}>Connected Services</h2>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(61,139,255,0.12)', color: 'var(--pulse2)', border: '1px solid rgba(61,139,255,0.2)' }}>10%</span>
            </div>
            <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--ink3)' }}>
              <span style={{ color: 'var(--ink4)', fontWeight: 600, marginRight: 6 }}>Purpose:</span>
              Each connection unlocks real-time AI capabilities.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saved && (
            <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              style={{ fontSize: 12, color: 'var(--go)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>✓</span> Saved
            </motion.div>
          )}
          <div style={{ padding: '6px 14px', borderRadius: 999, background: connectedCount > 0 ? 'rgba(0,227,150,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${connectedCount > 0 ? 'rgba(0,227,150,0.3)' : 'rgba(255,255,255,0.1)'}`, fontSize: 12, fontWeight: 700, color: connectedCount > 0 ? 'var(--go)' : 'var(--ink3)' }}>
            {connectedCount} / {ALL_INTEGRATIONS.length} connected
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px' }}>
        {/* Integration list */}
        <div style={{ padding: '28px 32px' }}>
          <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--pulse2)', fontWeight: 700, marginBottom: 20 }}>Services</div>
          {loadingStatus ? (
            <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Checking connection status…</div>
          ) : (
            categories.map(cat => (
              <div key={cat} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink4)', marginBottom: 10 }}>{cat}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ALL_INTEGRATIONS.filter(i => i.category === cat).map(intg => {
                    const st = getStatus(intg.id)
                    const isConnecting = connecting === intg.id
                    return (
                      <motion.div key={intg.id} layout
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, border: st.connected ? '1px solid rgba(0,227,150,0.25)' : '1px solid rgba(255,255,255,0.07)', background: st.connected ? 'rgba(0,227,150,0.04)' : 'rgba(255,255,255,0.02)', transition: 'all 0.2s' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, fontSize: 20, background: st.connected ? 'rgba(0,227,150,0.12)' : 'rgba(255,255,255,0.05)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{intg.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink1)', marginBottom: 2 }}>{intg.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.4 }}>
                            {st.connected ? st.label : intg.desc}
                          </div>
                          {intg.readOnly && !st.connected && (
                            <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 3 }}>{intg.note}</div>
                          )}
                        </div>
                        {/* Live status dot */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {st.connected && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div className="anim-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--go)' }} />
                              <span style={{ fontSize: 11, color: 'var(--go)', fontWeight: 700 }}>Live</span>
                            </div>
                          )}
                          {intg.soon ? (
                            <span style={{ fontSize: 11, color: 'var(--ink4)', fontWeight: 600, padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>Soon</span>
                          ) : intg.readOnly ? (
                            <span style={{ fontSize: 11, color: st.connected ? 'var(--go)' : 'var(--ink4)', fontWeight: 600 }}>{st.connected ? '✓ Active' : 'Auto'}</span>
                          ) : (
                            <button onClick={() => handleConnect(intg)} disabled={isConnecting}
                              style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 999, cursor: 'pointer', border: 'none', transition: 'all 0.15s', background: st.connected ? 'rgba(255,82,82,0.1)' : 'rgba(61,139,255,0.15)', color: st.connected ? 'var(--danger)' : 'var(--pulse2)' }}>
                              {isConnecting ? '…' : st.connected ? 'Disconnect' : 'Connect'}
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Powers panel */}
        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(61,139,255,0.02)' }}>
          <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--pulse2)', fontWeight: 700, marginBottom: 4 }}>Powers</div>
          <p style={{ fontSize: 12, color: 'var(--ink4)', margin: '0 0 8px', lineHeight: 1.6 }}>Each connection unlocks:</p>
          {[
            { icon: '📧', label: 'Email AI & smart replies' },
            { icon: '📅', label: 'Calendar intelligence' },
            { icon: '❤️', label: 'Real-time health data' },
            { icon: '💹', label: 'Live portfolio tracking' },
            { icon: '🚗', label: 'Cab & food automation' },
            { icon: '🔔', label: 'Cross-app notifications' },
          ].map((p, i) => (
            <motion.div key={p.label} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ fontSize: 18 }}>{p.icon}</span>
              <span style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>{p.label}</span>
            </motion.div>
          ))}

          {/* Live summary */}
          {!loadingStatus && connectedCount > 0 && (
            <div style={{ marginTop: 8, padding: '14px', borderRadius: 12, background: 'rgba(0,227,150,0.06)', border: '1px solid rgba(0,227,150,0.18)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--go)', marginBottom: 8 }}>✓ Active connections</div>
              {ALL_INTEGRATIONS.filter(i => getStatus(i.id).connected).map(i => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14 }}>{i.icon}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink2)' }}>{i.name}</span>
                  <div className="anim-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--go)', marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Section card ────────────────────────────────────────────────────────────
function SectionCard({ sec, formData, onChange, onSave, saving, saved, fillPct }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}
      style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24, overflow: 'hidden',
      }}>

      {/* Header */}
      <div style={{
        padding: '28px 32px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, fontSize: 24,
            background: 'linear-gradient(135deg,rgba(61,139,255,0.2),rgba(155,114,255,0.2))',
            border: '1px solid rgba(61,139,255,0.25)', display: 'grid', placeItems: 'center',
          }}>{sec.icon}</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink1)' }}>{sec.title}</h2>
              {(() => {
                const sectionShare = (fillPct / 100) * 10  // 0–10
                const label = fillPct === 100
                  ? '10% ✓'
                  : fillPct === 0 ? '0 / 10%'
                  : `${sectionShare.toFixed(1).replace(/\.0$/, '')} / 10%`
                const bg = saved ? 'rgba(0,227,150,0.12)' : fillPct > 0 ? 'rgba(61,139,255,0.12)' : 'rgba(255,255,255,0.06)'
                const color = saved ? 'var(--go)' : fillPct > 0 ? 'var(--pulse2)' : 'var(--ink4)'
                const border = saved ? '1px solid rgba(0,227,150,0.25)' : fillPct > 0 ? '1px solid rgba(61,139,255,0.2)' : '1px solid rgba(255,255,255,0.1)'
                return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color, border }}>{label}</span>
              })()}
            </div>
            <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--ink3)' }}>
              <span style={{ color: 'var(--ink4)', fontWeight: 600, marginRight: 6 }}>Purpose:</span>
              {sec.purpose}
            </p>
          </div>
        </div>
        {saved && (
          <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ fontSize: 12, color: 'var(--go)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>✓</span> Saved
          </motion.div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 0 }}>
        {/* Questions */}
        <div style={{ padding: '28px 32px' }}>
          <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--pulse2)', fontWeight: 700, marginBottom: 20 }}>
            Questions
          </div>
          {sec.fields.map(f => {
            if (f.conditional && !formData[f.conditional]) return null
            return <Field key={f.name} field={f} value={formData[f.name]} onChange={v => onChange(f.name, v)} />
          })}
          <div style={{ marginTop: 8 }}>
            <button className="btn-primary" onClick={() => onSave(sec)} disabled={saving}
              style={{ padding: '12px 28px', fontSize: 13.5 }}>
              {saving ? 'Saving…' : `Save ${sec.title}`}
            </button>
          </div>
        </div>

        {/* Powers panel */}
        <div style={{
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 12,
          background: 'rgba(61,139,255,0.02)',
        }}>
          <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--pulse2)', fontWeight: 700, marginBottom: 4 }}>
            Powers
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink4)', margin: '0 0 8px', lineHeight: 1.6 }}>
            Completing this section unlocks:
          </p>
          {sec.powers.map((p, i) => (
            <motion.div key={p.label} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                borderRadius: 12, background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
              <span style={{ fontSize: 18 }}>{p.icon}</span>
              <span style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>{p.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function AIProfilePage() {
  const [formData, setFormData] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [saved, setSaved] = useState({})
  const [completion, setCompletion] = useState(0)
  const [completedSections, setCompletedSections] = useState([])
  const [connectedCount, setConnectedCount] = useState(0)

  useEffect(() => {
    onboardingApi.profile()
      .then(res => {
        const profile = res?.profile || {}
        setFormData(buildDefaults(profile))
        setCompletion(profile.completionPct || 0)
        const sections = Array.isArray(profile.completedSections) ? profile.completedSections : []
        setCompletedSections(sections)
        const done = {}
        sections.forEach(k => { done[k] = true })
        setSaved(done)
      })
      .catch(() => toast.error('Could not load profile'))
      .finally(() => setLoading(false))

    Promise.allSettled([gmailApi.status(), googleFitApi.status()])
      .then(([gm, fit]) => {
        let count = 0
        if (gm.status  === 'fulfilled' && gm.value?.connected)  count++
        if (fit.status === 'fulfilled' && fit.value?.connected) count++
        setConnectedCount(count)
      })
  }, [])

  const onChange = (name, value) => setFormData(prev => ({ ...prev, [name]: value }))

  const onSave = async (sec) => {
    setSaving(sec.key)
    try {
      const res = await onboardingApi.section(sec.key, buildPayload(sec, formData))
      const newPct = res?.completionPct || 0
      const newSections = Array.isArray(res?.completedSections) ? res.completedSections : completedSections
      setCompletion(newPct)
      setCompletedSections(newSections)
      setSaved(prev => ({ ...prev, [sec.key]: true }))
      toast.success(`${sec.title} saved — profile ${newPct}% complete`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink3)' }}>
        Loading your profile…
      </div>
    )
  }

  const TOTAL_SECTIONS = PROFILE_SECTIONS.length + 1
  const connectionsComplete = connectedCount > 0 ? 1 : 0
  const completedCount = PROFILE_SECTIONS.filter(s => saved[s.key]).length + connectionsComplete
  // live: always use actual fill proportion, saved sections just get green badge
  const liveFillPct = PROFILE_SECTIONS.reduce((acc, sec) => {
    const fill = getSectionFillPct(sec, formData)
    return acc + (fill / 100) * 10
  }, 0)
  const displayPct = Math.min(100, Math.round(liveFillPct + (connectionsComplete * 10)))

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '32px 36px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--pulse2)', fontWeight: 700, marginBottom: 8 }}>
              AI Profile Completion
            </div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: 'var(--ink1)' }}>
              Personalize MNEVA
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink3)' }}>
              The more you share, the smarter your AI Chief of Staff becomes.
            </p>
          </div>

          {/* Completion counter */}
          <div style={{ padding: '18px 24px', borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 38, fontWeight: 900, lineHeight: 1, color: 'var(--ink1)' }}>{displayPct}%</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>Complete</div>
            </div>
            <div style={{ width: 1, height: 44, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: 'var(--pulse2)' }}>{completedCount}/{TOTAL_SECTIONS}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>Sections</div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 20, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)' }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${displayPct}%` }} transition={{ duration: 0.7 }}
            style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#3D8BFF,#10b981)' }} />
        </div>
      </div>

      {/* Section cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {PROFILE_SECTIONS.map(sec => (
          <SectionCard
            key={sec.key}
            sec={sec}
            formData={formData}
            onChange={onChange}
            onSave={onSave}
            saving={saving === sec.key}
            saved={!!saved[sec.key]}
            fillPct={getSectionFillPct(sec, formData)}
          />
        ))}
        {/* Live connections section — always last, counts as 10% */}
        <ConnectionsCard
          saved={connectionsComplete > 0}
          onConnectedCountChange={setConnectedCount}
        />
      </div>
    </div>
  )
}
