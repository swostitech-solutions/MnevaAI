import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import IntegrationGate from '../ui/IntegrationGate'
import EmptyState from '../ui/EmptyState'
import Modal from '../ui/Modal'
import FormField from '../ui/FormField'
import { outlookApi } from '../../services/api'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const up = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

export default function OutlookCalendarPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)

  const { data: events, isLoading } = useQuery({ queryKey: ['outlookEvents'], queryFn: () => outlookApi.events(20) })

  const create = async () => {
    if (!modal.title || !modal.start || !modal.end) return toast.error('Title, start and end are required')
    setSaving(true)
    try {
      await outlookApi.createEvent({ title: modal.title, start: modal.start, end: modal.end, location: modal.location })
      toast.success('Event created')
      setModal(null)
      qc.invalidateQueries({ queryKey: ['outlookEvents'] })
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Could not create event')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <Link to="/microsoft" style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>← Microsoft 365</Link>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>📅 Outlook Calendar</div>
        <button className="btn-primary" onClick={() => setModal({ title: '', start: '', end: '', location: '' })}>+ New Event</button>
      </motion.div>

      <IntegrationGate name="Microsoft 365" icon="📅" statusFn={outlookApi.status} connectFn={outlookApi.connect}>
        {!isLoading && (!events || events.length === 0) && <EmptyState icon="📅" title="No upcoming events" />}
        {events?.length > 0 && (
          <motion.div variants={up} className="card" style={{ padding: 8 }}>
            {events.map(e => (
              <a key={e.id} href={e.link} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', textDecoration: 'none', color: 'var(--ink1)', borderRadius: 10 }}>
                <div style={{ textAlign: 'center', width: 48, flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{e.start ? new Date(e.start).toLocaleDateString('en-IN', { month: 'short' }) : ''}</div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{e.start ? new Date(e.start).getDate() : '—'}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                    {e.start ? new Date(e.start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                    {e.location ? ` · ${e.location}` : ''}
                  </div>
                </div>
              </a>
            ))}
          </motion.div>
        )}
      </IntegrationGate>

      {modal && (
        <Modal title="New Event" icon="📅" onClose={() => setModal(null)}>
          <FormField label="Title" required value={modal.title} onChange={v => setModal({ ...modal, title: v })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormField label="Start" required type="datetime" value={modal.start} onChange={v => setModal({ ...modal, start: v })} />
            <FormField label="End" required type="datetime" value={modal.end} onChange={v => setModal({ ...modal, end: v })} />
          </div>
          <FormField label="Location" value={modal.location} onChange={v => setModal({ ...modal, location: v })} />
          <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={saving} onClick={create}>{saving ? 'Creating…' : 'Create Event'}</button>
        </Modal>
      )}
    </motion.div>
  )
}
