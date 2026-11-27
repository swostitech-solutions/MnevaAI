import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { tmdbApi } from '../../services/api'
import EmptyState from '../ui/EmptyState'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const up = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

const TMDB_IMG = 'https://image.tmdb.org/t/p/w342'

export default function MovieDiscoveryPage() {
  const [tab, setTab] = useState('trending')
  const { data: trending } = useQuery({ queryKey: ['tmdbTrending'], queryFn: () => tmdbApi.trending('week'), enabled: tab === 'trending' })
  const { data: discover } = useQuery({ queryKey: ['tmdbDiscover'], queryFn: () => tmdbApi.discover(), enabled: tab === 'discover' })

  const movies = (tab === 'trending' ? trending : discover)?.results || []

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>🎬 Movies</div>
        {['trending', 'discover'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: tab === t ? 'var(--pulse)' : 'var(--depth3)', color: tab === t ? '#fff' : 'var(--ink2)', border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif', textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </motion.div>

      {!movies.length && <EmptyState icon="🎬" title="Loading…" />}
      <motion.div variants={up} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
        {movies.map(m => (
          <a key={m.id} href={`https://www.themoviedb.org/movie/${m.id}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--ink1)' }}>
            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              {m.poster_path ? (
                <img src={`${TMDB_IMG}${m.poster_path}`} alt={m.title} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--depth3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🎬</div>
              )}
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>
                <div style={{ fontSize: 11, color: 'var(--go)', marginTop: 2 }}>⭐ {m.vote_average?.toFixed(1)}</div>
              </div>
            </div>
          </a>
        ))}
      </motion.div>
    </motion.div>
  )
}
