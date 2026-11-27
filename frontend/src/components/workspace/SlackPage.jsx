import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import IntegrationGate from '../ui/IntegrationGate'
import EmptyState from '../ui/EmptyState'
import { slackApi } from '../../services/api'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const up = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

export default function SlackPage() {
  const [channelId, setChannelId] = useState(null)
  const { data: channels } = useQuery({ queryKey: ['slackChannels'], queryFn: slackApi.channels })
  const { data: messages } = useQuery({ queryKey: ['slackMessages', channelId], queryFn: () => slackApi.channelMessages(channelId), enabled: !!channelId })

  const sendTest = async () => {
    try { await slackApi.sendTest(); toast.success('Test message sent to Slack') }
    catch (err) { toast.error(err.response?.data?.error || err.message || 'Could not send') }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>💬 Slack</div>
        <button className="btn-ghost" onClick={sendTest}>Send test message</button>
      </motion.div>

      <IntegrationGate name="Slack" icon="💬" statusFn={slackApi.status} connectFn={slackApi.connect}>
        {!channels?.length && <EmptyState icon="💬" title="No channels found" />}
        {channels?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 14 }}>
            <div className="card" style={{ padding: 6, maxHeight: '70vh', overflowY: 'auto' }}>
              {channels.map(c => (
                <div key={c.id} onClick={() => setChannelId(c.id)}
                  style={{ padding: '10px 14px', borderRadius: 9, cursor: 'pointer', background: channelId === c.id ? 'rgba(61,139,255,0.1)' : 'transparent', fontSize: 13 }}>
                  # {c.name} <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>({c.memberCount})</span>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: 16, maxHeight: '70vh', overflowY: 'auto' }}>
              {!channelId && <EmptyState icon="👈" title="Select a channel" />}
              {channelId && (!messages || messages.length === 0) && <EmptyState icon="💬" title="No messages" />}
              {messages?.map(m => (
                <div key={m.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{m.user}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{m.time}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{m.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </IntegrationGate>
    </motion.div>
  )
}
