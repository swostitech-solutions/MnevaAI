import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authApi, trustApi } from '../../services/api'
import AvatarPic from '../common/AvatarPic'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }

const AUTOMATION_UNLOCK_LEVEL = 4
const DOMAIN_LABELS = { finance: 'Finance', communications: 'Communication', health: 'Health Core', family: 'Family' }
const DOMAINS_COUNT = Object.keys(DOMAIN_LABELS).length

const ROWS = [
  { to: '/subscription', icon: '⭐', label: 'Subscription', value: 'Manage your plan' },
  { to: '/alerts', icon: '📱', label: 'Phone Alerts', value: 'View alert history' },
  { to: '/ai-profile', icon: '🧠', label: 'AI Profile', value: 'Personalize Mneva' },
  { to: '/memory', icon: '🔖', label: 'Memory', value: 'What Mneva knows about you' },
  { to: '/contacts', icon: '👥', label: 'Contacts', value: 'Google Contacts sync' },
  { to: '/twin', icon: '🔄', label: 'Automations', value: 'View AI actions', automations: true },
  { to: '/settings', icon: '⚙️', label: 'Settings', value: 'Trust, privacy & more' },
]

export default function ProfilePage() {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: authApi.me })
  const { data: trustSettings } = useQuery({ queryKey: ['trustSettings'], queryFn: trustApi.settings })

  const domains = trustSettings?.domains
  const domainsBelowL4 = domains ? Object.entries(domains).filter(([, d]) => (d.level || 1) < AUTOMATION_UNLOCK_LEVEL) : []
  const automationsUnlocked = !!domains && domainsBelowL4.length === 0

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} className="card" style={{ padding: 22, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <AvatarPic size={56} fontSize={20} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{user?.name || 'Loading…'}</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{user?.email}</div>
          <Link to="/subscription" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, textDecoration: 'none' }}>
            <span className="badge badge-pulse">☀️ {user?.plan || 'Free'} →</span>
          </Link>
        </div>
      </motion.div>

      <motion.div variants={up} className="card" style={{ padding: 8 }}>
        {ROWS.map(row => {
          const locked = row.automations && !automationsUnlocked
          const value = row.automations
            ? (locked ? (domains ? `${DOMAINS_COUNT - domainsBelowL4.length}/${DOMAINS_COUNT} at Inner Circle` : 'Checking…') : row.value)
            : row.value
          return (
            <Link key={row.to} to={row.to} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 14px', textDecoration: 'none', color: 'var(--ink1)', borderRadius: 10 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--depth3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: 18, width: 24, textAlign: 'center', opacity: locked ? 0.4 : 1 }}>{locked ? '🔒' : row.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{row.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{value}</div>
              </div>
              <span style={{ color: 'var(--ink4)' }}>→</span>
            </Link>
          )
        })}
      </motion.div>
    </motion.div>
  )
}
