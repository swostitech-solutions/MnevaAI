import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { memoryApi } from '../../services/api'
import EmptyState from '../ui/EmptyState'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }

const MODULE_TILES = [
  { key: 'loan', label: 'Loans', icon: '🏦', path: ['finance', 'loans'] },
  { key: 'emi', label: 'EMIs', icon: '💳', path: ['finance', 'emis'] },
  { key: 'subscription', label: 'Subscriptions', icon: '🔁', path: ['finance', 'subscriptions'] },
  { key: 'bill', label: 'Bills', icon: '📋', path: ['finance', 'bills'] },
  { key: 'fixed_deposit', label: 'Fixed Deposits', icon: '🏛️', path: ['finance', 'fixedDeposits'] },
  { key: 'portfolio_holding', label: 'Portfolio', icon: '📈', path: ['finance', 'portfolioHoldings'] },
  { key: 'expense', label: 'Expenses (this month)', icon: '🧾', path: ['finance', 'expenses'] },
]

export default function MemoryOverviewPage() {
  const [expanded, setExpanded] = useState(null)
  const { data, isLoading } = useQuery({ queryKey: ['memoryOverview'], queryFn: memoryApi.overview })
  const { data: records } = useQuery({
    queryKey: ['memoryRecords', expanded],
    queryFn: () => memoryApi.records(expanded),
    enabled: !!expanded,
  })

  if (isLoading) return <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />

  const p = data?.profile || {}
  const m = data?.modules || {}

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>🧠 What Mneva Knows</motion.div>
      <motion.div variants={up} style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 20 }}>Everything the AI has learned about you, in one place.</motion.div>

      <motion.div variants={up} className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>👤 Profile</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, fontSize: 12.5 }}>
          {[['Nickname', p.nickname], ['Occupation', p.occupation], ['Company', p.company], ['City', p.city], ['Top Goal', p.topGoal], ['AI Personality', p.aiPersonality]].map(([k, v]) => (
            <div key={k}>
              <div style={{ color: 'var(--ink3)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
              <div style={{ fontWeight: 600 }}>{v || '—'}</div>
            </div>
          ))}
        </div>
        {p.goals?.length > 0 && <div style={{ marginTop: 10, fontSize: 12 }}><span style={{ color: 'var(--ink3)' }}>Goals: </span>{p.goals.join(', ')}</div>}
        {p.interests?.length > 0 && <div style={{ marginTop: 4, fontSize: 12 }}><span style={{ color: 'var(--ink3)' }}>Interests: </span>{p.interests.join(', ')}</div>}
        <div style={{ marginTop: 10, height: 5, background: 'var(--depth4)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${p.completionPct || 0}%`, background: 'var(--pulse)' }} />
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 4 }}>Profile {p.completionPct || 0}% complete</div>
      </motion.div>

      <motion.div variants={up} style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginBottom: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>💰 Finance</div>
          {Object.entries(m.finance || {}).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: 'var(--ink3)', textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</span>
              <span style={{ fontWeight: 600 }}>{v.count ?? 0}</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>👥 Family &amp; ❤️ Health</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}><span style={{ color: 'var(--ink3)' }}>Family tasks</span><span style={{ fontWeight: 600 }}>{m.family?.familyTasks?.count ?? 0} ({m.family?.familyTasks?.pending ?? 0} pending)</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}><span style={{ color: 'var(--ink3)' }}>Pets</span><span style={{ fontWeight: 600 }}>{m.family?.pets?.count ?? 0}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}><span style={{ color: 'var(--ink3)' }}>Parent medications</span><span style={{ fontWeight: 600 }}>{m.family?.parentMedications?.count ?? 0}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}><span style={{ color: 'var(--ink3)' }}>Health logged days</span><span style={{ fontWeight: 600 }}>{m.health?.loggedDays ?? 0}</span></div>
        </div>
      </motion.div>

      <motion.div variants={up} className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>🔎 Tap a module to see records</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 8 }}>
          {MODULE_TILES.map(t => (
            <button key={t.key} onClick={() => setExpanded(expanded === t.key ? null : t.key)}
              style={{ background: expanded === t.key ? 'rgba(61,139,255,0.12)' : 'var(--depth3)', border: `1px solid ${expanded === t.key ? 'var(--rim2)' : 'var(--rim1)'}`, borderRadius: 10, padding: '12px 8px', textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
              <div style={{ fontSize: 11, color: 'var(--ink2)' }}>{t.label}</div>
            </button>
          ))}
        </div>
        {expanded && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--rim1)', paddingTop: 12 }}>
            {!records?.records?.length && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No records yet.</div>}
            {records?.records?.slice(0, 10).map((r, i) => (
              <div key={r.id || i} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--rim1)' }}>
                {r.name || r.title || JSON.stringify(r).slice(0, 80)}
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div variants={up} className="card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>💭 Remembered Notes</div>
        {!data?.memories?.length && <EmptyState icon="💭" title="No memories yet" body="These build up as you use Ask AI and connect services." />}
        {data?.memories?.map((mem, i) => (
          <div key={i} style={{ fontSize: 12.5, color: 'var(--ink2)', padding: '8px 0', borderBottom: '1px solid var(--rim1)' }}>
            {mem.text}
            <div style={{ fontSize: 10.5, color: 'var(--ink4)', marginTop: 2 }}>{mem.type}{mem.updatedAt ? ` · ${new Date(mem.updatedAt).toLocaleDateString('en-IN')}` : ''}</div>
          </div>
        ))}
      </motion.div>
    </motion.div>
  )
}
