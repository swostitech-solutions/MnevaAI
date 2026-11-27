import React from 'react'

// Generic labeled field wrapper, mirrors mobile AIProfile.js's field config
// pattern: { type: 'text'|'textarea'|'number'|'select'|'chips'|'toggle'|'date' }
export function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--danger)' }}> *</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export default function FormField({ type = 'text', label, required, value, onChange, options = [], placeholder, hint, min, step }) {
  const common = { className: 'input', value: value ?? '', placeholder }

  let control
  if (type === 'textarea') {
    control = <textarea {...common} rows={3} style={{ resize: 'vertical' }} onChange={e => onChange(e.target.value)} />
  } else if (type === 'select') {
    control = (
      <select {...common} onChange={e => onChange(e.target.value)}>
        <option value="" disabled>Select…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  } else if (type === 'toggle') {
    const on = !!value
    control = (
      <button type="button" className={`toggle ${on ? 'on' : 'off'}`} onClick={() => onChange(!on)}>
        <span className="toggle-knob" />
      </button>
    )
  } else if (type === 'number') {
    control = <input {...common} type="number" min={min} step={step ?? 'any'} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
  } else if (type === 'date') {
    control = <input {...common} type="date" onChange={e => onChange(e.target.value)} />
  } else if (type === 'datetime') {
    control = <input {...common} type="datetime-local" onChange={e => onChange(e.target.value)} />
  } else {
    control = <input {...common} type="text" onChange={e => onChange(e.target.value)} />
  }

  return <Field label={label} required={required} hint={hint}>{control}</Field>
}
