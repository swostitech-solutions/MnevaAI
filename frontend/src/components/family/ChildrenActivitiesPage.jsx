import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import Tabs from '../ui/Tabs'
import FamilyItemTab from '../ui/FamilyItemTab'

const ACTIVITY_TYPES = ['School', 'Sports', 'Music', 'Dance', 'Art', 'Tuition', 'Other']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const CHILD_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'age', label: 'Age', type: 'number' },
  { key: 'school', label: 'School', type: 'text' },
  { key: 'grade', label: 'Grade', type: 'text' },
]
const ACTIVITY_FIELDS = [
  { key: 'child', label: 'Child Name', type: 'text', required: true },
  { key: 'name', label: 'Activity Name', type: 'text', required: true },
  { key: 'type', label: 'Activity Type', type: 'select', options: ACTIVITY_TYPES },
  { key: 'day', label: 'Day', type: 'select', options: DAYS },
  { key: 'time', label: 'Time', type: 'text', hint: 'e.g. 4:00 PM' },
  { key: 'venue', label: 'Venue', type: 'text' },
]
const EVENT_FIELDS = [
  { key: 'child', label: 'Child Name', type: 'text', required: true },
  { key: 'title', label: 'Event Title', type: 'text', required: true },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'time', label: 'Time', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export default function ChildrenActivitiesPage() {
  const [tab, setTab] = useState('child')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link to="/family" style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>← Family</Link>
        <div style={{ fontSize: 20, fontWeight: 700 }}>🧒 Children &amp; Activities</div>
      </div>
      <Tabs
        tabs={[{ key: 'child', icon: '🧒', label: 'Children' }, { key: 'activity', icon: '🎨', label: 'Activities' }, { key: 'event', icon: '🏫', label: 'School Events' }]}
        active={tab} onChange={setTab}
      />
      {tab === 'child' && (
        <FamilyItemTab domain="children" type="child" icon="🧒" fields={CHILD_FIELDS}
          emptyTitle="No children added" emptyBody="Add your children's basic profile here."
          renderCard={(d) => (
            <>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{d.age ? `${d.age} yrs · ` : ''}{d.school}{d.grade ? ` · Grade ${d.grade}` : ''}</div>
            </>
          )}
        />
      )}
      {tab === 'activity' && (
        <FamilyItemTab domain="children" type="activity" icon="🎨" fields={ACTIVITY_FIELDS}
          emptyTitle="No activities added" emptyBody="Track extracurriculars — sports, music, tuition and more."
          renderCard={(d) => (
            <>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{d.child} · {d.type}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{d.day} {d.time}{d.venue ? ` · ${d.venue}` : ''}</div>
            </>
          )}
        />
      )}
      {tab === 'event' && (
        <FamilyItemTab domain="children" type="event" icon="🏫" fields={EVENT_FIELDS}
          emptyTitle="No school events" emptyBody="PTMs, exams, school trips and more."
          renderCard={(d) => (
            <>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{d.child} · {d.date} {d.time}</div>
              {d.notes && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{d.notes}</div>}
            </>
          )}
        />
      )}
    </div>
  )
}
