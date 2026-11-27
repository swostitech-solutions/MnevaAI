import React from 'react'
import EntityCrudPage from '../ui/EntityCrudPage'
import { finApi } from '../../services/api'

const EMI_TYPES = ['Loan EMI', 'Credit Card EMI', 'Product EMI', 'Other']
const PAYMENT_METHODS = ['Card', 'Bank', 'UPI', 'Wallet', 'Other']
const FREQUENCIES = ['Monthly', 'Bi-weekly', 'Quarterly']
const STATUSES = ['Active', 'Completed', 'Overdue', 'Cancelled']

const FIELDS = [
  { key: 'name', label: 'EMI Name', type: 'text', required: true },
  { key: 'emiType', label: 'EMI Type', type: 'select', options: EMI_TYPES, required: true },
  { key: 'provider', label: 'Provider', type: 'text', required: true },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'totalAmount', label: 'Total Amount (₹)', type: 'number', required: true, min: 0 },
  { key: 'downPayment', label: 'Down Payment (₹)', type: 'number', min: 0 },
  { key: 'financedAmount', label: 'Financed Amount (₹)', type: 'number', required: true, min: 0 },
  { key: 'emiAmount', label: 'EMI Amount (₹)', type: 'number', required: true, min: 0 },
  { key: 'interestRate', label: 'Interest Rate (%)', type: 'number', min: 0, step: 0.01 },
  { key: 'processingFee', label: 'Processing Fee (₹)', type: 'number', min: 0 },
  { key: 'totalPayable', label: 'Total Payable (₹)', type: 'number', min: 0 },
  { key: 'numberOfInstallments', label: 'Number of Installments', type: 'number', required: true, min: 1 },
  { key: 'installmentsPaid', label: 'Installments Paid', type: 'number', min: 0 },
  { key: 'installmentsRemaining', label: 'Installments Remaining', type: 'number', min: 0 },
  { key: 'startDate', label: 'Start Date', type: 'date', required: true },
  { key: 'nextPaymentDate', label: 'Next Payment Date', type: 'date' },
  { key: 'endDate', label: 'End Date', type: 'date' },
  { key: 'frequency', label: 'Frequency', type: 'select', options: FREQUENCIES, default: 'Monthly' },
  { key: 'paymentMethod', label: 'Payment Method', type: 'select', options: PAYMENT_METHODS },
  { key: 'autoDebit', label: 'Auto Debit', type: 'toggle' },
  { key: 'paymentAccount', label: 'Payment Account', type: 'text' },
  { key: 'paymentDay', label: 'Payment Day of Month', type: 'number', min: 1 },
  { key: 'status', label: 'Status', type: 'select', options: STATUSES, default: 'Active' },
  { key: 'productName', label: 'Product Name', type: 'text' },
  { key: 'orderReference', label: 'Order Reference', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export default function EmisPage() {
  return (
    <EntityCrudPage
      title="EMIs" icon="💳"
      queryKey={['emis']} listFn={finApi.emis}
      createFn={finApi.createEmi} updateFn={finApi.updateEmi} removeFn={finApi.deleteEmi}
      fields={FIELDS}
      emptyIcon="💳" emptyTitle="No EMIs tracked yet" emptyBody="Add a card/product EMI to track installments. Loan EMIs appear here automatically."
      renderCard={(emi) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{emi.name}{emi.loanId && <span style={{ fontSize: 10, color: 'var(--ink3)', marginLeft: 6 }}>(from Loan)</span>}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{emi.provider} · {emi.emiType}</div>
            </div>
            <span className={`badge ${emi.status === 'Active' ? 'badge-go' : emi.status === 'Overdue' ? 'badge-danger' : 'badge-pulse'}`}>{emi.status}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
            <span style={{ color: 'var(--ink3)' }}>Pending</span>
            <span style={{ fontWeight: 700 }}>₹{(emi.pendingAmount ?? emi.financedAmount)?.toLocaleString('en-IN')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--ink3)' }}>EMI</span>
            <span>₹{emi.emiAmount?.toLocaleString('en-IN')} / {emi.frequency}</span>
          </div>
        </>
      )}
    />
  )
}
