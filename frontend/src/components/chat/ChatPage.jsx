import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { agentApi, conversationApi, messageApi, documentsApi, calendarApi } from '../../services/api'
import { useChat, useAuth } from '../../store'
import toast from 'react-hot-toast'

// Render tool result as a structured card
function ToolCard({ tool, result }) {
  const meta = {
    query_bills:          { icon: '💡', title: 'Bills Found' },
    initiate_payment:     { icon: '💸', title: 'Payment Ready' },
    get_portfolio:        { icon: '📈', title: 'Portfolio Summary' },
    get_spending_summary: { icon: '💰', title: 'Spending Report' },
    get_emails:           { icon: '📧', title: 'Inbox Summary' },
    draft_reply:          { icon: '✉️', title: 'Draft Ready' },
    send_email:           { icon: '✅', title: 'Email Sent' },
    get_health_data:      { icon: '❤️', title: 'Health Data' },
    book_cab:             { icon: '🚗', title: 'Cab Booking' },
    order_food:           { icon: '🍛', title: 'Food Order' },
    set_reminder:         { icon: '🔔', title: 'Reminder Set' },
    personal_search:      { icon: '🔍', title: 'Search Results' },
    schedule_event:       { icon: '📅', title: 'Meeting Scheduled' },
    get_daily_brief:      { icon: '⚡', title: 'Daily Brief' },
  }[tool] || { icon: '🔧', title: tool }

  const renderBody = () => {
    if (!result || result.error) return <div style={{ fontSize: 12, color: 'var(--danger)' }}>{result?.error || 'No data'}</div>

    if (tool === 'schedule_event') {
      if (!result.success) return <div style={{ fontSize: 12, color: 'var(--danger)' }}>❌ {result.error}</div>
      return (
        <div style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>📅 {result.title}</div>
          <div style={{ color: 'var(--ink3)', marginBottom: 4 }}>
            🕐 {new Date(result.start).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            {' → '}{new Date(result.end).toLocaleTimeString('en-IN', { timeStyle: 'short' })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {result.meetLink && (
              <a href={result.meetLink} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, background: 'linear-gradient(135deg,#1a73e8,#0d47a1)', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none', fontFamily: '"Space Grotesk",sans-serif' }}>
                <span style={{ fontSize: 15 }}>📹</span> Join Google Meet
              </a>
            )}
            {result.htmlLink && (
              <a href={result.htmlLink} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, background: 'var(--depth4)', border: '1px solid var(--rim2)', color: 'var(--ink1)', fontSize: 12, fontWeight: 600, textDecoration: 'none', fontFamily: '"Space Grotesk",sans-serif' }}>
                📆 View in Calendar
              </a>
            )}
          </div>
          {result.meetLink && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(26,115,232,0.08)', borderRadius: 7, fontSize: 11, color: 'var(--ink3)', wordBreak: 'break-all' }}>
              🔗 {result.meetLink}
            </div>
          )}
        </div>
      )
    }
    if (tool === 'query_bills' && Array.isArray(result)) {
      return result.slice(0, 5).map(b => (
        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--rim1)', fontSize: 12 }}>
          <span>{b.logo} {b.name}</span>
          <span style={{ fontWeight: 700 }}>₹{b.amount.toLocaleString('en-IN')}</span>
        </div>
      ))
    }
    if (tool === 'get_portfolio' && result.holdings) {
      return (
        <div style={{ fontSize: 12 }}>
          <div style={{ color: 'var(--go)', fontWeight: 700, marginBottom: 5 }}>+{result.returnPct}% · ₹{result.totalCurrent?.toLocaleString('en-IN')}</div>
          {result.holdings.slice(0, 3).map(h => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ color: 'var(--ink2)' }}>{h.name.slice(0, 22)}</span>
              <span style={{ color: h.ret >= 0 ? 'var(--go)' : 'var(--danger)', fontWeight: 600 }}>{h.ret >= 0 ? '+' : ''}{h.ret}%</span>
            </div>
          ))}
        </div>
      )
    }
    if (tool === 'get_emails' && result.emails) {
      return result.emails.slice(0, 3).map(e => (
        <div key={e.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--rim1)' }}>
          <span style={{ fontWeight: 600 }}>{e.from}</span>
          <span style={{ color: 'var(--ink3)' }}> — {e.subject}</span>
        </div>
      ))
    }
    if (tool === 'book_cab' && result.bookingId) {
      return (
        <div style={{ fontSize: 12 }}>
          <div>🚗 {result.cab_type} · ₹{result.fare} · ETA {result.eta} min</div>
          <div style={{ color: 'var(--ink3)' }}>Driver: {result.driver?.name} · {result.driver?.vehicle}</div>
          {result.requiresBiometric && <div style={{ color: 'var(--warn)', marginTop: 4 }}>🔐 Biometric confirmation required</div>}
        </div>
      )
    }
    if (tool === 'order_food' && result.orderId) {
      return (
        <div style={{ fontSize: 12 }}>
          <div>🍛 {result.restaurant} · ₹{result.total} · ~{result.eta} min</div>
          {result.items?.length > 0 && <div style={{ color: 'var(--ink3)' }}>{result.items.join(', ')}</div>}
        </div>
      )
    }
    if (tool === 'get_health_data' && result.metrics) {
      const m = result.metrics
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 12 }}>
          <span>❤️ {m.heartRate?.value} bpm</span>
          <span>🚶 {m.steps?.value?.toLocaleString()} steps</span>
          <span>😴 {m.sleep?.value}h sleep</span>
          <span>🍽️ {m.calories?.consumed} cal</span>
        </div>
      )
    }
    if (tool === 'get_spending_summary' && result.categories) {
      return (
        <div style={{ fontSize: 12 }}>
          <div style={{ color: 'var(--ink2)', marginBottom: 4 }}>Total: ₹{result.total?.toLocaleString('en-IN')} · Savings {result.savingsRate}%</div>
          {result.categories.slice(0, 4).map(c => (
            <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span style={{ color: 'var(--ink3)' }}>{c.name}</span>
              <span style={{ fontWeight: 600 }}>₹{c.amount.toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
      )
    }
    if (tool === 'set_reminder' && result.reminderId) {
      return <div style={{ fontSize: 12, color: 'var(--go)' }}>✅ Reminder set: "{result.message}" at {result.scheduled}</div>
    }
    if (tool === 'personal_search' && result.results) {
      return result.results.slice(0, 4).map((r, i) => (
        <div key={i} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--rim1)' }}>
          <span style={{ fontWeight: 600 }}>{r.title}</span>
          <div style={{ color: 'var(--ink3)' }}>{r.snippet}</div>
        </div>
      ))
    }
    if (tool === 'get_daily_brief') {
      const pending = result.pendingActions || []
      const completed = result.autoCompleted || []
      return (
        <div style={{ fontSize: 12 }}>
          <div style={{ color: 'var(--ink2)', marginBottom: 4 }}>{result.summary}</div>
          {pending.slice(0, 3).map((a, i) => (
            <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--rim1)', color: 'var(--ink3)' }}>{a.title}</div>
          ))}
          {completed.length > 0 && <div style={{ color: 'var(--go)', marginTop: 4 }}>✓ {completed.length} completed today</div>}
        </div>
      )
    }
    // Fallback — only show for known structured results, otherwise show nothing
    return null
  }

  const isActionable = ['initiate_payment','book_cab','order_food'].includes(tool) && result?.status?.includes('pending')
  const actionId = result?.actionId || result?.bookingId || result?.orderId || result?.id

  const handleApprove = async () => {
    if (!actionId) {
      toast.error('No action ID available to approve')
      return
    }

    try {
      await agentApi.approve(actionId)
      toast.success('✅ Action approved')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not approve action')
    }
  }

  const handleDeny = async () => {
    if (!actionId) {
      toast.error('No action ID available to deny')
      return
    }

    try {
      await agentApi.deny(actionId)
      toast('Action cancelled')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not cancel action')
    }
  }

  return (
    <div style={{ background: 'rgba(61,139,255,0.06)', border: '1px solid var(--rim2)', borderRadius: 10, padding: '10px 13px', marginTop: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--pulse2)', marginBottom: 6 }}>{meta.icon} {meta.title}</div>
      {renderBody()}
      {isActionable && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn-approve" onClick={handleApprove}>✓ Approve</button>
          <button className="btn-deny" onClick={handleDeny}>✗ Cancel</button>
        </div>
      )}
    </div>
  )
}

// Markdown-like bold rendering
function RenderText({ text }) {
  const parts = (text || '').split(/(\*\*.*?\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : <React.Fragment key={i}>{p}</React.Fragment>
      )}
    </>
  )
}

function Message({ msg }) {
  const { user } = useAuth()
  const isUser = msg.role === 'user'
  const time = new Date(msg.ts || msg.createdAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', gap: 10, maxWidth: '82%', alignSelf: isUser ? 'flex-end' : 'flex-start', flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: isUser ? 'linear-gradient(135deg,#00E396,#3D8BFF)' : 'linear-gradient(135deg,#3D8BFF,#9B72FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0, fontFamily: '"Space Grotesk",sans-serif' }}>
        {isUser ? user?.avatar || 'U' : 'M'}
      </div>
      <div style={{ maxWidth: '100%' }}>
        <div style={{ padding: '11px 15px', borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px', background: isUser ? 'var(--pulse)' : 'var(--depth3)', border: isUser ? 'none' : '1px solid var(--rim1)', color: isUser ? '#fff' : 'var(--ink1)', fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <RenderText text={msg.content} />
        </div>
        {msg.toolResults?.map((tr, i) => (
          <ToolCard key={i} tool={tr.tool} result={tr.result} />
        ))}
        <div style={{ fontSize: 10, color: 'var(--ink4)', marginTop: 4, textAlign: isUser ? 'right' : 'left' }}>{time}</div>
      </div>
    </motion.div>
  )
}

function ThinkingDots() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '50%' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#3D8BFF,#9B72FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>M</div>
      <div style={{ padding: '13px 18px', background: 'var(--depth3)', border: '1px solid var(--rim1)', borderRadius: '4px 16px 16px 16px', display: 'flex', gap: 5, alignItems: 'center' }}>
        <span className="dot-bounce" />
        <span className="dot-bounce" />
        <span className="dot-bounce" />
      </div>
    </motion.div>
  )
}

export default function ChatPage() {
  const { messages, thinking, conversationId, addMsg, setConversationId, setMessages, setThinking } = useChat()
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [recording, setRecording] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [speakEnabled, setSpeakEnabled] = useState(true)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [speakVoice, setSpeakVoice] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [meetModal, setMeetModal] = useState(false)
  const [meetForm, setMeetForm] = useState({ title: '', date: '', time: '', duration: '60', description: '', attendees: '' })
  const [meetLoading, setMeetLoading] = useState(false)
  const msgsRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')
  const stopTimerRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  useEffect(() => {
    const supported = !!(
      window.SpeechRecognition || window.webkitSpeechRecognition ||
      (navigator.mediaDevices?.getUserMedia && window.MediaRecorder)
    )
    setVoiceSupported(supported)
  }, [])

  const clearStopTimer = () => {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
  }

  const stopRecording = async () => {
    clearStopTimer()
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }

    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    recorder.stop()
  }

  const handleVoiceClick = async () => {
    if (recording) {
      await stopRecording()
      return
    }

    if (!voiceSupported) {
      toast.error('Voice input is not supported in this browser.')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'en-IN'
      finalTranscriptRef.current = ''

      recognition.onstart = () => {
        setRecording(true)
        toast('🎙️ Listening… speak now')
      }

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0]?.transcript || '')
          .join('')

        setInput(transcript)
        if (inputRef.current) {
          inputRef.current.style.height = 'auto'
          inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 96) + 'px'
        }

        if (event.results[event.results.length - 1].isFinal) {
          finalTranscriptRef.current = transcript.trim()
        }
      }

      recognition.onerror = (event) => {
        setRecording(false)
        recognitionRef.current = null
        toast.error(`Voice input error: ${event.error || 'unknown error'}`)
      }

      recognition.onend = async () => {
        setRecording(false)
        recognitionRef.current = null
        const transcript = finalTranscriptRef.current
        finalTranscriptRef.current = ''
        if (transcript && !thinking) {
          await send(transcript)
        }
      }

      recognitionRef.current = recognition
      recognition.start()
      stopTimerRef.current = window.setTimeout(() => {
        recognition.stop()
      }, 12000)
      return
    }

    try {
      setRecording(true)
      setIsTranscribing(false)
      toast('🎙️ Recording… speak now. Click again to stop.')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }

      recorder.onerror = (event) => {
        setRecording(false)
        setIsTranscribing(false)
        toast.error(`Recording error: ${event.error || 'unknown error'}`)
      }

      recorder.onstop = async () => {
        clearStopTimer()
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const audioFile = new File([audioBlob], 'voice.webm', { type: 'audio/webm' })
        stream.getTracks().forEach(track => track.stop())
        setRecording(false)
        setIsTranscribing(true)

        try {
          const text = await agentApi.transcribe(audioFile)
          if (text?.text) {
            setInput(text.text)
            if (inputRef.current) {
              inputRef.current.style.height = 'auto'
              inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 96) + 'px'
            }
            await send(text.text)
          } else {
            throw new Error('No transcript returned')
          }
        } catch (err) {
          toast.error(err.response?.data?.error || err.message || 'Audio transcription failed')
        } finally {
          setIsTranscribing(false)
        }
      }

      recorder.start()
      stopTimerRef.current = window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, 12000)
    } catch (err) {
      setRecording(false)
      setIsTranscribing(false)
      toast.error(err.message || 'Could not access microphone')
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || []
      if (!voices.length) return
      const candidate = voices.find(v => /en[-_]?in/i.test(v.lang) && /female|woman|girl/i.test(v.name))
        || voices.find(v => /en[-_]?in/i.test(v.lang))
        || voices.find(v => /female|woman|girl/i.test(v.name))
        || voices.find(v => /en[-_]?/i.test(v.lang))
        || voices[0]
      setSpeakVoice(candidate)
    }

    if (window?.speechSynthesis) {
      loadVoices()
      window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
    }

    return () => {
      window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices)
    }
  }, [])

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    try {
      setUploading(true)
      toast.loading(`Uploading ${file.name}…`, { id: 'upload-doc' })
      const result = await documentsApi.upload(file, file.name)
      const chunkCount = result.chunks || 0
      toast.success(`Uploaded ${file.name} and indexed ${chunkCount} chunk(s)`, { id: 'upload-doc' })

      if (chunkCount === 0) {
        const note = result.note || result.preview || 'No readable text was found in the uploaded file.'
        addMsg({ role: 'assistant', content: `Uploaded ${file.name}, but I could not extract any readable text. ${note}`, toolResults: [] })
      } else {
        const preview = String(result.preview || '').trim()
        const previewText = preview ? ` I also extracted text from it, so you can ask me to read it or summarize it.` : ' You can now ask me questions about its content.'
        addMsg({ role: 'assistant', content: `✅ Uploaded and indexed document: ${file.name}.${previewText}`, toolResults: [] })
      }
    } catch (err) {
      toast.error(err.response?.data?.error || `Upload failed for ${file.name}` , { id: 'upload-doc' })
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadConversation = async () => {
      if (!user?.id) return

      try {
        const list = await conversationApi.list()
        if (cancelled) return

        const conversations = Array.isArray(list) ? list : list.conversations || []
        if (conversations.length === 0) {
          const created = await conversationApi.create('New Conversation')
          if (!cancelled) setConversationId(created.id)
          return
        }

        const latest = conversations[0]
        setConversationId(latest.id)

        const savedMessages = await messageApi.list(latest.id)
        if (cancelled) return

        const normalized = Array.isArray(savedMessages)
          ? savedMessages.map(msg => ({
              ...msg,
              ts: msg.createdAt || msg.ts || new Date().toISOString(),
              toolResults: Array.isArray(msg.toolResults) ? msg.toolResults : [],
            }))
          : []

        if (normalized.length) {
          setMessages(normalized)
        } else {
          setMessages([{
            id: 'welcome',
            role: 'assistant',
            ts: new Date().toISOString(),
            toolResults: [],
            content: "Hello, I'm Mneva, your AI Chief of Staff. Once your database and integrations have real records, I'll summarize actions and keep an audit trail here.\n\nWhat would you like me to work on?",
          }])
        }
      } catch (err) {
        console.error('Failed to load chat history', err)
      }
    }

    loadConversation()

    return () => {
      cancelled = true
    }
  }, [user?.id, setConversationId, setMessages])

  const persistMessage = async (conversation, payload) => {
    if (!conversation || !payload?.content) return
    try {
      await messageApi.create({
        conversationId: conversation,
        role: payload.role,
        content: payload.content,
      })
    } catch {
      // ignore persistence failures so the chat still works in demo mode
    }
  }

  const ensureConversation = async () => {
    if (conversationId) return conversationId
    const created = await conversationApi.create('New Conversation')
    setConversationId(created.id)
    return created.id
  }

  const speakText = (text) => {
    if (!speakEnabled) return
    if (!window?.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return
    // Strip emojis, markdown symbols, and extra whitespace
    const clean = text
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA9F}]/gu, '')
      .replace(/[*_~`#>|\-]{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim()
    const utterance = new window.SpeechSynthesisUtterance(clean)
    if (speakVoice) utterance.voice = speakVoice
    utterance.lang = speakVoice?.lang || 'en-IN'
    utterance.rate = 1.05
    utterance.pitch = 1.15
    utterance.volume = 1
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  const send = async (text) => {
    const content = (text || input).trim()
    if (!content || thinking) return
    setInput('')
    if (inputRef.current) { inputRef.current.style.height = 'auto' }

    const userMessage = { role: 'user', content, toolResults: [] }
    addMsg(userMessage)
    setThinking(true)

    const history = [...messages.filter(m => m.id !== 'welcome'), userMessage]
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const currentConversationId = await ensureConversation()
      await persistMessage(currentConversationId, userMessage)

      const result = await agentApi.chat(history)
      const assistantMessage = {
        role: 'assistant',
        content: result.response,
        toolResults: result.toolResults || [],
      }
      addMsg(assistantMessage)
      await persistMessage(currentConversationId, assistantMessage)
      speakText(result.response)
    } catch (err) {
      const isNoKey = err.response?.status === 500 && err.response?.data?.error?.includes('API')
      const errorText = isNoKey
        ? "I'm running in demo mode — the DEEPSEEK_API_KEY isn't set on the backend yet.\n\n**To enable full AI:** copy `backend/.env.example` → `backend/.env` and add your key.\n\nIn the meantime, try the quick-action chips above to explore the app!"
        : `Something went wrong: ${err.response?.data?.error || err.message}`
      addMsg({
        role: 'assistant',
        content: errorText,
        toolResults: []
      })
      speakText(errorText)
    } finally {
      setThinking(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }
  const handleInput = (e) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 96) + 'px'
  }

  const createMeeting = async () => {
    if (!meetForm.title || !meetForm.date || !meetForm.time) {
      toast.error('Title, date and time are required')
      return
    }
    setMeetLoading(true)
    try {
      const start = new Date(`${meetForm.date}T${meetForm.time}`).toISOString()
      const end = new Date(new Date(start).getTime() + Number(meetForm.duration) * 60000).toISOString()
      const attendees = meetForm.attendees ? meetForm.attendees.split(',').map(s => s.trim()).filter(Boolean) : []
      const res = await calendarApi.createMeeting({ title: meetForm.title, start, end, description: meetForm.description, attendees })
      if (!res.success) throw new Error(res.error)
      setMeetModal(false)
      setMeetForm({ title: '', date: '', time: '', duration: '60', description: '', attendees: '' })
      const m = res.meeting
      addMsg({
        role: 'assistant',
        content: `📅 Meeting **${m.title}** scheduled!${m.meetLink ? `\n\n📹 Google Meet: ${m.meetLink}` : ''}`,
        toolResults: [{ tool: 'schedule_event', result: { success: true, ...m } }],
      })
      toast.success('Meeting created with Google Meet link!')
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to create meeting')
    } finally {
      setMeetLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)' }}>
      {/* Header strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '0 2px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#3D8BFF,#9B72FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: '"Space Grotesk",sans-serif', boxShadow: '0 0 18px rgba(61,139,255,0.35)' }}>M</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Mneva AI — Autonomy Engine</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>13 domain tools · Trust L{user?.trustLevel} · {thinking ? 'Thinking…' : 'Ready'}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <div className="anim-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: thinking ? 'var(--warn)' : 'var(--go)', marginTop: 1 }} />
          <span style={{ fontSize: 11, color: thinking ? 'var(--warn)' : 'var(--go)', fontWeight: 600 }}>{thinking ? 'Processing' : 'Online'}</span>
          <button onClick={() => {
              if (speakEnabled && window?.speechSynthesis) {
                window.speechSynthesis.cancel()
              }
              setSpeakEnabled((s) => !s)
            }}
            style={{ width: 28, height: 28, marginLeft: 6, borderRadius: 8, border: '1px solid var(--rim1)', background: speakEnabled ? 'var(--go)' : 'var(--depth3)', color: speakEnabled ? '#fff' : 'var(--ink2)', fontSize: 14, cursor: 'pointer' }}
            title={speakEnabled ? 'Disable voice responses and stop current audio' : 'Enable voice responses'}>
            {speakEnabled ? '🔊' : '🔇'}
          </button>
          <button onClick={() => setMeetModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: '1px solid var(--rim2)', background: 'rgba(26,115,232,0.12)', color: '#4a90e2', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}
            title="Schedule a meeting with Google Meet">
            📅 Schedule Meeting
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md,.csv,.json,.js,.ts,.py,.zip,image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Messages */}
      <div ref={msgsRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 16 }}>
        <AnimatePresence>
          {messages.map(msg => <Message key={msg.id} msg={msg} />)}
        </AnimatePresence>
        {thinking && <ThinkingDots />}
      </div>

      {/* Input area */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', padding: '14px 16px', background: 'var(--depth2)', border: '1px solid var(--rim1)', borderRadius: 14, transition: 'border-color 0.2s' }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--rim2)'}
        onBlur={e => e.currentTarget.style.borderColor = 'var(--rim1)'}>
        <textarea ref={inputRef} value={input} rows={1} onChange={handleInput} onKeyDown={handleKey} disabled={thinking}
          placeholder="Ask Mneva to pay bills, book a cab, summarize emails, check your portfolio…"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: '"Space Grotesk",sans-serif', fontSize: 13.5, color: 'var(--ink1)', resize: 'none', lineHeight: 1.5, minHeight: 22, maxHeight: 96, overflowY: 'auto' }} />
        <button onClick={handleUploadClick} disabled={uploading}
          style={{ width: 36, height: 36, borderRadius: 10, background: uploading ? 'var(--depth4)' : 'var(--depth3)', border: '1px solid var(--rim1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 15, flexShrink: 0 }}
          title={uploading ? 'Uploading…' : 'Upload document'}>
          {uploading ? '⏫' : '📎'}
        </button>

        <button onClick={handleVoiceClick} disabled={!voiceSupported || isTranscribing}
          style={{ width: 36, height: 36, borderRadius: 10, background: recording ? 'var(--pulse)' : 'var(--depth3)', border: '1px solid var(--rim1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (!voiceSupported || isTranscribing) ? 'not-allowed' : 'pointer', fontSize: 15, flexShrink: 0, color: recording ? '#fff' : 'inherit', opacity: (!voiceSupported || isTranscribing) ? 0.5 : 1 }}
          title={!voiceSupported ? 'Voice input is not supported in this browser' : recording ? 'Stop voice input' : isTranscribing ? 'Transcribing audio…' : 'Ask Mneva by voice'}>
          {recording ? '⏹️' : '🎙️'}
        </button>
        <button onClick={() => send()} disabled={thinking || !input.trim()}
          style={{ width: 36, height: 36, borderRadius: 10, background: (thinking || !input.trim()) ? 'var(--depth4)' : 'var(--pulse)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (thinking || !input.trim()) ? 'not-allowed' : 'pointer', fontSize: 15, flexShrink: 0, transition: 'all 0.2s', color: '#fff' }}>
          {thinking ? <span className="anim-spin" style={{ fontSize: 14 }}>⟳</span> : '➤'}
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--ink4)', marginTop: 7 }}>
        Mneva AI · All actions logged to Signed Ledger · Trust L{user?.trustLevel} · Powered by DeepSeek
      </div>

      {/* Meeting Scheduler Modal */}
      <AnimatePresence>
        {meetModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setMeetModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 20, padding: 28, width: 460, maxWidth: '92vw', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
              {/* Modal header */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>📅 Schedule Meeting</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>Creates event + Google Meet link automatically</div>
                </div>
                <button onClick={() => setMeetModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--ink3)', cursor: 'pointer' }}>✕</button>
              </div>

              {/* Google Meet badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: 'rgba(26,115,232,0.1)', border: '1px solid rgba(26,115,232,0.25)', borderRadius: 10, marginBottom: 18 }}>
                <span style={{ fontSize: 18 }}>📹</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#4a90e2' }}>Google Meet link will be auto-generated</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Real meet.google.com URL · Saved to Google Calendar</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                <MeetField label="Meeting Title *">
                  <input className="input" value={meetForm.title} onChange={e => setMeetForm(f => ({ ...f, title: e.target.value }))} placeholder="Team Standup, Client Call…" />
                </MeetField>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <MeetField label="Date *">
                    <input className="input" type="date" value={meetForm.date} onChange={e => setMeetForm(f => ({ ...f, date: e.target.value }))} />
                  </MeetField>
                  <MeetField label="Time *">
                    <input className="input" type="time" value={meetForm.time} onChange={e => setMeetForm(f => ({ ...f, time: e.target.value }))} />
                  </MeetField>
                </div>
                <MeetField label="Duration">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['30','30 min'],['60','1 hour'],['90','1.5 hr'],['120','2 hr']].map(([v, l]) => (
                      <button key={v} onClick={() => setMeetForm(f => ({ ...f, duration: v }))}
                        style={{ flex: 1, padding: '8px 4px', borderRadius: 8, background: meetForm.duration === v ? 'rgba(61,139,255,0.15)' : 'var(--depth3)', border: `1px solid ${meetForm.duration === v ? 'var(--rim2)' : 'var(--rim1)'}`, color: meetForm.duration === v ? 'var(--pulse2)' : 'var(--ink2)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </MeetField>
                <MeetField label="Attendees (comma-separated emails)">
                  <input className="input" value={meetForm.attendees} onChange={e => setMeetForm(f => ({ ...f, attendees: e.target.value }))} placeholder="alice@example.com, bob@example.com" />
                </MeetField>
                <MeetField label="Description / Agenda">
                  <textarea className="input" rows={2} value={meetForm.description} onChange={e => setMeetForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional agenda or notes…" style={{ resize: 'none', fontFamily: '"Space Grotesk",sans-serif' }} />
                </MeetField>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button onClick={createMeeting} disabled={meetLoading}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, background: meetLoading ? 'var(--depth4)' : 'linear-gradient(135deg,#1a73e8,#0d47a1)', border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: meetLoading ? 'not-allowed' : 'pointer', fontFamily: '"Space Grotesk",sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  {meetLoading ? <><span className="anim-spin">⧗</span> Creating…</> : <>📹 Create Meeting + Meet Link</>}
                </button>
                <button onClick={() => setMeetModal(false)}
                  style={{ padding: '11px 18px', borderRadius: 10, background: 'var(--depth3)', border: '1px solid var(--rim1)', color: 'var(--ink2)', fontSize: 13, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MeetField({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 11.5, color: 'var(--ink2)', fontWeight: 500, display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}
