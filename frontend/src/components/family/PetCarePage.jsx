import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Tabs from '../ui/Tabs'
import Modal from '../ui/Modal'
import FormField from '../ui/FormField'
import ConfirmDialog from '../ui/ConfirmDialog'
import EmptyState from '../ui/EmptyState'
import { petApi } from '../../services/api'

const SPECIES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish', 'Other']
const SPECIES_EMOJI = { Dog: '🐶', Cat: '🐱', Bird: '🐦', Rabbit: '🐰', Fish: '🐟', Other: '🐾' }
const SEX = ['Male', 'Female']
const COAT_TYPES = ['Short', 'Long', 'Curly', 'Wavy', 'Hairless']
const REMINDER_TYPES = ['Vaccination', 'Medication', 'Grooming', 'Vet Appointment', 'Feeding']

const PET_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'species', label: 'Species', type: 'select', options: SPECIES, required: true },
  { key: 'breed', label: 'Breed', type: 'text' },
  { key: 'sex', label: 'Sex', type: 'select', options: SEX },
  { key: 'dob', label: 'Date of Birth', type: 'date' },
  { key: 'microchip', label: 'Microchip / ID', type: 'text' },
  { key: 'weight', label: 'Weight', type: 'text', hint: 'e.g. 12 kg' },
  { key: 'height', label: 'Height', type: 'text', hint: 'e.g. 45 cm' },
  { key: 'coatType', label: 'Coat Type', type: 'select', options: COAT_TYPES },
  { key: 'colorMarkings', label: 'Color / Markings', type: 'text' },
]

function emptyPetForm() {
  const f = {}
  for (const field of PET_FIELDS) f[field.key] = ''
  return f
}

function ProfilesTab({ pets, isLoading }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyPetForm())
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [saving, setSaving] = useState(false)

  const openCreate = () => { setEditing(null); setForm(emptyPetForm()); setModal(true) }
  const openEdit = (p) => { setEditing(p); setForm({ ...emptyPetForm(), ...p }); setModal(true) }

  const save = async () => {
    if (!form.name || !form.species) return toast.error('Name and species are required')
    setSaving(true)
    try {
      if (editing) await petApi.update(editing.id, form)
      else await petApi.create(form)
      toast.success(editing ? 'Updated' : 'Pet added')
      setModal(false)
      qc.invalidateQueries({ queryKey: ['pets'] })
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save') }
    finally { setSaving(false) }
  }
  const doDelete = async () => {
    try { await petApi.remove(confirmDelete.id); toast.success('Removed'); setConfirmDelete(null); qc.invalidateQueries({ queryKey: ['pets'] }) }
    catch (err) { toast.error(err.response?.data?.error || 'Could not remove') }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" onClick={openCreate}>+ Add Pet</button>
      </div>
      {isLoading && <div className="skeleton" style={{ height: 100, borderRadius: 14 }} />}
      {!isLoading && !pets?.length && <EmptyState icon="🐾" title="No pets added yet" />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 12 }}>
        {pets?.map(p => (
          <div key={p.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 26 }}>{SPECIES_EMOJI[p.species] || '🐾'}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{p.breed || p.species}{p.sex ? ` · ${p.sex}` : ''}</div>
              </div>
            </div>
            {(p.weight || p.height) && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 8 }}>{p.weight}{p.weight && p.height ? ' · ' : ''}{p.height}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn-view" onClick={() => openEdit(p)}>Edit</button>
              <button className="btn-deny" onClick={() => setConfirmDelete(p)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {modal && (
        <Modal title={editing ? 'Edit Pet' : 'Add Pet'} icon="🐾" onClose={() => setModal(false)} width={460}>
          {PET_FIELDS.map(f => (
            <FormField key={f.key} type={f.type} label={f.label} required={f.required} options={f.options} hint={f.hint}
              value={form[f.key]} onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))} />
          ))}
          <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={saving} onClick={save}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add'}</button>
        </Modal>
      )}
      {confirmDelete && <ConfirmDialog title={`Remove ${confirmDelete.name}?`} body="This cannot be undone." onConfirm={doDelete} onClose={() => setConfirmDelete(null)} />}
    </div>
  )
}

function RemindersTab({ pets }) {
  const qc = useQueryClient()
  const [petId, setPetId] = useState(pets?.[0]?.id || '')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ type: '', title: '', remindAt: '', notes: '' })
  const { data: reminders, isLoading } = useQuery({ queryKey: ['petReminders', petId], queryFn: () => petApi.reminders(petId), enabled: !!petId })

  const create = async () => {
    if (!form.type || !form.title) return toast.error('Type and title are required')
    try {
      await petApi.createReminder(petId, form)
      toast.success('Reminder added')
      setModal(false)
      setForm({ type: '', title: '', remindAt: '', notes: '' })
      qc.invalidateQueries({ queryKey: ['petReminders', petId] })
    } catch (err) { toast.error(err.response?.data?.error || 'Could not add reminder') }
  }
  const toggleDone = async (r) => {
    try { await petApi.updateReminder(petId, r.id, { done: !r.done }); qc.invalidateQueries({ queryKey: ['petReminders', petId] }) }
    catch { toast.error('Could not update') }
  }
  const remove = async (id) => {
    try { await petApi.deleteReminder(petId, id); qc.invalidateQueries({ queryKey: ['petReminders', petId] }) }
    catch { toast.error('Could not delete') }
  }

  if (!pets?.length) return <EmptyState icon="🐾" title="Add a pet first" body="Reminders need a pet profile to attach to." />

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {pets.map(p => (
          <button key={p.id} onClick={() => setPetId(p.id)}
            style={{ background: petId === p.id ? 'var(--pulse)' : 'var(--depth3)', color: petId === p.id ? '#fff' : 'var(--ink2)', border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>
            {SPECIES_EMOJI[p.species] || '🐾'} {p.name}
          </button>
        ))}
        <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal(true)}>+ Add Reminder</button>
      </div>
      {isLoading && <div className="skeleton" style={{ height: 100, borderRadius: 14 }} />}
      {!isLoading && !reminders?.length && <EmptyState icon="🔔" title="No reminders for this pet" />}
      {reminders?.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rim1)' }}>
          <button onClick={() => toggleDone(r)} style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid var(--rim2)', background: r.done ? 'var(--go)' : 'transparent', cursor: 'pointer', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, textDecoration: r.done ? 'line-through' : 'none', opacity: r.done ? 0.6 : 1 }}>{r.title}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.type}{r.remindAt ? ` · ${new Date(r.remindAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</div>
          </div>
          <button className="btn-deny" onClick={() => remove(r.id)}>Delete</button>
        </div>
      ))}
      {modal && (
        <Modal title="Add Reminder" icon="🔔" onClose={() => setModal(false)}>
          <FormField type="select" label="Type" required options={REMINDER_TYPES} value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} />
          <FormField label="Title" required value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
          <FormField type="datetime" label="Remind At" value={form.remindAt} onChange={v => setForm(f => ({ ...f, remindAt: v }))} />
          <FormField type="textarea" label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />
          <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} onClick={create}>Add</button>
        </Modal>
      )}
    </div>
  )
}

const VACCINE_STATUS = ['Up to date', 'Due soon', 'Overdue']
const VACCINE_FIELDS = [
  { key: 'name', label: 'Vaccine Name', type: 'text', required: true },
  { key: 'date', label: 'Date Given', type: 'date' },
  { key: 'next', label: 'Next Due', type: 'date' },
  { key: 'status', label: 'Status', type: 'select', options: VACCINE_STATUS },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]
const MED_FIELDS = [
  { key: 'name', label: 'Medication', type: 'text', required: true },
  { key: 'dosage', label: 'Dosage', type: 'text' },
  { key: 'freq', label: 'Frequency', type: 'text' },
  { key: 'start', label: 'Start Date', type: 'date' },
  { key: 'end', label: 'End Date', type: 'date' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]
const ALLERGY_FIELDS = [
  { key: 'name', label: 'Allergy', type: 'text', required: true },
  { key: 'reaction', label: 'Reaction', type: 'text' },
]
const GROOM_FIELDS = [
  { key: 'type', label: 'Type', type: 'text', required: true, hint: 'e.g. Bath, Haircut, Nail trim' },
  { key: 'freq', label: 'Frequency', type: 'text' },
  { key: 'lastDate', label: 'Last Date', type: 'date' },
  { key: 'nextDate', label: 'Next Date', type: 'date' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]
const EXERCISE_TYPES = ['Walk', 'Exercise', 'Playtime']
const EX_FIELDS = [
  { key: 'type', label: 'Type', type: 'select', options: EXERCISE_TYPES, required: true },
  { key: 'duration', label: 'Duration', type: 'text', hint: 'e.g. 30 mins' },
  { key: 'freq', label: 'Frequency', type: 'text' },
  { key: 'time', label: 'Time', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]
const VET_FIELDS = [
  { key: 'name', label: 'Vet Name', type: 'text' },
  { key: 'clinic', label: 'Clinic', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'lastVisit', label: 'Last Visit', type: 'date' },
  { key: 'nextVisit', label: 'Next Visit', type: 'date' },
]
const FEEDING_FIELDS = [
  { key: 'foodName', label: 'Food Name', type: 'text' },
  { key: 'qty', label: 'Quantity', type: 'text' },
  { key: 'times', label: 'Times per Day', type: 'text' },
  { key: 'schedule', label: 'Schedule', type: 'text' },
  { key: 'treats', label: 'Treats', type: 'text' },
  { key: 'dietRestrictions', label: 'Diet Restrictions', type: 'textarea' },
]

// Vaccines/medications/allergies/groomings/exercises are plain JSON arrays
// living directly on the Pet row (no separate table/endpoint) — add/edit/
// delete all go through one PATCH /pet/:id replacing the whole array, same
// as mobile's PetHealthTab/PetRoutineTab do.
function PetArrayEditor({ pet, field, fields, icon, title, emptyTitle }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)
  const items = Array.isArray(pet[field]) ? pet[field] : []

  const emptyForm = () => { const f = {}; for (const fl of fields) f[fl.key] = ''; return f }
  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setModal(true) }
  const openEdit = (item) => { setEditingId(item.id); setForm({ ...emptyForm(), ...item }); setModal(true) }

  const save = async () => {
    const missing = fields.filter(f => f.required && !form[f.key])
    if (missing.length) return toast.error(`${missing[0].label} is required`)
    const next = editingId
      ? items.map(i => i.id === editingId ? { ...form, id: editingId } : i)
      : [...items, { ...form, id: Date.now().toString() }]
    try {
      await petApi.update(pet.id, { [field]: next })
      toast.success(editingId ? 'Updated' : 'Added')
      setModal(false)
      qc.invalidateQueries({ queryKey: ['pets'] })
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save') }
  }
  const doDelete = async () => {
    try {
      await petApi.update(pet.id, { [field]: items.filter(i => i.id !== confirmDelete.id) })
      setConfirmDelete(null)
      qc.invalidateQueries({ queryKey: ['pets'] })
    } catch { toast.error('Could not delete') }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn-primary" onClick={openCreate}>+ Add {title}</button>
      </div>
      {!items.length && <EmptyState icon={icon} title={emptyTitle} />}
      {items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rim1)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{item[fields[0].key]}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{fields.slice(1, 3).map(f => item[f.key]).filter(Boolean).join(' · ')}</div>
          </div>
          <button className="btn-view" onClick={() => openEdit(item)}>Edit</button>
          <button className="btn-deny" onClick={() => setConfirmDelete(item)}>Delete</button>
        </div>
      ))}
      {modal && (
        <Modal title={`${editingId ? 'Edit' : 'Add'} ${title}`} icon={icon} onClose={() => setModal(false)}>
          {fields.map(f => (
            <FormField key={f.key} type={f.type} label={f.label} required={f.required} options={f.options} hint={f.hint}
              value={form[f.key]} onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))} />
          ))}
          <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} onClick={save}>{editingId ? 'Save changes' : 'Add'}</button>
        </Modal>
      )}
      {confirmDelete && <ConfirmDialog title="Delete this?" body="This cannot be undone." onConfirm={doDelete} onClose={() => setConfirmDelete(null)} />}
    </div>
  )
}

// Vet/Feeding are single JSON objects on the Pet row (not arrays) — one
// inline form, saved straight onto the pet.
function PetObjectEditor({ pet, field, fields, icon, title }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(() => {
    const f = {}
    for (const fl of fields) f[fl.key] = pet[field]?.[fl.key] || ''
    return f
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await petApi.update(pet.id, { [field]: form })
      toast.success(`${title} saved`)
      qc.invalidateQueries({ queryKey: ['pets'] })
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save') }
    finally { setSaving(false) }
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      {fields.map(f => (
        <FormField key={f.key} type={f.type} label={f.label} options={f.options}
          value={form[f.key]} onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))} />
      ))}
      <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={saving} onClick={save}>{saving ? 'Saving…' : `Save ${title}`}</button>
    </div>
  )
}

const HEALTH_ROUTINE_SECTIONS = [
  { key: 'vaccines', icon: '💉', title: 'Vaccine', emptyTitle: 'No vaccines logged', fields: VACCINE_FIELDS, kind: 'array' },
  { key: 'medications', icon: '💊', title: 'Medication', emptyTitle: 'No medications logged', fields: MED_FIELDS, kind: 'array' },
  { key: 'allergies', icon: '⚠️', title: 'Allergy', emptyTitle: 'No allergies logged', fields: ALLERGY_FIELDS, kind: 'array' },
  { key: 'vet', icon: '🩺', title: 'Vet', fields: VET_FIELDS, kind: 'object' },
  { key: 'feeding', icon: '🍖', title: 'Feeding', fields: FEEDING_FIELDS, kind: 'object' },
  { key: 'groomings', icon: '✂️', title: 'Grooming', emptyTitle: 'No grooming logged', fields: GROOM_FIELDS, kind: 'array' },
  { key: 'exercises', icon: '🏃', title: 'Exercise', emptyTitle: 'No exercise logged', fields: EX_FIELDS, kind: 'array' },
]

function HealthRoutineTab({ pets }) {
  const [petId, setPetId] = useState(pets?.[0]?.id || '')
  const [section, setSection] = useState('vaccines')
  const pet = pets?.find(p => p.id === petId)

  if (!pets?.length) return <EmptyState icon="🐾" title="Add a pet first" />

  const current = HEALTH_ROUTINE_SECTIONS.find(s => s.key === section)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {pets.map(p => (
          <button key={p.id} onClick={() => setPetId(p.id)}
            style={{ background: petId === p.id ? 'var(--pulse)' : 'var(--depth3)', color: petId === p.id ? '#fff' : 'var(--ink2)', border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>
            {SPECIES_EMOJI[p.species] || '🐾'} {p.name}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {HEALTH_ROUTINE_SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            style={{ background: section === s.key ? 'rgba(61,139,255,0.14)' : 'transparent', border: `1px solid ${section === s.key ? 'var(--rim2)' : 'var(--rim1)'}`, color: section === s.key ? 'var(--pulse2)' : 'var(--ink3)', fontSize: 11.5, fontWeight: 600, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>
            {s.icon} {s.title}
          </button>
        ))}
      </div>
      {pet && current && (
        current.kind === 'array'
          ? <PetArrayEditor pet={pet} field={current.key} fields={current.fields} icon={current.icon} title={current.title} emptyTitle={current.emptyTitle} />
          : <PetObjectEditor pet={pet} field={current.key} fields={current.fields} icon={current.icon} title={current.title} />
      )}
    </div>
  )
}

export default function PetCarePage() {
  const [tab, setTab] = useState('profiles')
  const { data: pets, isLoading } = useQuery({ queryKey: ['pets'], queryFn: petApi.list })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link to="/family" style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>← Family</Link>
        <div style={{ fontSize: 20, fontWeight: 700 }}>🐾 Pet Care</div>
      </div>
      <Tabs tabs={[{ key: 'profiles', icon: '🐾', label: 'Profiles' }, { key: 'health', icon: '🩺', label: 'Health & Routine' }, { key: 'reminders', icon: '🔔', label: 'Reminders' }]} active={tab} onChange={setTab} />
      {tab === 'profiles' && <ProfilesTab pets={pets} isLoading={isLoading} />}
      {tab === 'health' && <HealthRoutineTab pets={pets} />}
      {tab === 'reminders' && <RemindersTab pets={pets} />}
    </div>
  )
}
