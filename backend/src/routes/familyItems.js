import express from 'express'
import { prisma } from '../config/prisma.js'

export const familyItemsRouter = express.Router()

const emit = (io, userId, event, data) => { if (io) io.to(`u:${userId}`).emit(event, data) }

const fmt = (item) => ({
  id: item.id, domain: item.domain, type: item.type,
  data: item.data, remindAt: item.remindAt, done: item.done,
  createdAt: item.createdAt, updatedAt: item.updatedAt,
})

// ── AI Memory sync ────────────────────────────────────────────────────────────
async function syncFamilyMemory(userId, domain, prismaClient) {
  const items = await prismaClient.familyItem.findMany({
    where: { userId, domain },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  if (!items.length) return

  const domainLabel = {
    children:    'Children & Activities',
    home:        'Home Maintenance',
    celebration: 'Celebrations & Gifting',
    calendar:    'Family Calendar',
  }[domain] || domain

  const lines = items.map(item => {
    const d = item.data || {}
    const parts = []
    if (d.name)    parts.push(d.name)
    if (d.title)   parts.push(d.title)
    if (d.person)  parts.push(d.person)
    if (d.item)    parts.push(d.item)
    if (d.type)    parts.push(d.type)
    if (d.date)    parts.push(`Date: ${d.date}`)
    if (d.dueDate) parts.push(`Due: ${d.dueDate}`)
    if (d.school)  parts.push(`School: ${d.school}`)
    if (d.age)     parts.push(`Age: ${d.age}`)
    if (d.budget)  parts.push(`Budget: ₹${d.budget}`)
    if (d.status)  parts.push(`Status: ${d.status}`)
    if (d.priority) parts.push(`Priority: ${d.priority}`)
    if (d.member)  parts.push(`For: ${d.member}`)
    return parts.join(' | ')
  }).filter(Boolean)

  const memoryText = `${domainLabel}: ${lines.join(' || ')}`
  const profile = await prismaClient.userProfile.findUnique({ where: { userId } })
  const existing = Array.isArray(profile?.aiMemories) ? profile.aiMemories : []
  const filtered = existing.filter(e => !String(e?.text || '').startsWith(`${domainLabel}:`))
  const updated = [{ text: memoryText, type: `family_${domain}`, updatedAt: new Date().toISOString() }, ...filtered].slice(0, 50)
  await prismaClient.userProfile.upsert({
    where: { userId },
    update: { aiMemories: updated },
    create: { userId, aiMemories: updated },
  })
}

// ── GET all items for a domain ────────────────────────────────────────────────
familyItemsRouter.get('/:domain', async (req, res) => {
  try {
    const items = await prisma.familyItem.findMany({
      where: { userId: req.user.id, domain: req.params.domain },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ items: items.map(fmt) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST create item ──────────────────────────────────────────────────────────
familyItemsRouter.post('/:domain', async (req, res) => {
  try {
    const { type, data, remindAt } = req.body
    if (!type || !data) return res.status(400).json({ error: 'type and data required' })
    let remindAtDate = null
    if (remindAt) {
      remindAtDate = new Date(remindAt)
      if (isNaN(remindAtDate.getTime())) remindAtDate = null
    }
    const item = await prisma.familyItem.create({
      data: { userId: req.user.id, domain: req.params.domain, type, data, remindAt: remindAtDate },
    })
    await syncFamilyMemory(req.user.id, req.params.domain, prisma)
    const formatted = fmt(item)
    emit(req.app.get('io'), req.user.id, `family:${req.params.domain}:created`, formatted)
    res.status(201).json({ item: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── PATCH update item ─────────────────────────────────────────────────────────
familyItemsRouter.patch('/:domain/:id', async (req, res) => {
  try {
    const existing = await prisma.familyItem.findUnique({ where: { id: req.params.id } })
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: 'Not found' })
    const { data, done, remindAt } = req.body
    let remindAtDate = existing.remindAt
    if (remindAt !== undefined) {
      remindAtDate = remindAt ? new Date(remindAt) : null
      if (remindAtDate && isNaN(remindAtDate.getTime())) remindAtDate = null
    }
    const updated = await prisma.familyItem.update({
      where: { id: req.params.id },
      data: {
        ...(data !== undefined && { data }),
        ...(done !== undefined && { done: Boolean(done) }),
        remindAt: remindAtDate,
      },
    })
    await syncFamilyMemory(req.user.id, req.params.domain, prisma)
    const formatted = fmt(updated)
    emit(req.app.get('io'), req.user.id, `family:${req.params.domain}:updated`, formatted)
    res.json({ item: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── DELETE item ───────────────────────────────────────────────────────────────
familyItemsRouter.delete('/:domain/:id', async (req, res) => {
  try {
    const existing = await prisma.familyItem.findUnique({ where: { id: req.params.id } })
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: 'Not found' })
    await prisma.familyItem.delete({ where: { id: req.params.id } })
    await syncFamilyMemory(req.user.id, req.params.domain, prisma)
    emit(req.app.get('io'), req.user.id, `family:${req.params.domain}:deleted`, { id: req.params.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Reminder poller — fires family:alert every 60s for due items ──────────────
export function startFamilyReminderPoller(io) {
  setInterval(async () => {
    try {
      const now = new Date()
      const windowEnd = new Date(now.getTime() + 60 * 1000)
      const due = await prisma.familyItem.findMany({
        where: { done: false, remindAt: { gte: now, lte: windowEnd } },
      })
      for (const item of due) {
        const d = item.data || {}
        io.to(`u:${item.userId}`).emit('family:alert', {
          id: item.id, domain: item.domain, type: item.type,
          title: d.title || d.name || d.item || d.person || 'Reminder',
          remindAt: item.remindAt,
        })
      }
    } catch { /* silent */ }
  }, 60 * 1000)
}
