import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import IntegrationGate from '../ui/IntegrationGate'
import EmptyState from '../ui/EmptyState'
import Modal from '../ui/Modal'
import FormField from '../ui/FormField'
import { outlookApi } from '../../services/api'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const up = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

export default function OutlookMailPage() {
  const [selectedId, setSelectedId] = useState(null)
  const [compose, setCompose] = useState(null)
  const [sending, setSending] = useState(false)

  const { data } = useQuery({ queryKey: ['outlookEmails'], queryFn: () => outlookApi.emails('all', 20) })
  const { data: detail } = useQuery({ queryKey: ['outlookEmail', selectedId], queryFn: () => outlookApi.getEmail(selectedId), enabled: !!selectedId })

  const send = async () => {
    if (!compose.recipient || !compose.subject || !compose.body) return toast.error('Recipient, subject and body are required')
    setSending(true)
    try {
      await outlookApi.sendEmail(compose.recipient, compose.subject, compose.body)
      toast.success('Email sent')
      setCompose(null)
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Could not send email')
    } finally {
      setSending(false)
    }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <Link to="/microsoft" style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>← Microsoft 365</Link>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>📧 Outlook Mail</div>
        <button className="btn-primary" onClick={() => setCompose({ recipient: '', subject: '', body: '' })}>+ Compose</button>
      </motion.div>

      <IntegrationGate name="Microsoft 365" icon="📧" statusFn={outlookApi.status} connectFn={outlookApi.connect}>
        {!data?.emails?.length && <EmptyState icon="📧" title="No emails" />}
        {data?.emails?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14 }}>
            <div className="card" style={{ padding: 6, maxHeight: '70vh', overflowY: 'auto' }}>
              {data.emails.map(e => (
                <div key={e.id} onClick={() => setSelectedId(e.id)}
                  style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', background: selectedId === e.id ? 'rgba(61,139,255,0.1)' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12.5, fontWeight: e.unread ? 700 : 500 }}>{e.from}</span>
                    <span style={{ fontSize: 10, color: 'var(--ink3)' }}>{e.date}</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: e.unread ? 600 : 400, marginTop: 2 }}>{e.subject}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.preview}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: 20 }}>
              {!selectedId && <EmptyState icon="👈" title="Select an email" />}
              {selectedId && detail && (
                <>
                  <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{detail.subject}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>{detail.from}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{detail.body || detail.bodyHtml}</div>
                </>
              )}
            </div>
          </div>
        )}
      </IntegrationGate>

      {compose && (
        <Modal title="Compose Email" icon="📧" onClose={() => setCompose(null)}>
          <FormField label="To" required value={compose.recipient} onChange={v => setCompose({ ...compose, recipient: v })} placeholder="name@example.com" />
          <FormField label="Subject" required value={compose.subject} onChange={v => setCompose({ ...compose, subject: v })} />
          <FormField type="textarea" label="Message" required value={compose.body} onChange={v => setCompose({ ...compose, body: v })} />
          <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={sending} onClick={send}>{sending ? 'Sending…' : 'Send'}</button>
        </Modal>
      )}
    </motion.div>
  )
}
