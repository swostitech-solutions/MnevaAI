import React from 'react'
import EntityCrudPage from '../ui/EntityCrudPage'
import { finApi } from '../../services/api'

const CATEGORIES = ['Streaming', 'Software', 'Cloud', 'Gaming', 'News', 'Fitness', 'Education', 'Other']
const BILLING_CYCLES = ['Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly']
const PAYMENT_METHODS = ['Card', 'Bank', 'UPI', 'Wallet', 'Other']
const STATUSES = ['Active', 'Paused', 'Cancelled', 'Expired']

const FIELDS = [
  { key: 'name', label: 'Subscription Name', type: 'text', required: true },
  { key: 'category', label: 'Category', type: 'select', options: CATEGORIES, required: true },
  { key: 'provider', label: 'Provider', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'amount', label: 'Amount (₹)', type: 'number', required: true, min: 0 },
  { key: 'billingCycle', label: 'Billing Cycle', type: 'select', options: BILLING_CYCLES, required: true },
  { key: 'tax', label: 'Tax (₹)', type: 'number', min: 0 },
  { key: 'startDate', label: 'Start Date', type: 'date', required: true },
  { key: 'nextBillingDate', label: 'Next Billing Date', type: 'date' },
  { key: 'renewalDate', label: 'Renewal Date', type: 'date' },
  { key: 'paymentMethod', label: 'Payment Method', type: 'select', options: PAYMENT_METHODS },
  { key: 'paymentAccount', label: 'Payment Account', type: 'text' },
  { key: 'autoRenewal', label: 'Auto Renewal', type: 'toggle', default: true },
  { key: 'status', label: 'Status', type: 'select', options: STATUSES, default: 'Active' },
  { key: 'trialPeriod', label: 'In Trial Period', type: 'toggle' },
  { key: 'trialEndDate', label: 'Trial End Date', type: 'date' },
  { key: 'reminderBeforeRenewal', label: 'Remind (days before renewal)', type: 'number', min: 0 },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export default function SubscriptionsPage() {
  return (
    <EntityCrudPage
      title="Subscriptions" icon="🔁"
      queryKey={['subscriptionsFull']} listFn={finApi.subscriptions}
      createFn={finApi.createSubscription} updateFn={finApi.updateSubscription} removeFn={finApi.deleteSubscription}
      fields={FIELDS}
      emptyIcon="🔁" emptyTitle="No subscriptions tracked" emptyBody="Add Netflix, Spotify, cloud storage and other recurring charges."
      renderCard={(s) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{s.category}{s.provider ? ` · ${s.provider}` : ''}</div>
            </div>
            <span className={`badge ${s.status === 'Active' ? 'badge-go' : 'badge-pulse'}`}>{s.status}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
            <span style={{ color: 'var(--ink3)' }}>₹{s.amount?.toLocaleString('en-IN')} / {s.billingCycle}</span>
            {s.nextBillingDate && <span style={{ color: 'var(--ink3)' }}>Next: {new Date(s.nextBillingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
          </div>
        </>
      )}
    />
  )
}
