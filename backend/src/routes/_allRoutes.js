// agent.js
import express from 'express'
import { runLangGraphOrchestrator } from '../agents/langGraphOrchestrator.js'
import { getAgentRegistrySnapshot, plannerAgent, researcherAgent } from '../agents/registry.js'
import { memoryService } from '../services/memory.service.js'
import { ledger } from '../services/ledgerService.js'
import { userStore } from '../models/userStore.js'
import { prisma } from '../config/prisma.js'
import { transcribeAudio } from '../services/transcription.service.js'
import { listEmails, getEmailBody, sendEmail } from '../services/gmail.service.js'
import { createEventIfConnected } from '../services/calendar.service.js'
import multer from 'multer'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

export const agentRouter = express.Router()
agentRouter.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages[] required' })
    const user = await userStore.getById(req.user.id) || req.user

    const sessionContext = await memoryService.getSessionSnapshot(req.user.id)
    const recentMemory = await memoryService.recall(messages[messages.length - 1]?.content || '', req.user.id, 5)
    const onboardingProfile = await prisma.userProfile.findUnique({ where: { userId: req.user.id } })

    // ── Fetch live connected data so AI knows real user data ──────────────
    const liveData = {}
    await Promise.allSettled([
      // Google Fit / Health
      (async () => {
        try {
          const { getHealthData } = await import('../services/googleFit.service.js')
          liveData.health = await getHealthData(user)
        } catch {}
      })(),
      // Google Contacts summary
      (async () => {
        try {
          const { listContacts } = await import('../services/googleContacts.service.js')
          const result = await listContacts(user, { pageSize: 20 })
          liveData.contacts = { total: result.total, sample: result.contacts.slice(0, 10).map(c => ({ name: c.displayName, phone: c.phone, email: c.email, org: c.organization })) }
        } catch {}
      })(),
      // Calendar upcoming events
      (async () => {
        try {
          const { listEvents } = await import('../services/calendar.service.js')
          const now = new Date()
          const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          const events = await listEvents(user, now.toISOString(), weekLater.toISOString(), 10)
          liveData.calendar = (events || []).slice(0, 10).map(e => ({ title: e.summary || e.title, start: e.start?.dateTime || e.start?.date, meetLink: e.hangoutLink || e.meetLink || null }))
        } catch {}
      })(),
      // Gmail unread count + recent subjects
      (async () => {
        try {
          const { listEmails } = await import('../services/gmail.service.js')
          const result = await listEmails(user, 'unread', 5)
          liveData.emails = { unreadCount: result.unreadCount || 0, recent: (result.emails || []).slice(0, 5).map(e => ({ subject: e.subject, from: e.from, preview: e.preview })) }
        } catch {}
      })(),
    ])

    const result = await runLangGraphOrchestrator({
      messages: messages.slice(-20),
      user,
      context: {
        sessionContext,
        recentMemory,
        onboardingContext: onboardingProfile || null,
        liveData,
      },
    })

    res.json({
      ...result,
      sessionContext,
      memories: recentMemory,
      ts: new Date().toISOString(),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

agentRouter.post('/orchestrate', async (req, res) => {
  try {
    const { messages = [] } = req.body
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages[] required' })

    const user = await userStore.getById(req.user.id) || req.user
    const sessionContext = await memoryService.getSessionSnapshot(req.user.id)
    const recentMemory = await memoryService.recall(messages[messages.length - 1]?.content || '', req.user.id, 5)
    const onboardingProfile = await prisma.userProfile.findUnique({ where: { userId: req.user.id } })

    const result = await runLangGraphOrchestrator({
      messages: messages.slice(-20),
      user,
      context: { sessionContext, recentMemory, onboardingContext: onboardingProfile || null },
    })

    res.json({
      ...result,
      sessionContext,
      memories: recentMemory,
      ts: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

agentRouter.post('/planner', async (req, res) => {
  try {
    const output = await plannerAgent.run(req.body)
    res.json(output)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

agentRouter.post('/researcher', async (req, res) => {
  try {
    const output = await researcherAgent.run(req.body)
    res.json(output)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

agentRouter.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    let file = req.file

    // React Native sends base64 JSON instead of multipart FormData
    if (!file && req.body?.audioBase64) {
      const base64 = String(req.body.audioBase64).replace(/^data:[^;]+;base64,/, '')
      const buffer = Buffer.from(base64, 'base64')
      if (!buffer.length) return res.status(400).json({ error: 'Empty audio data received' })
      file = {
        buffer,
        originalname: req.body.fileName || 'voice.m4a',
        mimetype: req.body.mimeType || 'audio/m4a',
        size: buffer.length,
      }
    }

    if (!file) return res.status(400).json({ error: 'audio file is required' })
    const result = await transcribeAudio(file)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

agentRouter.post('/draft', async (req, res) => {
  try {
    const { subject, from, preview, body } = req.body
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
    if (!apiKey) return res.status(503).json({ error: 'AI not configured' })
    const content = `From: ${from || ''}\nSubject: ${subject || ''}\n\n${body || preview || ''}`
    const r = await fetch(`${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: `You are ${req.user?.name || 'the user'}'s AI Chief of Staff. Write a concise professional reply to the email below. Return ONLY the reply body — no subject, no greeting, no sign-off. Under 100 words.` },
          { role: 'user', content },
        ],
        temperature: 0.4, stream: false,
      }),
    })
    const data = await r.json().catch(() => ({}))
    const draft = data.choices?.[0]?.message?.content?.trim() || ''
    res.json({ draft })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

agentRouter.get('/ledger', async (req, res) => {
  const entries = await ledger.getByUser(req.user.id)
  res.json({ entries, total: entries.length })
})
agentRouter.get('/registry', (_req, res) => {
  res.json(getAgentRegistrySnapshot())
})
agentRouter.post('/approve', async (req, res) => {
  await prisma.trustScore.upsert({
    where: { userId: req.user.id },
    update: { approvedActions: { increment: 1 }, score: { increment: 1 } },
    create: { userId: req.user.id, approvedActions: 1, score: 1 },
  })
  res.json({ actionId: req.body.actionId, status: 'approved', ts: new Date().toISOString() })
})
agentRouter.post('/deny', async (req, res) => {
  await prisma.trustScore.upsert({
    where: { userId: req.user.id },
    update: { rejectedActions: { increment: 1 }, score: { decrement: 1 } },
    create: { userId: req.user.id, rejectedActions: 1, score: -1 },
  })
  res.json({ actionId: req.body.actionId, status: 'denied', ts: new Date().toISOString() })
})

// dashboard.js
export const dashboardRouter = express.Router()
dashboardRouter.get('/brief', async (req, res) => {
  const [notifications, completed, pendingTasks] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.user.id, read: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.agentLedger.findMany({
      where: {
        userId: req.user.id,
        status: 'completed',
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.task.findMany({
      where: { userId: req.user.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])
  res.json({
    generatedAt: new Date().toISOString(),
    greeting: `Hello, ${req.user.name || 'there'}`,
    summary: notifications.length ? `${notifications.length} items need your attention.` : 'No pending items from your connected data yet.',
    weather: null,
    pendingActions: notifications
      .filter(n => !n.title?.startsWith('\ud83d\udce7'))
      .map(n => ({
      id: n.id,
      type: 'notification',
      urgency: 'medium',
      title: n.title,
      detail: n.message,
      domain: 'notifications',
    })),
    autoCompleted: completed.map(entry => {
      let input = {}, result = {}
      try { const p = JSON.parse(entry.action); input = p.input || {}; result = p.result || {} } catch {}
      const TOOL_LABELS = {
        schedule_event:       `📅 ${input.title || 'Meeting scheduled'}`,
        set_reminder:         `🔔 ${input.message || 'Reminder set'}`,
        initiate_payment:     `💸 Payment ₹${input.amount || ''} to ${input.payee || ''}`,
        send_email:           `📧 Email sent to ${input.recipient || ''}`,
        draft_reply:          `✏️ Draft reply prepared`,
        book_cab:             `🚗 Cab booked: ${input.pickup || ''} → ${input.destination || ''}`,
        order_food:           `🍔 Food ordered from ${input.restaurant || ''}`,
        get_daily_brief:      `💡 Daily brief generated`,
        get_portfolio:        `📈 Portfolio snapshot fetched`,
        get_spending_summary: `💰 Spending summary checked`,
        get_health_data:      `🏥 Health data synced`,
        query_bills:          `🧾 Bills checked`,
        personal_search:      `🔍 Search: "${input.query || ''}"`,
      }
      const label = TOOL_LABELS[entry.tool] || entry.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      const detail = entry.tool === 'schedule_event'
        ? `${input.attendees?.length ? `With ${input.attendees[0]}` : ''}${input.start ? ` · ${new Date(input.start).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}`.trim()
        : entry.tool === 'initiate_payment' ? `Status: ${result.status || 'done'}`
        : entry.tool === 'book_cab' ? `Est. fare: ${result.fare || 'N/A'}`
        : ''
      return {
        title: label,
        detail,
        tool: entry.tool,
        time: entry.createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      }
    }),
    commitments: [],
    followUpRadar: [],
    insights: [],
    pendingTasks: pendingTasks.map(t => ({ id: t.id, title: t.title, description: t.description, createdAt: t.createdAt })),
    stats: { actionsAuto: completed.length, trustScore: 0 },
  })
})
dashboardRouter.get('/sidebar-counts', async (req, res) => {
  try {
    const userId = req.user.id
    const user = await userStore.getById(userId)

    // Daily Brief: unread notifications count
    const briefCount = await prisma.notification.count({ where: { userId, read: false } })

    // Finance: due bills count (from DB ledger pending payments)
    const financeCount = await prisma.agentLedger.count({
      where: { userId, tool: 'initiate_payment', status: 'pending_approval' },
    })

    // Communications: unread emails via Gmail
    let commsCount = 0
    try {
      const { listEmails } = await import('../services/gmail.service.js')
      const result = await listEmails(user, 'unread', 1)
      commsCount = result?.unreadCount || 0
    } catch { commsCount = 0 }

    // Health: upcoming appointments (from preferences or tasks)
    const healthCount = await prisma.task.count({
      where: { userId, status: 'PENDING', title: { contains: 'appointment', mode: 'insensitive' } },
    }).catch(() => 0)

    res.json({ brief: briefCount, finance: financeCount, comms: commsCount, health: healthCount })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

dashboardRouter.get('/stats', async (req, res) => {
  const [actionsTotal, actionsAuto, trustScore] = await Promise.all([
    prisma.agentLedger.count({ where: { userId: req.user.id } }),
    prisma.agentLedger.count({ where: { userId: req.user.id, status: 'completed' } }),
    prisma.trustScore.findUnique({ where: { userId: req.user.id } }),
  ])
  res.json({ hoursSaved: 0, actionsTotal, actionsAuto, trustScore: trustScore?.score || 0 })
})

// finance.js
export const financeRouter = express.Router()
financeRouter.get('/bills',     (_req, res) => res.json([]))
financeRouter.get('/portfolio', (_req, res) => res.json({ totalInvested: 0, totalCurrent: 0, returnPct: 0, cibilScore: null, cibilGrade: null, netWorth: 0, holdings: [], accounts: [] }))
financeRouter.get('/spending',  (req, res) => res.json({ period: req.query.period || 'month', total: 0, budget: 0, savingsRate: 0, categories: [], insights: [] }))
financeRouter.post('/pay',      async (req, res) => {
  const entry = await ledger.add({ userId: req.user.id, tool: 'initiate_payment', input: req.body, result: { status: 'pending_approval' }, status: 'pending_approval' })
  res.json({ actionId: entry.id, status: 'pending_approval', ...req.body })
})

// comms.js
function gmailErrorResponse(err, res) {
  const msg = err?.message || ''
  if (msg.includes('Gmail is not connected')) return res.status(409).json({ error: 'gmail_not_connected', message: 'Gmail is not connected. Go to Settings → Integrations to connect.' })
  if (msg.includes('Gmail API has not been used') || msg.includes('is disabled')) return res.status(503).json({ error: 'gmail_api_disabled', message: 'Gmail API is disabled in Google Cloud Console. Visit https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=769657045922 and click Enable.' })
  if (msg.includes('invalid_grant') || msg.includes('Token has been expired')) return res.status(401).json({ error: 'gmail_token_expired', message: 'Gmail token expired. Please reconnect Gmail in Settings → Integrations.' })
  return res.status(500).json({ error: 'gmail_error', message: msg })
}

export const commsRouter = express.Router()
commsRouter.get('/emails', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const { filter = 'all', limit = 20 } = req.query
    const result = await listEmails(user, filter, Number(limit))
    res.json(result)
  } catch (err) { gmailErrorResponse(err, res) }
})
commsRouter.get('/emails/:id', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const email = await getEmailBody(user, req.params.id)
    res.json(email)
  } catch (err) { gmailErrorResponse(err, res) }
})
commsRouter.get('/emails/:id/draft', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const email = await getEmailBody(user, req.params.id)
    res.json({ email, draft: '' })
  } catch (err) { gmailErrorResponse(err, res) }
})
commsRouter.post('/emails/:id/send', async (req, res) => {
  try {
    const { recipient, subject, draft } = req.body
    if (!recipient || !subject || !draft) return res.status(400).json({ error: 'recipient, subject, and draft are required' })
    const user = await userStore.getById(req.user.id)
    const result = await sendEmail(user, recipient, subject, draft)
    res.json({ success: true, result })
  } catch (err) { gmailErrorResponse(err, res) }
})

// health.js
export const healthRouter = express.Router()
healthRouter.get('/metrics', async (req, res) => {
  try {
    const { getHealthData } = await import('../services/googleFit.service.js')
    const user = await userStore.getById(req.user.id)
    const data = await getHealthData(user)
    // auto-log today's Google Fit data to the calendar log
    if (data.source === 'google_fit') {
      const today = new Date().toISOString().slice(0, 10)
      const prefs = user?.preferences || {}
      if (!prefs.healthLog) prefs.healthLog = {}
      prefs.healthLog[today] = {
        source: 'google_fit',
        lastSynced: data.lastUpdated,
        steps:     data.steps?.value     ?? null,
        heartRate: data.heartRate?.value ?? null,
        sleep:     data.sleep?.value     ?? null,
        calories:  data.calories?.consumed ?? null,
        weight:    data.weight?.value    ?? null,
        height:    data.height?.value    ?? null,
      }
      await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } }).catch(() => {})
    }
    res.json(data)
  } catch (err) {
    if (err.message?.includes('not connected')) {
      return res.json({ period: req.query.period || 'today', lastUpdated: new Date().toISOString(), source: 'none', weeklySteps: [] })
    }
    res.status(500).json({ error: err.message })
  }
})
healthRouter.get('/appointments', (_req, res) => res.json({ appointments: [] }))
healthRouter.get('/medications',  (_req, res) => res.json({ medications: [] }))

// POST /api/health-data/sync — accepts data from iOS Shortcut / Apple Health / manual
healthRouter.post('/sync', async (req, res) => {
  try {
    const { steps, heartRate, sleep, calories, weight, height, source = 'manual' } = req.body
    const user = await userStore.getById(req.user.id)
    const prefs = user?.preferences || {}
    const today = new Date().toISOString().slice(0, 10)
    const existing = prefs.healthSync || {}
    // merge — only overwrite fields that are provided
    prefs.healthSync = {
      ...existing,
      source,
      lastSynced: new Date().toISOString(),
      date: today,
      ...(steps     != null && { steps:     Number(steps) }),
      ...(heartRate != null && { heartRate: Number(heartRate) }),
      ...(sleep     != null && { sleep:     Number(sleep) }),
      ...(calories  != null && { calories:  Number(calories) }),
      ...(weight    != null && { weight:    Number(weight) }),
      ...(height    != null && { height:    Number(height) }),
    }
    // also persist to per-date log for calendar view
    if (!prefs.healthLog) prefs.healthLog = {}
    prefs.healthLog[today] = { ...prefs.healthSync }
    await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } })
    res.json({ success: true, synced: prefs.healthSync })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/health-data/log — full per-date history for calendar
healthRouter.get('/log', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const log = user?.preferences?.healthLog || {}
    res.json({ log })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/health-data/log/:date — edit a specific date entry
healthRouter.put('/log/:date', async (req, res) => {
  try {
    const { date } = req.params
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid_date' })
    const { steps, heartRate, sleep, calories, weight, height, source } = req.body
    const user = await userStore.getById(req.user.id)
    const prefs = user?.preferences || {}
    if (!prefs.healthLog) prefs.healthLog = {}
    const existing = prefs.healthLog[date] || {}
    prefs.healthLog[date] = {
      ...existing,
      lastSynced: new Date().toISOString(),
      ...(source     != null && { source }),
      ...(steps      != null && { steps:     Number(steps) }),
      ...(heartRate  != null && { heartRate: Number(heartRate) }),
      ...(sleep      != null && { sleep:     Number(sleep) }),
      ...(calories   != null && { calories:  Number(calories) }),
      ...(weight     != null && { weight:    Number(weight) }),
      ...(height     != null && { height:    Number(height) }),
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } })
    res.json({ success: true, entry: prefs.healthLog[date] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/health-data/log/:date — delete a specific date entry
healthRouter.delete('/log/:date', async (req, res) => {
  try {
    const { date } = req.params
    const user = await userStore.getById(req.user.id)
    const prefs = user?.preferences || {}
    if (prefs.healthLog?.[date]) delete prefs.healthLog[date]
    await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
// lifeops.js
export const lifeopsRouter = express.Router()
lifeopsRouter.get('/rides',    (_req, res) => res.json({ rides: [] }))
lifeopsRouter.get('/wishlist', (_req, res) => res.json({ items: [] }))
lifeopsRouter.post('/cab',     async (req, res) => {
  const entry = await ledger.add({ userId: req.user.id, tool: 'book_cab', input: req.body, result: { status: 'pending_provider_connection' }, status: 'pending_provider_connection' })
  res.json({ bookingId: entry.id, status: 'pending_provider_connection', ...req.body })
})
lifeopsRouter.post('/food',    async (req, res) => {
  const entry = await ledger.add({ userId: req.user.id, tool: 'order_food', input: req.body, result: { status: 'pending_provider_connection' }, status: 'pending_provider_connection' })
  res.json({ orderId: entry.id, status: 'pending_provider_connection', ...req.body })
})

// twin.js
export const twinRouter = express.Router()
twinRouter.get('/diary', async (req, res) => res.json({ entries: await ledger.getByUser(req.user.id) }))
twinRouter.get('/ledger',async (req, res) => res.json({ entries: await ledger.getByUser(req.user.id) }))

// notifications.js
export const notifRouter = express.Router()
notifRouter.get('/', async (req, res) => {
  const notifications = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } })
  res.json({
    notifications: notifications.map(n => {
      const isEmail = n.title?.startsWith('\ud83d\udce7')
      const isSms = n.title?.startsWith('\ud83d\udcf1')
      let meta = {}
      if (isEmail || isSms) {
        try { meta = JSON.parse(n.message) } catch { meta = { preview: n.message } }
      }
      if (!isEmail && !isSms) {
        try { meta = JSON.parse(n.message) } catch { meta = { preview: n.message } }
      }
      return {
        id: n.id,
        title: n.title,
        body: isEmail || isSms ? `From: ${meta.from || ''} \u2014 ${meta.preview || ''}` : meta?.preview || meta?.body || n.message,
        type: isEmail ? 'email' : isSms ? 'sms' : (meta?.source === 'calendar' ? 'calendar' : meta?.source === 'whatsapp' ? 'whatsapp' : meta?.source === 'instagram' ? 'instagram' : meta?.source === 'shopping' ? 'shopping' : meta?.source === 'food' ? 'food' : meta?.source === 'payment' ? 'payment' : meta?.source === 'booking' ? 'booking' : meta?.source === 'reminder' ? 'reminder' : 'info'),
        emailId: isEmail ? meta.emailId || null : null,
        smsId: isSms ? meta.smsId || null : null,
        from: meta.from || null,
        source: meta.source || null,
        appName: meta.appName || null,
        meetLink: meta.meetLink || null,
        eventStart: meta.start || null,
        relevant: typeof meta.relevant === 'boolean' ? meta.relevant : true,
        read: n.read,
        ts: n.createdAt.toISOString(),
      }
    }),
    unreadCount: notifications.filter(n => !n.read).length,
  })
})
notifRouter.patch('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } })
  res.json({ success: true })
})
notifRouter.patch('/:id/read', async (req, res) => {
  const notification = await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } })
  res.json({ id: notification.id, read: notification.read })
})

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function classifyRelevance(title, body, source) {
  const text = normalizeText(`${title} ${body}`)
  const important = /(remind|due|urgent|follow up|action required|meeting|appointment|deadline|task|todo|schedule|bill|payment|verify|renew|deliver|respond|reply)/i
  const unimportant = /(promo|sale|offer|unsubscribe|newsletter|spam|advertisement|ads|promotion|deal)/i
  if (unimportant.test(text)) return false
  if (important.test(text)) return true
  if (source === 'reminder' || source === 'task' || source === 'calendar') return true
  return true
}

function classifyType(source, title, body) {
  const normalizedSource = normalizeText(source)
  if (normalizedSource === 'sms') return 'sms'
  if (normalizedSource === 'reminder') return 'reminder'
  if (normalizedSource === 'email') return 'email'
  const text = normalizeText(`${title} ${body}`)
  if (text.includes('reminder') || text.includes('due') || text.includes('appointment')) return 'reminder'
  return 'info'
}

export const smsRouter = express.Router()
smsRouter.post('/webhook', async (req, res) => {
  try {
    const secret = process.env.SMS_WEBHOOK_SECRET?.trim()
    const incomingSecret = req.headers['x-sms-webhook-secret'] || req.body.secret || req.query.secret
    if (secret && incomingSecret !== secret) {
      return res.status(401).json({ error: 'Invalid webhook secret' })
    }

    const { userId, from, body, preview, smsId, threadId } = req.body
    if (!userId) return res.status(400).json({ error: 'userId is required' })

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ error: 'User not found' })

    const previewText = preview || String(body || '').slice(0, 150)
    const notification = await prisma.notification.create({
      data: {
        userId,
        title: `📱 SMS from ${from || 'Unknown'}`,
        message: JSON.stringify({ source: 'sms', from, preview: previewText, smsBody: body || '', smsId: smsId || null, threadId: threadId || null, relevant: true }),
      },
    })

    const io = req.app.get('io')
    const payload = {
      id: notification.id,
      title: notification.title,
      body: previewText,
      type: 'sms',
      from,
      smsBody: body || '',
      smsId: smsId || null,
      threadId: threadId || null,
      ts: notification.createdAt.toISOString(),
      source: 'sms',
      relevant: true,
    }
    if (io) {
      io.to(`u:${userId}`).emit('sms:notification', payload)
      io.to(`u:${userId}`).emit('notification:created', payload)
    }

    res.json({ success: true, notification: payload })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

smsRouter.post('/ingest', async (req, res) => {
  try {
    const secret = process.env.NOTIFICATION_WEBHOOK_SECRET?.trim()
    const incomingSecret = req.headers['x-notification-webhook-secret'] || req.body.secret || req.query.secret
    if (secret && incomingSecret !== secret) {
      return res.status(401).json({ error: 'Invalid webhook secret' })
    }

    const { userId, title, message, source = 'generic', sourceId, relevant } = req.body
    if (!userId || !title || !message) {
      return res.status(400).json({ error: 'userId, title, and message are required' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ error: 'User not found' })

    const bodyText = typeof message === 'string' ? message : JSON.stringify(message)
    const shouldStore = relevant === false ? false : classifyRelevance(title, bodyText, source)
    if (!shouldStore) {
      return res.json({ success: true, skipped: true, reason: 'Notification classified as not relevant' })
    }

    const previewText = String(bodyText).slice(0, 150)
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message: JSON.stringify({ source, sourceId: sourceId || null, preview: previewText, body: bodyText, relevant: shouldStore }),
      },
    })

    const type = classifyType(source, title, bodyText)
    const payload = {
      id: notification.id,
      title: notification.title,
      body: previewText,
      type,
      source,
      sourceId: sourceId || null,
      relevant: shouldStore,
      ts: notification.createdAt.toISOString(),
    }
    const io = req.app.get('io')
    if (io) {
      io.to(`u:${userId}`).emit('notification:created', payload)
    }

    // If the incoming payload includes a start time and the user has calendar connected, create an event
    const start = req.body.start || (typeof message === 'object' && message.start) || null
    const end = req.body.end || (typeof message === 'object' && message.end) || null
    if (start) {
      try {
        const event = {
          summary: title,
          description: bodyText,
          start: start.includes('T') ? { dateTime: start } : { date: start },
          end: end ? (end.includes('T') ? { dateTime: end } : { date: end }) : (start.includes('T') ? { dateTime: new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString() } : { date: start }),
        }
        await createEventIfConnected(userId, event)
      } catch (err) {
        // fail silently — calendar integration is best-effort
      }
    }

    res.json({ success: true, notification: payload })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// trust.js
export const trustRouter = express.Router()
trustRouter.get('/status', async (req, res) => {
  const [user, trustScore] = await Promise.all([
    userStore.getById(req.user.id),
    prisma.trustScore.findUnique({ where: { userId: req.user.id } }),
  ])
  res.json({ currentLevel: user?.trustLevel || 1, trustScore: trustScore?.score || 0, plan: user?.plan || 'Free' })
})
trustRouter.post('/upgrade', async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { trustLevel: { increment: 1 } },
  })
  res.json({ success: true, newLevel: user.trustLevel })
})

trustRouter.patch('/level', async (req, res) => {
  const { level } = req.body
  if (!level || level < 1 || level > 4) return res.status(400).json({ error: 'level must be 1–4' })
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { trustLevel: Number(level) },
  })
  res.json({ success: true, newLevel: user.trustLevel })
})

trustRouter.get('/settings', async (req, res) => {
  const [user, trustScore] = await Promise.all([
    userStore.getById(req.user.id),
    prisma.trustScore.findUnique({ where: { userId: req.user.id } }),
  ])
  res.json({
    currentLevel: user?.trustLevel || 1,
    trustScore: trustScore?.score || 0,
    approvedActions: trustScore?.approvedActions || 0,
    rejectedActions: trustScore?.rejectedActions || 0,
    plan: user?.plan || 'Free',
    preferences: user?.preferences || {},
  })
})

trustRouter.patch('/settings', async (req, res) => {
  const { autonomy, privacy, notifications: notifPrefs } = req.body
  const user = await userStore.getById(req.user.id)
  const prefs = user?.preferences || {}
  if (autonomy)      prefs.autonomy      = { ...(prefs.autonomy || {}),      ...autonomy }
  if (privacy)       prefs.privacy       = { ...(prefs.privacy || {}),       ...privacy }
  if (notifPrefs)    prefs.notifications = { ...(prefs.notifications || {}), ...notifPrefs }
  await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } })
  res.json({ success: true, preferences: prefs })
})

// search.js
export const searchRouter = express.Router()
searchRouter.get('/', async (req, res) => {
  const q = String(req.query.q || '')
  if (q.length < 2) return res.json({ query: q, results: [], total: 0 })

  const [notifications, ledgers, memories] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.user.id, OR: [{ title: { contains: q, mode: 'insensitive' } }, { message: { contains: q, mode: 'insensitive' } }] },
      take: 10,
    }),
    prisma.agentLedger.findMany({
      where: { userId: req.user.id, OR: [{ tool: { contains: q, mode: 'insensitive' } }, { action: { contains: q, mode: 'insensitive' } }] },
      take: 10,
    }),
    memoryService.recall(q, req.user.id, 5),
  ])

  const results = [
    ...notifications.map(n => ({ type: 'notification', title: n.title, snippet: n.message, date: n.createdAt.toISOString() })),
    ...ledgers.map(l => ({ type: 'ledger', title: l.tool, snippet: l.action, date: l.createdAt.toISOString() })),
    ...memories.map(item => ({
      type: 'memory',
      title: item.payload?.type || 'memory',
      snippet: item.payload?.text || '',
      date: item.payload?.createdAt || new Date().toISOString(),
      score: item.score,
    })),
  ]

  res.json({ query: q, results, total: results.length })
})
