import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { agentApi, dashApi, notifApi, onboardingApi, gmailApi, googleFitApi } from '../../services/api'
import { useAuth, useBrief, useOnboarding } from '../../store'
import { useSocket } from '../../services/socket'
import toast from 'react-hot-toast'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const up = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } }

// ── Inline Reply Panel ────────────────────────────────────────────────────────
function InlineReplyPanel({ notif, emit, on, onClose, onDismiss }) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    agentApi.draft({
      subject: notif.title?.replace('📧 ', '') || '',
      from: notif.from || '',
      preview: notif.body || '',
    }).then(r => { if (!cancelled) { setDraft(r.draft || ''); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [notif.id])

  useEffect(() => {
    const offSent = on('gmail:reply_sent', ({ notifId }) => {
      if (notifId !== notif.id) return
      toast.success('✉️ Reply sent!')
      onClose()
    })
    const offErr = on('gmail:reply_error', ({ notifId, error }) => {
      if (notifId !== notif.id) return
      setSending(false)
      toast.error(`Send failed: ${error}`)
    })
    return () => { offSent(); offErr() }
  }, [on, notif.id, onClose])

  const handleSend = () => {
    if (!draft.trim()) return
    setSending(true)
    const recipient = notif.from || ''
    const subject = notif.title?.replace('📧 ', '') || ''
    emit('gmail:send_reply', { emailId: notif.emailId || notif.id, recipient, subject, draft, notifId: notif.id })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22 }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{ margin: '10px 0 4px', background: 'var(--depth1)', border: '1px solid var(--rim2)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Panel header */}
        <div style={{ padding: '10px 14px', background: 'rgba(61,139,255,0.07)', borderBottom: '1px solid var(--rim1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🤖</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--pulse2)', flex: 1 }}>Mneva AI — Suggested Reply</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>

        {/* Draft area */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rim1)' }}>
          {loading ? (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '6px 0', color: 'var(--ink3)', fontSize: 12 }}>
              <span className="dot-bounce" /><span className="dot-bounce" /><span className="dot-bounce" />
              <span style={{ marginLeft: 6 }}>Generating reply…</span>
            </div>
          ) : editing ? (
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              style={{ width: '100%', background: 'var(--depth3)', border: '1px solid var(--rim2)', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--ink1)', lineHeight: 1.65, resize: 'none', minHeight: 90, outline: 'none', fontFamily: '"Space Grotesk",sans-serif' }}
            />
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink1)', lineHeight: 1.65, background: 'var(--depth3)', borderRadius: 8, padding: '9px 11px', whiteSpace: 'pre-wrap' }}>
              {draft || <span style={{ color: 'var(--ink3)' }}>Could not generate draft — click Edit to write manually</span>}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
          <button className="btn-approve" style={{ flex: 1, fontSize: 12, padding: '7px 0' }}
            onClick={handleSend} disabled={sending || loading || !draft.trim()}>
            {sending ? '⏳ Sending…' : '✉️ Send Reply'}
          </button>
          <button className="btn-view" style={{ fontSize: 12, padding: '7px 12px' }}
            onClick={() => setEditing(e => !e)}>
            {editing ? '✓ Done' : '✏️ Edit'}
          </button>
          <button className="btn-deny" style={{ fontSize: 12, padding: '7px 12px' }}
            onClick={onDismiss}>
            Skip
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth()
  const { showWizard, setShowWizard } = useOnboarding()
  const navigate = useNavigate()
  const [profilePct, setProfilePct] = useState(null)

  // Fetch real completion % — mirrors AIProfilePage displayPct logic exactly
  useEffect(() => {
    Promise.allSettled([
      onboardingApi.profile(),
      gmailApi.status(),
      googleFitApi.status(),
    ]).then(([prof, gm, fit]) => {
      const base = prof.value?.profile?.completionPct || 0
      const connections = ((gm.value?.connected ? 1 : 0) + (fit.value?.connected ? 1 : 0)) > 0 ? 10 : 0
      setProfilePct(Math.min(100, base + connections))
    })
  }, [])

  // Track first-seen date for the profile banner (persist 1 week)
  const BANNER_KEY = `mneva-profile-banner-seen-${user?.id}`
  const bannerFirstSeen = useRef(null)
  if (bannerFirstSeen.current === null) {
    const stored = localStorage.getItem(BANNER_KEY)
    if (!stored) { const now = Date.now(); localStorage.setItem(BANNER_KEY, String(now)); bannerFirstSeen.current = now }
    else bannerFirstSeen.current = parseInt(stored, 10)
  }
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
  const bannerExpired = Date.now() - bannerFirstSeen.current > ONE_WEEK_MS
  const showProfileBanner = !showWizard && profilePct !== null && !bannerExpired && profilePct < 80
  const { approve, deny, approved, denied } = useBrief()
  const queryClient = useQueryClient()
  const { on, emit } = useSocket()
  const [openReplyId, setOpenReplyId] = useState(null) // which action has reply panel open

  const { data: brief, isLoading } = useQuery({ queryKey: ['brief'], queryFn: dashApi.brief, staleTime: 60000 })
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: dashApi.stats, staleTime: 60000 })
  const { data: notifData } = useQuery({ queryKey: ['notifications'], queryFn: notifApi.all, staleTime: 15000 })

  const dbNotifs = notifData?.notifications || []
  const emailSmsNotifs = dbNotifs.filter(n => (n.type === 'email' || n.type === 'sms') && !n.read)
  const calendarNotifs = dbNotifs.filter(n => n.type === 'calendar' && !n.read)
  const emailSmsCalIds = new Set([...emailSmsNotifs, ...calendarNotifs].map(n => n.id))
  // brief pendingActions are DB notifications too — dedupe by id, exclude ones already handled above
  const otherPending = (brief?.pendingActions || []).filter(a => !emailSmsCalIds.has(a.id) && !a.title?.startsWith('📧') && !a.title?.startsWith('📱') && !a.title?.startsWith('📅'))
  const formatNotifTime = (iso) => {
    if (!iso) return ''
    const dt = new Date(iso)
    return dt.toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  const allPending = [
    ...otherPending.map(action => ({
      ...action,
      ts: action.createdAt || action.ts || null,
    })),
    ...calendarNotifs.map(n => ({
      id: n.id,
      type: 'calendar',
      urgency: 'medium',
      title: n.title,
      detail: n.eventStart ? `⏰ ${new Date(n.eventStart).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '',
      domain: 'calendar',
      meetLink: n.meetLink || null,
      ts: n.ts,
    })),
    ...emailSmsNotifs.map(n => ({
      id: n.id,
      type: n.type,
      urgency: 'medium',
      title: n.title,
      detail: n.body,
      domain: n.type === 'email' ? 'comms' : 'communications',
      ts: n.ts,
      _notif: n,
    }))
  ]

  const now = new Date()
  const h = now.getHours()
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  const STATS = [
    { label: 'Hours Saved Today', value: stats?.hoursSaved ?? 0,          color: 'var(--pulse2)', change: 'From real actions' },
    { label: 'Actions Automated', value: stats?.actionsAuto ?? 0,          color: 'var(--go)',     change: 'Completed actions' },
    { label: 'Bills Managed',     value: '₹0',                             color: 'var(--warn)',   change: 'Connect finance data' },
    { label: 'Trust Score',       value: `${stats?.trustScore ?? 0}%`,     color: 'var(--violet)', change: 'Builds with approvals' },
  ]

  const TRUST_DOMAINS = [
    { icon: '💡', name: 'Utility Bills',  level: 3, pct: 90, color: 'var(--go)' },
    { icon: '🚗', name: 'Cab Booking',    level: 3, pct: 85, color: 'var(--go)' },
    { icon: '📧', name: 'Email Drafting', level: 2, pct: 62, color: 'var(--pulse2)' },
    { icon: '📈', name: 'Finance / SIP',  level: 2, pct: 42, color: 'var(--warn)' },
    { icon: '🏥', name: 'Health',         level: 1, pct: 26, color: 'var(--ink4)' },
  ]

  const handleApprove = async (action) => {
    try {
      await agentApi.approve(action.id)
      await notifApi.markRead(action.id).catch(() => {})
      approve(action.id)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['brief'] })
      toast.success(`✅ ${String(action.title).slice(0, 50)} — approved`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not approve')
    }
  }
  const handleDeny = async (action) => {
    try {
      await notifApi.markRead(action.id).catch(() => {})
      deny(action.id)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['brief'] })
      toast('Dismissed', { icon: '✕' })
    } catch { toast.error('Could not dismiss') }
  }

  const getViewPath = (action) => {
    const type = action.type || ''
    const domain = action.domain || ''
    const title = (action.title || '').toLowerCase()
    if (type === 'email' || domain === 'comms') return '/comms'
    if (type === 'calendar' || title.includes('event') || title.includes('meeting') || title.includes('scheduled')) return '/twin'
    if (type === 'payment' || domain === 'finance') return '/finance'
    if (type === 'booking') return '/lifeops'
    if (type === 'reminder' || title.includes('reminder')) return '/twin'
    return '/twin'
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* Profile completion banner — shown for 1 week or until 80% complete */}
      <AnimatePresence>
        {showProfileBanner && (
          <motion.div
            key="profile-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'linear-gradient(135deg, rgba(61,139,255,0.1), rgba(155,114,255,0.07))',
              border: '1px solid rgba(61,139,255,0.25)',
              borderRadius: 12, padding: '11px 16px', marginBottom: 18,
              cursor: 'pointer',
            }}
            onClick={() => navigate('/ai-profile')}
          >
            <span style={{ fontSize: 18 }}>✨</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink1)' }}>Personalisation {profilePct}% complete </span>
              <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>— Mneva works better when it knows you.</span>
            </div>
            {/* Progress bar */}
            <div style={{ width: 80, height: 5, background: 'var(--depth4)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${profilePct}%` }}
                transition={{ duration: 0.6 }}
                style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, var(--pulse), var(--violet))' }}
              />
            </div>
            <button
              className="btn-primary"
              style={{ fontSize: 12, padding: '7px 14px', flexShrink: 0 }}
              onClick={e => { e.stopPropagation(); navigate('/ai-profile') }}
            >
              Complete →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Greeting */}
      <motion.div variants={up} style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4, fontWeight: 500 }}>{dateStr} · {timeStr}</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, marginBottom: 5 }}>
          {greet}, <span className="grad-text">{user?.name?.split(' ')[0]}</span>.{' '}
          <span style={{ color: 'var(--ink2)', fontWeight: 400, fontSize: 20 }}>
            {isLoading ? 'Loading your brief…' : 'Your day is ready.'}
          </span>
        </h1>
        {brief && (
          <div style={{ fontSize: 13.5, color: 'var(--ink2)' }}>
            Mneva found <strong style={{ color: 'var(--go)' }}>{brief.autoCompleted?.length} completed actions</strong>.
            {' '}<strong style={{ color: 'var(--warn)' }}>{allPending.length} actions</strong> need you.
          </div>
        )}
      </motion.div>

      {/* Autonomy Engine — Actions Pending */}
      {allPending.length > 0 && (
        <motion.div variants={up} style={{ background: 'linear-gradient(135deg, rgba(61,139,255,0.09) 0%, rgba(155,114,255,0.06) 100%)', border: '1px solid var(--rim2)', borderRadius: 16, padding: 20, marginBottom: 18, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, var(--pulse), var(--violet))' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Autonomy Engine — Actions Pending</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="anim-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--go)' }} />
              <span style={{ fontSize: 11, color: 'var(--go)', fontWeight: 600 }}>Live · {timeStr}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {allPending.map((action) => {
              const done    = approved.has(action.id)
              const skipped = denied.has(action.id)
              const isEmail    = action.type === 'email'
              const isCalendar = action.type === 'calendar' || action.title?.includes('📅')
              const isReminder = action.type === 'reminder' || action.title?.includes('Reminder') || action.title?.includes('reminder')
              const replyOpen  = openReplyId === action.id

              const cardIcon = done ? '✅' : isEmail ? '📧' : isCalendar ? '📅' : isReminder ? '🔔' : action.type === 'payment' ? '💸' : action.type === 'booking' ? '🚗' : '📊'
              const cardBg   = isEmail ? 'rgba(61,139,255,0.15)' : isCalendar ? 'rgba(0,227,150,0.12)' : isReminder ? 'rgba(255,176,32,0.12)' : action.urgency === 'high' ? 'rgba(255,82,82,0.12)' : 'rgba(0,227,150,0.12)'

              return (
                <div key={action.id}>
                  <motion.div
                    initial={{ opacity: 1 }}
                    animate={{ opacity: done || skipped ? 0.35 : 1 }}
                    style={{
                      display: 'flex', gap: 12,
                      background: replyOpen ? 'rgba(61,139,255,0.06)' : 'rgba(255,255,255,0.025)',
                      border: `1px solid ${replyOpen ? 'var(--rim2)' : 'var(--rim1)'}`,
                      borderRadius: replyOpen ? '12px 12px 0 0' : 12,
                      padding: '12px 15px',
                      pointerEvents: done || skipped ? 'none' : 'auto',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: isEmail ? 'rgba(61,139,255,0.15)' : action.urgency === 'high' ? 'rgba(255,82,82,0.12)' : 'rgba(0,227,150,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                      {done ? '✅' : isEmail ? '📧' : action.type === 'payment' ? '💸' : '📊'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{action.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink2)', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{action.detail}</span>
                        {action.ts && (
                          <span style={{ fontSize: 10.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{formatNotifTime(action.ts)}</span>
                        )}
                      </div>
                      {!done && !skipped && (
                        <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
                          {isEmail ? (
                            <>
                              <button className="btn-approve"
                                onClick={() => setOpenReplyId(replyOpen ? null : action.id)}>
                                🤖 {replyOpen ? 'Hide Reply' : 'Reply with AI'}
                              </button>
                              <button className="btn-view" onClick={() => navigate('/comms')}>Open →</button>
                              <button className="btn-deny" onClick={() => {
                                handleDeny(action)
                                setOpenReplyId(null)
                              }}>Dismiss</button>
                            </>
                          ) : isCalendar || isReminder ? (
                            <>
                              <button className="btn-approve" onClick={() => handleApprove(action)}>✓ Done</button>
                              <button className="btn-deny" onClick={() => handleDeny(action)}>✕ Dismiss</button>
                              {action.meetLink ? (
                                <a
                                  href={action.meetLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '5px 12px',
                                    background: 'linear-gradient(135deg, rgba(0,210,200,0.22), rgba(61,139,255,0.18))',
                                    border: '1px solid rgba(0,210,200,0.5)',
                                    borderRadius: 8, fontSize: 12, fontWeight: 700,
                                    color: 'var(--go)', textDecoration: 'none',
                                  }}
                                >
                                  📹 Join Meet
                                </a>
                              ) : (
                                <button className="btn-view" onClick={() => navigate('/twin')}>View →</button>
                              )}
                            </>
                          ) : (
                            <>
                              <button className="btn-approve" onClick={() => handleApprove(action)}>✓ Approve</button>
                              <button className="btn-deny"    onClick={() => handleDeny(action)}>✕ Skip</button>
                              <button className="btn-view"    onClick={() => navigate(getViewPath(action))}>View →</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <span className={`badge ${isEmail ? 'badge-pulse' : isCalendar ? 'badge-go' : isReminder ? 'badge-warn' : action.urgency === 'high' ? 'badge-danger' : 'badge-go'}`} style={{ flexShrink: 0, height: 'fit-content' }}>
                      {isEmail ? 'email' : isCalendar ? 'calendar' : isReminder ? 'reminder' : action.urgency}
                    </span>
                  </motion.div>

                  {/* Inline reply panel — only for THIS action */}
                  <AnimatePresence>
                    {replyOpen && isEmail && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden', border: '1px solid var(--rim2)', borderTop: 'none', borderRadius: '0 0 12px 12px', background: 'var(--depth1)' }}
                      >
                        <InlineReplyPanel
                          notif={action._notif}
                          emit={emit}
                          on={on}
                          onClose={() => setOpenReplyId(null)}
                          onDismiss={() => {
                            handleDeny(action)
                            setOpenReplyId(null)
                          }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>

          {brief?.insights?.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--rim1)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {brief.insights.map((ins, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--ink2)', background: 'rgba(61,139,255,0.06)', border: '1px solid var(--rim1)', borderRadius: 8, padding: '5px 11px' }}>{ins}</div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Stats Row */}
      <motion.div variants={up} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        {STATS.map((s, i) => (
          <div key={s.label} className={`stat-card anim-fade-up delay-${i + 1}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-delta">{s.change}</div>
          </div>
        ))}
      </motion.div>

      {/* Two column */}
      <motion.div variants={up} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 15 }}>
            <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>⚡ Completed Overnight</span>
            <button className="btn-view" onClick={() => navigate('/twin')} style={{ fontSize: 11 }}>Ledger →</button>
          </div>
          {brief?.autoCompleted?.map((item, i) => {
            const TOOL_FILTER = {
              schedule_event: 'meeting', set_reminder: 'reminder',
              initiate_payment: 'payment', send_email: 'email', draft_reply: 'email',
              book_cab: 'booking', order_food: 'booking',
            }
            const filterKey = TOOL_FILTER[item.tool] || 'all'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < brief.autoCompleted.length - 1 ? '1px solid var(--rim1)' : 'none' }}>
                <span style={{ fontSize: 14 }}>✅</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{item.detail}</div>
                </div>
                <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{item.time}</span>
                <button className="btn-view" style={{ fontSize: 11 }} onClick={() => navigate(`/twin?filter=${filterKey}`)}>View →</button>
              </div>
            )
          }) ?? <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 15 }}>
            <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>🔒 Domain Trust Levels</span>
            <button className="btn-view" onClick={() => navigate('/settings')} style={{ fontSize: 11 }}>Manage →</button>
          </div>
          {TRUST_DOMAINS.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
              <span style={{ fontSize: 14, width: 20 }}>{d.icon}</span>
              <span style={{ fontSize: 12, color: 'var(--ink2)', width: 108 }}>{d.name}</span>
              <div style={{ flex: 1, height: 5, background: 'var(--depth4)', borderRadius: 3, overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${d.pct}%` }} transition={{ duration: 0.9, delay: 0.3 }}
                  style={{ height: '100%', borderRadius: 3, background: d.color }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: d.color, width: 18, textAlign: 'right' }}>L{d.level}</span>
            </div>
          ))}
          {brief?.commitments?.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rim1)' }}>
              <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Commitments</div>
              {brief.commitments.map((c, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 5, display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--warn)' }}>○</span><span>{c.text} <span style={{ color: 'var(--ink3)' }}>· {c.due}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {brief?.followUpRadar?.length > 0 && (
        <motion.div variants={up} style={{ marginTop: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>📡 Follow-Up Radar — Stale Threads</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {brief.followUpRadar.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, background: 'var(--depth3)', borderRadius: 10, padding: '11px 13px', cursor: 'pointer' }} onClick={() => navigate('/comms')}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,82,82,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>⏳</div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{f.contact}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>{f.subject}</div>
                    <div style={{ fontSize: 11, color: 'var(--danger)' }}>{f.daysSilent} days silent</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
