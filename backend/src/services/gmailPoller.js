import { listEmails, getEmailBody } from './gmail.service.js'
import { userStore } from '../models/userStore.js'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'
import { sendEmail } from './gmail.service.js'

const activePollers = new Map()
const POLL_INTERVAL_MS = 60_000

async function generateReplyDraft(email, userName) {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
    if (!apiKey || apiKey.includes('replace')) return null

    const body = (email.body || email.preview || '').slice(0, 1500)
    const payload = {
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are ${userName}'s AI Chief of Staff. Write a concise, professional reply draft to the email below. Match a natural human tone. Return ONLY the reply body text — no subject line, no "Dear...", no sign-off needed. Keep it under 100 words.`,
        },
        {
          role: 'user',
          content: `From: ${email.from}\nSubject: ${email.subject}\n\n${body}`,
        },
      ],
      temperature: 0.4,
      stream: false,
    }
    const res = await fetch(`${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch {
    return null
  }
}

async function pollOnce(userId, io) {
  try {
    const user = await userStore.getById(userId)
    if (!user?.preferences?.gmail?.tokens?.refresh_token) return

    const { emails } = await listEmails(user, 'unread', 10)
    if (!emails?.length) return

    const state = activePollers.get(userId)
    if (!state) return

    const newEmails = emails.filter(e => !state.lastSeenIds.has(e.id))
    if (!newEmails.length) return

    emails.forEach(e => state.lastSeenIds.add(e.id))

    for (const email of newEmails) {
      // fetch full body for better draft quality
      let fullEmail = email
      try {
        const body = await getEmailBody(user, email.id)
        fullEmail = { ...email, body: body.body }
      } catch { /* use preview fallback */ }

      const draft = await generateReplyDraft(fullEmail, user.name || 'User')

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

      io.to(`u:${userId}`).emit('gmail:notification', {
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
    }

    logger.info(`Gmail poller: ${newEmails.length} new email(s) for user ${userId}`)
  } catch (err) {
    logger.debug(`Gmail poll skipped for ${userId}: ${err.message}`)
  }
}

export async function sendGmailReply(userId, emailId, recipient, subject, draft) {
  const user = await userStore.getById(userId)
  return sendEmail(user, recipient, `Re: ${subject}`, draft)
}

export function startGmailPoller(userId, io) {
  if (activePollers.has(userId)) return

  const state = { lastSeenIds: new Set(), timer: null }
  activePollers.set(userId, state)

  // seed existing unread IDs first, THEN start polling so old emails never trigger cards
  userStore.getById(userId).then(async (user) => {
    if (!user?.preferences?.gmail?.tokens?.refresh_token) {
      state.timer = setInterval(() => pollOnce(userId, io), POLL_INTERVAL_MS)
      return
    }
    try {
      const { emails } = await listEmails(user, 'unread', 50)
      emails?.forEach(e => state.lastSeenIds.add(e.id))
      logger.info(`Gmail poller seeded ${state.lastSeenIds.size} existing unread IDs for user ${userId}`)
    } catch { /* not connected yet */ }
    // start polling only after seed is done
    state.timer = setInterval(() => pollOnce(userId, io), POLL_INTERVAL_MS)
  })

  logger.info(`Gmail poller started for user ${userId}`)
}

export function stopGmailPoller(userId) {
  const state = activePollers.get(userId)
  if (!state) return
  clearInterval(state.timer)
  activePollers.delete(userId)
  logger.info(`Gmail poller stopped for user ${userId}`)
}
