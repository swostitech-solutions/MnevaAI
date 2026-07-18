// Communications.jsx
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { commsApi, gmailApi, agentApi } from '../../services/api'
import { useSocket } from '../../services/socket'
import toast from 'react-hot-toast'

// ── Inline Reply Panel (same as notification bell) ────────────────────────────
function InlineReplyPanel({ email, onClose }) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const { emit, on } = useSocket()

  React.useEffect(() => {
    let cancelled = false
    agentApi.draft({
      subject: email.subject || '',
      from: email.from || '',
      preview: email.body || email.preview || '',
    }).then(r => { if (!cancelled) { setDraft(r.draft || ''); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [email.id])

  React.useEffect(() => {
    const offSent = on('gmail:reply_sent', ({ notifId }) => {
      if (notifId !== email.id) return
      toast.success('✉️ Reply sent!')
      onClose()
    })
    const offErr = on('gmail:reply_error', ({ notifId, error }) => {
      if (notifId !== email.id) return
      setSending(false)
      toast.error(`Send failed: ${error}`)
    })
    return () => { offSent(); offErr() }
  }, [on, email.id, onClose])

  const handleSend = () => {
    if (!draft.trim()) return
    setSending(true)
    emit('gmail:send_reply', {
      emailId: email.id,
      recipient: email.email || email.from || '',
      subject: email.subject || '',
      draft,
      notifId: email.id,
    })
  }

  return (
    <div style={{ margin: '0 20px 16px', background: 'var(--depth1)', border: '1px solid var(--rim2)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', background: 'rgba(61,139,255,0.07)', borderBottom: '1px solid var(--rim1)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>🤖</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--pulse2)', flex: 1 }}>Mneva AI — Suggested Reply</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
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

      {/* Actions */}
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
          onClick={onClose}>Skip</button>
      </div>
    </div>
  )
}

export function Communications() {
  const [sel, setSel] = useState(null)
  const [selBody, setSelBody] = useState(null)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [readIds, setReadIds] = useState(new Set())
  const [filter, setFilter] = useState('all')
  const queryClient = useQueryClient()
  const { on } = useSocket()

  const { data, error } = useQuery({
    queryKey: ['emails', filter],
    queryFn: () => commsApi.emails(filter),
    retry: false,
    staleTime: 30000,
    refetchInterval: 60000, // poll every 60s for new emails
  })
  const { data: gmailStatus } = useQuery({ queryKey: ['gmailStatus'], queryFn: gmailApi.status, staleTime: 60000 })
  const emails = data?.emails || []
  const gmailConnected = gmailStatus?.connected || false

  // Invalidate email list when a new Gmail notification arrives via socket
  React.useEffect(() => {
    const off = on('notification:created', (notif) => {
      if (notif?.type === 'email') {
        queryClient.invalidateQueries({ queryKey: ['emails'] })
      }
    })
    return off
  }, [on, queryClient])

  const gmailErrorCode = error?.response?.data?.error

  const bannerInfo = (() => {
    if (gmailErrorCode === 'gmail_not_connected' || (!gmailConnected && !emails.length && !error)) {
      return { icon: '📧', title: 'Connect Gmail to see your inbox', desc: 'Mneva will fetch emails, surface important ones, and draft replies in your tone.', action: 'Connect Gmail', color: 'rgba(61,139,255,0.08)', border: 'rgba(61,139,255,0.2)' }
    }
    if (gmailErrorCode === 'gmail_api_disabled') {
      return { icon: '⚠️', title: 'Gmail API not enabled in Google Cloud', desc: 'Go to Google Cloud Console → APIs → Gmail API → click Enable. Takes 1 minute.', action: 'Open Google Console', href: 'https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=769657045922', color: 'rgba(255,176,32,0.08)', border: 'rgba(255,176,32,0.25)' }
    }
    if (gmailErrorCode === 'gmail_token_expired') {
      return { icon: '🔄', title: 'Gmail session expired', desc: 'Your Gmail token has expired. Reconnect to restore access.', action: 'Reconnect Gmail', color: 'rgba(255,69,96,0.08)', border: 'rgba(255,69,96,0.2)' }
    }
    return null
  })()

  const select = async (email) => {
    if (sel?.id === email.id) return
    setReplyOpen(false)
    setSel(email)
    setSelBody(null)
    setReadIds(s => new Set([...s, email.id]))
    setBodyLoading(true)
    try {
      const full = await commsApi.getEmail(email.id)
      setSelBody(full.body || '')
    } catch { setSelBody('') }
    finally { setBodyLoading(false) }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {bannerInfo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: bannerInfo.color, border: `1px solid ${bannerInfo.border}`, borderRadius: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 22 }}>{bannerInfo.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{bannerInfo.title}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{bannerInfo.desc}</div>
          </div>
          <button className="btn-primary" style={{ fontSize: 12, padding: '8px 16px', flexShrink: 0 }}
            onClick={async () => {
              if (bannerInfo.href) { window.open(bannerInfo.href, '_blank'); return }
              try { const { url } = await gmailApi.connect(); window.location.href = url }
              catch (err) { toast.error(err.response?.data?.message || err.message || 'Could not connect Gmail') }
            }}>
            {bannerInfo.action}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        {['all', 'primary', 'social', 'promotions', 'updates', 'forums'].map((type) => (
          <button key={type} className={filter === type ? 'btn-approve' : 'btn-view'}
            style={{ fontSize: 11.5, padding: '8px 14px', textTransform: 'capitalize' }}
            onClick={() => { setFilter(type); setSel(null); setReplyOpen(false) }}>
            {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink3)' }}>{emails.length} messages</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 16, height: 'calc(100vh - 215px)' }}>
        {/* Email list */}
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--rim1)', fontWeight: 700, fontSize: 13 }}>
            📧 Inbox · {emails.filter(e => e.unread && !readIds.has(e.id)).length} unread
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {emails.map(email => {
              const unread = email.unread && !readIds.has(email.id)
              const active = sel?.id === email.id
              return (
                <div key={email.id} onClick={() => select(email)}
                  style={{ padding: '11px 15px', borderBottom: '1px solid var(--rim1)', cursor: 'pointer', background: active ? 'rgba(61,139,255,0.07)' : 'transparent', borderRight: `3px solid ${active ? 'var(--pulse)' : 'transparent'}`, transition: 'all 0.12s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: unread ? 700 : 500, color: unread ? 'var(--ink1)' : 'var(--ink2)' }}>{email.from}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ink3)', fontSize: 10.5 }}>
                      {email.category && <span style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: 8, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.06em' }}>{email.category}</span>}
                      {email.date ? `${email.date}${email.time ? ` · ${email.time}` : ''}` : email.time}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>{email.subject}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email.preview}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {unread && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pulse)', marginTop: 2 }} />}
                    {email.important && <span className="badge badge-warn" style={{ fontSize: 9 }}>Important</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Email detail */}
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {sel ? (
            <>
              <div style={{ padding: '17px 20px', borderBottom: '1px solid var(--rim1)' }}>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 9 }}>{sel.subject}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>From: {sel.from} &lt;{sel.email}&gt;</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink3)' }}>{sel.date}, {sel.time}</span>
                </div>
              </div>

              <div style={{ padding: 20, flex: 1, fontSize: 13.5, lineHeight: 1.75, color: 'var(--ink2)', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {bodyLoading
                  ? <span style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</span>
                  : selBody || <span style={{ color: 'var(--ink3)', fontSize: 13 }}>{sel.preview}</span>
                }
              </div>

              {/* Reply trigger bar */}
              {!replyOpen && (
                <div style={{ margin: '0 20px 16px', padding: '11px 14px', background: 'rgba(61,139,255,0.05)', border: '1px solid var(--rim2)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13 }}>🤖</span>
                  <span style={{ fontSize: 12, color: 'var(--ink2)', flex: 1 }}>Mneva AI can draft a reply for you</span>
                  <button className="btn-approve" style={{ fontSize: 12, padding: '7px 16px' }}
                    onClick={() => setReplyOpen(true)}>
                    ✨ Generate Draft
                  </button>
                </div>
              )}

              {/* Inline reply panel — same as notification bell */}
              <AnimatePresence>
                {replyOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <InlineReplyPanel
                      email={{ ...sel, body: selBody || sel.preview }}
                      onClose={() => setReplyOpen(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--ink3)' }}>
              <span style={{ fontSize: 44 }}>📬</span>
              <div style={{ fontSize: 14 }}>Select an email to read</div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
export default Communications
