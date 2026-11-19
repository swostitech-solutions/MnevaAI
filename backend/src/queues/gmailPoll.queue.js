import { Queue, Worker } from 'bullmq'
import { getBullRedisClient } from '../config/redis.js'
import { logger } from '../config/logger.js'
import { prisma } from '../config/prisma.js'
import { userStore } from '../models/userStore.js'
import { emitToUser } from '../services/realtime.js'
import { listEmails, getEmailBody, classifyEmailsUrgency, sendEmail } from '../services/gmail.service.js'
import { sendPushToUser } from '../services/pushService.js'
import { applyModelCompat } from '../services/openaiCompat.js'

// L-13: this used to be one setInterval per connected user, all started at
// boot in one tight loop — every restart made every user's 60s tick land
// in the same instant forever after. One repeatable job now re-discovers
// every Gmail-connected user fresh each tick (same `prefs.gmail?.tokens`
// check server.js already did at boot) and fans out over them with a
// concurrency cap and a small stagger between batches, so Gmail's API
// never sees every connected user's request at once.
const POLL_INTERVAL_MS = 60_000
const REPEAT_JOB_ID = 'gmail-poll-main'
const CONCURRENCY = 5
const STAGGER_MS = 400

// lastSeenIds persists in-process across ticks, same guarantee the old
// per-user Map had (reseeded from scratch after a restart — a handful of
// already-unread emails re-surfacing once is a much smaller cost than a
// DB write on every single poll tick for state nothing else needs).
const lastSeenByUser = new Map()

let queue

export function getGmailPollQueue() {
  if (!queue) {
    queue = new Queue('gmail-poll', { connection: getBullRedisClient() })
  }
  return queue
}

export async function scheduleGmailPoll() {
  const q = getGmailPollQueue()
  await q.add('run-gmail-poll-tick', {}, { repeat: { every: POLL_INTERVAL_MS }, jobId: REPEAT_JOB_ID })
  logger.info(`📬 Gmail poll scheduled — every ${POLL_INTERVAL_MS / 1000}s`)
}

async function generateReplyDraft(email, userName, userId) {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey || apiKey.includes('replace')) return null

    let scheduleContext = ''
    try {
      const tasks = await prisma.task.findMany({
        where: { userId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
      const notifications = await prisma.notification.findMany({
        where: {
          userId,
          OR: [
            { message: { contains: '"source":"reminder"' } },
            { message: { contains: '"source":"calendar"' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
      const scheduled = notifications.map(n => {
        try {
          const meta = JSON.parse(n.message)
          if (!meta.start) return null
          const t = new Date(meta.start).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
          return `• ${n.title.replace(/^[^a-zA-Z]+/, '')} — ${t}`
        } catch { return null }
      }).filter(Boolean)
      const pendingTasks = tasks.map(t => `• ${t.title}`)
      const all = [...scheduled, ...pendingTasks]
      if (all.length) scheduleContext = `\n\nUSER'S CURRENT SCHEDULE & PENDING TASKS:\n${all.join('\n')}\n\nIMPORTANT: If this email requests a meeting or asks for availability, check the schedule above for conflicts and mention them in the draft reply. Suggest an alternative time if there is a conflict.`
    } catch { /* schedule context is best-effort */ }

    const body = (email.body || email.preview || '').slice(0, 1500)
    const payload = applyModelCompat({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content: `You are ${userName}'s AI Chief of Staff. Write a concise, professional reply draft to the email below. Match a natural human tone. Return ONLY the reply body text — no subject line, no "Dear...", no sign-off needed. Keep it under 120 words.${scheduleContext}`,
        },
        {
          role: 'user',
          content: `From: ${email.from}\nSubject: ${email.subject}\n\n${body}`,
        },
      ],
    }, { temperature: 0.4 })
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000)
    let res
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
    const data = await res.json().catch(() => ({}))
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch {
    return null
  }
}

async function pollOneUser(userId) {
  try {
    const user = await userStore.getById(userId)
    if (!user?.preferences?.gmail?.tokens?.refresh_token) {
      lastSeenByUser.delete(userId) // disconnected since the last tick — drop stale state
      return
    }

    const { emails } = await listEmails(user, 'unread', 10)
    if (!emails?.length) return

    // First time this process has seen this user — seed from current
    // unread mail without notifying, same as the old poller's "seed
    // existing unread IDs first" step, so pre-existing mail never fires a
    // notification just because the server restarted.
    if (!lastSeenByUser.has(userId)) {
      const { emails: seedEmails } = await listEmails(user, 'unread', 50).catch(() => ({ emails: [] }))
      lastSeenByUser.set(userId, new Set((seedEmails || []).map(e => e.id)))
      logger.info(`Gmail poller seeded ${lastSeenByUser.get(userId).size} existing unread IDs for user ${userId}`)
      return
    }

    const seen = lastSeenByUser.get(userId)
    const newEmails = emails.filter(e => !seen.has(e.id))
    if (!newEmails.length) return
    emails.forEach(e => seen.add(e.id))

    const urgency = await classifyEmailsUrgency(
      newEmails.map(e => ({ id: e.id, from: e.from, subject: e.subject, snippet: e.preview })),
    ).catch(() => new Map())

    for (const email of newEmails) {
      let fullEmail = email
      try {
        const body = await getEmailBody(user, email.id)
        fullEmail = { ...email, body: body.body }
      } catch { /* use preview fallback */ }

      const isUrgent = !!urgency.get(email.id)?.urgent
      const draft = isUrgent ? await generateReplyDraft(fullEmail, user.name || 'User', userId) : null

      const notif = await prisma.notification.create({
        data: {
          userId,
          title: `📧 ${email.subject || '(No subject)'}`,
          message: JSON.stringify({
            from: email.from,
            preview: (email.preview || '').slice(0, 150),
            emailId: email.id,
          }),
        },
      })

      emitToUser(userId, 'gmail:notification', {
        id: notif.id,
        emailId: email.id,
        title: notif.title,
        body: (email.preview || '').slice(0, 150),
        from: email.from,
        subject: email.subject,
        preview: email.preview,
        emailBody: fullEmail.body || '',
        suggestedReply: draft,
        ts: notif.createdAt.toISOString(),
      })
      if (isUrgent) {
        sendPushToUser(userId, { title: notif.title, body: `From ${email.from || 'unknown'}`, data: { type: 'gmail', emailId: email.id } })
      }
    }

    logger.info(`Gmail poller: ${newEmails.length} new email(s) for user ${userId}`)
  } catch (err) {
    logger.debug(`Gmail poll skipped for ${userId}: ${err.message}`)
  }
}

// Exported for a focused unit test on the batching math itself, without
// having to mock prisma/userStore/Gmail just to exercise chunk boundaries.
export function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

async function runGmailPollTick() {
  const users = await prisma.user.findMany({ select: { id: true, preferences: true } })
  const connected = users.filter(u => u.preferences?.gmail?.tokens?.refresh_token).map(u => u.id)
  const batches = chunkArray(connected, CONCURRENCY)

  for (let i = 0; i < batches.length; i++) {
    await Promise.all(batches[i].map(userId => pollOneUser(userId)))
    if (i < batches.length - 1) await new Promise(r => setTimeout(r, STAGGER_MS))
  }
}

export function startGmailPollWorker() {
  const worker = new Worker('gmail-poll', async () => { await runGmailPollTick() }, {
    connection: getBullRedisClient(),
    concurrency: 1, // one tick at a time — fan-out concurrency is handled inside runGmailPollTick
  })
  worker.on('failed', (job, err) => logger.error(`Gmail poll tick failed: ${err.message}`))
  return worker
}

// Still exported for sendGmailReply's existing call sites (socket's
// gmail:send_reply handler) — unrelated to the polling mechanism itself.
export async function sendGmailReply(userId, emailId, recipient, subject, draft) {
  const user = await userStore.getById(userId)
  return sendEmail(user, recipient, `Re: ${subject}`, draft)
}
