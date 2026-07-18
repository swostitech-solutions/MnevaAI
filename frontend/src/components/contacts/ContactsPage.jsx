import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { contactsApi } from '../../services/api'
import { useSocket } from '../../services/socket'
import toast from 'react-hot-toast'

const AVATAR_COLORS = [
  ['#1F9A5A', '#3CB37A'], ['#615FF8', '#4C3AED'], ['#4FA6E8', '#2E86C8'],
  ['#E0546E', '#C8405A'], ['#F5A623', '#E8943A'], ['#9B72FF', '#7C5CE8'],
]

function Avatar({ name, size = 40 }) {
  const idx = (name?.charCodeAt(0) || 0) % AVATAR_COLORS.length
  const [from, to] = AVATAR_COLORS[idx]
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      background: `linear-gradient(135deg,${from},${to})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 800, color: '#fff',
    }}>{initials}</div>
  )
}

function ContactDetail({ contact, onClose }) {
  if (!contact) return null
  const rows = [
    contact.phone        && { icon: '📞', label: 'Phone',   value: contact.phone,   href: `tel:${contact.phone}` },
    contact.email        && { icon: '📧', label: 'Email',   value: contact.email,   href: `mailto:${contact.email}` },
    contact.organization && { icon: '🏢', label: 'Company', value: contact.organization },
    contact.jobTitle     && { icon: '💼', label: 'Role',    value: contact.jobTitle },
    contact.address      && { icon: '📍', label: 'Address', value: contact.address },
    contact.birthday     && { icon: '🎂', label: 'Birthday',value: contact.birthday },
    contact.bio          && { icon: '📝', label: 'Note',    value: contact.bio },
  ].filter(Boolean)

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 20 }}
        onClick={e => e.stopPropagation()}
        style={{ width: 420, maxWidth: '92vw', background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}
      >
        <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid var(--rim1)', textAlign: 'center', background: 'var(--depth1)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <Avatar name={contact.displayName} size={72} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink1)', marginBottom: 4 }}>{contact.displayName}</div>
          {(contact.jobTitle || contact.organization) && (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
              {[contact.jobTitle, contact.organization].filter(Boolean).join(' · ')}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            {contact.phone && (
              <a href={`tel:${contact.phone}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(31,154,90,0.15)', border: '1px solid rgba(31,154,90,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📞</div>
                  <span style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600 }}>Call</span>
                </div>
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(97,95,248,0.15)', border: '1px solid rgba(97,95,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📧</div>
                  <span style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600 }}>Email</span>
                </div>
              </a>
            )}
            {contact.phone && (
              <a href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💬</div>
                  <span style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600 }}>WhatsApp</span>
                </div>
              </a>
            )}
          </div>
        </div>
        <div style={{ padding: '8px 0', maxHeight: 320, overflowY: 'auto' }}>
          {rows.map((row, i) => (
            <div key={i}
              onClick={() => row.href && window.open(row.href, '_self')}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 24px', borderBottom: i < rows.length - 1 ? '1px solid var(--rim1)' : 'none', cursor: row.href ? 'pointer' : 'default', transition: 'background 0.12s' }}
              onMouseEnter={e => { if (row.href) e.currentTarget.style.background = 'var(--depth3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{row.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: 'var(--ink4)', fontWeight: 600, marginBottom: 2 }}>{row.label}</div>
                <div style={{ fontSize: 13, color: row.href ? 'var(--pulse2)' : 'var(--ink1)', fontWeight: 500 }}>{row.value}</div>
              </div>
              {row.href && <span style={{ color: 'var(--ink4)', fontSize: 12 }}>›</span>}
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--rim1)' }}>
          <button className="btn-ghost" style={{ width: '100%', fontSize: 13 }} onClick={onClose}>Close</button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ConnectScreen({ onConnect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 480 }}>
      <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg,#4FA6E8,#2E86C8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 24 }}>👥</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink1)', marginBottom: 10 }}>Google Contacts</div>
      <div style={{ fontSize: 14, color: 'var(--ink3)', textAlign: 'center', maxWidth: 380, lineHeight: 1.7, marginBottom: 28 }}>
        Connect your Google account to sync contacts, let your AI twin know who matters to you, and search across all your relationships.
      </div>
      <div style={{ background: 'var(--depth2)', border: '1px solid var(--rim1)', borderRadius: 16, padding: '20px 28px', marginBottom: 28, width: '100%', maxWidth: 380 }}>
        {['Search across all contacts', 'One-click call, email & WhatsApp', 'AI knows your key relationships', 'Syncs automatically in real-time'].map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < 3 ? 12 : 0 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4FA6E8', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--ink2)' }}>{f}</span>
          </div>
        ))}
      </div>
      <button className="btn-primary" style={{ fontSize: 14, padding: '12px 32px', borderRadius: 12 }} onClick={onConnect}>
        👥 Connect Google Contacts
      </button>
      <div style={{ fontSize: 11.5, color: 'var(--ink4)', marginTop: 12 }}>Read-only access · OAuth 2.0 · No passwords stored</div>
    </div>
  )
}

export default function ContactsPage() {
  const [contacts, setContacts]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [connected, setConnected]         = useState(null)
  const [query, setQuery]                 = useState('')
  const [searching, setSearching]         = useState(false)
  const [nextPageToken, setNextPageToken] = useState(null)
  const [loadingMore, setLoadingMore]     = useState(false)
  const [total, setTotal]                 = useState(0)
  const [selected, setSelected]           = useState(null)
  const searchTimer = useRef(null)
  const { on } = useSocket()

  const checkStatus = useCallback(async () => {
    try {
      const res = await contactsApi.status()
      setConnected(res.connected)
      return res.connected
    } catch { setConnected(false); return false }
  }, [])

  const loadContacts = useCallback(async (reset = true, q = '') => {
    if (reset) setLoading(true)
    try {
      const res = await contactsApi.list({ query: q, pageSize: 50 })
      setContacts(reset ? (res.contacts || []) : prev => [...prev, ...(res.contacts || [])])
      setNextPageToken(res.nextPageToken || null)
      setTotal(res.total || 0)
    } catch (err) {
      if (err.response?.status === 409) setConnected(false)
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    checkStatus().then(ok => { if (ok) loadContacts() })
  }, [])

  useEffect(() => {
    const offConnected = on('contacts:connected', () => { setConnected(true); loadContacts() })
    const offUpdated   = on('contacts:updated', ({ newCount }) => { if (newCount > 0) loadContacts(true, query) })
    return () => { offConnected?.(); offUpdated?.() }
  }, [on, query])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!query.trim()) { loadContacts(true, ''); return }
    setSearching(true)
    searchTimer.current = setTimeout(() => loadContacts(true, query.trim()), 400)
    return () => clearTimeout(searchTimer.current)
  }, [query])

  const loadMore = async () => {
    if (!nextPageToken || loadingMore || query) return
    setLoadingMore(true)
    try {
      const res = await contactsApi.list({ pageSize: 50, pageToken: nextPageToken })
      setContacts(prev => [...prev, ...(res.contacts || [])])
      setNextPageToken(res.nextPageToken || null)
    } catch {}
    finally { setLoadingMore(false) }
  }

  const handleConnect = async () => {
    try {
      const { url } = await contactsApi.connect()
      window.location.href = url
    } catch (err) { toast.error(err.response?.data?.error || 'Could not start OAuth') }
  }

  const grouped = React.useMemo(() => {
    if (query) return [{ letter: `Results for "${query}"`, contacts }]
    const map = {}
    contacts.forEach(c => {
      const letter = (c.displayName?.[0] || '#').toUpperCase()
      const key = /[A-Z]/.test(letter) ? letter : '#'
      if (!map[key]) map[key] = []
      map[key].push(c)
    })
    return Object.keys(map).sort().map(k => ({ letter: k, contacts: map[k] }))
  }, [contacts, query])

  if (connected === null) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 6 }}>
      <div className="dot-bounce" /><div className="dot-bounce" /><div className="dot-bounce" />
    </div>
  )

  if (connected === false) return <ConnectScreen onConnect={handleConnect} />

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink1)' }}>Contacts</div>
          {!loading && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3 }}>{total > 0 ? `${total.toLocaleString('en-IN')} contacts synced` : `${contacts.length} loaded`}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--depth2)', border: '1px solid var(--rim1)', borderRadius: 10, padding: '8px 14px', width: 260 }}>
            <span style={{ fontSize: 13 }}>🔍</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, email or phone…"
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--ink1)', flex: 1, fontFamily: '"Space Grotesk",sans-serif' }}
            />
            {searching && <span style={{ fontSize: 11, color: 'var(--ink3)' }}>…</span>}
            {query && <span style={{ cursor: 'pointer', color: 'var(--ink3)', fontSize: 13 }} onClick={() => setQuery('')}>✕</span>}
          </div>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => loadContacts(true, query)}>↻ Refresh</button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--depth2)', border: '1px solid var(--rim1)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--depth4)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, borderRadius: 6, background: 'var(--depth4)', width: '60%', marginBottom: 8 }} />
                <div style={{ height: 10, borderRadius: 5, background: 'var(--depth4)', width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{query ? 'No contacts found' : 'No contacts yet'}</div>
        </div>
      ) : (
        <>
          {grouped.map(group => (
            <div key={group.letter}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink4)', letterSpacing: '0.08em', padding: '10px 4px 6px', textTransform: 'uppercase' }}>
                {group.letter}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 8, marginBottom: 8 }}>
                {group.contacts.map(c => (
                  <motion.div
                    key={c.id}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => setSelected(c)}
                    style={{ background: 'var(--depth2)', border: '1px solid var(--rim1)', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--rim3)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--rim1)'}
                  >
                    <Avatar name={c.displayName} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.displayName}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                        {c.jobTitle && c.organization ? `${c.jobTitle} · ${c.organization}` : c.phone || c.email || ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {c.phone && (
                        <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()}
                          style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(31,154,90,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, textDecoration: 'none' }}>📞</a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                          style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(97,95,248,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, textDecoration: 'none' }}>📧</a>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
          {nextPageToken && !query && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn-ghost" style={{ fontSize: 13 }} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more contacts'}
              </button>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {selected && <ContactDetail contact={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </motion.div>
  )
}
