import { Queue, Worker } from 'bullmq'
import { getRedisClient } from '../config/redis.js'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'

let queue

export function getWorkflowQueue() {
  if (!queue) {
    queue = new Queue('workflow', {
      connection: getRedisClient(),
    })
  }
  return queue
}

export async function enqueueWorkflow(job = {}) {
  const workflowQueue = getWorkflowQueue()
  return workflowQueue.add('run-workflow', job, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  })
}

export function startWorkflowWorker() {
  const worker = new Worker(
    'workflow',
    async (job) => {
      const { workflowId, userId } = job.data
      await prisma.workflow.update({
        where: { id: workflowId },
        data: { status: 'RUNNING' },
      })

      logger.info(`Running workflow ${workflowId} for ${userId}`)

      await prisma.workflowExecution.create({
        data: {
          workflowId,
          status: 'RUNNING',
        },
      })

      await prisma.workflow.update({
        where: { id: workflowId },
        data: { status: 'COMPLETED' },
      })

      await prisma.workflowExecution.updateMany({
        where: { workflowId, status: 'RUNNING' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
    },
    { connection: getRedisClient() }
  )

  worker.on('failed', (job, err) => {
    logger.error(`Workflow job failed: ${job?.id} ${err.message}`)
  })

  return worker
}
