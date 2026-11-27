import React from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { calendarApi, commsApi, tasksApi } from '../../services/api'
import EmptyState from '../ui/EmptyState'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }

export default function PrioritiesPage() {
  const qc = useQueryClient()

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)

  const { data: events } = useQuery({
    queryKey: ['todayEvents'],
    queryFn: () => calendarApi.events(todayStart.toISOString(), todayEnd.toISOString()),
  })
  const { data: insights } = useQuery({ queryKey: ['commsInsights'], queryFn: commsApi.insights })
  const { data: tasks } = useQuery({ queryKey: ['allTasks'], queryFn: tasksApi.list })

  const todayTasks = (Array.isArray(tasks) ? tasks : []).filter(t => t.status !== 'COMPLETED')
  const overdueTasks = todayTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date())

  const dismissInsight = async (id) => {
    try { await commsApi.dismissInsight(id); qc.invalidateQueries({ queryKey: ['commsInsights'] }) }
    catch { toast.error('Could not dismiss') }
  }
  const confirmInsight = async (id) => {
    try { await commsApi.confirmInsight(id); toast.success('Added to tasks'); qc.invalidateQueries({ queryKey: ['commsInsights'] }); qc.invalidateQueries({ queryKey: ['allTasks'] }) }
    catch { toast.error('Could not confirm') }
  }
  const completeTask = async (id) => {
    try { await tasksApi.updateStatus(id, 'COMPLETED'); qc.invalidateQueries({ queryKey: ['allTasks'] }) }
    catch { toast.error('Could not update task') }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>🎯 Priorities</motion.div>

      <motion.div variants={up} className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📅 Today's Meetings</div>
        {!events?.length && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No meetings today.</div>}
        {events?.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rim1)' }}>
            <div style={{ fontSize: 12, color: 'var(--pulse2)', fontWeight: 700, width: 60 }}>
              {e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'All day'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{e.summary}</div>
              {e.hangoutLink && <a href={e.hangoutLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: 'var(--pulse2)' }}>Join →</a>}
            </div>
          </div>
        ))}
      </motion.div>

      {(insights?.followUps?.length > 0 || insights?.commitments?.length > 0) && (
        <motion.div variants={up} className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📡 Follow-Up Radar</div>
          {insights.followUps?.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--rim1)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{f.snippet}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>To {f.recipient} · {f.subject}</div>
              </div>
              <button className="btn-deny" onClick={() => dismissInsight(f.id)}>Dismiss</button>
            </div>
          ))}
          {insights.commitments?.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--rim1)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.snippet}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{c.dueText || 'No specific date'}</div>
              </div>
              <button className="btn-approve" onClick={() => confirmInsight(c.id)}>✓ Confirm</button>
              <button className="btn-deny" onClick={() => dismissInsight(c.id)}>Dismiss</button>
            </div>
          ))}
        </motion.div>
      )}

      <motion.div variants={up} className="card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>✅ Open Tasks {overdueTasks.length > 0 && <span style={{ color: 'var(--danger)' }}>({overdueTasks.length} overdue)</span>}</div>
        {!todayTasks.length && <EmptyState icon="✅" title="Nothing open" />}
        {todayTasks.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--rim1)' }}>
            <button onClick={() => completeTask(t.id)} style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid var(--rim2)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}>{t.title}</div>
              {t.dueDate && <div style={{ fontSize: 11, color: new Date(t.dueDate) < new Date() ? 'var(--danger)' : 'var(--ink3)' }}>Due {new Date(t.dueDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>}
            </div>
          </div>
        ))}
      </motion.div>
    </motion.div>
  )
}
