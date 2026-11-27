import React from 'react'
import { Link } from 'react-router-dom'
import FamilyItemTab from '../ui/FamilyItemTab'

const EVENT_TYPES = ['Birthday', 'Anniversary', 'School', 'Medical', 'Travel', 'Festival', 'Meeting', 'Other']

const FIELDS = [
  { key: 'type', label: 'Event Type', type: 'select', options: EVENT_TYPES },
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'member', label: 'Family Member', type: 'text' },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'time', label: 'Time', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export default function FamilyCalendarPage() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link to="/family" style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>← Family</Link>
        <div style={{ fontSize: 20, fontWeight: 700 }}>📅 Family Calendar</div>
      </div>
      <FamilyItemTab domain="calendar" type="event" icon="📅" fields={FIELDS}
        emptyTitle="No family events" emptyBody="One shared calendar for everyone in the family."
        renderCard={(d) => (
          <>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{d.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{d.type}{d.member ? ` · ${d.member}` : ''}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{d.date} {d.time}</div>
          </>
        )}
      />
    </div>
  )
}
