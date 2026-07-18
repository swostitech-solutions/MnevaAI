import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth, useUI } from '../../store'
import AvatarPic from '../common/AvatarPic'
import { notifApi, searchApi, dashApi } from '../../services/api'
import { useSocket } from '../../services/socket'
import toast from 'react-hot-toast'

const NAV_BASE = [
  { path: '/',         icon: '⚡', label: 'Daily Brief',    bc: 'var(--pulse)' },
  { path: '/chat',     icon: '💬', label: 'Ask Mneva' },
  { path: '/finance',  icon: '💰', label: 'Finance',        bc: 'var(--warn)' },
  { path: '/comms',    icon: '📧', label: 'Communications', bc: 'var(--pulse)' },
  { path: '/health',   icon: '❤️', label: 'Health',         bc: 'var(--go)' },
  { path: '/lifeops',  icon: '🏠', label: 'Life Ops' },
  { path: '/contacts', icon: '👥', label: 'Contacts' },
  { path: '/twin',     icon: '📓', label: 'Twin Diary' },
  { path: '/settings',   icon: '⚙️', label: 'Settings' },
  { path: '/ai-profile', icon: '🧠', label: 'AI Profile' },
]

const TITLES = { '/': 'Daily Brief', '/chat': 'Ask Mneva', '/finance': 'Finance & Payments', '/comms': 'Communications', '/health': 'Health & Wellness', '/lifeops': 'Life Operations', '/contacts': 'Contacts', '/twin': 'Twin Diary', '/settings': 'Settings & Trust', '/ai-profile': 'AI Profile' }

// ── Professional chime using Web Audio API ───────────────────────────────────
function playReminderChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.55, ctx.currentTime)
    master.connect(ctx.destination)

    const notes = [
      { freq: 880, start: 0,    dur: 0.18 },
      { freq: 1108, start: 0.18, dur: 0.18 },
      { freq: 1320, start: 0.36, dur: 0.32 },
    ]
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
      env.gain.setValueAtTime(0, ctx.currentTime + start)
      env.gain.linearRampToValueAtTime(0.7, ctx.currentTime + start + 0.02)
      env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      osc.connect(env)
      env.connect(master)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch { /* audio not supported */ }
}

// ── Reminder Alert Popup ──────────────────────────────────────────────────────
function ReminderAlert() {
  const [alerts, setAlerts] = useState([])
  const { on } = useSocket()

  useEffect(() => {
    const off = on('reminder:alert', (data) => {
      playReminderChime()
      setAlerts(prev => [...prev, { ...data, _key: Date.now() }])
    })
    return off
  }, [on])

  const dismiss = (key) => setAlerts(prev => prev.filter(a => a._key !== key))

  return (
    <AnimatePresence>
      {alerts.map(alert => (
        <motion.div
          key={alert._key}
          initial={{ opacity: 0, scale: 0.88, y: -24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: -16 }}
          transition={{ type: 'spring', stiffness: 340, damping: 26 }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)',
          }}
          onClick={() => dismiss(alert._key)}
        >
          <motion.div
            onClick={e => e.stopPropagation()}
            style={{
              width: 420, maxWidth: '90vw',
              background: 'linear-gradient(160deg, #0d1629 0%, #060912 100%)',
              border: '1px solid rgba(61,139,255,0.35)',
              borderRadius: 24,
              boxShadow: '0 0 0 1px rgba(61,139,255,0.12), 0 32px 80px rgba(0,0,0,0.7)',
              overflow: 'hidden',
            }}
          >
            {/* Top accent bar */}
            <div style={{ height: 3, background: 'linear-gradient(90deg,#3D8BFF,#9B72FF,#10b981)' }} />

            <div style={{ padding: '28px 28px 24px' }}>
              {/* Icon + label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                  background: 'linear-gradient(135deg,rgba(61,139,255,0.2),rgba(155,114,255,0.2))',
                  border: '1px solid rgba(61,139,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                }}>🔔</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--pulse2)', marginBottom: 4 }}>Mneva Reminder</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink4)' }}>
                    {new Date(alert.time || alert.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    {alert.domain && alert.domain !== 'general' && ` · ${alert.domain}`}
                  </div>
                </div>
              </div>

              {/* Message */}
              <div style={{
                fontSize: 18, fontWeight: 700, color: 'var(--ink1)', lineHeight: 1.45,
                marginBottom: 24, paddingBottom: 20,
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}>
                {alert.message}
              </div>

              {/* Dismiss */}
              <button
                onClick={() => dismiss(alert._key)}
                style={{
                  width: '100%', padding: '12px',
                  borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#3D8BFF,#9B72FF)',
                  color: '#fff', fontSize: 13.5, fontWeight: 700,
                  fontFamily: '"Space Grotesk",sans-serif',
                  letterSpacing: '0.02em',
                }}
              >
                Got it ✓
              </button>
            </div>
          </motion.div>
        </motion.div>
      ))}
    </AnimatePresence>
  )
}

export default function AppLayout() {
  const nav = useNavigate()
  const loc = useLocation()
  const { user, logout } = useAuth()
  const { sidebarCollapsed, toggleSidebar } = useUI()

  // ── Live badge counts ──────────────────────────────────────────────────────
  const queryClient = useQueryClient()
  const { data: counts } = useQuery({ queryKey: ['sidebar-counts'], queryFn: dashApi.sidebarCounts, staleTime: 30000, retry: false })

  const NAV = NAV_BASE.map(item => ({
    ...item,
    badge: item.path === '/'        ? (counts?.brief  || null)
         : item.path === '/comms'   ? (counts?.comms  || null)
         : item.path === '/finance' ? (counts?.finance || null)
         : item.path === '/health'  ? (counts?.health || null)
         : null,
  }))

  const handleLogout = () => { logout(); toast.success('Signed out'); nav('/login') }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <ReminderAlert />
      {/* Ambient */}
      <div className="orb" style={{ width: 500, height: 500, top: '-120px', left: '30%', background: 'rgba(61,139,255,0.035)' }} />
      <div className="orb" style={{ width: 350, height: 350, bottom: '-80px', right: '10%', background: 'rgba(155,114,255,0.03)' }} />

      {/* SIDEBAR */}
      <motion.aside animate={{ width: sidebarCollapsed ? 62 : 250 }} transition={{ duration: 0.22, ease: 'easeInOut' }}
        style={{ background: 'var(--depth1)', borderRight: '1px solid var(--rim1)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden', zIndex: 20 }}>

        {/* Logo */}
        <div style={{ padding: sidebarCollapsed ? '18px 12px' : '20px 18px', borderBottom: '1px solid var(--rim1)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div onClick={toggleSidebar} className="anim-glow"
              style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#3D8BFF,#9B72FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: '#fff', flexShrink: 0, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>
              M
            </div>
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                  <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.1 }}>Mneva<span className="grad-text">AI</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                    <div className="anim-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--go)', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: 'var(--go)', fontWeight: 600 }}>L{user?.trustLevel} Active</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          {!sidebarCollapsed && <div style={{ fontSize: 9.5, color: 'var(--ink4)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 8px', marginBottom: 5 }}>Overview</div>}
          {NAV.slice(0, 2).map(item => <SidebarItem key={item.path} item={item} active={loc.pathname === item.path} collapsed={sidebarCollapsed} onClick={() => nav(item.path)} />)}

          {!sidebarCollapsed && <div style={{ fontSize: 9.5, color: 'var(--ink4)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '10px 8px 5px', marginTop: 4 }}>Domains</div>}
          {NAV.slice(2, 7).map(item => <SidebarItem key={item.path} item={item} active={loc.pathname === item.path} collapsed={sidebarCollapsed} onClick={() => nav(item.path)} />)}

          {!sidebarCollapsed && <div style={{ fontSize: 9.5, color: 'var(--ink4)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '10px 8px 5px', marginTop: 4 }}>System</div>}
          {NAV.slice(7).map(item => <SidebarItem key={item.path} item={item} active={loc.pathname === item.path} collapsed={sidebarCollapsed} onClick={() => nav(item.path)} />)}
        </nav>

        {/* User */}
        <div style={{ padding: sidebarCollapsed ? '10px 8px' : '12px', borderTop: '1px solid var(--rim1)', flexShrink: 0 }}>
          <div onClick={handleLogout} title="Click to sign out"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: sidebarCollapsed ? '8px' : '8px 10px', background: 'var(--depth3)', borderRadius: 10, cursor: 'pointer', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
            <AvatarPic size={30} fontSize={11} />
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{user?.plan}</div>
                </motion.div>
              )}
            </AnimatePresence>
            {!sidebarCollapsed && (
              <div style={{ background: 'rgba(255,176,32,0.12)', border: '1px solid rgba(255,176,32,0.25)', color: 'var(--warn)', fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 8, flexShrink: 0 }}>
                L{user?.trustLevel}
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      {/* MAIN */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, zIndex: 5 }}>
        <Topbar title={TITLES[loc.pathname] || 'Mneva AI'} />
        {!sidebarCollapsed && <BackendStatusBanner />}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
            <Outlet />
          </motion.div>
        </div>
      </main>
    </div>
  )
}

function SidebarItem({ item, active, collapsed, onClick }) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: collapsed ? '10px' : '8px 10px', borderRadius: 9, cursor: 'pointer', color: active ? 'var(--pulse2)' : 'var(--ink3)', background: active ? 'rgba(61,139,255,0.09)' : 'transparent', marginBottom: 2, position: 'relative', transition: 'all 0.14s', justifyContent: collapsed ? 'center' : 'flex-start' }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--depth3)'; e.currentTarget.style.color = 'var(--ink1)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = active ? 'var(--pulse2)' : 'var(--ink3)' }}>
      {active && <div style={{ position: 'absolute', left: 0, top: '22%', bottom: '22%', width: 3, borderRadius: '0 3px 3px 0', background: 'var(--pulse)' }} />}
      <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
      {!collapsed && <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 600 : 400 }}>{item.label}</span>}
      {!collapsed && item.badge && (
        <span style={{ background: item.bc || 'var(--pulse)', color: '#fff', fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>{item.badge}</span>
      )}
    </div>
  )
}

function NotifInlineReply({ notif, emit, on, onClose }) {
  const [draft, setDraft] = useState(notif.suggestedReply || '')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(!notif.suggestedReply)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (notif.suggestedReply) return
    let cancelled = false
    const generate = async () => {
      try {
        const { agentApi } = await import('./../../services/api')
        const r = await agentApi.draft({
          subject: notif.subject || notif.title?.replace('📧 ', '') || '',
          from: notif.from || '',
          preview: notif.body || '',
        })
        if (!cancelled) setDraft(r.draft || '')
      } catch { if (!cancelled) setDraft('') }
      if (!cancelled) setLoading(false)
    }
    generate()
    return () => { cancelled = true }
  }, [notif.id])

  useEffect(() => {
    const offSent = on('gmail:reply_sent', ({ notifId }) => {
      if (notifId !== notif.id) return
      toast.success('\u2709\ufe0f Reply sent!')
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
    const fromMatch = (notif.body || notif.from || '').match(/From:\s*(.+?)(?:\s*\u2014|$)/)
    const recipient = notif.from || fromMatch?.[1]?.trim() || ''
    const subject = notif.subject || notif.title?.replace('\ud83d\udce7 ', '') || ''
    emit('gmail:send_reply', { emailId: notif.emailId || notif.id, recipient, subject, draft, notifId: notif.id })
  }

  return (
    <div style={{ padding: '12px 16px', background: 'rgba(61,139,255,0.04)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--pulse2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>\ud83e\udd16</span> Suggested Reply
      </div>
      {loading ? (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '4px 0', color: 'var(--ink3)', fontSize: 12 }}>
          <span className="dot-bounce" /><span className="dot-bounce" /><span className="dot-bounce" />
          <span style={{ marginLeft: 6 }}>Generating…</span>
        </div>
      ) : editing ? (
        <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
          style={{ width: '100%', background: 'var(--depth3)', border: '1px solid var(--rim2)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'var(--ink1)', lineHeight: 1.6, resize: 'none', minHeight: 72, outline: 'none', fontFamily: '"Space Grotesk",sans-serif', marginBottom: 8 }} />
      ) : (
        <div style={{ fontSize: 12, color: 'var(--ink1)', lineHeight: 1.6, background: 'var(--depth3)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, whiteSpace: 'pre-wrap' }}>
          {draft || <span style={{ color: 'var(--ink3)' }}>Could not generate — click Edit</span>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 7 }}>
        <button className="btn-approve" style={{ flex: 1, fontSize: 11.5, padding: '6px 0' }}
          onClick={handleSend} disabled={sending || loading || !draft.trim()}>
          {sending ? '\u23f3 Sending\u2026' : '\u2709\ufe0f Send Reply'}
        </button>
        <button className="btn-view" style={{ fontSize: 11.5, padding: '6px 10px' }}
          onClick={() => setEditing(e => !e)}>
          {editing ? '\u2713 Done' : '\u270f\ufe0f Edit'}
        </button>
        <button className="btn-deny" style={{ fontSize: 11.5, padding: '6px 10px' }}
          onClick={onClose}>Skip</button>
      </div>
    </div>
  )
}

function SmartReplyCard({ notif, onSend, onSkip }) {
  const [draft, setDraft] = useState(notif.suggestedReply || '')
  const [editing, setEditing] = useState(false)
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    setSending(true)
    await onSend(draft)
    setSending(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      style={{ background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 16px 50px rgba(0,0,0,0.5)', width: 360 }}
    >
      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--rim1)', background: 'rgba(61,139,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15 }}>🤖</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pulse2)' }}>Mneva AI — Smart Reply Suggestion</span>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink1)', marginBottom: 2 }}>{notif.subject}</div>
        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>From: {notif.from}</div>
      </div>

      {/* Email preview */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--rim1)', fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.5, maxHeight: 60, overflow: 'hidden' }}>
        {notif.preview}
      </div>

      {/* Draft */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--rim1)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Suggested Reply</div>
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            style={{ width: '100%', background: 'var(--depth3)', border: '1px solid var(--rim2)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: 'var(--ink1)', lineHeight: 1.6, resize: 'none', minHeight: 80, outline: 'none', fontFamily: '"Space Grotesk",sans-serif' }}
          />
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--ink1)', lineHeight: 1.6, background: 'var(--depth3)', borderRadius: 8, padding: '8px 10px' }}>
            {draft || <span style={{ color: 'var(--ink3)' }}>No draft generated</span>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
        <button className="btn-approve" style={{ flex: 1, fontSize: 12, padding: '7px 0' }}
          onClick={handleSend} disabled={sending || !draft.trim()}>
          {sending ? '⏳ Sending…' : '✉️ Send Reply'}
        </button>
        <button className="btn-view" style={{ fontSize: 12, padding: '7px 10px' }}
          onClick={() => setEditing(e => !e)}>
          {editing ? '✓ Done' : '✏️ Edit'}
        </button>
        <button className="btn-deny" style={{ fontSize: 12, padding: '7px 10px' }}
          onClick={onSkip}>
          Skip
        </button>
      </div>
    </motion.div>
  )
}

function Topbar({ title }) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [searchVal, setSearchVal] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState(null)
  const [liveNotifs, setLiveNotifs] = useState([])        // { ...notif, gmailData? }
  const [activeReply, setActiveReply] = useState(null)    // the one card shown when clicking a notif
  const [replyCards, setReplyCards] = useState([])        // auto-popup cards from socket
  const notifRef = useRef(null)
  const searchRef = useRef(null)
  const nav = useNavigate()
  const queryClient = useQueryClient()
  const { on, emit } = useSocket()

  const dismissCard = useCallback((id) => {
    setReplyCards(prev => prev.filter(c => c.id !== id))
  }, [])

  useEffect(() => {
    const offNotif = on('gmail:notification', (data) => {
      // store full gmail data on the live notif so clicking it can show the card
      setLiveNotifs(prev => [{
        id: data.id,
        title: data.title,
        body: data.body,
        type: 'email',
        read: false,
        ts: data.ts,
        emailId: data.emailId,
        gmailData: data,   // keep full payload
      }, ...prev])
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['brief'] })
      queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] })

      // auto-popup smart reply card if draft exists
      if (data.suggestedReply) {
        setReplyCards(prev => [...prev, data])
      } else {
        toast(
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => nav('/comms')}>
            <span style={{ fontSize: 18 }}>📧</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{data.subject || 'New Email'}</div>
              <div style={{ fontSize: 11.5, color: '#aaa' }}>From: {data.from}</div>
            </div>
          </div>,
          { duration: 6000, icon: null }
        )
      }
    })

    const offSms = on('sms:notification', (data) => {
      setLiveNotifs(prev => [{
        id: data.id,
        title: data.title,
        body: data.body,
        type: 'sms',
        read: false,
        ts: data.ts,
        smsId: data.smsId,
        from: data.from,
      }, ...prev])
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['brief'] })
      queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] })
      toast(
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => nav('/comms')}>
          <span style={{ fontSize: 18 }}>📱</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{data.title || 'New SMS'}</div>
            <div style={{ fontSize: 11.5, color: '#aaa' }}>From: {data.from}</div>
          </div>
        </div>,
        { duration: 6000, icon: null }
      )
    })

    const offCalendar = on('calendar:notification', (data) => {
        setLiveNotifs(prev => [{
          id: data.id,
          title: data.title,
          body: data.body,
          type: 'calendar',
          read: false,
          ts: data.ts,
          eventId: data.eventId,
          start: data.start,
        }, ...prev])
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
        queryClient.invalidateQueries({ queryKey: ['brief'] })
        queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] })
        toast(
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => nav('/dashboard')}>
            <span style={{ fontSize: 18 }}>📅</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{data.title || 'Calendar event'}</div>
              <div style={{ fontSize: 11.5, color: '#aaa' }}>{data.start ? new Date(data.start).toLocaleString() : ''}</div>
            </div>
          </div>,
          { duration: 6000, icon: null }
        )
      })

    const offGeneric = on('notification:created', (data) => {
        setLiveNotifs(prev => [{
          id: data.id,
          title: data.title,
          body: data.body,
          type: data.type || 'info',
          read: false,
          ts: data.ts,
          source: data.source,
        }, ...prev])
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
        queryClient.invalidateQueries({ queryKey: ['brief'] })
        queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] })
        toast(
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => nav('/dashboard')}>
            <span style={{ fontSize: 18 }}>{data.type === 'sms' ? '📱' : data.type === 'calendar' ? '📅' : '🔔'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{data.title}</div>
              <div style={{ fontSize: 11.5, color: '#aaa' }}>{data.body}</div>
            </div>
          </div>,
          { duration: 6000, icon: null }
        )
      })

    const offSent = on('gmail:reply_sent', async ({ notifId }) => {
      dismissCard(notifId)
      setActiveReply(null)
      toast.success('✉️ Reply sent!')
      if (notifId) {
        try {
          await notifApi.markRead(notifId)
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
          queryClient.invalidateQueries({ queryKey: ['brief'] })
          queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] })
        } catch (_err) {
          // keep UI responsive even if backend call fails
        }
      }
    })
    const offErr = on('gmail:reply_error', ({ notifId, error }) => {
      dismissCard(notifId)
      toast.error(`Send failed: ${error}`)
    })

    const offApp = on('app:notification', (data) => {
      setLiveNotifs(prev => [{
        id: data.id, title: data.title, body: data.body,
        type: data.type || 'info', source: data.source, appName: data.appName,
        read: false, ts: data.ts,
      }, ...prev])
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      const sourceIcons = { sms: '📱', whatsapp: '💬', instagram: '📸', shopping: '🛍️', food: '🍛', payment: '💸', booking: '🚗', social: '🔔', info: '🔔' }
      const icon = sourceIcons[data.type] || '🔔'
      toast(
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{data.appName || data.source}</div>
            <div style={{ fontSize: 11.5, color: '#aaa' }}>{data.body?.slice(0, 80)}</div>
          </div>
        </div>,
        { duration: 6000, icon: null }
      )
    })

    return () => { offNotif(); offSms(); offCalendar(); offGeneric(); offApp(); offSent(); offErr() }
  }, [on, nav, queryClient, dismissCard])

  const { data: notifData } = useQuery({ queryKey: ['notifications'], queryFn: notifApi.all, staleTime: 15000 })
  const dbNotifs = notifData?.notifications || []
  const liveIds = new Set(liveNotifs.map(n => n.id))
  const notifs = [...liveNotifs, ...dbNotifs.filter(n => !liveIds.has(n.id))]
  const unread = notifs.filter(n => !n.read).length

  const handleNotifClick = (n) => {
    setLiveNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    notifApi.markRead(n.id).catch(() => {})
    if (n.type === 'email') {
      // toggle inline reply panel for this notification
      setActiveReply(prev => {
        const next = prev?.id === n.id ? null : (n.gmailData || n)
        if (next?.id) dismissCard(next.id)
        return next
      })
    }
  }

  useEffect(() => {
    const h = e => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleSearch = async (q) => {
    setSearchVal(q)
    if (q.length < 2) { setSearchResults(null); return }
    try {
      const r = await searchApi.query(q)
      setSearchResults(r.results)
    } catch { setSearchResults([]) }
  }

  const sendReply = useCallback((card, draft) => {
    emit('gmail:send_reply', {
      emailId: card.emailId,
      recipient: card.from,
      subject: card.subject,
      draft,
      notifId: card.id,
    })
  }, [emit])

  return (
    <header style={{ height: 58, background: 'var(--depth1)', borderBottom: '1px solid var(--rim1)', display: 'flex', alignItems: 'center', padding: '0 22px', gap: 12, flexShrink: 0 }}>
      <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>{title}</div>

      {/* Smart reply card opened by clicking a notification */}
      <AnimatePresence>
        {activeReply && !notifOpen && (
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300 }}>
            <SmartReplyCard
              notif={activeReply}
              onSend={(draft) => sendReply(activeReply, draft)}
              onSkip={() => setActiveReply(null)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Auto-popup smart reply cards from socket (new emails) */}
      <AnimatePresence>
        {replyCards.filter(card => card.id !== activeReply?.id).map((card, i) => (
          <div key={card.id} style={{ position: 'fixed', bottom: activeReply && !notifOpen ? 320 + i * 20 : 24 + i * 20, right: 24, zIndex: 200 }}>
            <SmartReplyCard
              notif={card}
              onSend={(draft) => { sendReply(card, draft); dismissCard(card.id) }}
              onSkip={() => dismissCard(card.id)}
            />
          </div>
        ))}
      </AnimatePresence>

      {/* Search */}
      <div ref={searchRef} style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--depth3)', border: '1px solid var(--rim1)', borderRadius: 9, padding: '6px 12px', width: searchOpen ? 240 : 36, transition: 'width 0.25s', overflow: 'hidden' }}>
          <span style={{ fontSize: 13, flexShrink: 0, cursor: 'pointer' }} onClick={() => setSearchOpen(true)}>🔍</span>
          {searchOpen && (
            <input autoFocus value={searchVal} onChange={e => handleSearch(e.target.value)}
              placeholder="Search everything…" style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12.5, color: 'var(--ink1)', flex: 1, fontFamily: '"Space Grotesk",sans-serif' }} />
          )}
        </div>
        <AnimatePresence>
          {searchOpen && searchResults && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', top: 42, right: 0, width: 300, background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 12, padding: 8, zIndex: 100, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
              {searchResults.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '8px 10px' }}>No results for "{searchVal}"</div>
              ) : searchResults.map((r, i) => (
                <div key={i} onClick={() => setSearchOpen(false)}
                  style={{ display: 'flex', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--depth3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 14 }}>{r.type === 'email' ? '📧' : r.type === 'sms' ? '📱' : r.type === 'payment' ? '💸' : r.type === 'health' ? '❤️' : '💡'}</span>
                  <div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.title}</div><div style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.snippet}</div></div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Notifications */}
      <div ref={notifRef} style={{ position: 'relative' }}>
        <TopBtn icon="🔔" badge={unread} onClick={() => setNotifOpen(o => !o)} active={notifOpen} />
        <AnimatePresence>
          {notifOpen && (
            <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
              style={{ position: 'absolute', right: 0, top: 44, width: 360, background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 14, boxShadow: '0 16px 50px rgba(0,0,0,0.5)', zIndex: 100, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid var(--rim1)' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Notifications</span>
                {unread > 0 && <span style={{ marginLeft: 8, background: 'var(--pulse)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{unread}</span>}
                {unread > 0 && (
                  <button onClick={async () => { await notifApi.readAll(); setLiveNotifs(p => p.map(n => ({ ...n, read: true }))); queryClient.invalidateQueries({ queryKey: ['notifications'] }); queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] }) }}
                    style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--pulse2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>Mark all read</button>
                )}
              </div>
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {notifs.length === 0 && (
                  <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No notifications yet</div>
                )}
                {notifs.map(n => (
                  <div key={n.id}>
                    <div onClick={() => handleNotifClick(n)}
                      style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: activeReply?.id === n.id ? 'none' : '1px solid var(--rim1)', background: activeReply?.id === n.id ? 'rgba(61,139,255,0.06)' : n.read ? 'transparent' : 'rgba(61,139,255,0.04)', cursor: 'pointer', transition: 'background 0.12s' }}
                      onMouseEnter={e => { if (activeReply?.id !== n.id) e.currentTarget.style.background = 'var(--depth3)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = activeReply?.id === n.id ? 'rgba(61,139,255,0.06)' : n.read ? 'transparent' : 'rgba(61,139,255,0.04)' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: n.type === 'email' ? 'rgba(61,139,255,0.15)' : n.type === 'calendar' ? 'rgba(0,227,150,0.12)' : n.type === 'whatsapp' ? 'rgba(37,211,102,0.15)' : n.type === 'payment' ? 'rgba(0,227,150,0.12)' : n.type === 'shopping' ? 'rgba(255,176,32,0.12)' : n.type === 'food' ? 'rgba(255,107,53,0.12)' : n.type === 'booking' ? 'rgba(61,139,255,0.12)' : 'rgba(61,139,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                        {n.type === 'email' ? '📧' : n.type === 'sms' ? '📱' : n.type === 'calendar' ? '📅' : n.type === 'whatsapp' ? '💬' : n.type === 'instagram' ? '📸' : n.type === 'shopping' ? '🛍️' : n.type === 'food' ? '🍛' : n.type === 'payment' ? '💸' : n.type === 'booking' ? '🚗' : n.type === 'social' ? '🔔' : '🔔'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: n.read ? 500 : 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.body}</div>
                        {n.type === 'email' && (
                          <div style={{ fontSize: 10.5, color: activeReply?.id === n.id ? 'var(--warn)' : 'var(--pulse2)', marginTop: 3, fontWeight: 600 }}>
                            {activeReply?.id === n.id ? '▲ Hide reply' : '🤖 Click to reply with AI'}
                          </div>
                        )}
                      </div>
                      {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pulse)', flexShrink: 0, marginTop: 5 }} />}
                    </div>

                    {/* Inline reply panel — only under the clicked notification */}
                    <AnimatePresence>
                      {activeReply?.id === n.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden', borderBottom: '1px solid var(--rim1)' }}
                        >
                          <NotifInlineReply
                            notif={activeReply}
                            emit={emit}
                            on={on}
                            onClose={() => setActiveReply(null)}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <TopBtn icon="🔐" onClick={() => toast('🔐 Biometric gate active — L1 auth required for financial actions')} />
    </header>
  )
}

function BackendStatusBanner() {
  const { backendOnline, backendMessage } = useUI()
  if (backendOnline) return null
  const backendHost = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || window.location.origin

  return (
    <div style={{ padding: '12px 22px', background: 'rgba(255, 69, 96, 0.12)', borderBottom: '1px solid rgba(255, 69, 96, 0.18)', color: '#ff4562', fontSize: 13, fontWeight: 600 }}>
      Backend unavailable. Please start the API server at {backendHost}.
      {backendMessage ? ` (${backendMessage})` : ''}
    </div>
  )
}

function TopBtn({ icon, badge, onClick, active }) {
  return (
    <button onClick={onClick}
      style={{ width: 36, height: 36, borderRadius: 9, background: active ? 'var(--depth4)' : 'var(--depth3)', border: `1px solid ${active ? 'var(--rim2)' : 'var(--rim1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15, position: 'relative', transition: 'all 0.15s', flexShrink: 0 }}>
      {icon}
      {badge > 0 && <div style={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: '50%', background: 'var(--pulse)', border: '2px solid var(--depth1)' }} />}
    </button>
  )
}
