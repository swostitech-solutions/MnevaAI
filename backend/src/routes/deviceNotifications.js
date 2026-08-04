import express from 'express'
import { createHash, randomUUID } from 'crypto'
import { prisma } from '../config/prisma.js'

const router = express.Router()
const hashToken = token => createHash('sha256').update(String(token || '')).digest('hex')

function analyse(title = '', body = '', appName = '') {
  const text = `${title} ${body} ${appName}`.toLowerCase()
  if (/(unsubscribe|newsletter|advertisement|promo|sale|discount|cashback offer|% off|deal)/i.test(text)) return { priority: 0, relevant: false, reason: 'promotional' }
  if (/(fraud|suspicious|unauthori[sz]ed|security alert|account blocked|card blocked|transaction failed|payment failed|declined|otp|one.time password)/i.test(text)) return { priority: 100, relevant: true, reason: 'security_or_payment' }
  if (/(payment|credited|debited|due today|overdue|urgent|deadline|appointment|meeting|flight|boarding|delivery today|medicine|emergency)/i.test(text)) return { priority: 85, relevant: true, reason: 'time_sensitive' }
  if (/(bill|reminder|task|schedule|respond|reply|verify|renew|order|deliver)/i.test(text)) return { priority: 65, relevant: true, reason: 'action_needed' }
  return { priority: 25, relevant: false, reason: 'low_signal' }
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
        message: JSON.stringify({ source: 'android', appName: source, packageName, preview: String(body).slice(0, 300), body: String(body), priority: analysis.priority, reason: analysis.reason, postedAt: postedAt || new Date().toISOString(), relevant: true }),
      },
    })

    let task = null
    if (analysis.priority >= 85) {
      task = await prisma.task.create({
        data: {
          userId: device.userId,
          title: title || source,
          description: `Important ${source} alert · priority:${analysis.priority} · ref:${sourceId}`,
          status: 'PENDING',
        },
      })
    }

    await prisma.deviceNotificationToken.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } })
    const payload = { id: notification.id, title: notification.title, body: String(body).slice(0, 300), type: 'info', source: 'android', appName: source, priority: analysis.priority, ts: notification.createdAt.toISOString(), relevant: true }
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
