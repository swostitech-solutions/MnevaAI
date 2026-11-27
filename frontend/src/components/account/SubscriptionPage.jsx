import React from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authApi } from '../../services/api'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }

const PLANS = [
  { id: 'Free', name: 'Free', price: '₹0', features: ['Core AI chat', 'Finance tracking', 'Basic trust levels'] },
  { id: 'Pro', name: 'Inner Circle', price: '₹999/mo', features: ['Everything in Free', 'Full autonomy (L4)', 'Priority AI responses', 'Unlimited integrations'] },
]

export default function SubscriptionPage() {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: authApi.me })
  const currentPlan = user?.plan || 'Free'

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>⭐ Subscription</motion.div>

      <motion.div variants={up} className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 32 }}>⭐</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Current Plan</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{currentPlan}</div>
        </div>
        <span className="badge badge-go">Active</span>
      </motion.div>

      <motion.div variants={up} style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        {PLANS.map(p => (
          <div key={p.id} className="card" style={{ padding: 22, border: p.id === currentPlan ? '1px solid var(--rim3)' : undefined, background: p.id === currentPlan ? 'rgba(61,139,255,0.06)' : undefined }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--pulse2)', marginBottom: 14 }}>{p.price}</div>
            {p.features.map(f => (
              <div key={f} style={{ fontSize: 12.5, color: 'var(--ink2)', marginBottom: 8, display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--go)' }}>✓</span>{f}
              </div>
            ))}
            {p.id === currentPlan ? (
              <div style={{ marginTop: 14, textAlign: 'center' }}><span className="badge badge-pulse">Your current plan</span></div>
            ) : (
              <button className="btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={() => toast('Billing portal — coming in a future release')}>
                Upgrade
              </button>
            )}
          </div>
        ))}
      </motion.div>
    </motion.div>
  )
}
