import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useAuth, useOnboarding } from '../../store'
import AvatarPic from '../common/AvatarPic'
import { preferenceApi, trustApi, gmailApi, calendarApi, googleFitApi, contactsApi, gdriveApi, gtasksApi, slackApi, outlookApi } from '../../services/api'
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

// Mirrors mneva/src/Screen/Settings.js exactly — trust is earned per-domain,
// not as one global level, and the thresholds below are purely display text
// (the real gating lives in backend/src/services/pendingActions.service.js).
const DOMAIN_TABS = [
  { key: 'finance',        label: 'Finance',       icon: '💳' },
  { key: 'communications', label: 'Communication', icon: '📧' },
  { key: 'health',         label: 'Health Core',   icon: '❤️' },
  { key: 'family',         label: 'Family',        icon: '👥' },
]
const LEVEL_NAMES = { 1: 'Observe', 2: 'Suggest', 3: 'Draft & Prep', 4: 'Inner Circle' }
const L1_MIN_DAYS = 14, L1_MIN_ACTIONS = 15, L2_MIN_DAYS = 30
const L2_ACCEPT_RATE_TO_L3 = 80, L3_ACCEPT_RATE_TO_L4 = 90, L3_REJECT_RATE_DEMOTE = 10
const INNER_CIRCLE_ACTIONS = {
  finance: 'mark bills as paid and add subscriptions, loans, EMIs, deposits and investments. Payments of ₹1,000 or more will still need your approval',
  communications: 'send emails from your Gmail and create calendar events',
  health: 'log health data for you',
  family: 'add family tasks, medications, pets, pet reminders and family items',
}

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
  const [trustDomain, setTrustDomain] = useState('finance')
  const [confirmingLevel, setConfirmingLevel] = useState(false)
  const [searchParams] = useSearchParams()

  const { data: trustSettings, refetch: refetchTrustSettings } = useQuery({ queryKey: ['trustSettings'], queryFn: trustApi.settings, staleTime: 30000 })
  const { data: gmailStatus, refetch: refetchGmailStatus } = useQuery({ queryKey: ['gmailStatus'], queryFn: gmailApi.status, staleTime: 60000 })
  const { data: gmailConfig } = useQuery({ queryKey: ['gmailConfig'], queryFn: gmailApi.configStatus, staleTime: Infinity })
  const { data: calendarStatus, refetch: refetchCalendarStatus } = useQuery({ queryKey: ['calendarStatus'], queryFn: calendarApi.status, staleTime: 60000 })
  const { data: fitStatus, refetch: refetchFitStatus } = useQuery({ queryKey: ['fitStatus'], queryFn: googleFitApi.status, staleTime: 60000 })
  const { data: contactsStatus, refetch: refetchContactsStatus } = useQuery({ queryKey: ['contactsStatus'], queryFn: contactsApi.status, staleTime: 60000 })
  const { data: driveStatus, refetch: refetchDriveStatus } = useQuery({ queryKey: ['driveStatus'], queryFn: gdriveApi.status, staleTime: 60000 })
  const { data: tasksStatus, refetch: refetchTasksStatus } = useQuery({ queryKey: ['tasksStatus'], queryFn: gtasksApi.status, staleTime: 60000 })
  const { data: slackStatus, refetch: refetchSlackStatus } = useQuery({ queryKey: ['slackStatus'], queryFn: slackApi.status, staleTime: 60000 })
  const { data: outlookStatus, refetch: refetchOutlookStatus } = useQuery({ queryKey: ['outlookStatus'], queryFn: outlookApi.status, staleTime: 60000 })

  const fitConnected = fitStatus?.connected || false
  const fitEmail = fitStatus?.email || ''
  const contactsConnected = contactsStatus?.connected || false
  const contactsEmail = contactsStatus?.email || ''
  const driveConnected = driveStatus?.connected || false
  const driveEmail = driveStatus?.email || ''
  const tasksConnected = tasksStatus?.connected || false
  const tasksEmail = tasksStatus?.email || ''
  const slackConnected = slackStatus?.connected || false
  const slackTeam = slackStatus?.team || ''
  const outlookConnected = outlookStatus?.connected || false
  const outlookEmail = outlookStatus?.email || ''
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
    const driveResult = searchParams.get('drive')
    const tasksResult = searchParams.get('tasks')
    if (contactsResult === 'connected') { toast.success('Google Contacts connected!'); refetchContactsStatus(); setActiveTab('integrations') }
    else if (contactsResult === 'error') { toast.error(errMsg ? decodeURIComponent(errMsg) : 'Contacts connection failed'); setActiveTab('integrations') }
    if (driveResult === 'connected') { toast.success('Google Drive connected!'); refetchDriveStatus(); setActiveTab('integrations') }
    else if (driveResult === 'error') { toast.error(errMsg ? decodeURIComponent(errMsg) : 'Drive connection failed'); setActiveTab('integrations') }
    if (tasksResult === 'connected') { toast.success('Google Tasks connected!'); refetchTasksStatus(); setActiveTab('integrations') }
    else if (tasksResult === 'error') { toast.error(errMsg ? decodeURIComponent(errMsg) : 'Tasks connection failed'); setActiveTab('integrations') }
    const slackResult = searchParams.get('slack')
    const outlookResult = searchParams.get('outlook')
    if (slackResult === 'connected') { toast.success('Slack connected!'); refetchSlackStatus(); setActiveTab('integrations') }
    else if (slackResult === 'error') { toast.error(errMsg ? decodeURIComponent(errMsg) : 'Slack connection failed'); setActiveTab('integrations') }
    if (outlookResult === 'connected') { toast.success('Microsoft 365 connected!'); refetchOutlookStatus(); setActiveTab('integrations') }
    else if (outlookResult === 'error') { toast.error(errMsg ? decodeURIComponent(errMsg) : 'Microsoft 365 connection failed'); setActiveTab('integrations') }
    if (gmailResult || calendarResult || contactsResult || driveResult || tasksResult || slackResult || outlookResult || errMsg) window.history.replaceState({}, '', window.location.pathname)
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

  const dt = trustSettings?.domains?.[trustDomain] || {}
  const level = dt.level || 1
  const total = (dt.acceptedAtLevel || 0) + (dt.rejectedAtLevel || 0)
  const acceptPct = dt.acceptRate ?? 0

  const confirmFinanceLevel = async () => {
    setConfirmingLevel(true)
    try { await trustApi.confirmLevel('finance', 2); toast.success('Suggest mode turned on for Finance'); refetchTrustSettings() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not turn this on') }
    finally { setConfirmingLevel(false) }
  }
  const allowInnerCircle = async (domain) => {
    setConfirmingLevel(true)
    try { await trustApi.confirmLevel(domain, 4); toast.success('Inner Circle turned on'); refetchTrustSettings() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not turn this on') }
    finally { setConfirmingLevel(false) }
  }
  const declineInnerCircle = async (domain) => {
    setConfirmingLevel(true)
    try { await trustApi.declineLevel(domain); refetchTrustSettings() }
    catch { toast.error('Could not update') }
    finally { setConfirmingLevel(false) }
  }
  const turnOffInnerCircle = async (domain) => {
    setConfirmingLevel(true)
    try { await trustApi.leaveInnerCircle(domain); toast.success('Inner Circle turned off'); refetchTrustSettings() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not turn this off') }
    finally { setConfirmingLevel(false) }
  }
  const dropToLevel = async (domain, targetLevel) => {
    setConfirmingLevel(true)
    try { await trustApi.setDomainLevel(domain, targetLevel); refetchTrustSettings() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not update level') }
    finally { setConfirmingLevel(false) }
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
                  {/* Domain sub-tabs — each of the 4 domains earns trust on its own clock */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
                    {DOMAIN_TABS.map(d => (
                      <button key={d.key} onClick={() => setTrustDomain(d.key)}
                        style={{ background: trustDomain === d.key ? 'var(--pulse)' : 'var(--depth3)', color: trustDomain === d.key ? '#fff' : 'var(--ink2)', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: '"Space Grotesk",sans-serif' }}>
                        {d.icon} {d.label}
                      </button>
                    ))}
                  </div>

                  {/* L1 -> L2: finance only needs an explicit yes */}
                  {trustDomain === 'finance' && dt.pendingL2Confirm && (
                    <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, borderColor: 'var(--rim3)' }}>
                      <span style={{ fontSize: 18 }}>⚡</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Ready for Suggest mode</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Mneva has learned enough about your finance habits to start suggesting actions.</div>
                      </div>
                      <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} disabled={confirmingLevel} onClick={confirmFinanceLevel}>Turn on</button>
                    </div>
                  )}

                  {/* L3 -> L4: every domain needs an explicit, informed yes */}
                  {level === 3 && dt.pendingL4Confirm && (
                    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>🛡️</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Allow Inner Circle?</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                            You've approved most of Mneva's suggestions here. If you allow it, Mneva will {INNER_CIRCLE_ACTIONS[trustDomain]} without asking you first. Every action is still recorded in Twin Diary, and you can turn this off here at any time.
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} disabled={confirmingLevel} onClick={() => allowInnerCircle(trustDomain)}>Allow</button>
                            <button className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }} disabled={confirmingLevel} onClick={() => declineInnerCircle(trustDomain)}>Not now</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Progress to next level — real thresholds, not a cosmetic score */}
                  <div className="card" style={{ padding: 16, marginBottom: 24 }}>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      {DOMAIN_TABS.find(d => d.key === trustDomain)?.label} Trust
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 30, fontWeight: 700 }}>L{level}</span>
                      <span style={{ fontSize: 13, color: 'var(--ink2)' }}>{LEVEL_NAMES[level]}</span>
                    </div>

                    {level >= 4 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>🏅</span>
                        <span style={{ fontSize: 12.5, color: 'var(--ink2)', flex: 1 }}>Inner Circle on — Mneva acts here without asking</span>
                        <button onClick={() => turnOffInnerCircle(trustDomain)} disabled={confirmingLevel} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Turn off</button>
                      </div>
                    ) : level === 1 ? (
                      <>
                        <div style={{ height: 6, background: 'var(--depth4)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                          <div style={{ height: '100%', width: `${Math.min(100, Math.round(((dt.actionsAtLevel || 0) / L1_MIN_ACTIONS) * 100))}%`, background: 'linear-gradient(90deg, var(--pulse), var(--go))' }} />
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{dt.actionsAtLevel || 0}/{L1_MIN_ACTIONS} actions observed · {dt.daysAtLevel || 0}/{L1_MIN_DAYS} days</div>
                      </>
                    ) : level === 2 ? (
                      <>
                        <div style={{ height: 6, background: 'var(--depth4)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                          <div style={{ height: '100%', width: `${Math.min(100, total > 0 ? acceptPct : 0)}%`, background: 'linear-gradient(90deg, var(--pulse), var(--go))' }} />
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{total > 0 ? `${acceptPct}% accepted (need ${L2_ACCEPT_RATE_TO_L3}%)` : 'No suggestions yet'} · {dt.daysAtLevel || 0}/{L2_MIN_DAYS} days</div>
                      </>
                    ) : (
                      <>
                        <div style={{ height: 6, background: 'var(--depth4)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                          <div style={{ height: '100%', width: `${Math.min(100, total > 0 ? acceptPct : 0)}%`, background: 'linear-gradient(90deg, var(--pulse), var(--go))' }} />
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{total > 0 ? `${acceptPct}% accepted (need ${L3_ACCEPT_RATE_TO_L4}%)` : 'No one-tap actions yet'}</div>
                      </>
                    )}

                    {level === 3 && total > 0 && (100 - acceptPct) > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: 'var(--warn)' }}>
                        ⚠️ Reject rate must stay under {L3_REJECT_RATE_DEMOTE}% or this drops back to L2 · currently {100 - acceptPct}%
                      </div>
                    )}
                  </div>

                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Autonomy Level</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 12 }}>Earned automatically as you approve or decline what Mneva proposes for this domain. You can always drop to a lower level yourself.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 11, marginBottom: 24 }}>
                    {TRUST_LEVELS.map(t => {
                      const isLower = t.level < level
                      return (
                        <motion.div key={t.level} whileHover={isLower ? { scale: 1.02 } : {}}
                          onClick={() => isLower && !confirmingLevel && dropToLevel(trustDomain, t.level)}
                          style={{ border: `1px solid ${t.level === level ? 'var(--rim3)' : 'var(--rim1)'}`, borderRadius: 13, padding: 17, textAlign: 'center', cursor: isLower ? 'pointer' : 'default', background: t.level === level ? 'rgba(61,139,255,0.07)' : 'var(--depth2)', opacity: t.level > level ? 0.45 : 1, transition: 'all 0.18s' }}>
                          <div style={{ fontSize: 32, fontWeight: 700, color: t.color, lineHeight: 1, marginBottom: 5 }}>L{t.level}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{t.name}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginBottom: 8 }}>{t.desc}</div>
                          {t.level === level && <span className="badge badge-pulse" style={{ fontSize: 9 }}>● Current</span>}
                          {isLower && t.level !== level && <span className="badge" style={{ fontSize: 9, color: 'var(--ink3)' }}>Tap to drop here</span>}
                        </motion.div>
                      )
                    })}
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
                    { icon: '❤️', name: 'Google Fit', status: fitConnected ? 'Connected' : 'Retired', detail: fitConnected ? `Syncing steps, heart rate, sleep · ${fitEmail} · being retired, switch to Health Connect on the app` : 'Being retired — connect Health Connect from the Mneva mobile app instead', color: fitConnected ? 'var(--warn)' : 'var(--ink3)' },
                    { icon: '👥', name: 'Google Contacts', status: contactsConnected ? 'Connected' : 'Not linked', detail: contactsConnected ? `Contacts synced · ${contactsEmail}` : 'Connect Google Contacts — AI knows your relationships', color: contactsConnected ? 'var(--go)' : 'var(--ink3)' },
                    { icon: '🗂️', name: 'Google Drive', status: driveConnected ? 'Connected' : 'Not linked', detail: driveConnected ? `Drive synced · ${driveEmail}` : 'Connect Drive to browse Docs, Sheets, Slides & files', color: driveConnected ? 'var(--go)' : 'var(--ink3)' },
                    { icon: '✅', name: 'Google Tasks', status: tasksConnected ? 'Connected' : 'Not linked', detail: tasksConnected ? `Tasks synced · ${tasksEmail}` : 'Connect Google Tasks to sync your to-dos with AI', color: tasksConnected ? 'var(--go)' : 'var(--ink3)' },
                    { icon: '💬', name: 'Slack', status: slackConnected ? 'Connected' : 'Not linked', detail: slackConnected ? `Workspace linked · ${slackTeam}` : 'Connect Slack to read channels and send messages via AI', color: slackConnected ? 'var(--go)' : 'var(--ink3)' },
                    { icon: '🪟', name: 'Microsoft 365', status: outlookConnected ? 'Connected' : 'Not linked', detail: outlookConnected ? `Outlook Mail, Calendar, OneDrive & To Do synced · ${outlookEmail}` : 'Connect Outlook Mail, Calendar, OneDrive & Microsoft To Do', color: outlookConnected ? 'var(--go)' : 'var(--ink3)' },
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
                          if (!fitConnected) { toast('Google Fit is being retired. Open the Mneva mobile app and connect Health Connect from the Health screen instead.', { duration: 6000 }); return }
                          try { await googleFitApi.disconnect(); toast.success('Google Fit disconnected'); refetchFitStatus() }
                          catch (err) { toast.error(err.response?.data?.error || err.message || 'Could not disconnect Google Fit') }
                          return
                        }
                        if (svc.name === 'Google Contacts') {
                          try {
                            if (contactsConnected) { await contactsApi.disconnect(); toast.success('Google Contacts disconnected'); refetchContactsStatus() }
                            else { const { url } = await contactsApi.connect(); window.location.href = url }
                          } catch (err) { toast.error(err.response?.data?.error || err.message || 'Could not connect Google Contacts') }
                          return
                        }
                        if (svc.name === 'Google Drive') {
                          try {
                            if (driveConnected) { await gdriveApi.disconnect(); toast.success('Google Drive disconnected'); refetchDriveStatus() }
                            else { const { url } = await gdriveApi.connect(); window.location.href = url }
                          } catch (err) { toast.error(err.response?.data?.error || err.message || 'Could not connect Google Drive') }
                          return
                        }
                        if (svc.name === 'Google Tasks') {
                          try {
                            if (tasksConnected) { await gtasksApi.disconnect(); toast.success('Google Tasks disconnected'); refetchTasksStatus() }
                            else { const { url } = await gtasksApi.connect(); window.location.href = url }
                          } catch (err) { toast.error(err.response?.data?.error || err.message || 'Could not connect Google Tasks') }
                          return
                        }
                        if (svc.name === 'Slack') {
                          try {
                            if (slackConnected) { await slackApi.disconnect(); toast.success('Slack disconnected'); refetchSlackStatus() }
                            else { const { url } = await slackApi.connect(); window.location.href = url }
                          } catch (err) { toast.error(err.response?.data?.error || err.message || 'Could not connect Slack') }
                          return
                        }
                        if (svc.name === 'Microsoft 365') {
                          try {
                            if (outlookConnected) { await outlookApi.disconnect(); toast.success('Microsoft 365 disconnected'); refetchOutlookStatus() }
                            else { const { url } = await outlookApi.connect(); window.location.href = url }
                          } catch (err) { toast.error(err.response?.data?.error || err.message || 'Could not connect Microsoft 365') }
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
                        {svc.status === 'Connected' ? '✓ ' : svc.status === 'Pending' ? '⏳ ' : svc.status === 'Retired' ? '⚠️ ' : '+ '}{svc.status}
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
                    {[['City', user?.city || 'Not set'], ['Plan', user?.plan || 'Free'], ['Trust Levels', DOMAIN_TABS.map(d => `${d.label.split(' ')[0]} L${trustSettings?.domains?.[d.key]?.level || 1}`).join(' · ')], ['Member Since', user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'Not available']].map(([k, v]) => (
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
