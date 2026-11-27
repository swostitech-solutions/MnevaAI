import React from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { dashApi } from '../../services/api'
import EmptyState from '../ui/EmptyState'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }

export default function MorningBriefingPage() {
  const { data: brief, isLoading } = useQuery({ queryKey: ['brief'], queryFn: dashApi.brief, staleTime: 60000 })

  if (isLoading) return <div className="skeleton" style={{ height: 240, borderRadius: 14 }} />
  if (!brief) return <EmptyState icon="⚡" title="No briefing available" />

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} className="card" style={{ padding: 24, marginBottom: 16, background: 'linear-gradient(135deg, rgba(61,139,255,0.08), rgba(155,114,255,0.05))' }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>⚡ {brief.greeting}</div>
        <div style={{ fontSize: 14, color: 'var(--ink2)' }}>{brief.summary}</div>
        {brief.importantNotifications?.urgentCount > 0 && (
          <div style={{ marginTop: 10 }}><span className="badge badge-danger">{brief.importantNotifications.urgentCount} urgent</span></div>
        )}
      </motion.div>

      {brief.suggestedMeetings?.length > 0 && (
        <motion.div variants={up} className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📅 Suggested Meetings (from your inbox)</div>
          {brief.suggestedMeetings.map((m, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: i < brief.suggestedMeetings.length - 1 ? '1px solid var(--rim1)' : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{m.subject}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>From {m.senderName || m.senderEmail} · {m.time}</div>
              {m.meetingLink && <a href={m.meetingLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: 'var(--pulse2)' }}>Join link →</a>}
            </div>
          ))}
        </motion.div>
      )}

      {brief.urgentEmails?.length > 0 && (
        <motion.div variants={up} className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📧 Urgent Emails</div>
          {brief.urgentEmails.map(e => (
            <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--rim1)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{e.subject}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{e.from} · {e.snippet}</div>
            </div>
          ))}
        </motion.div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <motion.div variants={up} className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>✅ Pending Today ({brief.pendingTasks?.length || 0})</div>
          {!brief.pendingTasks?.length && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Nothing pending.</div>}
          {brief.pendingTasks?.map(t => (
            <div key={t.id} style={{ fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--rim1)' }}>{t.title}</div>
          ))}
        </motion.div>
        <motion.div variants={up} className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>⚡ Completed Overnight ({brief.autoCompleted?.length || 0})</div>
          {!brief.autoCompleted?.length && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Nothing automated yet.</div>}
          {brief.autoCompleted?.map((a, i) => (
            <div key={i} style={{ fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--rim1)' }}>
              {a.title}{a.detail ? <span style={{ color: 'var(--ink3)' }}> — {a.detail}</span> : null}
            </div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  )
}
