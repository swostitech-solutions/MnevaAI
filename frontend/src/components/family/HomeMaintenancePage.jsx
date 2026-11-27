import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import Tabs from '../ui/Tabs'
import FamilyItemTab from '../ui/FamilyItemTab'

const TASK_TYPES = ['Plumbing', 'Electrical', 'Cleaning', 'Painting', 'Carpentry', 'AC Service', 'Pest Control', 'Other']
const PRIORITY = ['High', 'Medium', 'Low']

const TASK_FIELDS = [
  { key: 'title', label: 'Task', type: 'text', required: true },
  { key: 'type', label: 'Type', type: 'select', options: TASK_TYPES },
  { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY },
  { key: 'dueDate', label: 'Due Date', type: 'date' },
  { key: 'time', label: 'Time', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]
const CONTACT_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'role', label: 'Role', type: 'text', hint: 'e.g. Plumber, Electrician' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]
const WARRANTY_FIELDS = [
  { key: 'item', label: 'Item', type: 'text', required: true },
  { key: 'brand', label: 'Brand', type: 'text' },
  { key: 'purchaseDate', label: 'Purchase Date', type: 'date' },
  { key: 'expiryDate', label: 'Warranty Expiry', type: 'date' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

const PRIORITY_COLOR = { High: 'badge-danger', Medium: 'badge-warn', Low: 'badge-pulse' }

export default function HomeMaintenancePage() {
  const [tab, setTab] = useState('task')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link to="/family" style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>← Family</Link>
        <div style={{ fontSize: 20, fontWeight: 700 }}>🏠 Home Maintenance</div>
      </div>
      <Tabs
        tabs={[{ key: 'task', icon: '🔧', label: 'Tasks' }, { key: 'contact', icon: '📇', label: 'Contacts' }, { key: 'warranty', icon: '🧾', label: 'Warranties' }]}
        active={tab} onChange={setTab}
      />
      {tab === 'task' && (
        <FamilyItemTab domain="home" type="task" icon="🔧" fields={TASK_FIELDS}
          emptyTitle="No maintenance tasks" emptyBody="Plumbing, electrical, cleaning and more."
          renderCard={(d) => (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{d.title}</div>
                {d.priority && <span className={`badge ${PRIORITY_COLOR[d.priority] || 'badge-pulse'}`}>{d.priority}</span>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{d.type}{d.dueDate ? ` · Due ${d.dueDate}` : ''} {d.time}</div>
            </>
          )}
        />
      )}
      {tab === 'contact' && (
        <FamilyItemTab domain="home" type="contact" icon="📇" fields={CONTACT_FIELDS}
          emptyTitle="No contacts saved" emptyBody="Plumber, electrician, handyman — save them here."
          renderCard={(d) => (
            <>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{d.role}{d.phone ? ` · ${d.phone}` : ''}</div>
            </>
          )}
        />
      )}
      {tab === 'warranty' && (
        <FamilyItemTab domain="home" type="warranty" icon="🧾" fields={WARRANTY_FIELDS}
          emptyTitle="No warranties tracked" emptyBody="Appliances, electronics and their warranty expiry."
          renderCard={(d) => (
            <>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.item}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{d.brand}</div>
              {d.expiryDate && <div style={{ fontSize: 11.5, color: 'var(--warn)', marginTop: 4 }}>Expires {d.expiryDate}</div>}
            </>
          )}
        />
      )}
    </div>
  )
}
