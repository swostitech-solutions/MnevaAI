import express from 'express'
import { createHash, randomUUID } from 'crypto'
import { prisma } from '../config/prisma.js'
import { sendPushToUser } from '../services/pushService.js'
import { applyModelCompat } from '../services/openaiCompat.js'

const router = express.Router()
const hashToken = token => createHash('sha256').update(String(token || '')).digest('hex')

// Device-side redaction is the first line of defence. Redact again at the
// server boundary so a malformed/outdated client can never persist OTP-like
// values in notifications, tasks, or logs.
const redactSensitiveText = value => String(value || '')
  .slice(0, 1000)
  .replace(/\b\d{4,8}\b/g, '••••')

// Fallback keyword heuristic — used ONLY when the AI classification below is
// unavailable (no/invalid OPENAI_API_KEY, or the call fails/times out). Same
// class of limitation the old email-urgency detector had: it can only catch
// notifications that happen to use one of these exact words, so a genuinely
// important WhatsApp message phrased differently would silently vanish. Kept
// as a safety net only, not the primary decision-maker anymore.
function analyseByKeywords(title = '', body = '', appName = '') {
  const text = `${title} ${body} ${appName}`.toLowerCase()
  if (/(unsubscribe|newsletter|advertisement|promo(?:tion)?|sale|discount|cashback offer|% off|coupon|deal)/i.test(text)) {
    return { priority: 0, relevant: false, reason: 'promotional', category: 'other' }
  }
  if (/(fraud|suspicious|unauthori[sz]ed|security alert|account blocked|card blocked|transaction failed|payment failed|declined|one[ -]?time (?:password|code)|\botp\b)/i.test(text)) {
    return { priority: 100, relevant: true, reason: 'security_or_payment', category: 'payments' }
  }
  // Telecom recharge / plan-expiry (Jio, Airtel, Vi, BSNL, etc.) — checked
  // before the generic time_sensitive bucket below, which would otherwise
  // swallow these (they have an expiry "deadline") and hand them the same
  // canned "check the time and location, add a reminder" copy written for
  // calendar events, unrelated to recharging a plan.
  if (/(recharge|\bplan (?:expir|validity)|data pack|talktime|\bjio\b|\bairtel\b|\bvi\b|vodafone|\bbsnl\b)/i.test(text)) {
    return { priority: 80, relevant: true, reason: 'recharge', category: 'recharge' }
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

const VALID_REASONS = new Set(['security_or_payment', 'time_sensitive', 'action_needed', 'personal', 'promotional', 'low_signal', 'recharge'])
const VALID_CATEGORIES = new Set(['payments', 'time_sensitive', 'action_needed', 'personal', 'other', 'recharge'])

// Only genuinely high-priority phone alerts are kept — security/payment
// issues (100), time-sensitive events (85), recharge/plan-expiry (80).
// "action_needed" (65, e.g. a generic bill/task/order-status alert) and
// anything below is dropped entirely: not stored, not pushed, not shown in
// the notification feed or Priorities' AI Detected section (both read from
// the same Notification rows this route creates — see unreadAlerts in
// fullSummary.js). The Notification table's own priority default is 0 and
// no other notification creator in the codebase sets this field, so
// raising the bar here is the single place this actually needs to change.
const HIGH_PRIORITY_THRESHOLD = 70

// Real judgment of whether a captured notification — from any app, not just
// the ones with obvious finance/action keywords — actually needs the user's
// attention. A plain keyword scan only catches notifications phrased with
// one of a fixed set of words; this reads the actual content the way a
// person would, so a WhatsApp message like "can you call me in 10 min" gets
// caught even though it contains none of the old trigger words, while a
// mundane "lol" or a Instagram like notification correctly gets dropped.
async function analyseWithAI(title, body, appName) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey || apiKey.includes('replace') || !apiKey.startsWith('sk-')) return null
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)
  try {
    const payload = applyModelCompat({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content: 'You triage a single captured phone notification (it can be from any app — WhatsApp, Instagram, banking, delivery, a telecom operator, a game, etc.) for a busy person\'s personal assistant. Decide if it genuinely needs their attention. Mark relevant true for: payments/security/OTP issues, mobile recharge or plan/data-pack expiry (Jio, Airtel, Vi, BSNL, etc.), time-sensitive events (appointments, flights, deliveries today, medicine), things needing a response or action (bills, tasks, a direct personal message asking something), or emergencies. Mark relevant false for: promotional/marketing content, social media engagement noise (likes, follows, "X posted a new photo"), generic app updates, or casual chat with no real ask. "reason" must be one of: security_or_payment, recharge, time_sensitive, action_needed, personal, promotional, low_signal. "category" must be one of: payments, recharge, time_sensitive, action_needed, personal, other — use "recharge" specifically for mobile/DTH recharge or plan-validity-expiry notifications, not "time_sensitive" or "payments". "priority" is 0-100 (0 = ignore entirely, 100 = critical/urgent).',
        },
        {
          role: 'user',
          content: `App: ${appName || 'unknown'}\nTitle: ${title || '(none)'}\nBody: ${body || '(none)'}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'notification_triage',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              relevant: { type: 'boolean' },
              priority: { type: 'integer', minimum: 0, maximum: 100 },
              reason: { type: 'string', enum: [...VALID_REASONS] },
              category: { type: 'string', enum: [...VALID_CATEGORIES] },
            },
            required: ['relevant', 'priority', 'reason', 'category'],
            additionalProperties: false,
          },
        },
      },
    }, { temperature: 0, maxTokens: 200 })

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    if (typeof parsed.relevant !== 'boolean' || !VALID_REASONS.has(parsed.reason) || !VALID_CATEGORIES.has(parsed.category)) return null
    return {
      relevant: parsed.relevant,
      priority: Math.max(0, Math.min(100, Math.round(parsed.priority))),
      reason: parsed.reason,
      category: parsed.category,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

const PROMOTIONAL_PATTERN = /(unsubscribe|newsletter|advertisement|promo(?:tion)?|sale|discount|cashback offer|% off|coupon|deal)/i

async function analyse(title = '', body = '', appName = '') {
  // Unambiguous marketing spam never needs a model call to identify — this
  // pattern is narrow enough that it won't misfire on a genuine message,
  // and skipping the AI call here matters in practice since this kind of
  // notification is a large share of real-world volume.
  if (PROMOTIONAL_PATTERN.test(`${title} ${body} ${appName}`.toLowerCase())) {
    return { priority: 0, relevant: false, reason: 'promotional', category: 'other' }
  }
  const aiResult = await analyseWithAI(title, body, appName)
  if (aiResult) return aiResult
  return analyseByKeywords(title, body, appName)
}

router.post('/ingest', async (req, res) => {
  try {
    const token = req.get('x-mneva-device-token')
    if (!token) return res.status(401).json({ error: 'Device token required' })
    const device = await prisma.deviceNotificationToken.findUnique({ where: { tokenHash: hashToken(token) } })
    if (!device) return res.status(401).json({ error: 'Invalid device token' })

    const { packageName = '', appName = '', notificationKey = '', postedAt } = req.body || {}
    const title = redactSensitiveText(req.body?.title)
    const body = redactSensitiveText(req.body?.body)
    if (!title && !body) return res.status(400).json({ error: 'title or body required' })
    const analysis = await analyse(title, body, appName)
    const preferences = await prisma.user.findUnique({ where: { id: device.userId }, select: { preferences: true } })
    const notificationPrefs = preferences?.preferences?.notifications || {}
    // Respect the controls in the app. Security alerts remain enabled unless
    // the user revokes Android notification-listener access altogether.
    if (analysis.category === 'payments' && notificationPrefs.payments === false) {
      return res.json({ accepted: false, reason: 'payments_disabled', priority: analysis.priority })
    }
    if (!analysis.relevant) return res.json({ accepted: false, reason: analysis.reason, priority: analysis.priority })
    if (analysis.priority < HIGH_PRIORITY_THRESHOLD) {
      return res.json({ accepted: false, reason: 'below_priority_threshold', priority: analysis.priority })
    }

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

    await prisma.deviceNotificationToken.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } })
    const type = analysis.category === 'payments' ? 'payment' : analysis.category === 'time_sensitive' ? 'reminder' : 'info'
    const payload = { id: notification.id, title: notification.title, body: String(body).slice(0, 300), type, source: 'android', appName: source, priority: analysis.priority, ts: notification.createdAt.toISOString(), relevant: true }
    const io = req.app.get('io')
    if (io) {
      io.to(`u:${device.userId}`).emit('notification:created', payload)
    }
    sendPushToUser(device.userId, { title: payload.title, body: payload.body, data: { type: payload.type } })
    // Phone alerts are kept in the notification feed, never converted to a
    // Task — but they DO surface under Priorities' "AI Detected" section via
    // unreadAlerts (fullSummary.js), since that reads unread Notification
    // rows by priority, not by source. HIGH_PRIORITY_THRESHOLD above is what
    // keeps that section to genuinely important alerts instead of everything
    // that gets captured.
    res.status(201).json({ accepted: true, priority: analysis.priority, notification: payload })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export function createDeviceToken() {
  return `mnd_${randomUUID().replaceAll('-', '')}_${randomUUID().replaceAll('-', '')}`
}
export { hashToken }
export default router
