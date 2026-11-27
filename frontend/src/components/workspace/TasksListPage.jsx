import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import IntegrationGate from '../ui/IntegrationGate'
import EmptyState from '../ui/EmptyState'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const up = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

// Google Tasks and Microsoft To Do both return the exact same shape from
// the backend (status/'completed'|'needsAction', due, listTitle, listId),
// deliberately normalized server-side so one screen covers both.
export default function TasksListPage({ title, icon, backTo, backLabel, integrationName, statusFn, connectFn, listFn, completeFn, queryKey }) {
  const qc = useQueryClient()
  const { data: tasks, isLoading } = useQuery({ queryKey, queryFn: listFn })

  const complete = async (t) => {
    try {
      await completeFn(t.listId, t.id)
      toast.success('Marked done')
      qc.invalidateQueries({ queryKey })
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Could not complete task')
    }
  }

  const pending = (tasks || []).filter(t => t.status !== 'completed')
  const done = (tasks || []).filter(t => t.status === 'completed')

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <Link to={backTo} style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>{backLabel}</Link>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>{icon} {title}</div>
      </motion.div>

      <IntegrationGate name={integrationName} icon={icon} statusFn={statusFn} connectFn={connectFn}>
        {isLoading && <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />}
        {!isLoading && (!tasks || tasks.length === 0) && <EmptyState icon={icon} title="No tasks found" />}
        {!isLoading && pending.length > 0 && (
          <motion.div variants={up} className="card" style={{ padding: 8, marginBottom: 12 }}>
            {pending.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                <button onClick={() => complete(t)} style={{ width: 20, height: 20, borderRadius: 5, border: '1.5px solid var(--rim2)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{t.listTitle}{t.due ? ` · Due ${new Date(t.due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
        {!isLoading && done.length > 0 && (
          <motion.div variants={up} className="card" style={{ padding: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, padding: '8px 14px' }}>COMPLETED</div>
            {done.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', opacity: 0.55 }}>
                <span style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--go)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>✓</span>
                <div style={{ fontSize: 13, textDecoration: 'line-through' }}>{t.title}</div>
              </div>
            ))}
          </motion.div>
        )}
      </IntegrationGate>
    </motion.div>
  )
}
