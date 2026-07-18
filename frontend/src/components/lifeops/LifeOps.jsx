import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { lifeApi } from '../../services/api'
import toast from 'react-hot-toast'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const up = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.28 } } }

export default function LifeOps() {
  const [cabModal, setCabModal] = useState(false)
  const [foodModal, setFoodModal] = useState(false)
  const [cabForm, setCabForm] = useState({ pickup: 'Home, Koramangala', destination: 'Office, Whitefield', cab_type: 'mini', pickup_time: '9:30 AM' })
  const [foodForm, setFoodForm] = useState({ restaurant: 'Paradise Restaurant', items: ['Chicken Biryani'], platform: 'swiggy' })

  const { data: rides }    = useQuery({ queryKey: ['rides'],    queryFn: lifeApi.rides,    staleTime: 5 * 60000 })
  const { data: wishlist } = useQuery({ queryKey: ['wishlist'], queryFn: lifeApi.wishlist, staleTime: 5 * 60000 })

  const bookCab = async () => {
    try {
      const r = await lifeApi.cab(cabForm)
      const msg = r?.status === 'pending_provider_connection'
        ? '🚗 Cab request logged — connect Ola/Uber in Settings to enable live booking'
        : `🚗 Cab booked! Booking ID: ${r?.bookingId}`
      toast.success(msg)
      setCabModal(false)
    } catch { toast.error('Booking failed') }
  }

  const orderFood = async () => {
    try {
      const r = await lifeApi.food(foodForm)
      const msg = r?.status === 'pending_provider_connection'
        ? '🍛 Order logged — connect Swiggy/Zomato in Settings to enable live ordering'
        : `🍛 Order placed! Order ID: ${r?.orderId}`
      toast.success(msg)
      setFoodModal(false)
    } catch { toast.error('Order failed') }
  }

  const QUICK = [
    { icon: '🚗', title: 'Book Cab', sub: 'Ola / Uber', color: 'rgba(61,139,255,0.08)', action: () => setCabModal(true) },
    { icon: '🍛', title: 'Reorder Food', sub: 'Swiggy / Zomato', color: 'rgba(0,227,150,0.08)', action: () => setFoodModal(true) },
    { icon: '🏠', title: 'MyGate', sub: 'Auto-approve deliveries', color: 'rgba(255,176,32,0.08)', action: () => toast.success('MyGate auto-approval is active for delivery partners') },
    { icon: '🛒', title: 'Price Alerts', sub: '2 items below target', color: 'rgba(155,114,255,0.08)', action: () => toast('Monitoring 4 wishlist items') },
    { icon: '✈️', title: 'Book Flight', sub: 'via MakeMyTrip', color: 'rgba(6,182,212,0.08)', action: () => toast('Flight booking — coming in v0.3') },
    { icon: '🏨', title: 'Book Hotel', sub: 'via Goibibo', color: 'rgba(236,72,153,0.08)', action: () => toast('Hotel booking — coming in v0.3') },
    { icon: '📦', title: 'Track Orders', sub: '1 Amazon delivery today', color: 'rgba(239,68,68,0.08)', action: () => toast.success('Dell Monitor arriving by 8 PM today') },
    { icon: '⚡', title: 'Smart Home', sub: 'Alexa / Google Home', color: 'rgba(245,158,11,0.08)', action: () => toast('Smart home controls — coming in v0.3') },
  ]

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* Quick Actions */}
      <motion.div variants={up} style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>⚡ Quick Actions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 11 }}>
          {QUICK.map(q => (
            <motion.div key={q.title} whileHover={{ scale: 1.02, y: -2 }} transition={{ duration: 0.14 }}
              onClick={q.action}
              style={{ background: q.color, border: '1px solid var(--rim1)', borderRadius: 13, padding: '18px 14px', textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: 30, marginBottom: 9 }}>{q.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{q.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{q.sub}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div variants={up} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Ride History */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>🚗 Ride History</div>
          {rides?.rides?.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--rim1)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(61,139,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🚗</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.from} → {r.to}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.type} · {r.date} · {r.driver}</div>
              </div>
              <span className="badge badge-go">₹{r.fare}</span>
            </div>
          ))}
          <button className="btn-ghost" style={{ width: '100%', marginTop: 12, fontSize: 12, padding: '8px' }} onClick={() => setCabModal(true)}>
            🚗 Book New Ride
          </button>
        </div>

        {/* Wishlist */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>🛒 Wishlist Price Alerts</div>
          {wishlist?.items?.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rim1)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{item.name}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
                  {item.dropPct > 0 && <span style={{ fontSize: 11, color: 'var(--ink3)', textDecoration: 'line-through' }}>₹{item.origPrice.toLocaleString('en-IN')}</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.dropPct > 0 ? 'var(--go)' : 'var(--ink2)' }}>₹{item.curPrice.toLocaleString('en-IN')}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>· {item.platform}</span>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 1 }}>Target: ₹{item.target.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {item.dropPct > 0
                  ? <span className="badge badge-go">↓{item.dropPct}%</span>
                  : <span className="badge badge-pulse">Watching</span>}
                {item.available && item.curPrice <= item.target && (
                  <div style={{ marginTop: 5 }}>
                    <button className="btn-approve" style={{ fontSize: 10 }} onClick={() => toast.success(`🛒 Buy ${item.name} link sent to your phone!`)}>Buy Now</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Modals */}
      {cabModal && (
        <Modal title="🚗 Book a Cab" onClose={() => setCabModal(false)}>
          <Field label="Pickup">
            <input className="input" value={cabForm.pickup} onChange={e => setCabForm(f => ({ ...f, pickup: e.target.value }))} />
          </Field>
          <Field label="Destination">
            <input className="input" value={cabForm.destination} onChange={e => setCabForm(f => ({ ...f, destination: e.target.value }))} />
          </Field>
          <Field label="Cab Type">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {['mini','sedan','xl','auto'].map(t => (
                <button key={t} onClick={() => setCabForm(f => ({ ...f, cab_type: t }))}
                  style={{ padding: '8px', borderRadius: 8, background: cabForm.cab_type === t ? 'rgba(61,139,255,0.15)' : 'var(--depth3)', border: `1px solid ${cabForm.cab_type === t ? 'var(--rim2)' : 'var(--rim1)'}`, color: cabForm.cab_type === t ? 'var(--pulse2)' : 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif', textTransform: 'capitalize' }}>
                  {t === 'mini' ? '🚗 Mini' : t === 'sedan' ? '🚙 Sedan' : t === 'xl' ? '🚐 XL' : '🛺 Auto'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Pickup Time">
            <input className="input" value={cabForm.pickup_time} onChange={e => setCabForm(f => ({ ...f, pickup_time: e.target.value }))} placeholder="9:30 AM" />
          </Field>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button className="btn-primary" onClick={bookCab} style={{ flex: 1 }}>Confirm Booking</button>
            <button onClick={() => setCabModal(false)} style={{ flex: 1, background: 'var(--depth3)', color: 'var(--ink2)', border: '1px solid var(--rim1)', borderRadius: 10, padding: '10px', cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif', fontSize: 13 }}>Cancel</button>
          </div>
        </Modal>
      )}

      {foodModal && (
        <Modal title="🍛 Order Food" onClose={() => setFoodModal(false)}>
          <Field label="Restaurant">
            <input className="input" value={foodForm.restaurant} onChange={e => setFoodForm(f => ({ ...f, restaurant: e.target.value }))} />
          </Field>
          <Field label="Items">
            <input className="input" value={foodForm.items.join(', ')} onChange={e => setFoodForm(f => ({ ...f, items: e.target.value.split(', ') }))} placeholder="Chicken Biryani, Raita" />
          </Field>
          <Field label="Platform">
            <div style={{ display: 'flex', gap: 8 }}>
              {['swiggy','zomato'].map(p => (
                <button key={p} onClick={() => setFoodForm(f => ({ ...f, platform: p }))}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, background: foodForm.platform === p ? 'rgba(61,139,255,0.15)' : 'var(--depth3)', border: `1px solid ${foodForm.platform === p ? 'var(--rim2)' : 'var(--rim1)'}`, color: foodForm.platform === p ? 'var(--pulse2)' : 'var(--ink2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif', textTransform: 'capitalize' }}>
                  {p === 'swiggy' ? '🧡 Swiggy' : '🔴 Zomato'}
                </button>
              ))}
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button className="btn-primary" onClick={orderFood} style={{ flex: 1 }}>Place Order</button>
            <button onClick={() => setFoodModal(false)} style={{ flex: 1, background: 'var(--depth3)', color: 'var(--ink2)', border: '1px solid var(--rim1)', borderRadius: 10, padding: '10px', cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif', fontSize: 13 }}>Cancel</button>
          </div>
        </Modal>
      )}
    </motion.div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={e => e.stopPropagation()}
        style={{ background: 'var(--depth2)', border: '1px solid var(--rim2)', borderRadius: 20, padding: 28, maxWidth: 440, width: '90%', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--ink3)', cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </motion.div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500, display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}
