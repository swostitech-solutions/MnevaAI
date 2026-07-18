import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useAuth, useOnboarding } from '../../store'
import AvatarPic from '../common/AvatarPic'
import { preferenceApi, trustApi, gmailApi, calendarApi, googleFitApi, contactsApi } from '../../services/api'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }

const TRUST_LEVELS = [
  { level: 1, name: 'Observe',      desc: 'Monitor & surface insights silently',   color: 'var(--ink3)',   sub: 'Read-only mode' },
  { level: 2, name: 'Suggest',      desc: 'Surface recommendations, draft actions', color: 'var(--pulse2)', sub: 'Approval required' },
  { level: 3, name: 'Draft & Prep', desc: 'Prepare actions awaiting one-tap OK',   color: 'var(--go)',     sub: 'Near-autonomous' },
  { level: 4, name: 'Inner Circle', desc: 'Execute goals autonomously',            color: 'var(--warn)',   sub: 'Full autonomy' },
]

const AUTONOMY_SECTIONS = [
  {
    title: 'Finance & Payments',
    items: [
      { key: 'utility_autopay', icon: '💡', name: 'Utility Bill Autopay',     desc: 'Auto-pay bills under ₹5,000 without asking', on: true  },
      { key: 'sip_auto',        icon: '📈', name: 'SIP / Investment Actions', desc: 'Always requires biometric — cannot be automated', on: false, locked: true },
      { key: 'cc_min',          icon: '💳', name: 'Credit Card Min Pay',      desc: 'Auto-pay minimum due on credit cards', on: true  },
    ]
  },
  {
    title: 'Daily Life',
    items: [
      { key: 'cab_auto',     icon: '🚗', name: 'Cab Booking',         desc: 'Book usual routes at set times automatically', on: true },
      { key: 'food_reorder', icon: '🍛', name: 'Food Reorder',        desc: 'Reorder frequent meals on cue',               on: true },
      { key: 'mygate',       icon: '🏠', name: 'MyGate Auto-approve', desc: 'Auto-approve verified delivery partners',      on: true },
    ]
  },
  {
    title: 'Communications',
    items: [
      { key: 'email_archive',  icon: '📧', name: 'Auto-Archive Newsletters', desc: 'Keep inbox clean automatically',       on: true },
      { key: 'draft_replies',  icon: '✉️', name: 'Draft Replies',            desc: 'Pre-draft replies for your review',     on: true },
      { key: 'followup_radar', icon: '📡', name: 'Follow-Up Radar',          desc: 'Flag stale email threads after 7 days', on: true },
    ]
  },
  {
    title: 'Security',
    items: [
      { key: 'biometric', icon: '🔐', name: 'Biometric Gate',       desc: 'Face ID / Fingerprint for all actions ≥ ₹1,000', on: true, locked: true },
      { key: 'e2e',       icon: '🔒', name: 'E2E Encrypted Vault',  desc: 'Keys on-device · Cloud never sees plaintext',    on: true, locked: true },
      { key: 'ledger',    icon: '📋', name: 'Signed Action Ledger', desc: 'Cryptographic audit trail for every action',     on: true, locked: true },
    ]
  },
]

const DEFAULT_TOGGLES = {
  utility_autopay: true, sip_auto: false, cc_min: true,
  cab_auto: true, food_reorder: true, mygate: true,
  email_archive: true, draft_replies: true, followup_radar: true,
  biometric: true, e2e: true, ledger: true,
}

export default function Settings() {
  const { user } = useAuth()
  const { setShowWizard } = useOnboarding()
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES)
  const [activeTab, setActiveTab] = useState('trust')
  const [searchParams] = useSearchParams()

  const { data: trustStatus } = useQuery({ queryKey: ['trust'], queryFn: trustApi.status, staleTime: 60000 })
  const { data: gmailStatus, refetch: refetchGmailStatus } = useQuery({ queryKey: ['gmailStatus'], queryFn: gmailApi.status, staleTime: 60000 })
  const { data: gmailConfig } = useQuery({ queryKey: ['gmailConfig'], queryFn: gmailApi.configStatus, staleTime: Infinity })
  const { data: calendarStatus, refetch: refetchCalendarStatus } = useQuery({ queryKey: ['calendarStatus'], queryFn: calendarApi.status, staleTime: 60000 })
  const { data: fitStatus, refetch: refetchFitStatus } = useQuery({ queryKey: ['fitStatus'], queryFn: googleFitApi.status, staleTime: 60000 })
  const { data: contactsStatus, refetch: refetchContactsStatus } = useQuery({ queryKey: ['contactsStatus'], queryFn: contactsApi.status, staleTime: 60000 })

  const fitConnected = fitStatus?.connected || false
  const fitEmail = fitStatus?.email || ''
  const contactsConnected = contactsStatus?.connected || false
  const contactsEmail = contactsStatus?.email || ''
  const currentTrustLevel = trustStatus?.currentLevel || user?.trustLevel || 1
  const trustScore = trustStatus?.trustScore ?? 0
  const gmailConnected = gmailStatus?.connected || false
  const gmailEmail = gmailStatus?.email || ''
  const gmailConfigured = gmailConfig?.configured ?? null
  const calendarEmail = calendarStatus?.email || gmailEmail

  useEffect(() => {
    const gmailResult = searchParams.get('gmail')
    const calendarResult = searchParams.get('calendar')
    const errMsg = searchParams.get('msg')
    const tabParam = searchParams.get('tab')

    if (tabParam && ['trust','privacy','notif','integrations','account'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
    if (gmailResult === 'connected') { toast.success('Gmail connected!'); refetchGmailStatus(); setActiveTab('integrations') }
    else if (gmailResult === 'error') { toast.error(errMsg ? decodeURIComponent(errMsg) : 'Gmail connection failed'); setActiveTab('integrations') }
    if (calendarResult === 'connected') { toast.success('Google Calendar connected!'); refetchCalendarStatus(); setActiveTab('integrations') }
    else if (calendarResult === 'error') { toast.error(errMsg ? decodeURIComponent(errMsg) : 'Calendar connection failed'); setActiveTab('integrations') }
    const contactsResult = searchParams.get('contacts')
    if (contactsResult === 'connected') { toast.success('Google Contacts connected!'); refetchContactsStatus(); setActiveTab('integrations') }
    else if (contactsResult === 'error') { toast.error(errMsg ? decodeURIComponent(errMsg) : 'Contacts connection failed'); setActiveTab('integrations') }
    if (gmailResult || calendarResult || contactsResult || errMsg) window.history.replaceState({}, '', window.location.pathname)
  }, [searchParams, refetchGmailStatus, refetchCalendarStatus, refetchContactsStatus])

  useEffect(() => {
    let cancelled = false
    preferenceApi.get().then(({ preferences = {} }) => { if (!cancelled) setToggles({ ...DEFAULT_TOGGLES, ...preferences }) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const flip = async (key, locked) => {
    if (locked) { toast.error('⚠️ This security setting cannot be disabled'); return }
    const next = { ...toggles, [key]: !toggles[key] }
    setToggles(next)
    try { await preferenceApi.update(next); toast.success('Setting updated') }
    catch { toast.error('Could not save preference') }
  }

  const TABS = [
    { id: 'trust',        label: '🔒 Trust & Autonomy'  },
    { id: 'privacy',      label: '🛡️ Privacy & Security' },
    { id: 'notif',        label: '🔔 Notifications'      },
    { id: 'integrations', label: '🔌 Integrations'       },
    { id: 'account',      label: '👤 Account'            },
  ]

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>

        {/* Sidebar */}
        <motion.div variants={up}>
          {TABS.map(tab => (
            <div key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding: '10px 14px', borderRadius: 9, fontSize: 13, cursor: 'pointer', color: activeTab === tab.id ? 'var(--pulse2)' : 'var(--ink2)', background: activeTab === tab.id ? 'rgba(61,139,255,0.09)' : 'transparent', fontWeight: activeTab === tab.id ? 600 : 400, marginBottom: 3, transition: 'all 0.14s' }}
              onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.background = 'var(--depth3)' }}
              onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.background = 'transparent' }}>
              {tab.label}
            </div>
          ))}
        </motion.div>

        {/* Content */}
        <div>
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

              {/* ── Trust & Autonomy ── */}
              {activeTab === 'trust' && (
                <>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Autonomy Level</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 11, marginBottom: 24 }}>
                    {TRUST_LEVELS.map(t => (
                      <motion.div key={t.level} whileHover={{ scale: 1.02 }}
                        onClick={() => toast(`L${t.level} — ${t.name}: upgrade path in full version`)}
                        style={{ border: `1px solid ${t.level === currentTrustLevel ? 'var(--rim3)' : 'var(--rim1)'}`, borderRadius: 13, padding: 17, textAlign: 'center', cursor: 'pointer', background: t.level === currentTrustLevel ? 'rgba(61,139,255,0.07)' : 'var(--depth2)', transition: 'all 0.18s' }}>
                        <div style={{ fontSize: 32, fontWeight: 700, color: t.color, lineHeight: 1, marginBottom: 5 }}>L{t.level}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{t.name}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginBottom: 8 }}>{t.desc}</div>
                        {t.level === currentTrustLevel && <span className="badge badge-pulse" style={{ fontSize: 9 }}>● Current</span>}
                      </motion.div>
                    ))}
                  </div>

                  <div className="card" style={{ padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Trust Score — {trustScore}%</div>
                      <div style={{ height: 6, background: 'var(--depth4)', borderRadius: 3, overflow: 'hidden' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${trustScore}%` }} transition={{ duration: 1 }}
                          style={{ height: '100%', background: 'linear-gradient(90deg, var(--pulse), var(--go))', borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 5 }}>Trust grows through approved real actions.</div>
                    </div>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '8px 16px', flexShrink: 0 }}
                      onClick={() => toast('Trust score grows through consistent approved actions!')}>How to Level Up?</button>
                  </div>

                  {AUTONOMY_SECTIONS.map(section => (
                    <div key={section.title} style={{ marginBottom: 22 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{section.title}</div>
                      {section.items.map(item => (
                        <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 15px', background: 'var(--depth2)', border: '1px solid var(--rim1)', borderRadius: 11, marginBottom: 8 }}>
                          <span style={{ fontSize: 17, width: 24, textAlign: 'center' }}>{item.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{item.name}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{item.desc}</div>
                          </div>
                          {item.locked && <span className="badge badge-danger" style={{ fontSize: 9 }}>Locked</span>}
                          <button className={`toggle ${toggles[item.key] ? 'on' : 'off'}`} onClick={() => flip(item.key, item.locked)}>
                            <motion.div className="toggle-knob" animate={{ x: toggles[item.key] ? 18 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}

              {/* ── Integrations ── */}
              {activeTab === 'integrations' && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Connected Services</div>
                  {[
                    { icon: '🏦', name: 'Account Aggregator (AA)', status: 'Not linked', detail: 'Connect real accounts', color: 'var(--ink3)' },
                    { icon: '💳', name: 'UPI / NPCI',              status: 'Not linked', detail: 'Connect payment provider', color: 'var(--ink3)' },
                    { icon: '📧', name: 'Gmail', status: gmailConnected ? 'Connected' : gmailConfigured === false ? 'Setup needed' : 'Not linked', detail: gmailConnected ? `Connected as ${gmailEmail} · Google Calendar synced automatically` : gmailConfigured === false ? 'Admin must add Google OAuth keys to backend/.env' : 'Connect Gmail — also enables Google Calendar sync', color: gmailConnected ? 'var(--go)' : gmailConfigured === false ? 'var(--warn)' : 'var(--ink3)' },
                    { icon: '📅', name: 'Google Calendar', status: gmailConnected ? 'Connected via Gmail' : 'Auto-connects with Gmail', detail: gmailConnected ? `Synced as ${calendarEmail || gmailEmail} · Managed via Gmail connection` : 'Connect Gmail above to enable Calendar sync automatically', color: gmailConnected ? 'var(--go)' : 'var(--ink3)', readOnly: true },
                    { icon: '📈', name: 'Zerodha Kite',    status: 'Not linked', detail: 'Connect portfolio access', color: 'var(--ink3)' },
                    { icon: '❤️', name: 'Google Fit', status: fitConnected ? 'Connected' : 'Not linked', detail: fitConnected ? `Syncing steps, heart rate, sleep · ${fitEmail}` : 'Connect Google Fit for real-time health data', color: fitConnected ? 'var(--go)' : 'var(--ink3)' },
                    { icon: '👥', name: 'Google Contacts', status: contactsConnected ? 'Connected' : 'Not linked', detail: contactsConnected ? `Contacts synced · ${contactsEmail}` : 'Connect Google Contacts — AI knows your relationships', color: contactsConnected ? 'var(--go)' : 'var(--ink3)' },
                    { icon: '🚗', name: 'Ola / Uber',      status: 'Not linked', detail: 'Connect ride provider', color: 'var(--ink3)' },
                    { icon: '🍛', name: 'Swiggy / Zomato', status: 'Not linked', detail: 'Connect food provider', color: 'var(--ink3)' },
                    { icon: '🏠', name: 'MyGate',          status: 'Not linked', detail: 'Connect visitor provider', color: 'var(--ink3)' },
                    { icon: '💊', name: 'PharmEasy',       status: 'Not linked', detail: 'Connect pharmacy provider', color: 'var(--ink3)' },
                    { icon: '✈️', name: 'MakeMyTrip',      status: 'Not linked', detail: 'Click to connect', color: 'var(--ink3)' },
                  ].map(svc => (
                    <div key={svc.name}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 15px', background: 'var(--depth2)', border: '1px solid var(--rim1)', borderRadius: 11, marginBottom: 8, cursor: svc.readOnly ? 'default' : 'pointer' }}
                      onClick={async () => {
                        if (svc.readOnly) return
                        if (svc.name === 'Gmail') {
                          if (gmailConfigured === false) { toast.error('Gmail OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env', { duration: 6000 }); return }
                          try {
                            if (gmailConnected) { await gmailApi.disconnect(); toast.success('Gmail & Google Calendar disconnected'); refetchGmailStatus(); refetchCalendarStatus() }
                            else { const { url } = await gmailApi.connect(); window.location.href = url }
                          } catch (err) { toast.error(err.response?.data?.error || err.message || 'Could not connect Gmail') }
                          return
                        }
                        if (svc.name === 'Google Fit') {
                          try {
                            if (fitConnected) { await googleFitApi.disconnect(); toast.success('Google Fit disconnected'); refetchFitStatus() }
                            else { const { url } = await googleFitApi.connect(); window.location.href = url }
                          } catch (err) { toast.error(err.response?.data?.error || err.message || 'Could not connect Google Fit') }
                          return
                        }
                        if (svc.name === 'Google Contacts') {
                          try {
                            if (contactsConnected) { await contactsApi.disconnect(); toast.success('Google Contacts disconnected'); refetchContactsStatus() }
                            else { const { url } = await contactsApi.connect(); window.location.href = url }
                          } catch (err) { toast.error(err.response?.data?.error || err.message || 'Could not connect Google Contacts') }
                          return
                        }
                        if (svc.status !== 'Connected') toast.success(`${svc.name} connection flow coming soon!`)
                      }}>
                      <span style={{ fontSize: 22, width: 28 }}>{svc.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{svc.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{svc.detail}</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: svc.color }}>
                        {svc.status === 'Connected' ? '✓ ' : svc.status === 'Pending' ? '⏳ ' : '+ '}{svc.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Account ── */}
              {activeTab === 'account' && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Account Details</div>
                  <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                      <AvatarPic size={56} fontSize={20} editable />
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{user?.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{user?.email}</div>
                      </div>
                      <span className="badge badge-warn" style={{ marginLeft: 'auto', fontSize: 12 }}>{user?.plan || 'Free'}</span>
                    </div>
                    {[['City', user?.city || 'Not set'], ['Plan', user?.plan || 'Free'], ['Trust Level', `L${currentTrustLevel}`], ['Member Since', user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'Not available']].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--rim1)', fontSize: 13 }}>
                        <span style={{ color: 'var(--ink3)' }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <button className="btn-primary" style={{ width: '100%', marginBottom: 10 }} onClick={() => toast('Upgrade flow — Swostitech billing portal')}>
                    ⭐ Upgrade to Inner Circle ₹999/month
                  </button>
                  <button className="btn-ghost" style={{ width: '100%' }} onClick={() => toast.error('Data export: DPDP-compliant export in v0.3')}>
                    📦 Export My Data (DPDP)
                  </button>
                </div>
              )}

              {/* ── Privacy ── */}
              {activeTab === 'privacy' && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Privacy & Security</div>
                  {[
                    { icon: '🔐', title: 'Biometric Authentication', desc: 'Require Face ID / Fingerprint for sensitive actions', enabled: true },
                    { icon: '🔒', title: 'End-to-End Encryption',    desc: 'Protect personal memories and diary entries',        enabled: true },
                    { icon: '📋', title: 'Signed Action Ledger',     desc: 'Maintain immutable audit trail of all AI actions',   enabled: true },
                    { icon: '🌐', title: 'Third-Party Data Sharing', desc: 'Control data access for connected integrations',     enabled: false },
                    { icon: '🗑️', title: 'Delete Personal Data',    desc: 'Request complete removal of your stored data',       enabled: false },
                  ].map(item => (
                    <div key={item.title} className="card" style={{ padding: 16, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ fontSize: 22 }}>{item.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{item.desc}</div>
                      </div>
                      <span className={`badge ${item.enabled ? 'badge-go' : 'badge-warn'}`}>{item.enabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Notifications ── */}
              {activeTab === 'notif' && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Notifications</div>
                  {[
                    { icon: '📧', title: 'Email Alerts',          desc: 'Receive updates about important emails' },
                    { icon: '💸', title: 'Payment Notifications', desc: 'Bill payments and financial alerts' },
                    { icon: '🚗', title: 'Ride Updates',          desc: 'Cab bookings and travel updates' },
                    { icon: '🧠', title: 'AI Insights',           desc: 'Daily insights and recommendations' },
                    { icon: '🔔', title: 'System Notifications',  desc: 'Security, trust score and account updates' },
                  ].map(item => (
                    <div key={item.title} className="card" style={{ padding: 16, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ fontSize: 22 }}>{item.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{item.desc}</div>
                      </div>
                      <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => toast.success(`${item.title} updated`)}>Configure</button>
                    </div>
                  ))}
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
