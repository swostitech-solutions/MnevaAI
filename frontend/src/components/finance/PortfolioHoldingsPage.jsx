import React from 'react'
import EntityCrudPage from '../ui/EntityCrudPage'
import { finApi } from '../../services/api'

const TYPES = ['Stock', 'Mutual Fund', 'SIP', 'ETF', 'Bonds', 'Gold', 'Crypto', 'Fixed Income', 'Other']

const FIELDS = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'type', label: 'Type', type: 'select', options: TYPES, required: true },
  { key: 'platform', label: 'Platform', type: 'text' },
  { key: 'quantity', label: 'Quantity', type: 'number', min: 0, step: 0.0001 },
  { key: 'avgBuyPrice', label: 'Avg Buy Price (₹)', type: 'number', min: 0 },
  { key: 'currentPrice', label: 'Current Price (₹)', type: 'number', min: 0 },
  { key: 'investedAmount', label: 'Invested Amount (₹)', type: 'number', required: true, min: 0 },
  { key: 'currentValue', label: 'Current Value (₹)', type: 'number', required: true, min: 0 },
  { key: 'purchaseDate', label: 'Purchase Date', type: 'date' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export default function PortfolioHoldingsPage() {
  return (
    <EntityCrudPage
      title="Portfolio Holdings" icon="📈"
      queryKey={['holdings']} listFn={finApi.holdings}
      createFn={finApi.createHolding} updateFn={finApi.updateHolding} removeFn={finApi.deleteHolding}
      fields={FIELDS}
      emptyIcon="📈" emptyTitle="No holdings yet" emptyBody="Track stocks, mutual funds, SIPs, crypto and more manually."
      renderCard={(h) => {
        const ret = h.investedAmount > 0 ? Math.round(((h.currentValue - h.investedAmount) / h.investedAmount) * 1000) / 10 : 0
        return (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{h.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{h.type}{h.platform ? ` · ${h.platform}` : ''}</div>
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: ret >= 0 ? 'var(--go)' : 'var(--danger)' }}>{ret >= 0 ? '+' : ''}{ret}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
              <span style={{ color: 'var(--ink3)' }}>Invested → Current</span>
              <span>₹{h.investedAmount?.toLocaleString('en-IN')} → ₹{h.currentValue?.toLocaleString('en-IN')}</span>
            </div>
          </>
        )
      }}
    />
  )
}
