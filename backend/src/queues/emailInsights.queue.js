import { Queue, Worker } from 'bullmq'
import { getBullRedisClient } from '../config/redis.js'
import { logger } from '../config/logger.js'
import { prisma } from '../config/prisma.js'
import { userStore } from '../models/userStore.js'

// Morning, after the night's mail has settled but before the work day gets
// going — the Priorities wrap-up/follow-up sections should already have
// today's picture by the time the user actually opens the app.
const CRON_PATTERN = '0 8 * * *'
const TIMEZONE = 'Asia/Kolkata'
const REPEAT_JOB_ID = 'email-insights-main'

// Only look at recent sent mail — a 3-month-old "I'll send this by Friday"
// is stale, not an actionable commitment worth surfacing now.
const SCAN_WINDOW_DAYS = 10
// Don't nudge about a follow-up the same day it was sent — give a normal
// reply window before calling it "no reply yet".
const FOLLOW_UP_MIN_DAYS = 3
const MAX_EMAILS_PER_USER = 25

let queue

export function getEmailInsightsQueue() {
  if (!queue) {
    queue = new Queue('email-insights', { connection: getBullRedisClient() })
  }
  return queue
}

// Idempotent — same as the other scan schedulers, safe to call every boot.
export async function scheduleEmailInsightsScan() {
  const q = getEmailInsightsQueue()
  await q.add(
    'run-email-insights-scan',
    {},
    { repeat: { pattern: CRON_PATTERN, tz: TIMEZONE }, jobId: REPEAT_JOB_ID },
  )
  logger.info(`✉️ Email insights scan scheduled — "${CRON_PATTERN}" (${TIMEZONE})`)
}

async function scanUserEmails(userId) {
  const user = await userStore.getById(userId)
  if (!user?.preferences?.gmail?.tokens?.refresh_token) return // Gmail not connected — nothing to scan

  const { searchEmails, getEmailBody, classifySentEmailsForInsights } = await import('../services/gmail.service.js')

  const sent = await searchEmails(user, `in:sent newer_than:${SCAN_WINDOW_DAYS}d`, MAX_EMAILS_PER_USER)
  if (!sent.length) return

  const existingRows = await prisma.emailInsight.findMany({
    where: { userId, provider: 'gmail', messageId: { in: sent.map(e => e.id) } },
  })
  const existingByKey = new Map(existingRows.map(r => [`${r.messageId}:${r.type}`, r]))

  // Fetch each sent message's full thread — gives both the real recipient
  // (the "To" header of this specific message) and every other message in
  // the conversation tagged fromSelf, which is what tells a genuine reply
  // apart from the user's own follow-up-to-their-own-email.
  const threads = await Promise.all(sent.map(async (e) => {
    try { return { email: e, thread: await getEmailBody(user, e.id) } }
    catch { return null }
  }))

  // Resolve pending follow-ups that have since gotten a reply — checked
  // every scan regardless of whether this email needs (re-)classifying.
  for (const t of threads) {
    if (!t) continue
    const row = existingByKey.get(`${t.email.id}:follow_up`)
    if (!row || row.status !== 'pending') continue
    const hasReply = t.thread.messages.some(m => !m.fromSelf && new Date(m.date).getTime() > new Date(row.sentAt).getTime())
    if (hasReply) {
      await prisma.emailInsight.update({ where: { id: row.id }, data: { status: 'resolved' } }).catch(() => {})
    }
  }

  // Only classify emails that have never been scanned before for EITHER
  // type — once an email has a row (pending, dismissed, actioned or
  // resolved) its classification doesn't need redoing, only its reply
  // status (handled above).
  const candidates = threads.filter(t =>
    t && !existingByKey.has(`${t.email.id}:follow_up`) && !existingByKey.has(`${t.email.id}:commitment`)
  )
  if (!candidates.length) return

  const classified = await classifySentEmailsForInsights(
    candidates.map(t => ({ id: t.email.id, subject: t.email.subject, body: (t.thread.body || '').slice(0, 800) }))
  )
  if (!classified) return

  const rows = []
  const now = Date.now()
  for (const t of candidates) {
    const c = classified.get(t.email.id)
    if (!c) continue
    const sentAt = new Date(t.email.date)
    const daysSince = (now - sentAt.getTime()) / (24 * 60 * 60 * 1000)

    if (c.isFollowUp && daysSince >= FOLLOW_UP_MIN_DAYS) {
      const hasReply = t.thread.messages.some(m => !m.fromSelf && new Date(m.date).getTime() > sentAt.getTime())
      if (!hasReply) {
        rows.push({
          userId, provider: 'gmail', type: 'follow_up', messageId: t.email.id, threadId: t.thread.threadId || null,
          subject: t.email.subject, recipient: t.thread.to || null,
          snippet: c.followUpSnippet || t.email.snippet || '', sentAt, status: 'pending',
        })
      }
    }
    if (c.isCommitment) {
      rows.push({
        userId, provider: 'gmail', type: 'commitment', messageId: t.email.id, threadId: t.thread.threadId || null,
        subject: t.email.subject, recipient: t.thread.to || null,
        snippet: c.commitmentSnippet || t.email.snippet || '', sentAt,
        dueText: c.commitmentDueText || null, status: 'pending',
      })
    }
  }

  if (rows.length) {
    await prisma.emailInsight.createMany({ data: rows, skipDuplicates: true })
  }
}

// Outlook side of the same scan (audit item G-08 partial fix) — Graph has
// no single "get whole thread" call the way Gmail's getEmailBody does, so
// reply-checking goes through conversationHasReplyAfter per candidate
// instead of a pre-fetched thread; otherwise this mirrors scanUserEmails
// above field-for-field.
async function scanUserOutlookEmails(userId) {
  const user = await userStore.getById(userId)
  if (!user?.preferences?.outlook?.tokens?.refresh_token) return // Outlook not connected — nothing to scan

  const { listSentEmailsForInsights, getSentEmailPlainBody, conversationHasReplyAfter, getOutlookProfile } = await import('../services/outlook.service.js')
  const { classifySentEmailsForInsights } = await import('../services/gmail.service.js')

  const sent = await listSentEmailsForInsights(user, SCAN_WINDOW_DAYS, MAX_EMAILS_PER_USER)
  if (!sent.length) return

  const profile = await getOutlookProfile(user).catch(() => null)
  const selfEmail = profile?.mail || profile?.userPrincipalName || null

  const existingRows = await prisma.emailInsight.findMany({
    where: { userId, provider: 'outlook', messageId: { in: sent.map(e => e.id) } },
  })
  const existingByKey = new Map(existingRows.map(r => [`${r.messageId}:${r.type}`, r]))

  // Resolve pending follow-ups that have since gotten a reply.
  for (const e of sent) {
    const row = existingByKey.get(`${e.id}:follow_up`)
    if (!row || row.status !== 'pending' || !e.conversationId || !selfEmail) continue
    const hasReply = await conversationHasReplyAfter(user, e.conversationId, row.sentAt, selfEmail).catch(() => false)
    if (hasReply) {
      await prisma.emailInsight.update({ where: { id: row.id }, data: { status: 'resolved' } }).catch(() => {})
    }
  }

  const candidates = sent.filter(e =>
    !existingByKey.has(`${e.id}:follow_up`) && !existingByKey.has(`${e.id}:commitment`)
  )
  if (!candidates.length) return

  const bodies = await Promise.all(candidates.map(async (e) => {
    try { return { email: e, body: await getSentEmailPlainBody(user, e.id) } }
    catch { return { email: e, body: '' } }
  }))

  const classified = await classifySentEmailsForInsights(
    bodies.map(b => ({ id: b.email.id, subject: b.email.subject, body: (b.body || '').slice(0, 800) }))
  )
  if (!classified) return

  const rows = []
  const now = Date.now()
  for (const b of bodies) {
    const c = classified.get(b.email.id)
    if (!c) continue
    const sentAt = new Date(b.email.date)
    const daysSince = (now - sentAt.getTime()) / (24 * 60 * 60 * 1000)

    if (c.isFollowUp && daysSince >= FOLLOW_UP_MIN_DAYS) {
      const hasReply = selfEmail && b.email.conversationId
        ? await conversationHasReplyAfter(user, b.email.conversationId, sentAt.toISOString(), selfEmail).catch(() => false)
        : false
      if (!hasReply) {
        rows.push({
          userId, provider: 'outlook', type: 'follow_up', messageId: b.email.id, threadId: b.email.conversationId || null,
          subject: b.email.subject, recipient: b.email.to || null,
          snippet: c.followUpSnippet || b.email.snippet || '', sentAt, status: 'pending',
        })
      }
    }
    if (c.isCommitment) {
      rows.push({
        userId, provider: 'outlook', type: 'commitment', messageId: b.email.id, threadId: b.email.conversationId || null,
        subject: b.email.subject, recipient: b.email.to || null,
        snippet: c.commitmentSnippet || b.email.snippet || '', sentAt,
        dueText: c.commitmentDueText || null, status: 'pending',
      })
    }
  }

  if (rows.length) {
    await prisma.emailInsight.createMany({ data: rows, skipDuplicates: true })
  }
}

export function startEmailInsightsWorker() {
  const worker = new Worker(
    'email-insights',
    async () => {
      const users = await prisma.user.findMany({ select: { id: true } })
      logger.info(`✉️ Running email insights scan for ${users.length} user(s)`)
      let scanned = 0
      for (const { id: userId } of users) {
        // Independent try/catch per provider — one account's expired Gmail
        // token shouldn't also skip that same user's Outlook scan.
        try { await scanUserEmails(userId) }
        catch (err) { logger.warn(`Gmail insights scan failed for user=${userId}: ${err.message}`) }
        try { await scanUserOutlookEmails(userId) }
        catch (err) { logger.warn(`Outlook insights scan failed for user=${userId}: ${err.message}`) }
        scanned++
      }
      return { ok: true, scanned }
    },
    { connection: getBullRedisClient() },
  )

  worker.on('failed', (job, err) => {
    logger.error(`Email insights job failed: ${job?.id} ${err.message}`)
  })

  return worker
}
