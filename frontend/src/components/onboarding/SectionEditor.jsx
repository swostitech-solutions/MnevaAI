import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { onboardingApi } from '../../services/api'
import { SECTIONS } from './OnboardingWizard'
import toast from 'react-hot-toast'

const inputStyle = {
  width: '100%', background: 'var(--depth3)', border: '1px solid var(--rim2)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--ink1)', outline: 'none', boxSizing: 'border-box'
}
const labelStyle = { fontSize: 12, color: 'var(--ink2)', display: 'block', marginBottom: 6, fontWeight: 700 }
const fieldStyle = { marginBottom: 12 }

function parseList(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  return String(value).split(',').map((i) => i.trim()).filter(Boolean)
}

function normalizeSectionPayload(section, formData) {
  const payload = {}
  section.fields.forEach((field) => {
    const value = formData[field.name]
    if (field.type === 'toggle') payload[field.name] = Boolean(value)
    else if (field.type === 'chips' && field.single) payload[field.name] = value ?? ''
    else if (field.type === 'chips') payload[field.name] = Array.isArray(value) ? value : parseList(value)
    else if (field.type === 'textarea') payload[field.name] = typeof value === 'string' ? value : (Array.isArray(value) ? value.join(', ') : '')
    else payload[field.name] = value ?? ''
  })
  return payload
}

export default function SectionEditor({ sectionKey, onClose = null, onSaved = null }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({})
  const section = SECTIONS.find(s => s.key === sectionKey)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await onboardingApi.profile()
        const profile = res?.profile || {}
        const initial = {}
        section.fields.forEach((field) => {
          const value = profile[field.name]
          if (field.type === 'toggle') initial[field.name] = value ?? true
          else if (field.type === 'chips') initial[field.name] = Array.isArray(value) ? value : parseList(value)
          else if (field.type === 'textarea') initial[field.name] = Array.isArray(value) ? value.join(', ') : (value || '')
          else initial[field.name] = value ?? ''
        })
        if (!cancelled) setFormData(initial)
      } catch (err) {
        toast.error('Could not load section data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sectionKey])

  const updateField = (name, value) => setFormData(prev => ({ ...prev, [name]: value }))

  const persist = async () => {
    setSaving(true)
    try {
      const payload = normalizeSectionPayload(section, formData)
      const res = await onboardingApi.section(section.key, payload)
      toast.success('Saved')
      onSaved?.(res)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (!section) return null

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ background: 'var(--depth2)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{section.title}</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{section.subtitle}</div>
        </div>
        <div>
          <button className="btn-ghost" onClick={() => onClose?.()} style={{ fontSize: 12 }}>Close</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 20, color: 'var(--ink3)' }}>Loading…</div>
      ) : (
        <div>
          {section.fields.map((field) => {
            if (field.type === 'toggle') return (
              <div key={field.name} style={{ ...fieldStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{field.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Optional</div>
                </div>
                <button type="button" onClick={() => updateField(field.name, !Boolean(formData[field.name]))} style={{ width: 44, height: 28, borderRadius: 999, background: Boolean(formData[field.name]) ? 'linear-gradient(135deg,#3D8BFF,#9B72FF)' : 'var(--depth4)', border: 'none', cursor: 'pointer', position: 'relative' }}>
                  <motion.div animate={{ x: Boolean(formData[field.name]) ? 16 : 0 }} style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 5, left: 5 }} />
                </button>
              </div>
            )

            if (field.type === 'chips') {
              const isSingle = field.single
              return (
                <div key={field.name} style={fieldStyle}>
                  <label style={labelStyle}>{field.label}</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {field.options.map((option) => {
                      const active = isSingle ? formData[field.name] === option : (formData[field.name] || []).includes(option)
                      return (
                        <button key={option} type="button" onClick={() => {
                          if (isSingle) updateField(field.name, option)
                          else {
                            const arr = Array.isArray(formData[field.name]) ? formData[field.name] : []
                            updateField(field.name, active ? arr.filter(i => i !== option) : [...arr, option])
                          }
                        }} style={{ borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: active ? '1px solid rgba(61,139,255,0.35)' : '1px solid var(--rim2)', background: active ? 'rgba(61,139,255,0.12)' : 'var(--depth3)', color: active ? 'var(--pulse2)' : 'var(--ink2)' }}>{option}</button>
                      )
                    })}
                  </div>
                </div>
              )
            }

            if (field.type === 'textarea') {
              return (
                <div key={field.name} style={fieldStyle}>
                  <label style={labelStyle}>{field.label}</label>
                  <textarea value={formData[field.name] ?? ''} onChange={(e) => updateField(field.name, e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} />
                </div>
              )
            }

            return (
              <div key={field.name} style={fieldStyle}>
                <label style={labelStyle}>{field.label}</label>
                {field.type === 'time' ? (
                  <input type="time" value={formData[field.name] ?? ''} onChange={(e) => updateField(field.name, e.target.value)} style={inputStyle} />
                ) : (
                  <input value={formData[field.name] ?? ''} onChange={(e) => updateField(field.name, e.target.value)} placeholder={field.placeholder} style={inputStyle} />
                )}
              </div>
            )
          })}

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn-ghost" onClick={() => onClose?.()} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={persist} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
