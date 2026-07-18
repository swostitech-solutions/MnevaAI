import express from 'express'
import { prisma } from '../config/prisma.js'

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
    const { title, description, status } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' })
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
