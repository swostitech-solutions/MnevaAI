import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { agentApi } from '../../services/api'

const CATEGORY_COLORS = {
  Politics: '#EF4444', Business: '#F97316', Technology: '#6C47FF', Science: '#0EA5E9',
  Sports: '#10B981', Entertainment: '#EC4899', Health: '#14B8A6', World: '#F59E0B',
  Finance: '#8B5CF6', India: '#F97316',
}

async function fetchStoryAnalysis(headline, summary) {
  const prompt = `You are Mneva AI news analyst. Analyse this news story and return ONLY a valid JSON object (no markdown):
{
  "summary": "3-4 sentence plain-English summary of the story",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4"],
  "sentiment": "Positive | Negative | Neutral",
  "impact": "High | Medium | Low",
  "impactReason": "one sentence why"
}

Story headline: ${headline}
Story summary: ${summary}

Return ONLY the JSON object.`
  const res = await agentApi.chat([{ role: 'user', content: prompt }])
  const text = res.response || ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  return JSON.parse(match[0])
}

export default function NewsStoryPage() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const story = state?.story
  const [analysis, setAnalysis] = useState(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([{ id: '0', role: 'assistant', text: "I've read this story. Ask me anything about it — context, impact, background or related news 🗞️" }])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!story) return
    setLoadingAnalysis(true)
    fetchStoryAnalysis(story.headline, story.summary)
      .then(setAnalysis)
      .catch(() => toast.error('Could not load deeper analysis'))
      .finally(() => setLoadingAnalysis(false))
  }, [story])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  if (!story) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 12 }}>No story selected — open one from News.</div>
        <button className="btn-primary" onClick={() => navigate('/discovery/news')}>← Back to News</button>
      </div>
    )
  }

  const send = async () => {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')
    setMessages(m => [...m, { id: Date.now(), role: 'user', text }])
    setThinking(true)
    try {
      const res = await agentApi.chat([
        { role: 'user', content: `Context: news story "${story.headline}" — ${story.summary}. Question: ${text}` },
      ])
      setMessages(m => [...m, { id: Date.now() + 1, role: 'assistant', text: res.response }])
    } catch {
      setMessages(m => [...m, { id: Date.now() + 1, role: 'assistant', text: 'Could not fetch a response right now.' }])
    } finally {
      setThinking(false)
    }
  }

  const color = CATEGORY_COLORS[story.category] || '#6C47FF'

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => navigate('/discovery/news')} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: 12, cursor: 'pointer', padding: 0 }}>← Back to News</button>
      </div>

      <span className="badge" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>{story.category}</span>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 10, lineHeight: 1.3 }}>{story.headline}</div>
      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 6 }}>{story.source} · {story.time} · {story.readTime}</div>
      <div style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 1.6, marginTop: 14 }}>{story.summary}</div>

      <div className="card" style={{ padding: 18, marginTop: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>✨ Mneva Analysis</div>
        {loadingAnalysis && <div className="skeleton" style={{ height: 80, borderRadius: 10 }} />}
        {!loadingAnalysis && !analysis && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Could not generate deeper analysis for this story.</div>}
        {analysis && (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 12 }}>{analysis.summary}</div>
            {analysis.keyPoints?.length > 0 && (
              <ul style={{ margin: '0 0 12px 18px', padding: 0, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.7 }}>
                {analysis.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <span className={`badge ${analysis.sentiment === 'Positive' ? 'badge-go' : analysis.sentiment === 'Negative' ? 'badge-danger' : 'badge-pulse'}`}>{analysis.sentiment}</span>
              <span className="badge badge-warn">Impact: {analysis.impact}</span>
            </div>
            {analysis.impactReason && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 8 }}>{analysis.impactReason}</div>}
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 20, overflow: 'hidden' }}>
        <button onClick={() => setChatOpen(o => !o)} style={{ width: '100%', background: 'none', border: 'none', padding: 16, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--ink1)', fontFamily: 'inherit' }}>
          <span style={{ fontSize: 16 }}>💬</span>
          <span style={{ fontWeight: 700, fontSize: 13, flex: 1, textAlign: 'left' }}>Ask Mneva about this story</span>
          <span style={{ color: 'var(--ink3)' }}>{chatOpen ? '▲' : '▼'}</span>
        </button>
        {chatOpen && (
          <div style={{ borderTop: '1px solid var(--rim1)', padding: 16 }}>
            <div ref={scrollRef} style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {messages.map(m => (
                <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '9px 13px', borderRadius: m.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px', background: m.role === 'user' ? 'var(--pulse)' : 'var(--depth3)', color: m.role === 'user' ? '#fff' : 'var(--ink1)', fontSize: 12.5, lineHeight: 1.5 }}>
                  {m.text}
                </div>
              ))}
              {thinking && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Thinking…</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Ask about this story…" style={{ flex: 1 }} />
              <button className="btn-primary" onClick={send} disabled={thinking || !input.trim()}>Send</button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
