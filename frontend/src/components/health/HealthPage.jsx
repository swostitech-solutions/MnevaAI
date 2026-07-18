import React from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts'
import { healthApi, googleFitApi } from '../../services/api'
import HealthCalendar from './HealthCalendar'
import toast from 'react-hot-toast'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.28 } } }

const SOURCE_LABEL = {
  google_fit:    { icon: '🏃', label: 'Google Fit',    color: 'var(--go)' },
  apple_health:  { icon: '🍎', label: 'Apple Health',  color: '#ff6b6b' },
  google_health: { icon: '❤️', label: 'Google Health', color: '#EF4444' },
  manual:        { icon: '✏️', label: 'Manual entry',  color: 'var(--ink3)' },
}

export default function HealthPage() {
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const [showSync, setShowSync] = React.useState(false)
  const [form, setForm] = React.useState({ steps: '', heartRate: '', sleep: '', calories: '', weight: '', height: '', source: 'google_fit' })

  const openSync = () => {
    if (metrics?.source === 'google_fit') {
      setForm({
        steps:     metrics.steps?.value     ? String(metrics.steps.value)              : '',
        heartRate: metrics.heartRate?.value ? String(metrics.heartRate.value)          : '',
        sleep:     metrics.sleep?.value     ? String(metrics.sleep.value)              : '',
        calories:  metrics.calories?.consumed ? String(metrics.calories.consumed)      : '',
        weight:    metrics.weight?.value    ? String(metrics.weight.value)             : '',
        height:    metrics.height?.value    ? String(metrics.height.value)             : '',
        source: 'google_fit',
      })
    }
    setShowSync(s => !s)
  }

  const { data: fitStatus, refetch: refetchFitStatus } = useQuery({ queryKey: ['fitStatus'], queryFn: googleFitApi.status, staleTime: 30000 })
  const fitConnected = fitStatus?.connected || false

  React.useEffect(() => {
    const result = searchParams.get('fit')
    const msg = searchParams.get('msg')
    if (result === 'connected') {
      toast.success('Google Fit connected!')
      refetchFitStatus()
      window.history.replaceState({}, '', '/health')
    } else if (result === 'error') {
      toast.error(msg ? decodeURIComponent(msg) : 'Google Fit connection failed')
      window.history.replaceState({}, '', '/health')
    }
  }, [searchParams, refetchFitStatus])

  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['health-metrics', fitConnected],
    queryFn: () => fitConnected ? googleFitApi.data() : healthApi.metrics('today'),
    staleTime: 0,
    enabled: fitStatus !== undefined,
    refetchInterval: fitConnected ? 5 * 60000 : false,
  })
  const { data: apptData } = useQuery({ queryKey: ['appointments'], queryFn: healthApi.appts, staleTime: 5 * 60000 })
  const { data: medsData }  = useQuery({ queryKey: ['medications'],  queryFn: healthApi.meds,  staleTime: 5 * 60000 })
  const { data: logData, refetch: refetchLog } = useQuery({ queryKey: ['health-log'], queryFn: healthApi.log, staleTime: 0 })

  const handleConnect = async () => {
    try {
      const { url } = await googleFitApi.connect()
      window.location.href = url
    } catch (err) { toast.error(err.message || 'Could not connect Google Fit') }
  }

  const handleSync = async () => {
    const payload = {}
    if (form.steps)     payload.steps     = Number(form.steps)
    if (form.heartRate) payload.heartRate = Number(form.heartRate)
    if (form.sleep)     payload.sleep     = Number(form.sleep)
    if (form.calories)  payload.calories  = Number(form.calories)
    if (form.weight)    payload.weight    = Number(form.weight)
    if (form.height)    payload.height    = Number(form.height)
    if (!Object.keys(payload).length) return toast.error('Enter at least one value')
    payload.source = form.source
    try {
      await googleFitApi.sync(payload)
      toast.success('Health data synced!')
      setShowSync(false)
      qc.invalidateQueries({ queryKey: ['health-metrics'] })
      refetchMetrics()
      refetchLog()
    } catch (err) { toast.error(err.message || 'Sync failed') }
  }

  const src = metrics?.source ? (SOURCE_LABEL[metrics.source] || { icon: '📊', label: metrics.source, color: 'var(--ink3)' }) : null

  const VITALS = metrics ? [
    { icon: '❤️', label: 'Heart Rate', value: metrics.heartRate?.value,                              unit: 'bpm',  color: '#EF4444',       status: metrics.heartRate?.status || '—',    ok: metrics.heartRate?.status === 'Normal' },
    { icon: '🚶', label: 'Steps',      value: metrics.steps?.value?.toLocaleString('en-IN'),          unit: `/ ${(metrics.steps?.goal||10000).toLocaleString()}`, color: 'var(--go)',     status: `${metrics.steps?.pct ?? 0}% of goal`, ok: (metrics.steps?.pct||0) >= 50 },
    { icon: '😴', label: 'Sleep',      value: metrics.sleep?.value,                                   unit: 'hrs',  color: 'var(--violet)', status: metrics.sleep?.quality || '—',       ok: metrics.sleep?.quality === 'Good' },
    { icon: '🍽️', label: 'Calories',   value: metrics.calories?.consumed?.toLocaleString(),           unit: `/ ${metrics.calories?.goal ?? 2000} kcal`, color: 'var(--warn)', status: 'Active', ok: true },
    { icon: '⚖️', label: 'Weight',     value: metrics.weight?.value,                                  unit: metrics.weight?.unit || 'kg', color: 'var(--pulse2)', status: metrics.weight?.value ? 'Tracked' : '—', ok: !!metrics.weight?.value },
    { icon: '📏', label: 'Height',     value: metrics.height?.value,                                  unit: metrics.height?.unit || 'cm', color: 'var(--pulse)',  status: metrics.height?.value ? 'Tracked' : '—', ok: !!metrics.height?.value },
  ] : []

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">

      {/* Connect banner — only if no data at all */}
      {!fitConnected && !metrics?.source && (
        <motion.div variants={up} style={{ background: 'linear-gradient(135deg,rgba(239,68,68,0.08),rgba(155,114,255,0.06))', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: '16px 20px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 28 }}>❤️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>Connect a health source</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Use Google Fit (Android) or sync manually from Apple Health / Google Health</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={openSync}>📲 Sync manually</button>
            <button className="btn-primary"   style={{ fontSize: 12, padding: '8px 14px' }} onClick={handleConnect}>Connect Google Fit</button>
          </div>
        </motion.div>
      )}

      {/* Source + status bar */}
      {(fitConnected || metrics?.source) && (
        <motion.div variants={up} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {fitConnected && <div className="anim-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--go)', flexShrink: 0 }} />}
          {src && <span style={{ fontSize: 12, color: src.color, fontWeight: 600 }}>{src.icon} {src.label} · {fitConnected ? 'Live data' : `Last synced ${metrics?.lastUpdated ? new Date(metrics.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}`}</span>}
          {<button style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink3)', background: 'none', border: '1px solid var(--rim1)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }} onClick={openSync}>📲 Sync data</button>}
        </motion.div>
      )}

      {/* Manual sync panel — only relevant when Google Fit is NOT connected */}
      {showSync && (
        <motion.div variants={up} className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📲 Sync Health Data</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
            {[['steps','Steps','👟'],['heartRate','Heart Rate (bpm)','❤️'],['sleep','Sleep (hrs)','😴'],['calories','Calories','🍽️'],['weight','Weight (kg)','⚖️'],['height','Height (cm)','📏']].map(([k, label, icon]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 4 }}>{icon} {label}</div>
                <input type="number" placeholder="—" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={{ width: '100%', background: 'var(--depth3)', border: '1px solid var(--rim1)', borderRadius: 8, padding: '7px 10px', color: 'var(--ink1)', fontSize: 13 }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 4 }}>📱 Source</div>
              <select value={form.source} onChange={e => {
                    const s = e.target.value
                    if (s === 'google_fit' && metrics) {
                      setForm(f => ({ ...f, source: s,
                        steps:     metrics.steps?.value       ? String(metrics.steps.value)        : '',
                        heartRate: metrics.heartRate?.value   ? String(metrics.heartRate.value)    : '',
                        sleep:     metrics.sleep?.value       ? String(metrics.sleep.value)        : '',
                        calories:  metrics.calories?.consumed ? String(metrics.calories.consumed)  : '',
                        weight:    metrics.weight?.value      ? String(metrics.weight.value)       : '',
                        height:    metrics.height?.value      ? String(metrics.height.value)       : '',
                      }))
                    } else {
                      setForm({ steps: '', heartRate: '', sleep: '', calories: '', weight: '', height: '', source: s })
                    }
                  }} style={{ width: '100%', background: 'var(--depth3)', border: '1px solid var(--rim1)', borderRadius: 8, padding: '7px 10px', color: 'var(--ink1)', fontSize: 13 }}>
                <option value="google_fit">Google Fit</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleSync}>Save</button>
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setShowSync(false)}>Cancel</button>
          </div>
        </motion.div>
      )}

      {/* Vitals */}
      <motion.div variants={up} style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 18 }}>
        {VITALS.map(v => (
          <div key={v.label} className="card" style={{ padding: 18, textAlign: 'center', transition: 'all 0.2s' }}>
            <div style={{ fontSize: 30, marginBottom: 9 }}>{v.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: v.color }}>{v.value ?? '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>{v.label} · {v.unit}</div>
            <div style={{ marginTop: 9 }}><span className={v.ok ? 'badge badge-go' : 'badge badge-warn'}>{v.status}</span></div>
          </div>
        ))}
        {VITALS.length === 0 && [1,2,3,4,5,6].map(i => (
          <div key={i} className="card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 9 }}>—</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink4)' }}>—</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>Connect Fit to see data</div>
          </div>
        ))}
      </motion.div>

      {/* Weekly steps chart */}
      {metrics?.weeklySteps?.length > 0 && (
        <motion.div variants={up} className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>📊 Weekly Steps — 7-day view</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={metrics.weeklySteps} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: 'var(--ink3)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--ink3)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `${(v/1000).toFixed(0)}k` : ''} />
              <Bar dataKey="steps" radius={[4,4,0,0]}>
                {metrics.weeklySteps.map((entry, i) => (
                  <Cell key={i} fill={entry.steps >= 8000 ? 'var(--go)' : entry.steps >= 5000 ? 'var(--pulse)' : entry.steps > 0 ? 'var(--ink4)' : 'var(--depth4)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Health Calendar */}
      <motion.div variants={up} style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📅 Health & Wellness Calendar</div>
        <HealthCalendar log={logData?.log || {}} onRefresh={refetchLog} />
      </motion.div>

      <motion.div variants={up} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Appointments */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>📅 Upcoming Appointments</span>
            <button className="btn-view" style={{ fontSize: 11 }} onClick={() => toast('Book via ABDM Health ID — coming soon')}>+ Book →</button>
          </div>
          {apptData?.appointments?.length > 0 ? apptData.appointments.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--depth3)', borderRadius: 11, padding: '13px 14px', marginBottom: 9, border: '1px solid var(--rim1)' }}>
              <div style={{ background: 'var(--depth4)', borderRadius: 9, padding: '7px 10px', textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--pulse2)', lineHeight: 1 }}>{new Date(a.date).getDate()}</div>
                <div style={{ fontSize: 9.5, color: 'var(--ink3)', textTransform: 'uppercase' }}>{new Date(a.date).toLocaleDateString('en-IN', { month: 'short' })}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{a.doctor}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>{a.hospital} · {a.location}</div>
                {a.prep && <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 3 }}>Prep: {a.prep}</div>}
              </div>
              <span className="badge badge-pulse" style={{ flexShrink: 0 }}>{a.time}</span>
            </div>
          )) : (
            <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '20px 0', textAlign: 'center' }}>No upcoming appointments</div>
          )}
        </div>

        {/* Medications */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>💊 Medication Tracker</div>
          {medsData?.medications?.length > 0 ? medsData.medications.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rim1)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: m.status === 'refill_needed' ? 'rgba(255,82,82,0.12)' : m.takenToday ? 'rgba(0,227,150,0.12)' : 'rgba(255,176,32,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>💊</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{m.freq?.replace('_', ' ')} · {m.stockDays} days left</div>
              </div>
              <span className={`badge ${m.status === 'refill_needed' ? 'badge-danger' : m.takenToday ? 'badge-go' : 'badge-warn'}`}>
                {m.status === 'refill_needed' ? 'Refill needed' : m.takenToday ? `✓ ${m.takenTime}` : `Due ${m.scheduledTime}`}
              </span>
            </div>
          )) : (
            <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '20px 0', textAlign: 'center' }}>No medications tracked</div>
          )}
          {medsData?.medications?.some(m => m.status === 'refill_needed') && (
            <button className="btn-primary" style={{ width: '100%', marginTop: 14, fontSize: 13 }} onClick={() => toast.success('PharmEasy refill link sent to your phone!')}>
              📱 Order Refill via PharmEasy
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
