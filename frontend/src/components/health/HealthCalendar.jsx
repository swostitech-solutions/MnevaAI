import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { healthApi } from '../../services/api'
import toast from 'react-hot-toast'

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const FIELDS = [
  ['steps',     'Steps',      '🚶', ''],
  ['heartRate', 'Heart Rate', '❤️', 'bpm'],
  ['sleep',     'Sleep',      '😴', 'hrs'],
  ['calories',  'Calories',   '🍽️', 'kcal'],
  ['weight',    'Weight',     '⚖️', 'kg'],
  ['height',    'Height',     '📏', 'cm'],
]

function getDotColor(entry) {
  if (!entry) return null
  return entry.source === 'google_fit' ? 'var(--go)' : 'var(--pulse2)'
}

function DataRow({ label, value, unit }) {
  if (value == null || value === '') return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--rim1)', fontSize: 12 }}>
      <span style={{ color: 'var(--ink3)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--ink1)' }}>{typeof value === 'number' ? value.toLocaleString() : value}{unit ? <span style={{ color: 'var(--ink3)', fontWeight: 400 }}> {unit}</span> : null}</span>
    </div>
  )
}

export default function HealthCalendar({ log = {}, onRefresh }) {
  const today    = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const [cursor,        setCursor]        = React.useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selected,      setSelected]      = React.useState(todayStr)
  const [mode,          setMode]          = React.useState('view')
  const [form,          setForm]          = React.useState({})
  const [saving,        setSaving]        = React.useState(false)
  const [deleting,      setDeleting]      = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const { year, month } = cursor
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const selectedEntry = log[selected] || null

  const openEdit = () => {
    setForm({
      steps:     selectedEntry?.steps     != null ? String(selectedEntry.steps)     : '',
      heartRate: selectedEntry?.heartRate != null ? String(selectedEntry.heartRate) : '',
      sleep:     selectedEntry?.sleep     != null ? String(selectedEntry.sleep)     : '',
      calories:  selectedEntry?.calories  != null ? String(selectedEntry.calories)  : '',
      weight:    selectedEntry?.weight    != null ? String(selectedEntry.weight)    : '',
      height:    selectedEntry?.height    != null ? String(selectedEntry.height)    : '',
      source:    selectedEntry?.source    || 'manual',
    })
    setMode('edit')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { source: form.source }
      FIELDS.forEach(([k]) => { if (form[k] !== '') payload[k] = Number(form[k]) })
      await healthApi.updateLog(selected, payload)
      toast.success('Entry updated')
      setMode('view')
      onRefresh?.()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await healthApi.deleteLog(selected)
      toast.success('Entry deleted')
      setMode('view')
      setConfirmDelete(false)
      onRefresh?.()
    } catch { toast.error('Failed to delete') }
    setDeleting(false)
  }

  const selectDate = (dateStr) => {
    setSelected(dateStr)
    setMode('view')
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

        {/* ── Calendar grid ── */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <button onClick={() => setCursor(c => { const d = new Date(c.year, c.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })}
              style={{ background: 'none', border: '1px solid var(--rim1)', borderRadius: 7, padding: '4px 10px', color: 'var(--ink2)', cursor: 'pointer', fontSize: 13 }}>‹</button>
            <span style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{MONTHS[month]} {year}</span>
            <button onClick={() => setCursor(c => { const d = new Date(c.year, c.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })}
              style={{ background: 'none', border: '1px solid var(--rim1)', borderRadius: 7, padding: '4px 10px', color: 'var(--ink2)', cursor: 'pointer', fontSize: 13 }}>›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
            {DAYS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--ink4)', fontWeight: 600 }}>{d}</div>)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
              const entry    = log[dateStr]
              const dot      = getDotColor(entry)
              const isToday  = dateStr === todayStr
              const isSel    = dateStr === selected
              const isFuture = dateStr > todayStr
              return (
                <div key={dateStr} onClick={() => !isFuture && selectDate(dateStr)}
                  style={{
                    textAlign: 'center', padding: '8px 4px', borderRadius: 9,
                    cursor: isFuture ? 'default' : 'pointer',
                    background: isSel ? 'var(--pulse)' : isToday ? 'rgba(155,114,255,0.12)' : 'transparent',
                    border: isToday && !isSel ? '1px solid var(--pulse)' : '1px solid transparent',
                    opacity: isFuture ? 0.3 : 1, transition: 'background 0.15s',
                  }}>
                  <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isSel ? '#fff' : 'var(--ink1)' }}>{d}</span>
                  {dot
                    ? <div style={{ width: 5, height: 5, borderRadius: '50%', background: isSel ? '#fff' : dot, margin: '3px auto 0' }} />
                    : !isFuture && <div style={{ width: 5, height: 2, borderRadius: 1, background: isSel ? 'rgba(255,255,255,0.4)' : 'var(--rim1)', margin: '4px auto 0' }} />
                  }
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 14, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rim1)' }}>
            {[['var(--go)', 'Google Fit'], ['var(--pulse2)', 'Manual']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink3)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink3)' }}>
              <div style={{ width: 8, height: 2, borderRadius: 1, background: 'var(--rim1)' }} />No data
            </div>
          </div>
        </div>

        {/* ── Detail / Edit panel ── */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
            {new Date(selected + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>

          {mode === 'view' ? (
            <>
              {selectedEntry ? (
                <>
                  <div style={{ fontSize: 11, marginBottom: 10, color: selectedEntry.source === 'google_fit' ? 'var(--go)' : 'var(--pulse2)', fontWeight: 600 }}>
                    {selectedEntry.source === 'google_fit' ? '🏃 Google Fit' : '✏️ Manual entry'}
                  </div>
                  {FIELDS.map(([k, label, icon, unit]) => (
                    <DataRow key={k} label={`${icon} ${label}`} value={selectedEntry[k]} unit={unit} />
                  ))}
                  {selectedEntry.lastSynced && (
                    <div style={{ fontSize: 10, color: 'var(--ink4)', marginTop: 8 }}>
                      Synced {new Date(selectedEntry.lastSynced).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} onClick={openEdit}>✏️ Edit</button>
                    <button
                      onClick={() => setConfirmDelete(true)}
                      style={{ flex: 1, fontSize: 12, background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)', borderRadius: 8, color: '#ff5252', cursor: 'pointer', padding: '7px 0' }}>
                      🗑️ Delete
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: 'var(--ink4)', margin: '20px 0 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                    No data for this date
                  </div>
                  {selected <= todayStr && (
                    <button className="btn-primary" style={{ width: '100%', fontSize: 12 }} onClick={openEdit}>+ Add data</button>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 12, marginTop: 4 }}>
                {selectedEntry ? 'Edit entry' : 'Add entry'}
              </div>
              {FIELDS.map(([k, label, icon, unit]) => (
                <div key={k} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 3 }}>{icon} {label}{unit ? ` (${unit})` : ''}</div>
                  <input type="number" placeholder="—" value={form[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    style={{ width: '100%', background: 'var(--depth3)', border: '1px solid var(--rim1)', borderRadius: 8, padding: '6px 10px', color: 'var(--ink1)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 3 }}>📱 Source</div>
                <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  style={{ width: '100%', background: 'var(--depth3)', border: '1px solid var(--rim1)', borderRadius: 8, padding: '6px 10px', color: 'var(--ink1)', fontSize: 13 }}>
                  <option value="google_fit">Google Fit</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ flex: 1, fontSize: 12 }} onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : '💾 Save'}
                </button>
                <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} onClick={() => setMode('view')}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setConfirmDelete(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: 'spring', stiffness: 340, damping: 26 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 380, background: 'var(--depth2)', border: '1px solid rgba(255,82,82,0.25)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
            >
              <div style={{ height: 4, background: 'linear-gradient(90deg,#ff5252,#ff1744)' }} />
              <div style={{ padding: '28px 28px 24px' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 18 }}>🗑️</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--ink1)' }}>Delete health entry?</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.2)', borderRadius: 8, padding: '5px 12px', marginBottom: 14 }}>
                  <span style={{ fontSize: 13 }}>📅</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#ff5252', fontFamily: 'monospace' }}>
                    {new Date(selected + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 24 }}>
                  This will permanently remove all health data recorded for this date. This action <strong style={{ color: 'var(--ink2)' }}>cannot be undone</strong>.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: 'var(--depth3)', border: '1px solid var(--rim2)', color: 'var(--ink2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: 'linear-gradient(135deg,#ff5252,#ff1744)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1, fontFamily: '"Space Grotesk",sans-serif', boxShadow: '0 4px 16px rgba(255,82,82,0.35)' }}>
                    {deleting ? 'Deleting…' : 'Yes, Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
