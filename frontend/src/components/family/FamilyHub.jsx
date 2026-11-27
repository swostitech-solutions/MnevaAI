import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }

const LINKS = [
  { to: '/family/tasks', icon: '✅', label: 'Family Tasks' },
  { to: '/family/medications', icon: '💊', label: 'Parent Medications' },
  { to: '/family/pets', icon: '🐾', label: 'Pet Care' },
  { to: '/family/children', icon: '🧒', label: 'Children & Activities' },
  { to: '/family/home', icon: '🏠', label: 'Home Maintenance' },
  { to: '/family/celebrations', icon: '🎉', label: 'Celebrations & Gifting' },
  { to: '/family/calendar', icon: '📅', label: 'Family Calendar' },
]

export default function FamilyHub() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>👨‍👩‍👧 Family</motion.div>
      <motion.div variants={up} className="card" style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
          {LINKS.map(l => (
            <Link key={l.to} to={l.to} style={{ textDecoration: 'none', color: 'var(--ink1)' }}>
              <motion.div whileHover={{ scale: 1.03 }} style={{ background: 'var(--depth3)', border: '1px solid var(--rim1)', borderRadius: 12, padding: '20px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{l.icon}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{l.label}</div>
              </motion.div>
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
