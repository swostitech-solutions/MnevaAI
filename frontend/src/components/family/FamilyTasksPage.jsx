import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Tabs from '../ui/Tabs'
import Modal from '../ui/Modal'
import FormField from '../ui/FormField'
import EmptyState from '../ui/EmptyState'
import { familyApi } from '../../services/api'
import { useAuth } from '../../store'

const RELATIONSHIPS = ['Father', 'Mother', 'Brother', 'Sister', 'Spouse', 'Son', 'Daughter', 'Grandparent', 'Grandchild', 'Partner', 'Relative', 'Caregiver', 'Other']
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
const CATEGORIES = ['Household', 'Health', 'Finance', 'Shopping', 'School', 'Errands', 'Other']
const RECURRENCES = ['None', 'Daily', 'Weekly', 'Monthly']
const STATUS_BADGE = {
  PENDING_ACCEPTANCE: 'badge-warn', ACCEPTED: 'badge-pulse', REJECTED: 'badge-danger',
  IN_PROGRESS: 'badge-violet', COMPLETED: 'badge-go', CANCELLED: 'badge-danger',
}

function ConnectionsTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ receiverEmail: '', relationship: '' })
  const { data: connections, isLoading } = useQuery({ queryKey: ['familyConnections'], queryFn: familyApi.connections })

  const connect = async () => {
    if (!form.receiverEmail || !form.relationship) return toast.error('Email and relationship are required')
    try {
      await familyApi.createConnection(form)
      toast.success('Request sent')
      setModal(false)
      setForm({ receiverEmail: '', relationship: '' })
      qc.invalidateQueries({ queryKey: ['familyConnections'] })
    } catch (err) { toast.error(err.response?.data?.error || 'Could not send request') }
  }
  const respond = async (id, status) => {
    try { await familyApi.respondConnection(id, status); qc.invalidateQueries({ queryKey: ['familyConnections'] }) }
    catch (err) { toast.error(err.response?.data?.error || 'Could not update') }
  }
  const remove = async (id) => {
    try { await familyApi.deleteConnection(id); qc.invalidateQueries({ queryKey: ['familyConnections'] }) }
    catch (err) { toast.error(err.response?.data?.error || 'Could not remove') }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" onClick={() => setModal(true)}>+ Connect family member</button>
      </div>
      {isLoading && <div className="skeleton" style={{ height: 100, borderRadius: 14 }} />}
      {!isLoading && !connections?.length && <EmptyState icon="👥" title="No family connections yet" body="Connect by email to share tasks and more." />}
      {connections?.map(c => (
        <div key={c.id} className="card" style={{ padding: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#3D8BFF,#9B72FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.name?.[0] || '?'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{c.relationship} · {c.email}</div>
          </div>
          {c.status === 'PENDING' && c.direction === 'RECEIVED' ? (
            <>
              <button className="btn-approve" onClick={() => respond(c.id, 'ACCEPTED')}>Accept</button>
              <button className="btn-deny" onClick={() => respond(c.id, 'REJECTED')}>Reject</button>
            </>
          ) : (
            <>
              <span className={`badge ${c.status === 'ACCEPTED' ? 'badge-go' : c.status === 'PENDING' ? 'badge-warn' : 'badge-danger'}`}>{c.status}</span>
              <button className="btn-deny" onClick={() => remove(c.id)}>Remove</button>
            </>
          )}
        </div>
      ))}
      {modal && (
        <Modal title="Connect Family Member" icon="👥" onClose={() => setModal(false)}>
          <FormField label="Their Email" required value={form.receiverEmail} onChange={v => setForm(f => ({ ...f, receiverEmail: v }))} placeholder="family@example.com" />
          <FormField label="Relationship" type="select" required options={RELATIONSHIPS} value={form.relationship} onChange={v => setForm(f => ({ ...f, relationship: v }))} />
          <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} onClick={connect}>Send Request</button>
        </Modal>
      )}
    </div>
  )
}

function emptyTaskForm() {
  return { connectionId: '', assigneeId: '', title: '', description: '', priority: 'Medium', category: '', dueDate: '', recurrence: 'None' }
}

function TasksTab() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(emptyTaskForm())
  const { data: connections } = useQuery({ queryKey: ['familyConnections'], queryFn: familyApi.connections })
  const { data: tasks, isLoading } = useQuery({ queryKey: ['familyTasks'], queryFn: familyApi.tasks })
  const accepted = (connections || []).filter(c => c.status === 'ACCEPTED')

  const create = async () => {
    if (!form.connectionId || !form.assigneeId || !form.title) return toast.error('Connection, assignee and title are required')
    try {
      await familyApi.createTask(form)
      toast.success('Task created')
      setModal(false)
      setForm(emptyTaskForm())
      qc.invalidateQueries({ queryKey: ['familyTasks'] })
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create task') }
  }
  const setStatus = async (id, status) => {
    try { await familyApi.updateTaskStatus(id, status); qc.invalidateQueries({ queryKey: ['familyTasks'] }) }
    catch (err) { toast.error(err.response?.data?.error || 'Could not update task') }
  }
  const remove = async (id) => {
    try { await familyApi.deleteTask(id); qc.invalidateQueries({ queryKey: ['familyTasks'] }) }
    catch (err) { toast.error(err.response?.data?.error || 'Could not delete task') }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" disabled={!accepted.length} onClick={() => setModal(true)}>+ Add Task</button>
      </div>
      {!accepted.length && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 12 }}>Accept a family connection first to assign tasks.</div>}
      {isLoading && <div className="skeleton" style={{ height: 100, borderRadius: 14 }} />}
      {!isLoading && !tasks?.length && <EmptyState icon="✅" title="No family tasks yet" />}
      {tasks?.map(t => {
        const isAssignee = t.assignedTo.id === user?.id
        const isCreator = t.createdBy.id === user?.id
        return (
          <div key={t.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
              <span className={`badge ${STATUS_BADGE[t.status] || 'badge-pulse'}`}>{t.status.replace(/_/g, ' ')}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
              {t.createdBy.name} → {t.assignedTo.name} · {t.priority}{t.category ? ` · ${t.category}` : ''}{t.dueDate ? ` · Due ${t.dueDate}` : ''}
            </div>
            {t.description && <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 6 }}>{t.description}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {isAssignee && t.status === 'PENDING_ACCEPTANCE' && (
                <>
                  <button className="btn-approve" onClick={() => setStatus(t.id, 'ACCEPTED')}>Accept</button>
                  <button className="btn-deny" onClick={() => setStatus(t.id, 'REJECTED')}>Reject</button>
                </>
              )}
              {isAssignee && t.status === 'ACCEPTED' && <button className="btn-view" onClick={() => setStatus(t.id, 'IN_PROGRESS')}>Start</button>}
              {isAssignee && t.status === 'IN_PROGRESS' && <button className="btn-approve" onClick={() => setStatus(t.id, 'COMPLETED')}>Complete</button>}
              {isCreator && !['COMPLETED', 'CANCELLED'].includes(t.status) && <button className="btn-deny" onClick={() => setStatus(t.id, 'CANCELLED')}>Cancel</button>}
              {isCreator && <button className="btn-deny" onClick={() => remove(t.id)}>Delete</button>}
            </div>
          </div>
        )
      })}
      {modal && (
        <Modal title="Add Family Task" icon="✅" onClose={() => setModal(false)} width={480}>
          <FormField label="Family Member" type="select" required
            options={accepted.map(c => c.name)}
            value={accepted.find(c => c.otherId === form.assigneeId)?.name || ''}
            onChange={name => {
              const conn = accepted.find(c => c.name === name)
              setForm(f => ({ ...f, connectionId: conn?.id || '', assigneeId: conn?.otherId || '' }))
            }}
          />
          <FormField label="Title" required value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
          <FormField type="textarea" label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} />
          <FormField type="select" label="Priority" options={PRIORITIES} value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v }))} />
          <FormField type="select" label="Category" options={CATEGORIES} value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} />
          <FormField type="date" label="Due Date" value={form.dueDate} onChange={v => setForm(f => ({ ...f, dueDate: v }))} />
          <FormField type="select" label="Recurrence" options={RECURRENCES} value={form.recurrence} onChange={v => setForm(f => ({ ...f, recurrence: v }))} />
          <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} onClick={create}>Create Task</button>
        </Modal>
      )}
    </div>
  )
}

export default function FamilyTasksPage() {
  const [tab, setTab] = useState('connections')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link to="/family" style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>← Family</Link>
        <div style={{ fontSize: 20, fontWeight: 700 }}>✅ Family Tasks</div>
      </div>
      <Tabs tabs={[{ key: 'connections', icon: '👥', label: 'Connections' }, { key: 'tasks', icon: '✅', label: 'Tasks' }]} active={tab} onChange={setTab} />
      {tab === 'connections' ? <ConnectionsTab /> : <TasksTab />}
    </div>
  )
}
