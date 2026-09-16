import express from 'express'
import { prisma } from '../config/prisma.js'
import { formatLeadMinutes } from '../agents/autonomyEngine.js'

const router = express.Router()

// GET /api/tasks
router.get('/', async (req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json(tasks)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/tasks
router.post('/', async (req, res) => {
  try {
    const { title, description, status, reminderTime, reminderDomain } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' })

    // Optional — the Home screen's quick-add doesn't collect a time by
    // default (it's meant to be instant), but when one is given, this task
    // gets real push reminders the same way an AI-chat "remind me" does.
    const scheduledAt = reminderTime ? new Date(reminderTime) : null
    const hasValidReminder = scheduledAt && !isNaN(scheduledAt.getTime()) && scheduledAt.getTime() > Date.now()

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description || null,
        userId: req.user.id,
        status: status || 'PENDING',
      },
    })
    // real-time push to all devices
    const io = req.app.get('io')
    if (io) io.to(`u:${req.user.id}`).emit('task:created', task)

    if (hasValidReminder) {
      const scheduled = scheduledAt.toISOString()
      await prisma.notification.create({
        data: {
          userId: req.user.id,
          title: '🔔 Reminder set',
          message: JSON.stringify({ source: 'reminder', preview: title.trim(), start: scheduled, repeat: 'once' }),
        },
      })
      try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { preferences: true } })
        const leadTimes = Array.isArray(user?.preferences?.notificationLeadTimes) && user.preferences.notificationLeadTimes.length
          ? user.preferences.notificationLeadTimes
          : [30]
        const { enqueueReminder } = await import('../queues/reminder.queue.js')
        await Promise.all(leadTimes.map((leadMinutes) => {
          const fireAt = new Date(scheduledAt.getTime() - leadMinutes * 60 * 1000)
          const body = leadMinutes > 0 ? `${title.trim()} — in ${formatLeadMinutes(leadMinutes)}` : title.trim()
          return enqueueReminder({
            userId: req.user.id,
            message: body,
            time: fireAt.toISOString(),
            domain: reminderDomain || 'general',
            repeat: 'once',
          })
        }))
      } catch {
        // The task itself is already saved — a queue hiccup shouldn't fail the request.
      }
    }

    res.json(task)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ⚠️ SPECIFIC routes MUST come before /:id wildcard

// GET /api/tasks/meeting-done
router.get('/meeting-done', async (req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      where: {
        userId: req.user.id,
        status: 'COMPLETED',
        title: { startsWith: 'meeting_done:' },
      },
      select: { title: true },
    })
    const ids = tasks.map(t => t.title.replace('meeting_done:', ''))
    res.json({ ids })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/tasks/meeting-done
router.post('/meeting-done', async (req, res) => {
  try {
    const { meetingId, meetingTitle } = req.body
    if (!meetingId) return res.status(400).json({ error: 'meetingId required' })
    const existing = await prisma.task.findFirst({
      where: { userId: req.user.id, title: `meeting_done:${meetingId}` },
    })
    if (existing) return res.json(existing)
    const task = await prisma.task.create({
      data: {
        title: `meeting_done:${meetingId}`,
        description: meetingTitle || null,
        userId: req.user.id,
        status: 'COMPLETED',
      },
    })
    res.json(task)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/tasks/:id — must be LAST
router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body
    const task = await prisma.task.update({
      where: { id: req.params.id, userId: req.user.id },
      data: { status: status || 'COMPLETED' },
    })
    res.json(task)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
