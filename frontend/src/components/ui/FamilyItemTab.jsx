import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import FormField from './FormField'
import EmptyState from './EmptyState'
import { familyItemsApi } from '../../services/api'

function emptyForm(fields) {
  const f = {}
  for (const field of fields) f[field.key] = field.default ?? ''
  return f
}

// One (domain, type) pair's list + add/edit modal — backs every FamilyItem
// screen (Children & Activities, Home Maintenance, Celebrations & Gifting,
// Family Calendar), since they all share the same generic
// /api/family-items/:domain CRUD with a freeform `data` JSON blob that only
// differs in which fields each (domain,type) actually uses.
export default function FamilyItemTab({ domain, type, icon, fields, renderCard, emptyTitle, emptyBody }) {
  const qc = useQueryClient()
  const queryKey = ['familyItems', domain]
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm(fields))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const { data, isLoading } = useQuery({ queryKey, queryFn: () => familyItemsApi.list(domain) })
  const items = (data || []).filter(i => i.type === type)

  const openCreate = () => { setEditing(null); setForm(emptyForm(fields)); setModalOpen(true) }
  const openEdit = (item) => { setEditing(item); setForm({ ...emptyForm(fields), ...item.data }); setModalOpen(true) }

  const save = async () => {
    const missing = fields.filter(f => f.required && (form[f.key] === '' || form[f.key] == null))
    if (missing.length) return toast.error(`${missing[0].label} is required`)
    setSaving(true)
    try {
      if (editing) await familyItemsApi.update(domain, editing.id, { data: form })
      else await familyItemsApi.create(domain, { type, data: form })
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
      await familyItemsApi.remove(domain, confirmDelete.id)
      toast.success('Deleted')
      setConfirmDelete(null)
      qc.invalidateQueries({ queryKey })
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Could not delete')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" onClick={openCreate}>+ Add</button>
      </div>

      {isLoading && <div className="skeleton" style={{ height: 100, borderRadius: 14 }} />}
      {!isLoading && items.length === 0 && <EmptyState icon={icon} title={emptyTitle} body={emptyBody} />}

      {!isLoading && items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {items.map(item => (
            <div key={item.id} className="card" style={{ padding: 16 }}>
              {renderCard(item.data, item)}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn-view" onClick={() => openEdit(item)}>Edit</button>
                <button className="btn-deny" onClick={() => setConfirmDelete(item)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? 'Edit' : 'Add'} icon={icon} onClose={() => setModalOpen(false)} width={460}>
          {fields.map(f => (
            <FormField
              key={f.key} type={f.type} label={f.label} required={f.required}
              value={form[f.key]} onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))}
              options={f.options} hint={f.hint}
            />
          ))}
          <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={saving} onClick={save}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add'}
          </button>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog title="Delete this?" body="This cannot be undone." onConfirm={doDelete} onClose={() => setConfirmDelete(null)} />
      )}
    </div>
  )
}
