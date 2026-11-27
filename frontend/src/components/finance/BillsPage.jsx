import React from 'react'
import EntityCrudPage from '../ui/EntityCrudPage'
import { finApi } from '../../services/api'

const CATEGORIES = ['Electricity', 'Water', 'Internet', 'Mobile', 'Gas', 'Rent', 'Maintenance', 'Insurance', 'Other']
const BILLING_CYCLES = ['Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Custom']
const STATUSES = ['Upcoming', 'Due', 'Paid', 'Overdue']

const FIELDS = [
  { key: 'name', label: 'Bill Name', type: 'text', required: true },
  { key: 'category', label: 'Category', type: 'select', options: CATEGORIES, required: true },
  { key: 'provider', label: 'Provider', type: 'text' },
  { key: 'accountNumber', label: 'Account Number', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'expectedAmount', label: 'Expected Amount (₹)', type: 'number', min: 0 },
  { key: 'lastBillAmount', label: 'Last Bill Amount (₹)', type: 'number', min: 0 },
  { key: 'currency', label: 'Currency', type: 'text', default: 'INR' },
  { key: 'billingCycle', label: 'Billing Cycle', type: 'select', options: BILLING_CYCLES, default: 'Monthly' },
  { key: 'billDate', label: 'Bill Date', type: 'date' },
  { key: 'dueDate', label: 'Due Date', type: 'date', required: true },
  { key: 'nextDueDate', label: 'Next Due Date', type: 'date' },
  { key: 'gracePeriod', label: 'Grace Period (days)', type: 'number', min: 0 },
  { key: 'paymentMethod', label: 'Payment Method', type: 'text' },
  { key: 'paymentAccount', label: 'Payment Account', type: 'text' },
  { key: 'autoPay', label: 'Auto Pay', type: 'toggle' },
  { key: 'status', label: 'Status', type: 'select', options: STATUSES, default: 'Upcoming' },
  { key: 'lateFee', label: 'Late Fee (₹)', type: 'number', min: 0 },
  { key: 'tax', label: 'Tax (₹)', type: 'number', min: 0 },
  { key: 'reminderDays', label: 'Remind (days before due)', type: 'number', min: 0 },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export default function BillsPage() {
  return (
    <EntityCrudPage
      title="Bills" icon="📋"
      queryKey={['billsFull']} listFn={() => finApi.bills('all')}
      createFn={finApi.createBill} updateFn={finApi.updateBill} removeFn={finApi.deleteBill}
      fields={FIELDS}
      emptyIcon="📋" emptyTitle="No bills yet" emptyBody="Track electricity, internet, rent and other recurring bills."
      renderCard={(bill) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{bill.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{bill.category}{bill.provider ? ` · ${bill.provider}` : ''}</div>
            </div>
            <span className={`badge ${bill.status === 'Paid' ? 'badge-go' : bill.status === 'Overdue' ? 'badge-danger' : bill.status === 'Due' ? 'badge-warn' : 'badge-pulse'}`}>{bill.status}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
            <span style={{ color: 'var(--ink3)' }}>₹{(bill.expectedAmount ?? bill.lastBillAmount ?? 0).toLocaleString('en-IN')}</span>
            <span style={{ color: 'var(--ink3)' }}>Due {new Date(bill.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          </div>
        </>
      )}
    />
  )
}
