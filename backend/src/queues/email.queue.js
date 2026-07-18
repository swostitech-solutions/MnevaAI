import { Queue, Worker } from 'bullmq'
import { getRedisClient } from '../config/redis.js'
import { logger } from '../config/logger.js'

let queue

export function getEmailQueue() {
  if (!queue) {
    queue = new Queue('email', {
      connection: getRedisClient(),
    })
  }
  return queue
}

export async function enqueueEmail(job = {}) {
  const emailQueue = getEmailQueue()
  return emailQueue.add('send-email', job, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  })
}

export function startEmailWorker() {
  const worker = new Worker(
    'email',
    async (job) => {
      const { userId, emailId, draft, recipient } = job.data || {}
      logger.info(`📧 Email job ${job.id} — provider not connected, logging to ledger`)

      if (userId) {
        const { prisma } = await import('../config/prisma.js')
        await prisma.notification.create({
          data: {
            userId,
            title: 'Email delivery pending',
            message: `Email to ${recipient || 'recipient'} is queued — connect Gmail in Settings to enable sending.`,
          },
        })
      }

      return { ok: false, reason: 'email_provider_not_connected', jobId: job.id }
    },
    { connection: getRedisClient() }
  )

  worker.on('failed', (job, err) => {
    logger.error(`Email job failed: ${job?.id} ${err.message}`)
  })

  return worker
}
