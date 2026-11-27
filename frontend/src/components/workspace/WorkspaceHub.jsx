import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }

const GOOGLE_LINKS = [
  { to: '/workspace/docs', icon: '📄', label: 'Docs' },
  { to: '/workspace/sheets', icon: '📊', label: 'Sheets' },
  { to: '/workspace/slides', icon: '📽️', label: 'Slides' },
  { to: '/workspace/drive', icon: '🗂️', label: 'Drive' },
  { to: '/workspace/tasks', icon: '✅', label: 'Tasks' },
]

function Section({ title, children }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>{children}</div>
    </div>
  )
}

function Tile({ to, icon, label }) {
  return (
    <Link to={to} style={{ textDecoration: 'none', color: 'var(--ink1)' }}>
      <motion.div whileHover={{ scale: 1.03 }} style={{ background: 'var(--depth3)', border: '1px solid var(--rim1)', borderRadius: 12, padding: '18px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
      </motion.div>
    </Link>
  )
}

export default function WorkspaceHub() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>🧰 Workspace</motion.div>

      <motion.div variants={up}>
        <Section title="Google Workspace">
          {GOOGLE_LINKS.map(l => <Tile key={l.to} {...l} />)}
        </Section>
      </motion.div>

      <motion.div variants={up}>
        <Section title="Other">
          <Tile to="/microsoft" icon="🪟" label="Microsoft 365" />
          <Tile to="/slack" icon="💬" label="Slack" />
        </Section>
      </motion.div>
    </motion.div>
  )
}
