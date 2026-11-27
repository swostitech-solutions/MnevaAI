import React from 'react'
import EntityCrudPage from '../ui/EntityCrudPage'
import { finApi } from '../../services/api'

const LOAN_TYPES = ['Personal Loan', 'Home Loan', 'Car Loan', 'Education Loan', 'Business Loan', 'Gold Loan', 'Other']
const LOAN_STATUSES = ['Active', 'Closed', 'Pending']
const INTEREST_TYPES = ['Fixed', 'Floating']
const INTEREST_CALCULATIONS = ['Reducing Balance', 'Flat Rate']
const EMI_FREQUENCIES = ['Monthly', 'Bi-weekly', 'Quarterly']

const FIELDS = [
  { key: 'name', label: 'Loan Name', type: 'text', required: true },
  { key: 'loanType', label: 'Loan Type', type: 'select', options: LOAN_TYPES, required: true },
  { key: 'lenderName', label: 'Lender / Bank Name', type: 'text', required: true },
  { key: 'accountNumber', label: 'Loan Account Number', type: 'text' },
  { key: 'purpose', label: 'Purpose', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: LOAN_STATUSES, default: 'Active' },
  { key: 'originalAmount', label: 'Original Amount (₹)', type: 'number', required: true, min: 0 },
  { key: 'outstandingAmount', label: 'Current Outstanding (₹)', type: 'number', required: true, min: 0 },
  { key: 'amountPaid', label: 'Amount Paid So Far (₹)', type: 'number', min: 0 },
  { key: 'processingFee', label: 'Processing Fee (₹)', type: 'number', min: 0 },
  { key: 'otherCharges', label: 'Other Charges (₹)', type: 'number', min: 0 },
  { key: 'interestRate', label: 'Interest Rate (%)', type: 'number', required: true, min: 0, step: 0.01 },
  { key: 'interestType', label: 'Interest Type', type: 'select', options: INTEREST_TYPES, required: true },
  { key: 'interestCalculation', label: 'Interest Calculation', type: 'select', options: INTEREST_CALCULATIONS, required: true },
  { key: 'emiAmount', label: 'EMI Amount (₹)', type: 'number', required: true, min: 0 },
  { key: 'emiFrequency', label: 'EMI Frequency', type: 'select', options: EMI_FREQUENCIES, default: 'Monthly' },
  { key: 'emiStartDate', label: 'EMI Start Date', type: 'date', required: true },
  { key: 'nextEmiDate', label: 'Next EMI Date', type: 'date' },
  { key: 'emiEndDate', label: 'EMI End Date', type: 'date' },
  { key: 'numberOfEmis', label: 'Number of EMIs', type: 'number', required: true, min: 1 },
  { key: 'emisPaid', label: 'EMIs Paid', type: 'number', min: 0 },
  { key: 'emisRemaining', label: 'EMIs Remaining', type: 'number', min: 0 },
  { key: 'loanStartDate', label: 'Loan Start Date', type: 'date', required: true },
  { key: 'loanMaturityDate', label: 'Loan Maturity Date', type: 'date' },
  { key: 'autoDebit', label: 'Auto Debit', type: 'toggle' },
  { key: 'paymentAccount', label: 'Payment Account', type: 'text' },
  { key: 'paymentDay', label: 'Payment Day of Month', type: 'number', min: 1 },
  { key: 'prepaymentAllowed', label: 'Prepayment Allowed', type: 'toggle' },
  { key: 'prepaymentCharges', label: 'Prepayment Charges (₹)', type: 'number', min: 0 },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export default function LoansPage() {
  return (
    <EntityCrudPage
      title="Loans" icon="🏦"
      queryKey={['loans']} listFn={finApi.loans}
      createFn={finApi.createLoan} updateFn={finApi.updateLoan} removeFn={finApi.deleteLoan}
      fields={FIELDS}
      emptyIcon="🏦" emptyTitle="No loans tracked yet" emptyBody="Add a loan to track EMIs, interest and outstanding balance."
      renderCard={(loan) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{loan.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{loan.lenderName} · {loan.loanType}</div>
            </div>
            <span className={`badge ${loan.status === 'Active' ? 'badge-go' : loan.status === 'Pending' ? 'badge-warn' : 'badge-pulse'}`}>{loan.status}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
            <span style={{ color: 'var(--ink3)' }}>Outstanding</span>
            <span style={{ fontWeight: 700 }}>₹{(loan.pendingAmount ?? loan.outstandingAmount)?.toLocaleString('en-IN')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--ink3)' }}>EMI</span>
            <span>₹{loan.emiAmount?.toLocaleString('en-IN')} / {loan.emiFrequency}</span>
          </div>
        </>
      )}
    />
  )
}
