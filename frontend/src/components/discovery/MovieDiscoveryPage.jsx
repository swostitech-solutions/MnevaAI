import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { agentApi } from '../../services/api'

// Mirrors mneva/src/Screen/MovieDiscovery.js exactly — mobile's own code
// comment confirms this used to be a TMDB-backed grid, abandoned because
// TMDB_API_KEY was never configured in production (permanently empty grid).
// It was replaced entirely with a crafted prompt to /api/agent/chat,
// forcing a real web_search and parsing the AI's numbered-list reply —
// same pattern as Music/Sports/News. The web port (an earlier mistake)
// used the dedicated /api/tmdb/* routes instead, hitting that exact same
// missing-key wall; this fixes it by porting mobile's real approach.

const BROWSE = [
  { id: 'trending', title: 'Trending', icon: '📈', color: '#F97316' },
  { id: 'bollywood', title: 'Bollywood', icon: '🎬', color: '#EC4899' },
  { id: 'hollywood', title: 'Hollywood', icon: '⭐', color: '#6C47FF' },
  { id: 'genres', title: 'Genres', icon: '🎭', color: '#2563EB' },
  { id: 'webseries', title: 'Web Series', icon: '📺', color: '#0EA5E9' },
  { id: 'regional', title: 'Regional', icon: '📍', color: '#10B981' },
  { id: 'awardwinner', title: 'Award Winners', icon: '🏆', color: '#EAB308' },
  { id: 'kids', title: 'Kids', icon: '😊', color: '#F43F5E' },
]
const GROUPS = {
  trending: ['This Week', 'This Month', 'All Time', 'India', 'Global'],
  bollywood: ['BW Action', 'BW Romance', 'BW Comedy', 'BW Drama', 'BW Thriller'],
  hollywood: ['HW Action', 'Sci-Fi', 'Marvel', 'DC', 'HW Animation'],
  genres: ['Horror', 'Mystery', 'Documentary', 'Biography', 'Fantasy'],
  webseries: ['Netflix', 'Prime Video', 'Hotstar', 'SonyLIV', 'ZEE5'],
  regional: ['Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Punjabi'],
  awardwinner: ['Oscar', 'Filmfare', 'BAFTA', 'National Award', 'Cannes'],
  kids: ['Animation', 'Adventure', 'Disney', 'Pixar', 'Family'],
}
const FALLBACK = {
  'This Week': [['Animal', 'Sandeep Reddy Vanga', '2023', '#B45E4D'], ['Jawan', 'Atlee', '2023', '#374151'], ['Dunki', 'Rajkumar Hirani', '2023', '#6D93AB'], ['Sam Bahadur', 'Meghna Gulzar', '2023', '#8EA373'], ['12th Fail', 'Vidhu Vinod Chopra', '2023', '#BD9A77']],
  Action: [['Pathaan', 'Siddharth Anand', '2023', '#B45E4D'], ['War', 'Siddharth Anand', '2019', '#374151'], ['Tiger 3', 'Maneesh Sharma', '2023', '#6D93AB'], ['KGF Chapter 2', 'Prashanth Neel', '2022', '#8EA373'], ['RRR', 'S.S. Rajamouli', '2022', '#BD9A77']],
  'Sci-Fi': [['Oppenheimer', 'Christopher Nolan', '2023', '#374151'], ['Dune Part Two', 'Denis Villeneuve', '2024', '#B45E4D'], ['Interstellar', 'Christopher Nolan', '2014', '#6D93AB'], ['Avatar', 'James Cameron', '2009', '#8EA373'], ['Inception', 'Christopher Nolan', '2010', '#BD9A77']],
  Netflix: [['Sacred Games', 'Vikramaditya Motwane', '2018', '#E50914'], ['Delhi Crime', 'Richie Mehta', '2019', '#B91C1C'], ['Scam 1992', 'Hansal Mehta', '2020', '#991B1B'], ['Mirzapur', 'Karan Anshuman', '2018', '#7F1D1D'], ['Panchayat', 'Deepak Kumar Mishra', '2020', '#DC2626']],
  Tamil: [['Leo', 'Lokesh Kanagaraj', '2023', '#B45E4D'], ['Jailer', 'Nelson', '2023', '#374151'], ['Ponniyin Selvan', 'Mani Ratnam', '2022', '#6D93AB'], ['Vikram', 'Lokesh Kanagaraj', '2022', '#8EA373'], ['Master', 'Lokesh Kanagaraj', '2021', '#BD9A77']],
  Oscar: [['Oppenheimer', 'Christopher Nolan', '2023', '#EAB308'], ['Everything Everywhere', 'Daniel Kwan', '2022', '#CA8A04'], ['CODA', 'Sian Heder', '2021', '#B45309'], ['Nomadland', 'Chloé Zhao', '2020', '#92400E'], ['Parasite', 'Bong Joon-ho', '2019', '#78350F']],
  Animation: [['Spider-Man: Across the Spider-Verse', 'Joaquim Dos Santos', '2023', '#6C47FF'], ['The Lion King', 'Jon Favreau', '2019', '#F59E0B'], ['Encanto', 'Byron Howard', '2021', '#EC4899'], ['Turning Red', 'Domee Shi', '2022', '#F97316'], ['Moana', 'Ron Clements', '2016', '#0EA5E9']],
}
const COVER_COLORS = ['#B45E4D', '#374151', '#6D93AB', '#8EA373', '#BD9A77', '#6C47FF', '#EC4899', '#EAB308', '#0EA5E9', '#10B981']

function parseMoviesFromAI(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const movies = []
  for (const line of lines) {
    const numbered = line.match(/^\d+[.)]\s*(.+)/)
    const raw = numbered ? numbered[1] : line
    const dashSplit = raw.split(/\s[-–]\s/)
    if (dashSplit.length >= 2) {
      const title = dashSplit[0].replace(/^["']|["']$/g, '').trim()
      const rest = dashSplit.slice(1).join(' - ')
      const dotSplit = rest.split(/\s[·•]\s/)
      const director = dotSplit[0].trim()
      const year = dotSplit[1]?.trim() || ''
      if (title.length > 1 && director.length > 1) movies.push([title, director, year, COVER_COLORS[movies.length % COVER_COLORS.length]])
    } else if (raw.toLowerCase().includes(' by ')) {
      const bySplit = raw.split(/ by /i)
      const title = bySplit[0].replace(/^["']|["']$/g, '').trim()
      const director = bySplit[1]?.trim() || ''
      if (title.length > 1 && director.length > 1) movies.push([title, director, '', COVER_COLORS[movies.length % COVER_COLORS.length]])
    }
    if (movies.length >= 10) break
  }
  return movies.length >= 3 ? movies : null
}

function openYouTube(title) {
  window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' trailer')}`, '_blank', 'noopener,noreferrer')
}

function MovieCard({ title, director, year, color, index, saved, onToggleSaved }) {
  return (
    <div className="card" style={{ display: 'flex', overflow: 'hidden', padding: 0 }}>
      <div style={{ width: 80, flexShrink: 0, background: color, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>#{index + 1}</span>
        <span style={{ fontSize: 22 }}>🎬</span>
      </div>
      <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>{director}</div>
          {year && <div style={{ fontSize: 10, color: 'var(--pulse2)', fontWeight: 700, marginTop: 2 }}>{year}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <button onClick={() => openYouTube(title)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,82,82,0.1)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--danger)', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>▶ Trailer</button>
          <button onClick={onToggleSaved} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: saved ? 'var(--pulse2)' : 'var(--ink4)' }}>🔖</button>
        </div>
      </div>
    </div>
  )
}

function AIChatPanel({ onMoviesUpdate, currentContext, onLoadingChange }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([{ id: '0', sender: 'ai', text: 'Hi! Ask me for movie recommendations — by genre, mood, language, director, or platform 🎬' }])
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)
  const lastContextRef = useRef(null)

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim()
    if (!content || loading) return
    if (!text) setInput('')
    setMessages(m => [...m, { id: String(Date.now()), sender: 'user', text: content }])
    setLoading(true); onLoadingChange?.(true)
    try {
      const prompt = `You are Mneva AI movie assistant. Call your web_search tool first to find real movies matching "${currentContext}" — search for "${currentContext} movies" and use only what you find; never invent titles from memory alone, since this must reflect real, current movies. Respond with a numbered list of 5-8 real movies in this exact format:\n1. Movie Title - Director Name · Year\n2. Movie Title - Director Name · Year\n...\nKeep it concise. If your search doesn't turn up enough real movies, return fewer rather than inventing any. User request: ${content}`
      const res = await agentApi.chat([{ role: 'user', content: prompt }])
      const aiText = res.response || 'Here are some picks for you!'
      setMessages(m => [...m, { id: String(Date.now() + 1), sender: 'ai', text: aiText }])
      const parsed = parseMoviesFromAI(aiText)
      if (parsed) onMoviesUpdate(parsed, currentContext)
    } catch {
      setMessages(m => [...m, { id: String(Date.now() + 1), sender: 'ai', text: "Couldn't connect to AI right now. Try again!" }])
    } finally {
      setLoading(false); onLoadingChange?.(false)
    }
  }, [input, loading, currentContext, onMoviesUpdate, onLoadingChange])

  useEffect(() => {
    if (!currentContext || currentContext === lastContextRef.current) return
    lastContextRef.current = currentContext
    sendMessage(`Give me top movie recommendations for: ${currentContext}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContext])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, loading])

  return (
    <div className="card" style={{ marginTop: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', background: 'none', border: 'none', padding: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--ink1)', fontFamily: 'inherit' }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#6C47FF,#4A2FCC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🤖</div>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Mneva AI</span>
        {loading && <span className="anim-spin" style={{ fontSize: 12 }}>⟳</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--violet)', fontWeight: 600 }}>{open ? 'Close' : 'Ask AI for movies'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--rim1)' }}>
          <div ref={scrollRef} style={{ maxHeight: 220, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(m => (
              <div key={m.id} style={{ alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '9px 12px', borderRadius: m.sender === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px', background: m.sender === 'user' ? 'var(--violet)' : 'var(--depth3)', color: m.sender === 'user' ? '#fff' : 'var(--ink1)', fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.text}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--rim1)' }}>
            <input className="input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Ask for movies, directors, genres…" style={{ flex: 1 }} />
            <button className="btn-primary" disabled={!input.trim() || loading} onClick={() => sendMessage()}>↑</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MovieDiscoveryPage() {
  const [section, setSection] = useState('trending')
  const [selection, setSelection] = useState('This Week')
  const [saved, setSaved] = useState([])
  const [aiMovies, setAiMovies] = useState(null)
  const [aiLabel, setAiLabel] = useState(null)
  const [aiContext, setAiContext] = useState('Trending · This Week')
  const [aiLoading, setAiLoading] = useState(false)

  const sectionTitle = BROWSE.find(b => b.id === section)?.title || 'Movies'
  const sectionColor = BROWSE.find(b => b.id === section)?.color || '#6C47FF'
  const movies = aiMovies || FALLBACK[selection] || FALLBACK['This Week']

  const chooseSection = (id) => {
    setSection(id)
    const first = GROUPS[id][0]
    setSelection(first)
    setAiMovies(null); setAiLabel(null)
    setAiContext(`${BROWSE.find(b => b.id === id)?.title} · ${first}`)
  }
  const chooseSelection = (item) => {
    setSelection(item)
    setAiMovies(null); setAiLabel(null)
    setAiContext(`${sectionTitle} · ${item}`)
  }
  const handleAiMovies = useCallback((list, label) => { setAiMovies(list); setAiLabel(label) }, [])
  const toggleSaved = (title) => setSaved(s => s.includes(title) ? s.filter(i => i !== title) : [...s, title])

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Movie intelligence</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 3 }}>Find your film</div>
        </div>
        <span className="badge badge-violet">● AI LIVE</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px,1fr))', gap: 10, marginBottom: 18 }}>
        {BROWSE.map(b => (
          <button key={b.id} onClick={() => chooseSection(b.id)}
            style={{ background: section === b.id ? `${b.color}1a` : 'var(--depth3)', border: `1px solid ${section === b.id ? b.color : 'var(--rim1)'}`, borderRadius: 14, padding: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: b.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, marginBottom: 7 }}>{b.icon}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: section === b.id ? b.color : 'var(--ink2)' }}>{b.title}</div>
          </button>
        ))}
      </div>

      <div style={{ background: sectionColor, borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 15 }}>🤖</span>
        <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.9)' }}>Mneva AI is searching the web for <b>{sectionTitle.toLowerCase()}</b> picks right now</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{sectionTitle}</div>
        <span style={{ fontSize: 10.5, color: 'var(--violet)', fontWeight: 700 }}>{aiMovies ? `AI · ${aiMovies.length}` : 'TOP 5'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
        {GROUPS[section].map(item => (
          <button key={item} onClick={() => chooseSelection(item)}
            style={{ background: selection === item ? 'var(--violet)' : 'var(--depth3)', color: selection === item ? '#fff' : 'var(--ink2)', border: 'none', borderRadius: 16, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
            {item.replace(/^(BW|HW) /, '')}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{(aiLabel || selection).replace(/^(BW|HW) /, '')}</div>
          <div style={{ fontSize: 10.5, color: 'var(--violet)' }}>{aiMovies ? '✨ AI-curated · live web search' : aiLoading ? 'Searching the web…' : 'Top picks for you'}</div>
        </div>
        {aiMovies && <button onClick={() => { setAiMovies(null); setAiLabel(null) }} style={{ background: 'none', border: 'none', color: 'var(--violet)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Reset</button>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {movies.map(([title, director, year, color], index) => (
          <MovieCard key={`${title}-${index}`} title={title} director={director} year={year} color={color} index={index} saved={saved.includes(title)} onToggleSaved={() => toggleSaved(title)} />
        ))}
      </div>

      <AIChatPanel onMoviesUpdate={handleAiMovies} currentContext={aiContext} onLoadingChange={setAiLoading} />
    </motion.div>
  )
}
