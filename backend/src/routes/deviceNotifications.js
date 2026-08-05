import express from 'express'
import { createHash, randomUUID } from 'crypto'
import { prisma } from '../config/prisma.js'

const router = express.Router()
const hashToken = token => createHash('sha256').update(String(token || '')).digest('hex')

function analyse(title = '', body = '', appName = '') {
  const text = `${title} ${body} ${appName}`.toLowerCase()
  // Marketing should never take a place in the briefing simply because it
  // contains words such as "urgent" or "offer expires today".
  if (/(unsubscribe|newsletter|advertisement|promo(?:tion)?|sale|discount|cashback offer|% off|coupon|deal)/i.test(text)) {
    return { priority: 0, relevant: false, reason: 'promotional', category: 'other' }
  }
  if (/(fraud|suspicious|unauthori[sz]ed|security alert|account blocked|card blocked|transaction failed|payment failed|declined|one[ -]?time (?:password|code)|\botp\b)/i.test(text)) {
    return { priority: 100, relevant: true, reason: 'security_or_payment', category: 'payments' }
  }
  if (/(payment|credited|debited|upi|bank|due today|overdue|urgent|deadline|appointment|meeting|flight|boarding|gate change|delivery today|medicine|emergency|ambulance)/i.test(text)) {
    const category = /(payment|credited|debited|upi|bank|bill)/i.test(text) ? 'payments' : 'time_sensitive'
    return { priority: 85, relevant: true, reason: 'time_sensitive', category }
  }
  if (/(bill|reminder|task|schedule|respond|reply|verify|renew|order|deliver|ride|driver|cab)/i.test(text)) {
    return { priority: 65, relevant: true, reason: 'action_needed', category: 'action_needed' }
  }
  return { priority: 25, relevant: false, reason: 'low_signal', category: 'other' }
}

router.post('/ingest', async (req, res) => {
  try {
    const token = req.get('x-mneva-device-token')
    if (!token) return res.status(401).json({ error: 'Device token required' })
    const device = await prisma.deviceNotificationToken.findUnique({ where: { tokenHash: hashToken(token) } })
    if (!device) return res.status(401).json({ error: 'Invalid device token' })

    const { packageName = '', appName = '', title = '', body = '', notificationKey = '', postedAt } = req.body || {}
    if (!title && !body) return res.status(400).json({ error: 'title or body required' })
    const analysis = analyse(title, body, appName)
    const preferences = await prisma.user.findUnique({ where: { id: device.userId }, select: { preferences: true } })
    const notificationPrefs = preferences?.preferences?.notifications || {}
    // Respect the controls in the app. Security alerts remain enabled unless
    // the user revokes Android notification-listener access altogether.
    if (analysis.category === 'payments' && notificationPrefs.payments === false) {
      return res.json({ accepted: false, reason: 'payments_disabled', priority: analysis.priority })
    }
    if (!analysis.relevant) return res.json({ accepted: false, reason: analysis.reason, priority: analysis.priority })

    const sourceId = `android:${notificationKey || createHash('sha256').update(`${packageName}|${title}|${body}|${postedAt || ''}`).digest('hex')}`
    const existing = await prisma.notification.findUnique({ where: { userId_sourceId: { userId: device.userId, sourceId } } })
    if (existing) return res.json({ accepted: true, duplicate: true, priority: existing.priority })

    const source = appName || packageName || 'Android app'
    const notification = await prisma.notification.create({
      data: {
        userId: device.userId,
        sourceId,
        priority: analysis.priority,
        title: `🔔 ${title || source}`,
        message: JSON.stringify({ source: 'android', appName: source, packageName, preview: String(body).slice(0, 300), body: String(body), priority: analysis.priority, reason: analysis.reason, category: analysis.category, postedAt: postedAt || new Date().toISOString(), relevant: true }),
      },
    })

    let task = null
    if (analysis.priority >= 85) {
      task = await prisma.task.create({
        data: {
          userId: device.userId,
          title: title || source,
          description: `Important ${source} alert · ${String(body).slice(0, 180)} · priority:${analysis.priority}`,
          status: 'PENDING',
        },
      })
    }

    await prisma.deviceNotificationToken.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } })
    const type = analysis.category === 'payments' ? 'payment' : analysis.category === 'time_sensitive' ? 'reminder' : 'info'
    const payload = { id: notification.id, title: notification.title, body: String(body).slice(0, 300), type, source: 'android', appName: source, priority: analysis.priority, ts: notification.createdAt.toISOString(), relevant: true }
    const io = req.app.get('io')
    if (io) {
      io.to(`u:${device.userId}`).emit('notification:created', payload)
      if (task) io.to(`u:${device.userId}`).emit('task:created', task)
    }
    res.status(201).json({ accepted: true, priority: analysis.priority, notification: payload, taskId: task?.id || null })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export function createDeviceToken() {
  return `mnd_${randomUUID().replaceAll('-', '')}_${randomUUID().replaceAll('-', '')}`
}
export { hashToken }
export default router
