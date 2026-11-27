import React from 'react'
import { motion } from 'framer-motion'

export default function Modal({ title, icon, onClose, children, width = 440 }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 20, padding: 28, maxWidth: width, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', maxHeight: '88vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          {icon && <span style={{ fontSize: 22 }}>{icon}</span>}
          <div style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--ink3)', cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </motion.div>
    </div>
  )
}
