import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { agentApi } from '../../services/api'
import EmptyState from '../ui/EmptyState'

// Mirrors mneva/src/Screen/SportsDiscovery.js — same trick as Music: no
// dedicated sports API, just a strict prompt to /api/agent/chat asking the
// AI to web_search for real matches and reply with ONLY a JSON array in a
// fixed shape, which this then renders as match cards.

const SPORTS = [
  { id: 'cricket', title: 'Cricket', icon: '🏏', color: '#0EA5E9' },
  { id: 'football', title: 'Football', icon: '⚽', color: '#10B981' },
  { id: 'tennis', title: 'Tennis', icon: '🎯', color: '#F59E0B' },
  { id: 'basketball', title: 'Basketball', icon: '🏀', color: '#F97316' },
  { id: 'kabaddi', title: 'Kabaddi', icon: '⚡', color: '#EC4899' },
  { id: 'hockey', title: 'Hockey', icon: '🏑', color: '#6C47FF' },
  { id: 'badminton', title: 'Badminton', icon: '🏸', color: '#14B8A6' },
  { id: 'formula1', title: 'Formula 1', icon: '🏁', color: '#EF4444' },
]
const MATCH_TABS = ['Live', 'Upcoming', 'Previous']

async function fetchOneSportsQuery(sportTitle, tab, searchTerm, today, windowNote) {
  const prompt = `Today is ${today}. Call your web_search tool first — search for "${sportTitle} ${searchTerm}" — to find real, current information. Never answer from memory: live/recent match scores and schedules change constantly and your training data cannot possibly be up to date.
Based ONLY on what your search actually finds, return ONLY a valid JSON array (no markdown, no explanation) of ${tab === 'Live' ? 'currently live' : tab === 'Upcoming' ? `upcoming ${windowNote} — list EVERY real one your search turns up, not just the first few` : 'recently completed (last 7 days)'} ${sportTitle} matches.
Each object must have exactly these fields:
{ "teamA": string, "teamB": string, "scoreA": string, "scoreB": string, "info": string, "venue": string, "status": "${tab === 'Live' ? 'live' : tab === 'Upcoming' ? 'upcoming' : 'result'}" }
Rules:
- scoreA/scoreB: empty string for upcoming matches, actual score for live/result
- info: for live = current over/minute/quarter + competition name, for result = winner + margin. For upcoming = that SPECIFIC match's own actual scheduled date and time, converted to IST and labeled "IST". Format like "16 Nov 2026, 4:30 PM IST". Still include the match if the exact time is unclear — put whatever schedule detail you DO have instead of guessing.
- venue: stadium/city name
- Return up to ${tab === 'Upcoming' ? '15' : '5'} matches — fewer, or an empty array, if your search doesn't turn up that many real ones. Never invent a match to fill the count.
- Return ONLY the JSON array, nothing else`

  const res = await agentApi.chat([{ role: 'user', content: prompt }])
  const text = res.response || ''
  const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (!match) return []
  try { const parsed = JSON.parse(match[0]); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}

async function fetchSportsFromAI(sportTitle, tab) {
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  if (tab !== 'Upcoming') {
    const searchTerm = tab === 'Live' ? 'live score' : 'recent match results'
    const results = await fetchOneSportsQuery(sportTitle, tab, searchTerm, today, '')
    return results.length > 0 ? results : null
  }
  const monthLabel = (monthsAhead) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + monthsAhead); return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' }) }
  const months = [monthLabel(0), monthLabel(1), monthLabel(2)]
  const windowNote = `(now through ${new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })})`
  const perMonthResults = await Promise.all(months.map(m => fetchOneSportsQuery(sportTitle, 'Upcoming', `fixtures schedule ${m}`, today, windowNote).catch(() => [])))
  const seen = new Set(); const merged = []
  for (const list of perMonthResults) for (const m of list) {
    const key = `${m.teamA}|${m.teamB}|${m.venue}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key); merged.push(m)
  }
  return merged.length > 0 ? merged.slice(0, 30) : null
}

function MatchCard({ match, color }) {
  const isLive = match.status === 'live'
  const isUpcoming = match.status === 'upcoming'
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 10.5, color: 'var(--ink3)', flex: 1 }}>{match.venue}</span>
        {isLive && <span className="badge badge-danger">● LIVE</span>}
        {isUpcoming && <span className="badge badge-warn">UPCOMING</span>}
        {match.status === 'result' && <span className="badge badge-go">FT</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 6 }}>{match.teamA?.[0]}</div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{match.teamA}</div>
          {match.scoreA && <div style={{ fontSize: 14, fontWeight: 700, color: isLive ? 'var(--danger)' : 'var(--ink2)', marginTop: 2 }}>{match.scoreA}</div>}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink4)', padding: '0 10px' }}>VS</div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 6, marginLeft: 'auto' }}>{match.teamB?.[0]}</div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{match.teamB}</div>
          {match.scoreB && <div style={{ fontSize: 14, fontWeight: 700, color: isLive ? 'var(--danger)' : 'var(--ink2)', marginTop: 2 }}>{match.scoreB}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 10, marginTop: 10, borderTop: '1px solid var(--rim1)', fontSize: 11, color: 'var(--ink3)' }}>
        {isLive ? '📡' : isUpcoming ? '🕐' : '✅'} {match.info}
      </div>
    </div>
  )
}

function AIChatPanel({ currentContext }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([{ id: '0', sender: 'ai', text: "Hi! Ask me anything about sports — live scores, fixtures, players, stats 🏆" }])
  const scrollRef = useRef(null)
  const QUICK = ['Live scores now', "Today's fixtures", 'Top performers', 'Recent results']

  const sendMessage = useCallback(async (presetText) => {
    const content = (presetText ?? input).trim()
    if (!content || loading) return
    setInput('')
    setMessages(m => [...m, { id: String(Date.now()), sender: 'user', text: content }])
    setLoading(true)
    try {
      const prompt = `You are Mneva AI sports assistant. The user is viewing: ${currentContext}.\nAnswer concisely about sports — scores, fixtures, players, stats, news.\nUser question: ${content}`
      const res = await agentApi.chat([{ role: 'user', content: prompt }])
      setMessages(m => [...m, { id: String(Date.now() + 1), sender: 'ai', text: res.response || 'Let me check that for you!' }])
    } catch {
      setMessages(m => [...m, { id: String(Date.now() + 1), sender: 'ai', text: "Couldn't reach AI right now. Try again!" }])
    } finally { setLoading(false) }
  }, [input, loading, currentContext])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, loading])

  return (
    <div className="card" style={{ marginTop: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', background: 'none', border: 'none', padding: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--ink1)', fontFamily: 'inherit' }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#F97316,#6C47FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🤖</div>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Mneva AI</span>
        {loading && <span className="anim-spin" style={{ fontSize: 12 }}>⟳</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--warn)', fontWeight: 600 }}>{open ? 'Close' : 'Ask about sports'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--rim1)' }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 12px' }}>
            {QUICK.map(q => <button key={q} onClick={() => setInput(q)} style={{ background: 'var(--depth3)', border: '1px solid rgba(255,176,32,0.3)', color: 'var(--warn)', borderRadius: 16, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{q}</button>)}
          </div>
          <div ref={scrollRef} style={{ maxHeight: 220, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(m => (
              <div key={m.id} style={{ alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '9px 12px', borderRadius: m.sender === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px', background: m.sender === 'user' ? 'var(--warn)' : 'var(--depth3)', color: m.sender === 'user' ? '#fff' : 'var(--ink1)', fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.text}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--rim1)' }}>
            <input className="input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Ask about scores, fixtures, players…" style={{ flex: 1 }} />
            <button className="btn-primary" disabled={!input.trim() || loading} onClick={() => sendMessage()}>↑</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SportsDiscoveryPage() {
  const [selected, setSelected] = useState(null)
  const [activeTab, setActiveTab] = useState('Live')
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const sport = SPORTS.find(s => s.id === selected)
  const aiContext = sport ? `${sport.title} · ${activeTab}` : 'Sports'

  const loadMatches = useCallback(async (sportTitle, tab) => {
    setLoading(true); setError(false); setMatches([])
    try { setMatches((await fetchSportsFromAI(sportTitle, tab)) || []) }
    catch { setError(true) }
    finally { setLoading(false) }
  }, [])

  const chooseSport = (s) => { setSelected(s.id); setActiveTab('Live'); loadMatches(s.title, 'Live') }
  const chooseTab = (tab) => { setActiveTab(tab); if (sport) loadMatches(sport.title, tab) }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Live · Scores · Highlights</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{sport ? sport.title : 'Sports'}</div>
        </div>
        <span className="badge badge-warn">● AI LIVE</span>
      </div>

      <div style={{ background: sport ? sport.color : 'linear-gradient(135deg,#F97316,#6C47FF)', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 15 }}>🤖</span>
        <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.9)' }}>
          Mneva AI searching the web for <b>{sport ? `${sport.title} · ${activeTab}` : 'live scores, fixtures & highlights'}</b> right now
        </span>
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Choose a sport</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
        {SPORTS.map(s => (
          <button key={s.id} onClick={() => chooseSport(s)}
            style={{ background: selected === s.id ? `${s.color}1a` : 'var(--depth3)', border: `1px solid ${selected === s.id ? s.color : 'var(--rim1)'}`, borderRadius: 14, padding: 16, textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit' }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, margin: '0 auto 8px' }}>{s.icon}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: selected === s.id ? s.color : 'var(--ink1)' }}>{s.title}</div>
            <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 2 }}>Tap to explore</div>
          </button>
        ))}
      </div>

      {selected && (
        <>
          <div style={{ display: 'flex', background: 'var(--depth3)', borderRadius: 12, border: '1px solid var(--rim1)', overflow: 'hidden', marginBottom: 10 }}>
            {MATCH_TABS.map(tab => (
              <button key={tab} onClick={() => chooseTab(tab)}
                style={{ flex: 1, background: 'none', border: 'none', borderBottom: activeTab === tab ? `2px solid ${sport.color}` : '2px solid transparent', padding: '11px 0', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {tab === 'Live' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: activeTab === tab ? sport.color : 'var(--ink4)' }} />}
                <span style={{ fontSize: 12, fontWeight: 700, color: activeTab === tab ? sport.color : 'var(--ink3)' }}>{tab}</span>
                {!loading && <span style={{ background: activeTab === tab ? sport.color : 'var(--depth4)', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{matches.length}</span>}
              </button>
            ))}
          </div>

          {!loading && !error && matches.length > 0 && <div style={{ fontSize: 10.5, color: 'var(--pulse2)', fontWeight: 700, marginBottom: 10 }}>🤖 Powered by Mneva AI · live web search</div>}
          {!loading && error && <div style={{ fontSize: 10.5, color: 'var(--warn)', fontWeight: 700, marginBottom: 10 }}>⚠️ Couldn't load live data · try again</div>}

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div className="anim-spin" style={{ fontSize: 24, display: 'inline-block' }}>⟳</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 10 }}>Mneva AI fetching {activeTab.toLowerCase()} matches…</div>
            </div>
          ) : matches.length === 0 ? (
            <EmptyState icon="📭" title={`No ${activeTab.toLowerCase()} matches found`} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
              {matches.map((m, i) => <MatchCard key={i} match={m} color={sport.color} />)}
            </div>
          )}
        </>
      )}

      <AIChatPanel currentContext={aiContext} />
    </motion.div>
  )
}
