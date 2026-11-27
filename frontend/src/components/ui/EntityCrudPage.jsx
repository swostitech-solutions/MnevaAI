import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import FormField from './FormField'
import EmptyState from './EmptyState'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }

function emptyForm(fields) {
  const f = {}
  for (const field of fields) f[field.key] = field.default ?? (field.type === 'toggle' ? false : '')
  return f
}

// One config-driven CRUD page — list + add/edit modal + delete confirm —
// reused for every Finance sub-entity (Loans, EMIs, FDs, Expenses,
// Subscriptions, Portfolio Holdings) and later Family Items/Pet Care,
// instead of 6+ near-identical hand-written pages.
export default function EntityCrudPage({
  title, icon, backTo = '/finance', backLabel = '← Finance',
  queryKey, listFn, createFn, updateFn, removeFn,
  fields,
  renderCard,
  emptyIcon = '📭', emptyTitle = 'Nothing here yet', emptyBody,
}) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm(fields))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const { data, isLoading } = useQuery({ queryKey, queryFn: listFn })
  const items = Array.isArray(data) ? data : (data?.items ?? Object.values(data ?? {}).find(Array.isArray) ?? [])

  const openCreate = () => { setEditing(null); setForm(emptyForm(fields)); setModalOpen(true) }
  const openEdit = (item) => { setEditing(item); setForm({ ...emptyForm(fields), ...item }); setModalOpen(true) }

  const save = async () => {
    const missing = fields.filter(f => f.required && (form[f.key] === '' || form[f.key] == null))
    if (missing.length) return toast.error(`${missing[0].label} is required`)
    setSaving(true)
    try {
      if (editing) await updateFn(editing.id, form)
      else await createFn(form)
      toast.success(editing ? 'Updated' : 'Added')
      setModalOpen(false)
      qc.invalidateQueries({ queryKey })
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    try {
      await removeFn(confirmDelete.id)
      toast.success('Deleted')
      setConfirmDelete(null)
      qc.invalidateQueries({ queryKey })
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Could not delete')
    }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <Link to={backTo} style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>{backLabel}</Link>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>{icon} {title}</div>
        <button className="btn-primary" onClick={openCreate}>+ Add</button>
      </motion.div>

      {isLoading && <div className="skeleton" style={{ height: 120, borderRadius: 14 }} />}

      {!isLoading && items.length === 0 && (
        <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody} />
      )}

      {!isLoading && items.length > 0 && (
        <motion.div variants={up} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {items.map(item => (
            <div key={item.id} className="card" style={{ padding: 16 }}>
              {renderCard(item)}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn-view" onClick={() => openEdit(item)}>Edit</button>
                <button className="btn-deny" onClick={() => setConfirmDelete(item)}>Delete</button>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {modalOpen && (
        <Modal title={editing ? `Edit ${title}` : `Add ${title}`} icon={icon} onClose={() => setModalOpen(false)} width={480}>
          {fields.map(f => (
            <FormField
              key={f.key}
              type={f.type}
              label={f.label}
              required={f.required}
              value={form[f.key]}
              onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))}
              options={f.options}
              hint={f.hint}
              min={f.min}
              step={f.step}
            />
          ))}
          <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={saving} onClick={save}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add'}
          </button>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete this ${title.toLowerCase()}?`}
          body="This cannot be undone."
          onConfirm={doDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </motion.div>
  )
}
