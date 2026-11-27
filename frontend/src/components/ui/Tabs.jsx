import React from 'react'

export default function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--rim1)', marginBottom: 18 }}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: '"Space Grotesk",sans-serif', fontSize: 13, fontWeight: 600,
            padding: '10px 16px', color: active === t.key ? 'var(--pulse2)' : 'var(--ink3)',
            borderBottom: active === t.key ? '2px solid var(--pulse)' : '2px solid transparent',
            transition: 'color 0.15s',
          }}
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  )
}
