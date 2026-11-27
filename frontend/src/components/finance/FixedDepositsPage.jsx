import React from 'react'
import EntityCrudPage from '../ui/EntityCrudPage'
import { finApi } from '../../services/api'

const STATUSES = ['Active', 'Matured', 'Closed', 'Withdrawn Early']
const COMPOUNDING = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'Cumulative']
const PAYOUTS = ['On Maturity', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly']

const FIELDS = [
  { key: 'name', label: 'FD Name', type: 'text', required: true },
  { key: 'bankName', label: 'Bank Name', type: 'text', required: true },
  { key: 'accountNumber', label: 'Account / FD Number', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: STATUSES, default: 'Active' },
  { key: 'principalAmount', label: 'Principal Amount (₹)', type: 'number', required: true, min: 0 },
  { key: 'interestRate', label: 'Interest Rate (%)', type: 'number', required: true, min: 0, step: 0.01 },
  { key: 'compoundingFrequency', label: 'Compounding Frequency', type: 'select', options: COMPOUNDING, default: 'Quarterly' },
  { key: 'interestPayout', label: 'Interest Payout', type: 'select', options: PAYOUTS, default: 'On Maturity' },
  { key: 'startDate', label: 'Start Date', type: 'date', required: true },
  { key: 'maturityDate', label: 'Maturity Date', type: 'date', required: true },
  { key: 'tenureMonths', label: 'Tenure (months)', type: 'number', min: 1 },
  { key: 'maturityAmount', label: 'Maturity Amount (₹)', type: 'number', min: 0 },
  { key: 'interestEarned', label: 'Interest Earned (₹)', type: 'number', min: 0 },
  { key: 'autoRenewal', label: 'Auto Renewal', type: 'toggle' },
  { key: 'nominee', label: 'Nominee', type: 'text' },
  { key: 'paymentAccount', label: 'Payment Account', type: 'text' },
  { key: 'prematureWithdrawalAllowed', label: 'Premature Withdrawal Allowed', type: 'toggle' },
  { key: 'prematureWithdrawalPenalty', label: 'Premature Withdrawal Penalty (%)', type: 'number', min: 0 },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export default function FixedDepositsPage() {
  return (
    <EntityCrudPage
      title="Fixed Deposits" icon="🏛️"
      queryKey={['fixedDeposits']} listFn={finApi.fixedDeposits}
      createFn={finApi.createFixedDeposit} updateFn={finApi.updateFixedDeposit} removeFn={finApi.deleteFixedDeposit}
      fields={FIELDS}
      emptyIcon="🏛️" emptyTitle="No fixed deposits yet" emptyBody="Track bank FDs — principal, interest rate and maturity."
      renderCard={(fd) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{fd.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{fd.bankName}</div>
            </div>
            <span className={`badge ${fd.status === 'Active' ? 'badge-go' : 'badge-pulse'}`}>{fd.status}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
            <span style={{ color: 'var(--ink3)' }}>Principal</span>
            <span style={{ fontWeight: 700 }}>₹{fd.principalAmount?.toLocaleString('en-IN')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--ink3)' }}>Rate · Maturity</span>
            <span>{fd.interestRate}% · {new Date(fd.maturityDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
          </div>
        </>
      )}
    />
  )
}
