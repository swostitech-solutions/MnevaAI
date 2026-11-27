import React from 'react'
import EntityCrudPage from '../ui/EntityCrudPage'
import { finApi } from '../../services/api'

const PAYMENT_METHODS = ['Cash', 'Online', 'Card', 'UPI']
const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other']

const FIELDS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'amount', label: 'Amount (₹)', type: 'number', required: true, min: 0.01 },
  { key: 'category', label: 'Category', type: 'select', options: CATEGORIES },
  { key: 'paymentMethod', label: 'Payment Method', type: 'select', options: PAYMENT_METHODS, required: true },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'note', label: 'Note', type: 'textarea' },
]

export default function ExpensesPage() {
  return (
    <EntityCrudPage
      title="Expenses" icon="🧾"
      queryKey={['expenses']} listFn={finApi.expenses}
      createFn={finApi.createExpense} updateFn={finApi.updateExpense} removeFn={finApi.deleteExpense}
      fields={FIELDS}
      emptyIcon="🧾" emptyTitle="No expenses logged yet" emptyBody="Log everyday cash/card/UPI spending here."
      renderCard={(e) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{e.name || e.category || 'Expense'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{e.category} · {e.paymentMethod}</div>
            </div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>₹{e.amount?.toLocaleString('en-IN')}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8 }}>{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </>
      )}
    />
  )
}
