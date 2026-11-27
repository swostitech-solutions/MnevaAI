import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { searchApi } from '../../services/api'
import EmptyState from '../ui/EmptyState'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const up = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

const TYPE_ICON = {
  task: '✅', notification: '🔔', ledger: '📋', memory: '🧠', family: '👥',
  payment: '💰', health: '❤️', email: '📧', contact: '👤',
}

export default function SearchPage() {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 350)
    return () => clearTimeout(t)
  }, [q])

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchApi.query(debounced),
    enabled: debounced.trim().length >= 2,
  })

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>🔍 Search</motion.div>
      <motion.div variants={up} style={{ marginBottom: 20 }}>
        <input
          className="input" autoFocus value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search tasks, emails, payments, contacts, memory…"
          style={{ fontSize: 15, padding: '14px 16px' }}
        />
      </motion.div>

      {debounced.trim().length < 2 && <EmptyState icon="🔍" title="Start typing to search" body="At least 2 characters — searches across every domain Mneva tracks." />}
      {isFetching && <div className="skeleton" style={{ height: 100, borderRadius: 14 }} />}
      {!isFetching && debounced.trim().length >= 2 && data?.results?.length === 0 && (
        <EmptyState icon="🤷" title={`No results for "${debounced}"`} />
      )}
      {!isFetching && data?.results?.length > 0 && (
        <motion.div variants={up} className="card" style={{ padding: 8 }}>
          {data.results.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderBottom: i < data.results.length - 1 ? '1px solid var(--rim1)' : 'none' }}>
              <span style={{ fontSize: 18 }}>{TYPE_ICON[r.type] || '📄'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</span>
                  <span className="badge badge-pulse" style={{ fontSize: 9, flexShrink: 0 }}>{r.type}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{r.snippet}</div>
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}
