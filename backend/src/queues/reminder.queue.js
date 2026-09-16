import { Queue, Worker } from 'bullmq'
import { getBullRedisClient } from '../config/redis.js'
import { logger } from '../config/logger.js'
import { sendPushToUser } from '../services/pushService.js'

let queue

export function getReminderQueue() {
  if (!queue) {
    queue = new Queue('reminder', {
      connection: getBullRedisClient(),
    })
  }
  return queue
}

// BullMQ jobs are one-shot — a "daily/weekly/monthly" reminder only actually
// recurs if each firing schedules its own next occurrence. Clamps the
// monthly case to the target month's last real day (Jan 31 -&gt; Feb 28/29)
// instead of letting Date's native month-overflow silently roll into March.
function nextOccurrence(date, repeat) {
  const next = new Date(date.getTime())
  if (repeat === 'daily') {
    next.setDate(next.getDate() + 1)
  } else if (repeat === 'weekly') {
    next.setDate(next.getDate() + 7)
  } else if (repeat === 'monthly') {
    const day = next.getDate()
    next.setDate(1)
    next.setMonth(next.getMonth() + 1)
    const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(day, daysInTargetMonth))
  } else {
    return null
  }
  return next
}

export async function enqueueReminder(job = {}) {
  const reminderQueue = getReminderQueue()
  let delayMs = 0
  if (job.time) {
    const target = new Date(job.time)
    if (!isNaN(target.getTime())) {
      delayMs = Math.max(0, target.getTime() - Date.now())
    }
  }
  return reminderQueue.add('send-reminder', job, {
    delay: delayMs,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  })
}

export function startReminderWorker(io) {
  const worker = new Worker(
    'reminder',
    async (job) => {
      const { userId, message, time, domain, repeat } = job.data || {}
      logger.info(`🔔 Reminder firing for user=${userId}: ${message}`)

      if (!userId || !message) {
        logger.warn(`Reminder job ${job.id} missing userId or message — skipping`)
        return { ok: false }
      }

      // Emit real-time alert directly to the user's socket room
      if (io) {
        io.to(`u:${userId}`).emit('reminder:alert', {
          id: job.id,
          message,
          time: time || new Date().toISOString(),
          domain: domain || 'general',
          ts: new Date().toISOString(),
        })
        logger.info(`✅ Reminder socket alert sent to user=${userId}`)
      }

      // This is the whole point of a reminder — it must reach the user even
      // when the app isn't open, which the socket emit above cannot do.
      sendPushToUser(userId, { title: 'Reminder', body: message, data: { type: 'reminder', domain, jobId: job.id } })

      if (repeat && repeat !== 'once' && time) {
        const next = nextOccurrence(new Date(time), repeat)
        if (next) {
          try {
            await enqueueReminder({ userId, message, time: next.toISOString(), domain, repeat })
            logger.info(`🔁 Recurring reminder (${repeat}) re-scheduled for user=${userId} at ${next.toISOString()}`)
          } catch (err) {
            logger.error(`Failed to re-schedule recurring reminder for user=${userId}: ${err.message}`)
          }
        }
      }

      return { ok: true, userId, message }
    },
    { connection: getBullRedisClient() }
  )

  worker.on('failed', (job, err) => {
    logger.error(`Reminder job failed: ${job?.id} ${err.message}`)
  })

  return worker
}
