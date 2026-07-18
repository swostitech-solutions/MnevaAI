import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { twinApi, agentApi, notifApi } from '../../services/api'
import toast from 'react-hot-toast'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }

const TYPE_META = {
  payment:  { icon: '💸', color: 'rgba(0,227,150,0.12)',   badge: 'badge-go',     label: 'Payment'   },
  booking:  { icon: '🚗', color: 'rgba(61,139,255,0.12)',  badge: 'badge-pulse',  label: 'Booking'   },
  email:    { icon: '📧', color: 'rgba(155,114,255,0.12)', badge: 'badge-violet', label: 'Email'     },
  meeting:  { icon: '📅', color: 'rgba(0,210,200,0.14)',   badge: 'badge-go',     label: 'Meeting'   },
  reminder: { icon: '🔔', color: 'rgba(255,176,32,0.12)',  badge: 'badge-warn',   label: 'Reminder'  },
  insight:  { icon: '💡', color: 'rgba(6,182,212,0.12)',   badge: 'badge-pulse',  label: 'Insight'   },
  default:  { icon: '⚡', color: 'rgba(61,139,255,0.1)',   badge: 'badge-pulse',  label: 'Action'    },
}

export default function TwinDiary() {
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const f = searchParams.get('filter')
    const VALID = ['all','meeting','payment','booking','email','reminder','insight']
    if (f && VALID.includes(f)) setFilter(f)
  }, [searchParams])

  const { data: diaryData }  = useQuery({ queryKey: ['diary'],         queryFn: twinApi.diary,    staleTime: 60000 })
  const { data: ledgerData } = useQuery({ queryKey: ['ledger'],        queryFn: agentApi.ledger,  staleTime: 60000 })
  const { data: notifData }  = useQuery({ queryKey: ['notifications'], queryFn: notifApi.all,     staleTime: 30000 })


  const diaryEntries = diaryData?.entries || []

  function toolToType(tool = '') {
    if (tool === 'schedule_event')     return 'meeting'
    if (tool === 'initiate_payment')   return 'payment'
    if (['get_emails','draft_reply','send_email'].includes(tool)) return 'email'
    if (['book_cab','order_food'].includes(tool))                 return 'booking'
    if (tool === 'set_reminder')       return 'reminder'
    if (['get_daily_brief','get_portfolio','get_spending_summary','get_health_data','query_bills','personal_search'].includes(tool)) return 'insight'
    return 'default'
  }

  function toolToLabel(tool = '', input = {}) {
    if (tool === 'schedule_event')   return `Scheduled: ${input?.title || 'Event'}`
    if (tool === 'set_reminder')     return `Reminder: ${input?.message || ''}`
    if (tool === 'send_email')       return `Email sent to ${input?.recipient || ''}`
    if (tool === 'draft_reply')      return `Draft reply for email ${input?.email_id || ''}`
    if (tool === 'get_emails')       return `Fetched emails (${input?.filter || 'all'})`
    if (tool === 'initiate_payment') return `Payment ₹${input?.amount || ''} to ${input?.payee || ''}`
    if (tool === 'book_cab')         return `Cab: ${input?.pickup || ''} → ${input?.destination || ''}`
    if (tool === 'order_food')       return `Food order from ${input?.restaurant || ''}`
    if (tool === 'personal_search')  return `Search: "${input?.query || ''}"`
    if (tool === 'get_daily_brief')  return 'Daily brief generated'
    if (tool === 'get_portfolio')    return 'Portfolio snapshot fetched'
    if (tool === 'get_spending_summary') return `Spending summary (${input?.period || 'month'})`
    if (tool === 'get_health_data')  return 'Health data fetched'
    if (tool === 'query_bills')      return `Bills queried (${input?.filter || 'all'})`
    return tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  const now = Date.now()

  const ledgerEntries = (ledgerData?.entries || []).map(e => {
    const type = toolToType(e.tool)
    // determine scheduled time for reminder/event tools
    let scheduledAt = null
    if (e.tool === 'set_reminder' && e.input?.time) scheduledAt = new Date(e.input.time).getTime()
    if (e.tool === 'schedule_event' && e.input?.start) scheduledAt = new Date(e.input.start).getTime()
    // compute display status: if has a future scheduled time → pending, past → completed
    let status = e.status || 'completed'
    if (scheduledAt) status = scheduledAt > now ? 'pending' : 'completed'
    return {
      id: e.id, ts: e.ts,
      type,
      action: toolToLabel(e.tool, e.input),
      tool: e.tool, input: e.input, result: e.result,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      sig: e.sig, source: 'agent',
    }
  })

  // Email entries from notifications table (polled from Gmail)
  const emailEntries = (notifData?.notifications || [])
    .filter(n => n.type === 'email')
    .map(n => {
      let meta = {}
      try { meta = JSON.parse(n.body || '{}') } catch {}
      const from = n.from || meta.from || ''
      const subject = n.title?.replace('\ud83d\udce7 ', '') || '(No subject)'
      return {
        id: `notif_${n.id}`,
        ts: n.ts,
        type: 'email',
        action: subject,
        detail: from ? `From: ${from}` : '',
        preview: n.body || '',
        from,
        subject,
        status: n.read ? 'read' : 'unread',
        source: 'gmail',
        sig: null,
      }
    })

  // Insight entries — AI tool calls that are read-only queries
  const insightTools = ['get_daily_brief','get_portfolio','get_spending_summary','get_health_data','query_bills','personal_search']
  const insightEntries = ledgerEntries.filter(e => insightTools.includes(e.tool))

  const all = [...diaryEntries, ...ledgerEntries, ...emailEntries].sort((a, b) => new Date(b.ts) - new Date(a.ts))
  const filtered = filter === 'all' ? all
    : filter === 'email'   ? emailEntries.sort((a,b) => new Date(b.ts) - new Date(a.ts))
    : filter === 'insight' ? insightEntries
    : all.filter(e => e.type === filter)

  const FILTERS = ['all','meeting','payment','booking','email','reminder','insight']
  const FILTER_LABELS = { all: 'All', meeting: '📅 Meeting', payment: '💸 Payment', booking: '🚗 Booking', email: '📧 Email', reminder: '🔔 Reminder', insight: '💡 Insight' }

  const STATS = [
    { label: 'Total Actions', value: all.length,                                                                          color: 'var(--pulse2)' },
    { label: 'Completed',     value: all.filter(e => e.status === 'completed' || e.status === 'read').length,             color: 'var(--go)'    },
    { label: 'Pending',       value: all.filter(e => e.status === 'pending' || e.status === 'unread').length,             color: 'var(--warn)'  },
    { label: 'Today',         value: all.filter(e => e.ts?.startsWith(new Date().toISOString().slice(0,10))).length,      color: 'var(--violet)' },
  ]

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* Header */}
      <motion.div variants={up} style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 5 }}>
          📓 Twin Diary — <span className="grad-text">Signed Action Ledger</span>
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink2)' }}>
          Every action Mneva takes on your behalf is cryptographically signed and immutably logged here.
          Your audit trail — yours alone.
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div variants={up} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {STATS.map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 26 }}>{s.value}</div>
          </div>
        ))}
      </motion.div>

      {/* Filter pills */}
      <motion.div variants={up} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ background: filter === f ? 'rgba(61,139,255,0.14)' : 'var(--depth3)', border: `1px solid ${filter === f ? 'var(--rim2)' : 'var(--rim1)'}`, color: filter === f ? 'var(--pulse2)' : 'var(--ink3)', fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif', textTransform: 'capitalize', transition: 'all 0.15s' }}>
            {f === 'all' ? `⚡ All (${all.length})` : FILTER_LABELS[f]}
          </button>
        ))}
      </motion.div>

      {/* Timeline */}
      <motion.div variants={up} className="card" style={{ padding: 20 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink3)' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
            <div>No entries{filter !== 'all' ? ` of type "${filter}"` : ''} yet</div>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: 18, top: 0, bottom: 0, width: 1, background: 'var(--rim1)' }} />

            {filtered.map((entry, i) => {
              const meta = TYPE_META[entry.type] || TYPE_META.default
              const isExp = expanded === entry.id
              const ts = new Date(entry.ts)
              const timeStr = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
              const dateStr = ts.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })

              return (
                <motion.div key={entry.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                  style={{ display: 'flex', gap: 16, marginBottom: 16, position: 'relative' }}>
                  {/* Icon dot */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0, zIndex: 1, border: '2px solid var(--depth2)' }}>
                    {meta.icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, background: 'var(--depth3)', borderRadius: 12, padding: '12px 15px', border: '1px solid var(--rim1)', cursor: 'pointer' }}
                    onClick={() => setExpanded(isExp ? null : entry.id)}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{entry.action}</div>
                        {entry.detail && <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.detail}</div>}
                        {entry.scheduledAt && (
                          <div style={{ fontSize: 11.5, color: entry.status === 'pending' ? 'var(--warn)' : 'var(--go)', marginBottom: 3, fontWeight: 600 }}>
                            {entry.status === 'pending' ? '⏰ Scheduled: ' : '✅ Was: '}
                            {new Date(entry.scheduledAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        {entry.type === 'meeting' && entry.result?.meetLink && (
                          <a
                            href={entry.result.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              marginBottom: 5, padding: '4px 10px',
                              background: 'linear-gradient(135deg, rgba(0,210,200,0.18), rgba(61,139,255,0.14))',
                              border: '1px solid rgba(0,210,200,0.4)',
                              borderRadius: 20, fontSize: 11.5, fontWeight: 700,
                              color: 'var(--go)', textDecoration: 'none',
                              transition: 'opacity 0.15s',
                            }}
                          >
                            📹 Join Google Meet
                          </a>
                        )}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{dateStr} · {timeStr}</span>
                          {entry.source === 'agent' && <span className="badge badge-pulse" style={{ fontSize: 9 }}>Agent</span>}
                          {entry.source === 'gmail' && <span className="badge badge-violet" style={{ fontSize: 9 }}>Gmail</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <span className={`badge ${entry.status === 'completed' ? 'badge-go' : entry.status === 'pending' ? 'badge-warn' : entry.status === 'unread' ? 'badge-pulse' : entry.status === 'read' ? 'badge-warn' : 'badge-pulse'}`}>
                          {entry.status}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--ink4)' }}>{isExp ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Expanded signature view */}
                    <AnimatePresence>
                      {isExp && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          style={{ overflow: 'hidden' }}>
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--rim1)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, fontSize: 12 }}>
                              <span style={{ color: 'var(--ink3)' }}>Entry ID</span>
                              <span style={{ fontFamily: '"JetBrains Mono",monospace', color: 'var(--ink2)', fontSize: 11 }}>{entry.id}</span>
                              <span style={{ color: 'var(--ink3)' }}>Timestamp</span>
                              <span style={{ fontFamily: '"JetBrains Mono",monospace', color: 'var(--ink2)', fontSize: 11 }}>{entry.ts}</span>
                              <span style={{ color: 'var(--ink3)' }}>Tool</span>
                              <span style={{ fontFamily: '"JetBrains Mono",monospace', color: 'var(--ink2)', fontSize: 11 }}>{entry.tool || entry.type}</span>
                              {entry.from && (
                                <>
                                  <span style={{ color: 'var(--ink3)' }}>From</span>
                                  <span style={{ color: 'var(--ink2)', fontSize: 11 }}>{entry.from}</span>
                                </>
                              )}
                              {entry.preview && (
                                <>
                                  <span style={{ color: 'var(--ink3)' }}>Preview</span>
                                  <span style={{ color: 'var(--ink2)', fontSize: 11, lineHeight: 1.5 }}>{String(entry.preview).slice(0, 200)}</span>
                                </>
                              )}
                              {entry.input && (
                                <>
                                  <span style={{ color: 'var(--ink3)' }}>Input</span>
                                  <span style={{ fontFamily: '"JetBrains Mono",monospace', color: 'var(--ink2)', fontSize: 11, wordBreak: 'break-all' }}>{JSON.stringify(entry.input).slice(0, 200)}</span>
                                </>
                              )}
                              {entry.type === 'meeting' && entry.result?.meetLink && (
                                <>
                                  <span style={{ color: 'var(--ink3)' }}>Meet Link</span>
                                  <a href={entry.result.meetLink} target="_blank" rel="noopener noreferrer"
                                    style={{ color: 'var(--go)', fontSize: 11, wordBreak: 'break-all', fontWeight: 600 }}>
                                    {entry.result.meetLink}
                                  </a>
                                </>
                              )}
                              {entry.type === 'meeting' && entry.result?.htmlLink && (
                                <>
                                  <span style={{ color: 'var(--ink3)' }}>Calendar</span>
                                  <a href={entry.result.htmlLink} target="_blank" rel="noopener noreferrer"
                                    style={{ color: 'var(--pulse2)', fontSize: 11, wordBreak: 'break-all' }}>
                                    Open in Google Calendar
                                  </a>
                                </>
                              )}
                              {entry.result && entry.type !== 'meeting' && (
                                <>
                                  <span style={{ color: 'var(--ink3)' }}>Result</span>
                                  <span style={{ fontFamily: '"JetBrains Mono",monospace', color: entry.result?.success === false ? 'var(--danger)' : 'var(--go)', fontSize: 11, wordBreak: 'break-all' }}>{JSON.stringify(entry.result).slice(0, 200)}</span>
                                </>
                              )}
                              {entry.sig && (
                                <>
                                  <span style={{ color: 'var(--ink3)' }}>Signature</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontFamily: '"JetBrains Mono",monospace', color: 'var(--go)', fontSize: 11 }}>{entry.sig}</span>
                                    <span className="badge badge-go" style={{ fontSize: 9 }}>✓ Verified</span>
                                  </div>
                                </>
                              )}
                            </div>
                            <button className="btn-view" style={{ marginTop: 10, fontSize: 11 }}
                              onClick={() => { navigator.clipboard?.writeText(JSON.stringify(entry, null, 2)); toast.success('Entry copied to clipboard') }}>
                              📋 Copy full entry
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
