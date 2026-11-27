import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { agentApi } from '../../services/api'

// Mirrors mneva/src/Screen/MusicDiscovery.js — no dedicated music backend
// exists (mobile has none either): it just sends a crafted prompt to the
// same /api/agent/chat endpoint Ask Mneva uses, telling the AI to
// web_search for real songs/charts and reply in a fixed parseable format.
// 30-second previews come straight from Apple's free, keyless iTunes
// Search API, called directly from the browser.

const BROWSE = [
  { id: 'trending', title: 'Trending', icon: '📈', color: '#F97316' },
  { id: 'new', title: 'New Releases', icon: '✨', color: '#8B5CF6' },
  { id: 'genres', title: 'Genres', icon: '💿', color: '#1DB954' },
  { id: 'moods', title: 'Moods', icon: '😊', color: '#EC4899' },
  { id: 'charts', title: 'Charts', icon: '📊', color: '#2563EB' },
  { id: 'recommended', title: 'For You', icon: '❤️', color: '#EAB308' },
  { id: 'devotional', title: 'Devotional', icon: '☀️', color: '#F97316' },
]

const GROUPS = {
  genres: ['Pop', 'Rock', 'Hip-Hop', 'R&B', 'Bollywood'],
  moods: ['Chill', 'Focus', 'Workout', 'Party', 'Relax'],
  trending: ['India', 'Global', 'Viral'],
  new: ['This Week', 'Fresh Finds', 'Indian Releases'],
  charts: ['India Top 50', 'Global Top 50', 'Top Albums'],
  recommended: ['Made for You', 'Your Mix', 'Recently Played'],
  devotional: ['Hindu Bhajans', 'Sufi', 'Gurbani', 'Christian', 'Islamic Nasheeds'],
}

const FALLBACK_SONGS = [
  ['Golden Hour', 'JVKE', "this is what ____ feels like", '#E9C6A6'],
  ['I Had Some Help', 'Post Malone · Morgan Wallen', 'F-1 Trillion', '#9CB4B4'],
  ['Birds of a Feather', 'Billie Eilish', 'HIT ME HARD AND SOFT', '#8FA7CA'],
  ['Husn', 'Anuv Jain', 'Husn', '#B9A18B'],
  ['Espresso', 'Sabrina Carpenter', "Short n' Sweet", '#E6B17C'],
]
const COVER_COLORS = ['#E9C6A6', '#9CB4B4', '#8FA7CA', '#B9A18B', '#E6B17C', '#BD9172', '#C09099', '#6D93AB', '#BD9A77', '#8EA373']

async function fetchPreviewUrl(title, artist) {
  try {
    const q = encodeURIComponent(`${title} ${artist}`)
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1&country=in`)
    const data = await res.json()
    return data.results?.[0]?.previewUrl || null
  } catch { return null }
}

function openYouTube(title, artist) {
  const q = encodeURIComponent(`${title} ${artist}`)
  window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank', 'noopener,noreferrer')
}

function parseSongsFromAI(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const songs = []
  for (const line of lines) {
    const numbered = line.match(/^\d+[.)]\s*(.+)/)
    const raw = numbered ? numbered[1] : line
    const dashSplit = raw.split(/\s[-–]\s/)
    if (dashSplit.length >= 2) {
      const title = dashSplit[0].replace(/^["']|["']$/g, '').trim()
      const rest = dashSplit.slice(1).join(' - ')
      const dotSplit = rest.split(/\s[·•]\s/)
      const artist = dotSplit[0].trim()
      const album = dotSplit[1]?.trim() || ''
      if (title.length > 1 && artist.length > 1) songs.push([title, artist, album, COVER_COLORS[songs.length % COVER_COLORS.length]])
    } else if (raw.toLowerCase().includes(' by ')) {
      const bySplit = raw.split(/ by /i)
      const title = bySplit[0].replace(/^["']|["']$/g, '').trim()
      const artist = bySplit[1]?.trim() || ''
      if (title.length > 1 && artist.length > 1) songs.push([title, artist, '', COVER_COLORS[songs.length % COVER_COLORS.length]])
    }
    if (songs.length >= 10) break
  }
  return songs.length >= 3 ? songs : null
}

function SongRow({ title, artist, album, color, index, saved, onToggleSaved }) {
  const [fetching, setFetching] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [active, setActive] = useState(false)
  const audioRef = useRef(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => () => { audioRef.current?.pause() }, [])

  const handlePlay = async () => {
    if (active) { audioRef.current?.pause(); setActive(false); return }
    if (audioRef.current) { audioRef.current.play(); setActive(true); return }
    setFetching(true)
    const url = await fetchPreviewUrl(title, artist)
    setFetching(false)
    if (!url) { setNotFound(true); setTimeout(() => setNotFound(false), 3000); return }
    const audio = new Audio(url)
    audio.ontimeupdate = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0)
    audio.onended = () => { setActive(false); setProgress(0) }
    audioRef.current = audio
    audio.play()
    setActive(true)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px' }}>
        <span style={{ width: 20, textAlign: 'center', fontSize: 12, color: active ? 'var(--pulse2)' : 'var(--ink3)', fontWeight: 700 }}>{active ? '♫' : index + 1}</span>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🎵</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist}{album ? ` · ${album}` : ''}</div>
        </div>
        <button onClick={() => openYouTube(title, artist)} title="Search on YouTube" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#FF0000' }}>▶</button>
        <button onClick={onToggleSaved} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: saved ? 'var(--danger)' : 'var(--ink4)' }}>♥</button>
        <button onClick={handlePlay} disabled={fetching}
          style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--pulse)', border: 'none', color: '#fff', cursor: fetching ? 'wait' : 'pointer', fontSize: 12, flexShrink: 0 }}>
          {fetching ? '…' : active ? '⏸' : '▶'}
        </button>
      </div>
      {active && (
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ height: 3, background: 'var(--depth4)', borderRadius: 2 }}><div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: 'var(--pulse)', borderRadius: 2 }} /></div>
          <div style={{ fontSize: 9.5, color: 'var(--ink4)', textAlign: 'right', marginTop: 3 }}>30s preview</div>
        </div>
      )}
      {notFound && <div style={{ fontSize: 10.5, color: 'var(--danger)', padding: '0 16px 8px' }}>Preview unavailable — tap YouTube for full song</div>}
    </div>
  )
}

function AIChatPanel({ onSongsUpdate, currentContext }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([{ id: '0', sender: 'ai', text: 'Hi! Ask me for music recommendations — by mood, artist, language, or vibe 🎵' }])
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)
  const lastContextRef = useRef(null)

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim()
    if (!content || loading) return
    if (!text) setInput('')
    setMessages(m => [...m, { id: String(Date.now()), sender: 'user', text: content }])
    setLoading(true)
    try {
      const isAutoQuery = !!text
      const isRealChart = isAutoQuery && /^(Trending|Charts)\b/.test(currentContext || '')
      const prompt = isRealChart
        ? `You are Mneva AI music assistant. Call your web_search tool first to find what is actually trending/charting right now for "${currentContext}" — never answer from memory, since chart rankings change constantly and your training data cannot be current. Based ONLY on what you find, respond with a numbered list of 5-8 real songs in this exact format:\n1. Song Title - Artist Name · Album Name\n2. Song Title - Artist Name · Album Name\n...\nKeep it concise. If your search doesn't turn up enough real, current songs, return fewer rather than inventing any. User request: ${content}`
        : `You are Mneva AI music assistant. The user is browsing ${currentContext}. Call your web_search tool first for "${content}" before answering — never recommend a song from memory alone. If the user named (or seems to be naming) a specific song, artist or album, your search must show a REAL result actually matching it; if nothing real comes up, say plainly that you couldn't find a real match and do NOT return a song list just to fill space. If the user is instead just asking for recommendations by mood/genre/vibe, use your search results (or well-known music you're confident actually exists) to pick 5-8 real songs that fit. When you do have real matches, respond with a numbered list of 5-8 in this exact format:\n1. Song Title - Artist Name · Album Name\n2. Song Title - Artist Name · Album Name\n...\nKeep it concise. If fewer than 5 real matches turn up, return fewer rather than inventing any. User request: ${content}`

      const res = await agentApi.chat([{ role: 'user', content: prompt }])
      const aiText = res.response || "Here are some picks for you!"
      setMessages(m => [...m, { id: String(Date.now() + 1), sender: 'ai', text: aiText }])
      const parsed = parseSongsFromAI(aiText)
      if (parsed) onSongsUpdate(parsed, currentContext)
    } catch {
      setMessages(m => [...m, { id: String(Date.now() + 1), sender: 'ai', text: "Couldn't connect to AI right now. Try again!" }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, currentContext, onSongsUpdate])

  useEffect(() => {
    if (!currentContext || currentContext === lastContextRef.current) return
    lastContextRef.current = currentContext
    sendMessage(`Give me top song recommendations for: ${currentContext}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContext])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, loading])

  return (
    <div className="card" style={{ marginTop: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', background: 'none', border: 'none', padding: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--ink1)', fontFamily: 'inherit' }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: '#1DB954', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🤖</div>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Mneva AI</span>
        {loading && <span className="anim-spin" style={{ fontSize: 12 }}>⟳</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#1DB954', fontWeight: 600 }}>{open ? 'Close' : 'Ask AI for music'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--rim1)' }}>
          <div ref={scrollRef} style={{ maxHeight: 220, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(m => (
              <div key={m.id} style={{ alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '9px 12px', borderRadius: m.sender === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px', background: m.sender === 'user' ? 'var(--pulse)' : 'var(--depth3)', color: m.sender === 'user' ? '#fff' : 'var(--ink1)', fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {m.text}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--rim1)' }}>
            <input className="input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Ask for songs, artists, moods…" style={{ flex: 1 }} />
            <button className="btn-primary" disabled={!input.trim() || loading} onClick={() => sendMessage()}>↑</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MusicDiscoveryPage() {
  const [section, setSection] = useState('trending')
  const [selection, setSelection] = useState('India')
  const [saved, setSaved] = useState([])
  const [aiSongs, setAiSongs] = useState(null)
  const [aiLabel, setAiLabel] = useState(null)
  const [aiContext, setAiContext] = useState('Trending · India')

  const fallbackSongs = useMemo(() => {
    const map = {
      Focus: [['A Moment Apart', 'ODESZA', 'A Moment Apart', '#7289A7'], ['Weightless', 'Marconi Union', 'Weightless', '#9BAAA8'], ['Experience', 'Ludovico Einaudi', 'In a Time Lapse', '#A7A0B7'], ['Sunset Lover', 'Petit Biscuit', 'Presence', '#E4A77B'], ['Awake', 'Tycho', 'Awake', '#92B6C3']],
      Workout: [["Don't Start Now", 'Dua Lipa', 'Future Nostalgia', '#D68DA8'], ["Can't Hold Us", 'Macklemore', 'The Heist', '#B28959'], ['Believer', 'Imagine Dragons', 'Evolve', '#B45E4D'], ['Titanium', 'David Guetta · Sia', 'Nothing but the Beat', '#9DB4C6'], ['Levitating', 'Dua Lipa', 'Future Nostalgia', '#9077B6']],
      Bollywood: [['Tum Hi Ho', 'Arijit Singh', 'Aashiqui 2', '#BD9172'], ['Heeriye', 'Jasleen Royal · Arijit Singh', 'Heeriye', '#C09099'], ['O Maahi', 'Arijit Singh', 'Dunki', '#6D93AB'], ['Pehle Bhi Main', 'Vishal Mishra', 'Animal', '#BD9A77'], ['Apna Bana Le', 'Arijit Singh', 'Bhediya', '#8EA373']],
      'Hindu Bhajans': [['Jai Shri Ram', 'Jubin Nautiyal', 'Bhakti', '#F97316'], ['Achyutam Keshavam', 'Shankar Mahadevan', 'Bhajans', '#EA580C'], ['Hanuman Chalisa', 'Hariharan', 'Devotional', '#C2410C'], ['Om Namah Shivaya', 'S.P. Balasubrahmanyam', 'Shiv Bhajans', '#F59E0B'], ['Raghupati Raghav', 'Lata Mangeshkar', 'Ram Bhajans', '#D97706']],
      Sufi: [['Kun Faya Kun', 'A.R. Rahman · Javed Ali', 'Rockstar', '#7C3AED'], ['Dama Dam Mast Qalandar', 'Abida Parveen', 'Sufi Classics', '#6D28D9'], ['Tere Bin', 'Atif Aslam', 'Sufi', '#5B21B6'], ['Arziyan', 'Javed Ali · Kailash Kher', 'Delhi 6', '#8B5CF6'], ['Allah Ke Bande', 'Kailash Kher', 'Kailasa', '#7C3AED']],
      Gurbani: [['Waheguru Simran', 'Bhai Harjinder Singh', 'Gurbani', '#F59E0B'], ['Deh Shiva', 'Harshdeep Kaur', 'Gurbani', '#D97706'], ['Satnam Waheguru', 'Bhai Gurpreet Singh', 'Kirtan', '#B45309'], ['Ik Onkar', 'A.R. Rahman', 'Rang De Basanti', '#92400E'], ['Ardas', 'Bhai Maninder Singh', 'Gurbani', '#F97316']],
      Christian: [['Amazing Grace', 'Il Divo', 'Hymns', '#1D4ED8'], ['Hallelujah', 'Pentatonix', 'PTX Vol. IV', '#1E40AF'], ['How Great Thou Art', 'Carrie Underwood', 'Hymns', '#1E3A8A'], ['10000 Reasons', 'Matt Redman', '10000 Reasons', '#2563EB'], ['Oceans', 'Hillsong United', 'Zion', '#3B82F6']],
      'Islamic Nasheeds': [['Tala Al Badru Alayna', 'Maher Zain', 'Nasheeds', '#065F46'], ['Assalamu Alayka', 'Maher Zain', 'Forgive Me', '#047857'], ['Ya Nabi Salam', 'Sami Yusuf', "Al-Mu'allim", '#059669'], ['Subhanallah', 'Atif Aslam', 'Nasheeds', '#10B981'], ['Allahu Allah', 'Sami Yusuf', 'My Ummah', '#34D399']],
    }
    return map[selection] || FALLBACK_SONGS
  }, [selection])

  const songs = aiSongs || fallbackSongs
  const sectionTitle = BROWSE.find(b => b.id === section)?.title || 'Music'

  const chooseSection = (id) => {
    setSection(id)
    const first = GROUPS[id][0]
    setSelection(first)
    setAiSongs(null); setAiLabel(null)
    setAiContext(`${BROWSE.find(b => b.id === id)?.title} · ${first}`)
  }
  const chooseSelection = (item) => {
    setSelection(item)
    setAiSongs(null); setAiLabel(null)
    setAiContext(`${sectionTitle} · ${item}`)
  }
  const handleAiSongs = useCallback((list, label) => { setAiSongs(list); setAiLabel(label) }, [])
  const toggleSaved = (title) => setSaved(s => s.includes(title) ? s.filter(i => i !== title) : [...s, title])

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Music intelligence</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 3 }}>Find your sound</div>
        </div>
        <span className="badge badge-go">● AI LIVE</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))', gap: 10, marginBottom: 18 }}>
        {BROWSE.map(b => (
          <button key={b.id} onClick={() => chooseSection(b.id)}
            style={{ background: section === b.id ? 'rgba(29,185,84,0.1)' : 'var(--depth3)', border: `1px solid ${section === b.id ? '#1DB95466' : 'var(--rim1)'}`, borderRadius: 14, padding: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: b.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, marginBottom: 8 }}>{b.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: section === b.id ? '#1DB954' : 'var(--ink2)' }}>{b.title}</div>
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--pulse)', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 15 }}>🤖</span>
        <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.9)' }}>Mneva AI is searching the web for <b>{sectionTitle.toLowerCase()}</b> picks right now</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{sectionTitle}</div>
        <span style={{ fontSize: 10.5, color: 'var(--pulse2)', fontWeight: 700 }}>{aiSongs ? `AI · ${aiSongs.length}` : 'TOP 5'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
        {GROUPS[section].map(item => (
          <button key={item} onClick={() => chooseSelection(item)}
            style={{ background: selection === item ? '#1DB954' : 'var(--depth3)', color: selection === item ? '#fff' : 'var(--ink2)', border: 'none', borderRadius: 16, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
            {item}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{aiLabel || selection}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{aiSongs ? '✨ AI-curated picks' : 'Top songs picked for you'}</div>
        </div>
        {aiSongs && <button onClick={() => { setAiSongs(null); setAiLabel(null) }} style={{ background: 'none', border: 'none', color: 'var(--pulse2)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Reset</button>}
      </div>

      <div className="card" style={{ padding: 4 }}>
        {songs.map(([title, artist, album, color], index) => (
          <SongRow key={`${title}-${index}`} title={title} artist={artist} album={album} color={color} index={index} saved={saved.includes(title)} onToggleSaved={() => toggleSaved(title)} />
        ))}
      </div>

      <AIChatPanel onSongsUpdate={handleAiSongs} currentContext={aiContext} />
    </motion.div>
  )
}
