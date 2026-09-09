import { Queue, Worker } from 'bullmq'
import { getBullRedisClient } from '../config/redis.js'
import { logger } from '../config/logger.js'
import { prisma } from '../config/prisma.js'
import { sendPushToUser } from '../services/pushService.js'
import { getDueSoonItems } from '../services/fullSummary.js'

const CRON_PATTERN = '*/5 * * * *' // every 5 minutes
const REPEAT_JOB_ID = 'advance-reminder-main'
const SCAN_WINDOW_MS = 6 * 60 * 1000 // slightly wider than the 5-min cadence so a slow tick never skips a lead time
const DEFAULT_LEAD_TIMES = [30, 5]

let queue

export function getAdvanceReminderQueue() {
  if (!queue) {
    queue = new Queue('advance-reminder', { connection: getBullRedisClient() })
  }
  return queue
}

// Idempotent — BullMQ dedupes a repeatable job whose repeat options are
// identical to one already registered, so this is safe to call on every
// server boot without stacking a second scanner.
export async function scheduleAdvanceReminderScan() {
  const q = getAdvanceReminderQueue()
  await q.add(
    'run-advance-reminder-scan',
    {},
    { repeat: { pattern: CRON_PATTERN }, jobId: REPEAT_JOB_ID },
  )
  logger.info(`⏰ Advance-reminder scan scheduled — "${CRON_PATTERN}"`)
}

function formatLeadTime(minutes) {
  if (minutes < 60) return `${minutes} min`
  if (minutes % 60 === 0) return `${minutes / 60} hr${minutes / 60 !== 1 ? 's' : ''}`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function startAdvanceReminderWorker() {
  const worker = new Worker(
    'advance-reminder',
    async () => {
      const now = Date.now()
      // Only users with at least one registered device can receive a push,
      // and only they need their due-dated items scanned at all.
      const recipients = await prisma.pushToken.findMany({ select: { userId: true }, distinct: ['userId'] })
      logger.info(`⏰ Running advance-reminder scan for ${recipients.length} user(s)`)

      let sent = 0
      for (const { userId } of recipients) {
        try {
          const [user, items] = await Promise.all([
            prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } }),
            getDueSoonItems(userId),
          ])
          const leadTimes = Array.isArray(user?.preferences?.notificationLeadTimes) && user.preferences.notificationLeadTimes.length
            ? user.preferences.notificationLeadTimes
            : DEFAULT_LEAD_TIMES

          for (const item of items) {
            for (const leadMinutes of leadTimes) {
              const fireAt = item.dueDate.getTime() - leadMinutes * 60 * 1000
              // Only items whose trigger moment falls inside the window this
              // tick is responsible for — already-past or still-future
              // trigger moments are left for an earlier/later tick.
              if (fireAt > now || fireAt <= now - SCAN_WINDOW_MS) continue

              try {
                // The unique (userId, itemType, itemId, leadMinutes) constraint
                // is the actual dedup mechanism — a duplicate create throws
                // and is simply skipped, no read-then-write race possible.
                await prisma.reminderSchedule.create({
                  data: { userId, itemType: item.itemType, itemId: item.itemId, leadMinutes },
                })
              } catch (err) {
                if (err.code === 'P2002') continue // already sent for this lead time
                throw err
              }

              await sendPushToUser(userId, {
                title: '⏰ Coming up',
                body: `${item.title} in ${formatLeadTime(leadMinutes)}`,
                data: { type: 'advance_reminder', itemType: item.itemType, itemId: item.itemId, leadMinutes },
              })
              sent++
            }
          }
        } catch (err) {
          logger.warn(`Advance-reminder scan failed for user=${userId}: ${err.message}`)
        }
      }
      return { ok: true, recipients: recipients.length, sent }
    },
    { connection: getBullRedisClient() },
  )

  worker.on('failed', (job, err) => {
    logger.error(`Advance-reminder job failed: ${job?.id} ${err.message}`)
  })

  return worker
}
