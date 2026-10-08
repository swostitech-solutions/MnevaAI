import { Queue, Worker } from 'bullmq'
import { getBullRedisClient } from '../config/redis.js'
import { logger } from '../config/logger.js'
import { prisma } from '../config/prisma.js'
import { emitToUser } from '../services/realtime.js'
import { sendPushToUser } from '../services/pushService.js'
import { istDayKey } from '../routes/callLog.js'

// Evening, not midnight — checking at 8pm IST still gives the user the rest
// of the day to reach out before the reminder fires, instead of flagging
// "you haven't talked to them" at 9am when the day's barely started.
const CRON_PATTERN = '0 20 * * *'
const TIMEZONE = 'Asia/Kolkata'
const REPEAT_JOB_ID = 'call-log-reminder-main'

let queue

export function getCallLogReminderQueue() {
  if (!queue) {
    queue = new Queue('call-log-reminder', { connection: getBullRedisClient() })
  }
  return queue
}

export async function scheduleCallLogReminderScan() {
  const q = getCallLogReminderQueue()
  await q.add(
    'run-call-log-reminder-scan',
    {},
    { repeat: { pattern: CRON_PATTERN, tz: TIMEZONE }, jobId: REPEAT_JOB_ID },
  )
  logger.info(`📞 Call log reminder scan scheduled — "${CRON_PATTERN}" (${TIMEZONE})`)
}

// One frequent contact, one user: did today break their usual pattern?
async function checkContact(userId, contact, todayKey) {
  const lastCallKey = istDayKey(contact.lastCallAt.getTime())
  if (lastCallKey === todayKey) return false // already talked today — nothing to flag

  const lastReminderKey = contact.lastReminderAt ? istDayKey(contact.lastReminderAt.getTime()) : null
  if (lastReminderKey === todayKey) return false // already nudged about this one today

  const name = contact.contactName || contact.phoneNumber
  const title = `📞 Haven't talked to ${name} today`
  const body = `You usually talk to ${name} most days — no call logged with them today yet.`

  await prisma.notification.create({
    data: { userId, title, message: JSON.stringify({ source: 'call_log_reminder', preview: body }) },
  })
  emitToUser(userId, 'notification:created', { title })
  await sendPushToUser(userId, { title, body, data: { type: 'call_log_reminder', phoneNumber: contact.phoneNumber } })

  await prisma.callContact.update({ where: { id: contact.id }, data: { lastReminderAt: new Date() } })
  return true
}

export function startCallLogReminderWorker() {
  const worker = new Worker(
    'call-log-reminder',
    async () => {
      const todayKey = istDayKey(Date.now())
      const contacts = await prisma.callContact.findMany({ where: { isFrequent: true } })
      logger.info(`📞 Running call log reminder scan — ${contacts.length} frequent contact(s) across all users`)
      let reminded = 0
      for (const contact of contacts) {
        try {
          if (await checkContact(contact.userId, contact, todayKey)) reminded++
        } catch (err) {
          logger.warn(`Call log reminder check failed for contact=${contact.id}: ${err.message}`)
        }
      }
      return { ok: true, reminded }
    },
    { connection: getBullRedisClient() },
  )

  worker.on('failed', (job, err) => {
    logger.error(`Call log reminder job failed: ${job?.id} ${err.message}`)
  })

  return worker
}
