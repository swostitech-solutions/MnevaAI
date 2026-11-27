import React from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { notifApi } from '../../services/api'
import EmptyState from '../ui/EmptyState'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const up = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

const TYPE_ICON = { email: '📧', sms: '💬', calendar: '📅', reminder: '🔔', whatsapp: '💬', instagram: '📸', shopping: '🛍️', food: '🍛', booking: '✈️', payment: '💸', info: '📱' }

export default function PhoneAlertsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['notifications'], queryFn: notifApi.all })
  const notifications = Array.isArray(data) ? data : data?.notifications || []

  const markRead = async (id) => {
    try { await notifApi.markRead(id); qc.invalidateQueries({ queryKey: ['notifications'] }) }
    catch { toast.error('Could not mark as read') }
  }
  const readAll = async () => {
    try { await notifApi.readAll(); toast.success('All marked as read'); qc.invalidateQueries({ queryKey: ['notifications'] }) }
    catch { toast.error('Could not mark all as read') }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>🔔 Alerts</div>
        <button className="btn-ghost" onClick={readAll}>Mark all read</button>
      </motion.div>

      {isLoading && <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />}
      {!isLoading && notifications.length === 0 && <EmptyState icon="🔔" title="No alerts" />}
      {notifications.length > 0 && (
        <motion.div variants={up} className="card" style={{ padding: 8 }}>
          {notifications.map(n => (
            <div key={n.id} onClick={() => !n.read && markRead(n.id)}
              style={{ display: 'flex', gap: 12, padding: '13px 14px', borderRadius: 10, cursor: n.read ? 'default' : 'pointer', background: n.read ? 'transparent' : 'rgba(61,139,255,0.05)' }}>
              <span style={{ fontSize: 18 }}>{TYPE_ICON[n.type] || '🔔'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 700 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{n.body}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink4)', marginTop: 4 }}>{new Date(n.ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
              </div>
              {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pulse)', flexShrink: 0, marginTop: 5 }} />}
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}
