import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import Tabs from '../ui/Tabs'
import FamilyItemTab from '../ui/FamilyItemTab'

const OCCASION_TYPES = ['Birthday', 'Anniversary', 'Festival', 'Wedding', 'Graduation', 'Baby Shower', 'Other']
const GIFT_STATUS = ['Idea', 'Ordered', 'Delivered', 'Given']

const OCC_FIELDS = [
  { key: 'type', label: 'Occasion Type', type: 'select', options: OCCASION_TYPES, required: true },
  { key: 'person', label: 'Person', type: 'text', required: true },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'time', label: 'Time', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]
const GIFT_FIELDS = [
  { key: 'item', label: 'Gift Item', type: 'text', required: true },
  { key: 'person', label: 'For', type: 'text', required: true },
  { key: 'occasion', label: 'Occasion', type: 'text' },
  { key: 'budget', label: 'Budget (₹)', type: 'number' },
  { key: 'status', label: 'Status', type: 'select', options: GIFT_STATUS, default: 'Idea' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

const STATUS_BADGE = { Idea: 'badge-pulse', Ordered: 'badge-warn', Delivered: 'badge-go', Given: 'badge-go' }

export default function CelebrationGiftingPage() {
  const [tab, setTab] = useState('occasion')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link to="/family" style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>← Family</Link>
        <div style={{ fontSize: 20, fontWeight: 700 }}>🎉 Celebrations &amp; Gifting</div>
      </div>
      <Tabs tabs={[{ key: 'occasion', icon: '🎂', label: 'Occasions' }, { key: 'gift', icon: '🎁', label: 'Gifts' }]} active={tab} onChange={setTab} />
      {tab === 'occasion' && (
        <FamilyItemTab domain="celebration" type="occasion" icon="🎂" fields={OCC_FIELDS}
          emptyTitle="No occasions tracked" emptyBody="Birthdays, anniversaries and more — never forget one."
          renderCard={(d) => (
            <>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.person}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{d.type} · {d.date} {d.time}</div>
            </>
          )}
        />
      )}
      {tab === 'gift' && (
        <FamilyItemTab domain="celebration" type="gift" icon="🎁" fields={GIFT_FIELDS}
          emptyTitle="No gifts tracked" emptyBody="Track gift ideas, budget and order status."
          renderCard={(d) => (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{d.item}</div>
                {d.status && <span className={`badge ${STATUS_BADGE[d.status] || 'badge-pulse'}`}>{d.status}</span>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>For {d.person}{d.occasion ? ` · ${d.occasion}` : ''}{d.budget ? ` · ₹${d.budget}` : ''}</div>
            </>
          )}
        />
      )}
    </div>
  )
}
