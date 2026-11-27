import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { finApi } from '../../services/api'
import toast from 'react-hot-toast'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const up = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.28 } } }

const COLORS = ['#F59E0B','#3D8BFF','#9B72FF','#00E396','#06B6D4','#EC4899','#EF4444']

// Mirrors mobile Finance.js's hub — links to the 6 full CRUD sub-screens,
// same split as mneva/src/Screen/finance/*.js.
const SUB_SCREENS = [
  { to: '/finance/bills', icon: '📋', label: 'Bills' },
  { to: '/finance/loans', icon: '🏦', label: 'Loans' },
  { to: '/finance/emis', icon: '💳', label: 'EMIs' },
  { to: '/finance/expenses', icon: '🧾', label: 'Expenses' },
  { to: '/finance/fixed-deposits', icon: '🏛️', label: 'Fixed Deposits' },
  { to: '/finance/portfolio-holdings', icon: '📈', label: 'Portfolio' },
  { to: '/finance/subscriptions', icon: '🔁', label: 'Subscriptions' },
]

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 10, padding: '9px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 700 }}>{payload[0].name}</div>
      <div style={{ color: 'var(--pulse2)' }}>₹{payload[0].value?.toLocaleString('en-IN')}</div>
    </div>
  )
}

export default function Finance() {
  const [payModal, setPayModal] = useState(null)
  const [chart, setChart]       = useState('pie')

  const { data: bills }     = useQuery({ queryKey: ['bills'],     queryFn: () => finApi.bills('all'),       staleTime: 5 * 60000 })
  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: finApi.portfolio,               staleTime: 5 * 60000 })
  const { data: spending }  = useQuery({ queryKey: ['spending'],  queryFn: () => finApi.spending('month'), staleTime: 5 * 60000 })

  const confirmPay = async () => {
    if (!payModal) return
    try {
      await finApi.pay({
        billId: payModal.id,
        amount: payModal.expectedAmount ?? payModal.lastBillAmount ?? 0,
        payee: payModal.name,
        category: payModal.category,
      })
      toast.success(`✅ ₹${(payModal.expectedAmount ?? payModal.lastBillAmount ?? 0).toLocaleString('en-IN')} payment initiated!`)
      setPayModal(null)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Payment could not be started right now.')
    }
  }

  const upcomingBills = (bills || []).filter(b => b.status !== 'Paid').sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))

  const STAT_CARDS = [
    { label: 'This Month Spend', value: `₹${(spending?.total || 0).toLocaleString('en-IN')}`, color: 'var(--pulse2)', change: 'Expenses + bills + EMIs + subs' },
    { label: 'Bills Pending',    value: upcomingBills.length, color: 'var(--warn)', change: 'Not yet paid' },
    { label: 'Portfolio',        value: portfolio ? `₹${(portfolio.totalCurrent / 1000).toFixed(0)}k` : '—', color: 'var(--go)', change: `${portfolio?.returnPct >= 0 ? '+' : ''}${portfolio?.returnPct ?? 0}% return` },
    { label: 'Net Worth',        value: portfolio ? `₹${(portfolio.netWorth / 1000).toFixed(0)}k` : '—', color: 'var(--violet)', change: 'From tracked holdings' },
  ]

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* Header */}
      <motion.div variants={up} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>This Month</div>
          <div style={{ fontSize: 38, fontWeight: 700, color: 'var(--pulse2)', lineHeight: 1 }}>₹{(spending?.total || 0).toLocaleString('en-IN')}</div>
        </div>
        <Link to="/finance/bills" className="btn-primary" style={{ fontSize: 13, padding: '8px 16px', textDecoration: 'none' }}>+ Add Bill</Link>
      </motion.div>

      {/* Sub-screen nav */}
      <motion.div variants={up} style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {SUB_SCREENS.map(s => (
          <Link key={s.to} to={s.to} className="btn-ghost" style={{ fontSize: 12.5, padding: '7px 14px', textDecoration: 'none' }}>
            {s.icon} {s.label}
          </Link>
        ))}
      </motion.div>

      {/* Stats */}
      <motion.div variants={up} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        {STAT_CARDS.map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 24 }}>{s.value}</div>
            <div className="stat-delta">{s.change}</div>
          </div>
        ))}
      </motion.div>

      {/* Bills Grid */}
      <motion.div variants={up} className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>📋 Upcoming Bills</span>
          <Link to="/finance/bills" className="btn-view" style={{ fontSize: 11.5, textDecoration: 'none' }}>Manage all bills →</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 11 }}>
          {upcomingBills.slice(0, 6).map(bill => (
            <motion.div key={bill.id} whileHover={{ scale: 1.015 }} transition={{ duration: 0.14 }}
              onClick={() => setPayModal(bill)}
              style={{ background: 'var(--depth3)', border: `1px solid ${bill.status === 'Overdue' ? 'rgba(255,82,82,0.3)' : bill.status === 'Due' ? 'rgba(255,176,32,0.3)' : 'var(--rim1)'}`, borderRadius: 12, padding: 14, cursor: 'pointer', transition: 'all 0.15s' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{bill.name}</div>
              <div style={{ fontSize: 19, fontWeight: 700 }}>₹{(bill.expectedAmount ?? bill.lastBillAmount ?? 0).toLocaleString('en-IN')}</div>
              <div style={{ fontSize: 11, color: bill.status === 'Overdue' ? 'var(--danger)' : bill.status === 'Due' ? 'var(--warn)' : 'var(--ink3)', marginTop: 3 }}>
                Due {new Date(bill.dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
              </div>
              <div style={{ marginTop: 9 }}>
                <span className={bill.autoPay ? 'badge badge-go' : bill.status === 'Overdue' ? 'badge badge-danger' : 'badge badge-warn'}>
                  {bill.autoPay ? '⚡ Auto' : '👆 Tap to pay'}
                </span>
              </div>
            </motion.div>
          ))}
          {upcomingBills.length === 0 && (
            <div style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--ink3)', padding: 18, textAlign: 'center' }}>
              No upcoming bills. <Link to="/finance/bills" style={{ color: 'var(--pulse2)' }}>Add one →</Link>
            </div>
          )}
        </div>
      </motion.div>

      {/* Portfolio */}
      {portfolio && (
        <motion.div variants={up} className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>📈 Investment Portfolio</span>
            <div style={{ display: 'flex', gap: 20 }}>
              {[['Invested', `₹${portfolio.totalInvested?.toLocaleString('en-IN')}`, 'var(--ink2)'], ['Current', `₹${portfolio.totalCurrent?.toLocaleString('en-IN')}`, 'var(--go)'], ['Return', `${portfolio.returnPct >= 0 ? '+' : ''}${portfolio.returnPct}%`, portfolio.returnPct >= 0 ? 'var(--go)' : 'var(--danger)']].map(([k,v,c]) => (
                <div key={k} style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--ink3)' }}>{k}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
            <thead><tr>{['Investment','Type','Value'].map(h => (
              <th key={h} style={{ textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '7px 11px', borderBottom: '1px solid var(--rim1)' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {portfolio.holdings?.map(h => (
                <tr key={h.id}>
                  <td style={{ padding: '10px 11px', fontSize: 13, fontWeight: 600, borderBottom: '1px solid var(--rim1)' }}>{h.name}</td>
                  <td style={{ padding: '10px 11px', fontSize: 12, color: 'var(--ink3)', borderBottom: '1px solid var(--rim1)' }}>{h.type}</td>
                  <td style={{ padding: '10px 11px', fontSize: 13, fontWeight: 700, borderBottom: '1px solid var(--rim1)' }}>₹{h.value?.toLocaleString('en-IN')}</td>
                </tr>
              ))}
              {(!portfolio.holdings || portfolio.holdings.length === 0) && (
                <tr><td colSpan={3} style={{ padding: '14px 11px', fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center' }}>
                  No holdings yet. <Link to="/finance/portfolio-holdings" style={{ color: 'var(--pulse2)' }}>Add one →</Link>
                </td></tr>
              )}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Spending Charts */}
      {spending && (
        <motion.div variants={up} className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>💸 Spending — ₹{spending.total?.toLocaleString('en-IN')}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['pie','bar'].map(m => (
                <button key={m} onClick={() => setChart(m)}
                  style={{ background: chart === m ? 'rgba(61,139,255,0.14)' : 'transparent', border: `1px solid ${chart === m ? 'var(--rim2)' : 'var(--rim1)'}`, color: chart === m ? 'var(--pulse2)' : 'var(--ink3)', fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>
                  {m === 'pie' ? '🥧 Pie' : '📊 Bar'}
                </button>
              ))}
            </div>
          </div>
          {spending.categories?.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height={220}>
                {chart === 'pie' ? (
                  <PieChart>
                    <Pie data={spending.categories} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={48} paddingAngle={3}>
                      {spending.categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                ) : (
                  <BarChart data={spending.categories} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(61,139,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--ink3)', fontSize: 9.5 }} axisLine={false} tickLine={false} tickFormatter={v => v.split(' ')[0].slice(0,5)} />
                    <YAxis tick={{ fill: 'var(--ink3)', fontSize: 9.5 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="amount" radius={[5,5,0,0]}>
                      {spending.categories.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {spending.categories?.map((c, i) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--ink2)' }}>{c.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>₹{c.amount.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink3)', padding: 18, textAlign: 'center' }}>No spending recorded this month yet.</div>
          )}
        </motion.div>
      )}

      {/* Pay Modal */}
      {payModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPayModal(null)}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={e => e.stopPropagation()}
            style={{ background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 20, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 26 }}>💸</span>
              <div style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Confirm Payment</div>
              <button onClick={() => setPayModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--ink3)', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, textAlign: 'center', margin: '4px 0 18px' }}>₹{(payModal.expectedAmount ?? payModal.lastBillAmount ?? 0).toLocaleString('en-IN')}</div>
            {[['Payee', payModal.name], ['Category', payModal.category], ['Provider', payModal.provider || '—'], ['Status', payModal.status]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--rim1)', fontSize: 13 }}>
                <span style={{ color: 'var(--ink3)' }}>{k}</span><span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{v}</span>
              </div>
            ))}
            <div style={{ background: 'rgba(255,176,32,0.07)', border: '1px solid rgba(255,176,32,0.2)', borderRadius: 10, padding: '10px 14px', margin: '16px 0', fontSize: 12, color: 'var(--warn)', display: 'flex', gap: 8 }}>
              🔐 Biometric required for payments ≥ ₹1,000
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={confirmPay} style={{ flex: 1 }}>Authenticate & Pay</button>
              <button onClick={() => setPayModal(null)} style={{ flex: 1, background: 'var(--depth3)', color: 'var(--ink2)', border: '1px solid var(--rim1)', borderRadius: 10, padding: '10px', fontSize: 13, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>Cancel</button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
