import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { notifApi } from '../../services/api'

const up = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

// Mirrors mobile PhoneAlertDetail.js's fallbackAnalysis() exactly — only
// Android-sourced alerts get a real server-computed `analysis`; everything
// else (email/sms/calendar/reminder-derived notifications) gets this same
// client-side heuristic instead of showing nothing.
function fallbackAnalysis(alert) {
  const text = `${alert?.title || ''} ${alert?.body || ''}`.toLowerCase()
  if (/(fraud|suspicious|unauthori[sz]ed|blocked|declined|failed)/i.test(text)) {
    return { label: 'Security or payment check', summary: 'This may need your attention to protect your account or resolve a payment issue.', nextStep: 'Open the original app and verify the activity before sharing any details or taking action.', urgency: 'urgent' }
  }
  if (/(recharge|plan (?:expir|validity)|data pack|talktime)/i.test(text)) {
    return { label: 'Recharge or plan expiry', summary: 'Your mobile plan or data pack appears to be expiring or needs a recharge soon.', nextStep: "Open your telecom operator's app to recharge or renew the plan before it expires.", urgency: alert?.priority >= 85 ? 'urgent' : 'important' }
  }
  if (/(payment|upi|bank|debit|credit|bill|due)/i.test(text)) {
    return { label: 'Money-related alert', summary: 'Mneva detected a finance-related notification that may need a quick review.', nextStep: 'Check the amount, due date, and recipient in the original app. Pay or dispute it only after verifying the details.', urgency: alert?.priority >= 85 ? 'urgent' : 'important' }
  }
  if (/(appointment|meeting|flight|delivery today|medicine|deadline)/i.test(text)) {
    return { label: 'Time-sensitive update', summary: 'This alert appears to have a time-sensitive detail worth reviewing soon.', nextStep: 'Review the time and location in the original app, then add or update a reminder if you need one.', urgency: alert?.priority >= 85 ? 'urgent' : 'important' }
  }
  return { label: 'Action may be needed', summary: 'Mneva marked this notification as useful because it may need a response, follow-up, or review.', nextStep: 'Read the full notification and decide whether to respond, complete the request, or dismiss it.', urgency: 'normal' }
}

export default function PhoneAlertDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: notifApi.all })
  const notifications = Array.isArray(data) ? data : data?.notifications || []
  const alert = notifications.find(n => n.id === id) || {}

  useEffect(() => {
    if (alert.id && !alert.read) {
      notifApi.markRead(alert.id).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })).catch(() => {})
    }
  }, [alert.id, alert.read, qc])

  const analysis = alert.analysis || fallbackAnalysis(alert)
  const urgent = analysis.urgency === 'urgent'

  return (
    <motion.div initial="hidden" animate="show" variants={up} style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/alerts" style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>← Alerts</Link>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ width: 62, height: 62, borderRadius: 18, background: urgent ? 'rgba(255,82,82,0.12)' : 'rgba(255,176,32,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 10px' }}>{urgent ? '⚠️' : '🔔'}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--pulse2)' }}>{alert.appName || 'Android app'}</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink4)', marginTop: 2 }}>{alert.ts ? new Date(alert.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 700, letterSpacing: '0.07em' }}>NOTIFICATION</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{alert.title || 'Phone alert'}</div>
        {alert.body && <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 8, lineHeight: 1.6 }}>{alert.body}</div>}
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 14, background: urgent ? 'rgba(255,82,82,0.06)' : 'rgba(0,227,150,0.06)', borderColor: urgent ? 'rgba(255,82,82,0.2)' : 'rgba(0,227,150,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--pulse)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>✨</div>
          <div>
            <div style={{ fontSize: 9.5, color: 'var(--pulse2)', fontWeight: 700, letterSpacing: '0.06em' }}>MNEVA ANALYSIS</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{analysis.label}</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>{analysis.summary}</div>
        <div style={{ display: 'flex', gap: 10, background: 'var(--depth2)', borderRadius: 10, padding: 12, marginTop: 12 }}>
          <span style={{ fontSize: 14 }}>➡️</span>
          <div>
            <div style={{ fontSize: 9.5, color: 'var(--ink3)', fontWeight: 700, letterSpacing: '0.05em' }}>SUGGESTED NEXT STEP</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3 }}>{analysis.nextStep}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--ink4)', padding: '0 8px' }}>
        🛡️ Mneva gives guidance only. Confirm important details in the original app before taking action.
      </div>
    </motion.div>
  )
}
