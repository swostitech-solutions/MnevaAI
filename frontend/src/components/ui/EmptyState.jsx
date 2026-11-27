import React from 'react'

export default function EmptyState({ icon = '📭', title = 'Nothing here yet', body, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink3)' }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>{title}</div>
      {body && <div style={{ fontSize: 12, marginBottom: action ? 14 : 0 }}>{body}</div>}
      {action}
    </div>
  )
}
