import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { newsApi } from '../../services/api'
import EmptyState from '../ui/EmptyState'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const up = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

const TABS = [
  { key: 'foryou', label: 'For You' },
  { key: 'trending', label: 'Trending' },
]

export default function NewsDiscoveryPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('foryou')
  const { data, isLoading } = useQuery({ queryKey: ['news', tab], queryFn: () => newsApi.stories(tab), staleTime: 10 * 60000 })

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>📰 News</div>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ background: tab === t.key ? 'var(--pulse)' : 'var(--depth3)', color: tab === t.key ? '#fff' : 'var(--ink2)', border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>
            {t.label}
          </button>
        ))}
      </motion.div>

      {isLoading && <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />}
      {!isLoading && !data?.stories?.length && <EmptyState icon="📰" title="No stories right now" body="Try again in a bit." />}
      {data?.stories?.map((s, i) => (
        <motion.div variants={up} key={i} className="card" style={{ padding: 18, marginBottom: 12, cursor: 'pointer' }} onClick={() => navigate('/discovery/news/story', { state: { story: s } })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="badge badge-pulse">{s.category}</span>
            <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{s.time} · {s.readTime}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{s.headline}</div>
          <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>{s.summary}</div>
          <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 8 }}>Source: {s.source}</div>
        </motion.div>
      ))}
    </motion.div>
  )
}
