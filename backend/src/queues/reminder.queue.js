import { Queue, Worker } from 'bullmq'
import { getRedisClient } from '../config/redis.js'
import { logger } from '../config/logger.js'

let queue

export function getReminderQueue() {
  if (!queue) {
    queue = new Queue('reminder', {
      connection: getRedisClient(),
    })
  }
  return queue
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
      const { userId, message, time, domain } = job.data || {}
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

      return { ok: true, userId, message }
    },
    { connection: getRedisClient() }
  )

  worker.on('failed', (job, err) => {
    logger.error(`Reminder job failed: ${job?.id} ${err.message}`)
  })

  return worker
}
