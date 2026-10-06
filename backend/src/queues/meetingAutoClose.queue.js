import { Queue, Worker } from 'bullmq'
import { getBullRedisClient } from '../config/redis.js'
import { logger } from '../config/logger.js'
import { prisma } from '../config/prisma.js'
import { emitToUser } from '../services/realtime.js'

const CRON_PATTERN = '*/5 * * * *' // every 5 minutes — same cadence as the advance-reminder scan
const REPEAT_JOB_ID = 'meeting-autoclose-main'
// A meeting with no explicit end uses the same 1-hour default
// createMeetingWithGoogleMeet falls back to when one isn't given.
const DEFAULT_DURATION_MS = 60 * 60 * 1000
// Only scan notifications created within this window — a meeting that was
// scheduled (and never auto-closed, e.g. from before this feature existed)
// longer ago than this is left alone rather than retroactively closed; this
// is about closing meetings as they end going forward, not rewriting history.
const LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000 // 60 days

let queue

export function getMeetingAutoCloseQueue() {
  if (!queue) {
    queue = new Queue('meeting-autoclose', { connection: getBullRedisClient() })
  }
  return queue
}

// Idempotent — same as scheduleAdvanceReminderScan, safe to call every boot.
export async function scheduleMeetingAutoCloseScan() {
  const q = getMeetingAutoCloseQueue()
  await q.add(
    'run-meeting-autoclose-scan',
    {},
    { repeat: { pattern: CRON_PATTERN }, jobId: REPEAT_JOB_ID },
  )
  logger.info(`🔒 Meeting auto-close scan scheduled — "${CRON_PATTERN}"`)
}

export function startMeetingAutoCloseWorker() {
  const worker = new Worker(
    'meeting-autoclose',
    async () => {
      const now = Date.now()
      const notifs = await prisma.notification.findMany({
        where: {
          title: { contains: 'Meeting scheduled' },
          createdAt: { gte: new Date(now - LOOKBACK_MS) },
        },
        select: { id: true, userId: true, title: true, message: true },
      })

      let closed = 0
      for (const n of notifs) {
        let parsed = {}
        try { parsed = JSON.parse(n.message) } catch { continue }
        if (!parsed.start) continue
        const start = new Date(parsed.start).getTime()
        if (Number.isNaN(start)) continue
        const end = parsed.end ? new Date(parsed.end).getTime() : start + DEFAULT_DURATION_MS
        if (Number.isNaN(end) || end > now) continue // not over yet

        const doneTitle = `meeting_done:${n.id}`
        try {
          // Same (userId, title) shape POST /api/tasks/meeting-done writes —
          // mirroring it exactly means the existing "done" UI (Priorities'
          // doneMeetingIds, the strike-through row, the meeting-count badge)
          // just works with zero client changes, whether a meeting was
          // marked done by hand or closed here automatically.
          const existing = await prisma.task.findFirst({ where: { userId: n.userId, title: doneTitle } })
          if (existing) continue
          const title = n.title.replace(/^📅 Meeting scheduled: /, '')
          const task = await prisma.task.create({
            data: { userId: n.userId, title: doneTitle, description: title, status: 'COMPLETED' },
          })
          emitToUser(n.userId, 'task:created', task)
          closed++
        } catch (err) {
          logger.warn(`Meeting auto-close failed for notification=${n.id}: ${err.message}`)
        }
      }
      if (closed) logger.info(`🔒 Auto-closed ${closed} ended meeting(s)`)
      return { ok: true, scanned: notifs.length, closed }
    },
    { connection: getBullRedisClient() },
  )

  worker.on('failed', (job, err) => {
    logger.error(`Meeting auto-close job failed: ${job?.id} ${err.message}`)
  })

  return worker
}
