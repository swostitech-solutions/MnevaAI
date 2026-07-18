import express from 'express'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'

const router = express.Router()

// Source metadata — icon + type mapping
const SOURCE_META = {
  sms:       { icon: '📱', type: 'sms' },
  whatsapp:  { icon: '💬', type: 'whatsapp' },
  instagram: { icon: '📸', type: 'instagram' },
  flipkart:  { icon: '🛍️', type: 'shopping' },
  amazon:    { icon: '📦', type: 'shopping' },
  swiggy:    { icon: '🍛', type: 'food' },
  zomato:    { icon: '🍕', type: 'food' },
  phonepe:   { icon: '💸', type: 'payment' },
  gpay:      { icon: '💸', type: 'payment' },
  paytm:     { icon: '💸', type: 'payment' },
  uber:      { icon: '🚗', type: 'booking' },
  ola:       { icon: '🚗', type: 'booking' },
  twitter:   { icon: '🐦', type: 'social' },
  linkedin:  { icon: '💼', type: 'social' },
  youtube:   { icon: '▶️', type: 'social' },
  generic:   { icon: '🔔', type: 'info' },
}

function detectSource(appName = '', title = '') {
  const s = (appName + ' ' + title).toLowerCase()
  for (const key of Object.keys(SOURCE_META)) {
    if (s.includes(key)) return key
  }
  return 'generic'
}

function isRelevant(title = '', body = '') {
  const text = (title + ' ' + body).toLowerCase()
  const spam = /(promo|sale|offer|unsubscribe|newsletter|advertisement|ads|deal|discount|cashback offer|% off)/i
  const important = /(otp|payment|order|deliver|remind|due|urgent|meeting|appointment|deadline|task|schedule|bill|verify|renew|respond|reply|failed|declined|blocked|alert)/i
  if (spam.test(text) && !important.test(text)) return false
  return true
}

// ── Unified notification ingest endpoint ─────────────────────────────────────
// Accepts from Android forwarders (Macrodroid, Tasker, Automate, custom apps)
// Body: { userEmail OR userId, appName, title, body, packageName? }
// Header: x-notify-secret (optional but recommended)
router.post('/push', async (req, res) => {
  try {
    // Secret check
    const secret = process.env.NOTIFY_WEBHOOK_SECRET?.trim()
    if (secret) {
      const incoming = req.headers['x-notify-secret'] || req.body.secret
      if (incoming !== secret) return res.status(401).json({ error: 'Invalid secret' })
    }

    const { userId, userEmail, userPhone, appName = '', title = '', body = '', packageName = '', icon } = req.body
    if (!title && !body) return res.status(400).json({ error: 'title or body required' })

    // Resolve user
    let user = null
    if (userId)    user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user && userEmail) user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user && userPhone) user = await prisma.user.findFirst({ where: { phone: userPhone } })
    if (!user) return res.status(404).json({ error: 'User not found. Provide userId, userEmail, or userPhone.' })

    // Relevance filter
    if (!isRelevant(title, body)) {
      return res.json({ success: true, skipped: true, reason: 'Classified as promotional/spam' })
    }

    const source = detectSource(appName || packageName, title)
    const meta = SOURCE_META[source] || SOURCE_META.generic
    const displayTitle = `${meta.icon} ${title}`
    const preview = String(body || '').slice(0, 200)

    const notification = await prisma.notification.create({
      data: {
        userId: user.id,
        title: displayTitle,
        message: JSON.stringify({
          source,
          appName: appName || packageName || source,
          preview,
          body,
          packageName: packageName || null,
          relevant: true,
        }),
      },
    })

    const payload = {
      id: notification.id,
      title: displayTitle,
      body: preview,
      type: meta.type,
      source,
      appName: appName || packageName || source,
      ts: notification.createdAt.toISOString(),
      relevant: true,
    }

    const io = req.app.get('io')
    if (io) {
      io.to(`u:${user.id}`).emit('notification:created', payload)
      io.to(`u:${user.id}`).emit('app:notification', payload)
    }

    logger.info(`Notification ingested: ${source} → ${user.email} — "${title.slice(0, 60)}"`)
    res.json({ success: true, notification: payload })
  } catch (err) {
    logger.error('Notify push error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Status endpoint — returns userId + webhook URL for setup ─────────────────
router.get('/setup/:userEmail', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.params.userEmail } })
    if (!user) return res.status(404).json({ error: 'User not found' })
    const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`
    res.json({
      userId: user.id,
      webhookUrl: `${base}/api/notify/push`,
      secret: process.env.NOTIFY_WEBHOOK_SECRET ? '(set in .env)' : '(not set — open)',
      instructions: {
        android: 'Use Macrodroid or Tasker to POST notification data to webhookUrl',
        body: { userId: user.id, appName: '{app_name}', title: '{title}', body: '{text}', packageName: '{package}' },
        header: process.env.NOTIFY_WEBHOOK_SECRET ? { 'x-notify-secret': '(your secret)' } : {},
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
