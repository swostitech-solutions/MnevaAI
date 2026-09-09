import { Queue, Worker } from 'bullmq'
import { getBullRedisClient } from '../config/redis.js'
import { logger } from '../config/logger.js'
import { prisma } from '../config/prisma.js'
import { sendPushToUser } from '../services/pushService.js'
import { buildFullSummary } from '../services/fullSummary.js'

const CRON_PATTERN = '0 7 * * *' // 7:00 AM daily
const TIMEZONE = 'Asia/Kolkata'
const REPEAT_JOB_ID = 'daily-digest-main'

let queue

export function getDailyDigestQueue() {
  if (!queue) {
    queue = new Queue('daily-digest', { connection: getBullRedisClient() })
  }
  return queue
}

// BullMQ dedupes a repeatable job whose repeat options (pattern + tz) are
// identical to one already registered, so calling this on every server boot
// is safe — it will not stack a second 7 AM job on each redeploy.
export async function scheduleDailyDigest() {
  const q = getDailyDigestQueue()
  await q.add(
    'run-daily-digest',
    {},
    { repeat: { pattern: CRON_PATTERN, tz: TIMEZONE }, jobId: REPEAT_JOB_ID },
  )
  logger.info(`📅 Daily digest scheduled — "${CRON_PATTERN}" (${TIMEZONE})`)
}

// A short, single-line notification body — the full breakdown is only ever
// fetched on demand (get_full_summary / GET /api/dashboard/full-summary),
// this just tells the user there's something worth opening the app for.
function buildDigestMessage(counts) {
  const parts = []
  const push = (n, singular, plural) => { if (n) parts.push(`${n} ${n === 1 ? singular : plural}`) }
  push(counts.urgentEmails, 'urgent email', 'urgent emails')
  push(counts.unreadAlerts, 'important alert', 'important alerts')
  push(counts.pendingTasks, 'pending task', 'pending tasks')
  push(counts.financeDueSoon, 'payment due soon', 'payments due soon')
  push(counts.medicationRefills, 'medication refill', 'medication refills')
  push(counts.petReminders, 'pet reminder', 'pet reminders')
  push(counts.familyTasks, 'family task', 'family tasks')
  push(counts.familyUpcoming, 'family item', 'family items')
  return parts.length ? parts.slice(0, 4).join(', ') : null
}

export function startDailyDigestWorker() {
  const worker = new Worker(
    'daily-digest',
    async () => {
      // Only users with at least one registered device can be notified —
      // no point building a summary for someone who can't receive it.
      const recipients = await prisma.pushToken.findMany({ select: { userId: true }, distinct: ['userId'] })
      logger.info(`📅 Running daily digest for ${recipients.length} user(s) with a registered device`)

      let sent = 0
      for (const { userId } of recipients) {
        try {
          const summary = await buildFullSummary(userId)
          if (!summary.totalImportant) continue // nothing to report — skip, don't spam an empty notification
          const message = buildDigestMessage(summary.counts)
          if (!message) continue
          await sendPushToUser(userId, {
            title: '☀️ Your daily summary',
            body: message,
            data: { type: 'daily_digest', totalImportant: summary.totalImportant },
          })
          sent++
        } catch (err) {
          logger.warn(`Daily digest failed for user=${userId}: ${err.message}`)
        }
      }
      return { ok: true, recipients: recipients.length, sent }
    },
    { connection: getBullRedisClient() },
  )

  worker.on('failed', (job, err) => {
    logger.error(`Daily digest job failed: ${job?.id} ${err.message}`)
  })

  return worker
}
