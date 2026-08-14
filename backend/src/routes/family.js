import express from 'express'
import { prisma } from '../config/prisma.js'

export const familyRouter = express.Router()

const userSelect  = { id: true, name: true, email: true, avatar: true }
const connInclude = {
  requester: { select: userSelect },
  receiver:  { select: userSelect },
}
const taskInclude = {
  creator:  { select: userSelect },
  assignee: { select: userSelect },
}

const fmtConn = (conn, myId) => ({
  id:           conn.id,
  status:       conn.status,
  relationship: conn.relationship,
  direction:    conn.requesterId === myId ? 'SENT' : 'RECEIVED',
  name:         conn.requesterId === myId ? conn.receiver.name   : conn.requester.name,
  email:        conn.requesterId === myId ? conn.receiver.email  : conn.requester.email,
  avatar:       conn.requesterId === myId ? conn.receiver.avatar : conn.requester.avatar,
  otherId:      conn.requesterId === myId ? conn.receiverId      : conn.requesterId,
  createdAt:    conn.createdAt,
})

const fmtTask = (t) => ({
  id:           t.id,
  connectionId: t.connectionId,
  title:        t.title,
  description:  t.description,
  status:       t.status,
  priority:     t.priority,
  category:     t.category,
  dueDate:      t.dueDate,
  recurrence:   t.recurrence,
  checklist:    t.checklist,
  comments:     t.comments,
  createdAt:    t.createdAt,
  updatedAt:    t.updatedAt,
  createdBy:  { id: t.creator.id,  name: t.creator.name,  avatar: t.creator.avatar },
  assignedTo: { id: t.assignee.id, name: t.assignee.name, avatar: t.assignee.avatar },
})

const emit = (io, userId, event, data) => { if (io) io.to(`u:${userId}`).emit(event, data) }

// ── Connections ───────────────────────────────────────────────────────────────

familyRouter.get('/connections', async (req, res) => {
  try {
    const myId = req.user.id
    const rows = await prisma.familyConnection.findMany({
      where: { OR: [{ requesterId: myId }, { receiverId: myId }] },
      include: connInclude,
      orderBy: { createdAt: 'desc' },
    })
    res.json({ connections: rows.map(c => fmtConn(c, myId)) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.post('/connections', async (req, res) => {
  try {
    const myId = req.user.id
    const { receiverEmail, relationship } = req.body
    if (!receiverEmail || !relationship) return res.status(400).json({ error: 'receiverEmail and relationship required' })

    const receiver = await prisma.user.findFirst({ where: { email: { equals: receiverEmail, mode: 'insensitive' } } })
    if (!receiver) return res.status(404).json({ error: 'User not found' })
    if (receiver.id === myId) return res.status(400).json({ error: 'Cannot connect to yourself' })

    const existing = await prisma.familyConnection.findFirst({
      where: { OR: [{ requesterId: myId, receiverId: receiver.id }, { requesterId: receiver.id, receiverId: myId }] },
    })
    if (existing) return res.status(409).json({ error: 'Connection already exists' })

    const conn = await prisma.familyConnection.create({
      data: { requesterId: myId, receiverId: receiver.id, relationship },
      include: connInclude,
    })
    const io = req.app.get('io')
    emit(io, receiver.id, 'family:request', fmtConn(conn, receiver.id))
    res.status(201).json({ connection: fmtConn(conn, myId) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.patch('/connections/:id', async (req, res) => {
  try {
    const myId = req.user.id
    const { status } = req.body
    if (!['ACCEPTED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'status must be ACCEPTED or REJECTED' })

    const conn = await prisma.familyConnection.findUnique({ where: { id: req.params.id }, include: connInclude })
    if (!conn) return res.status(404).json({ error: 'Not found' })
    if (conn.receiverId !== myId) return res.status(403).json({ error: 'Not authorized' })

    const updated = await prisma.familyConnection.update({ where: { id: req.params.id }, data: { status }, include: connInclude })
    const io = req.app.get('io')
    emit(io, conn.requesterId, 'family:updated', fmtConn(updated, conn.requesterId))
    res.json({ connection: fmtConn(updated, myId) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.delete('/connections/:id', async (req, res) => {
  try {
    const myId = req.user.id
    const conn = await prisma.familyConnection.findUnique({ where: { id: req.params.id } })
    if (!conn) return res.status(404).json({ error: 'Not found' })
    if (conn.requesterId !== myId && conn.receiverId !== myId) return res.status(403).json({ error: 'Not authorized' })
    await prisma.familyConnection.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Tasks ─────────────────────────────────────────────────────────────────────

familyRouter.get('/tasks', async (req, res) => {
  try {
    const myId = req.user.id
    const tasks = await prisma.familyTask.findMany({
      where: { OR: [{ creatorId: myId }, { assigneeId: myId }] },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    })
    res.json({ tasks: tasks.map(fmtTask) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.post('/tasks', async (req, res) => {
  try {
    const myId = req.user.id
    const { connectionId, assigneeId, title, description, priority, category, dueDate, recurrence, checklist } = req.body
    if (!connectionId || !assigneeId || !title) return res.status(400).json({ error: 'connectionId, assigneeId and title required' })

    const conn = await prisma.familyConnection.findUnique({ where: { id: connectionId } })
    if (!conn || (conn.requesterId !== myId && conn.receiverId !== myId)) return res.status(403).json({ error: 'Not authorized' })
    if (conn.status !== 'ACCEPTED') return res.status(400).json({ error: 'Connection not accepted yet' })

    const task = await prisma.familyTask.create({
      data: {
        connectionId, creatorId: myId, assigneeId,
        title, description: description || null,
        priority: priority || 'Medium', category: category || null,
        dueDate: dueDate || null, recurrence: recurrence || 'None',
        checklist: checklist || [],
        status: myId === assigneeId ? 'ACCEPTED' : 'PENDING_ACCEPTANCE',
      },
      include: taskInclude,
    })

    const formatted = fmtTask(task)
    const io = req.app.get('io')
    emit(io, myId,       'family:task:new', formatted)
    if (assigneeId !== myId) emit(io, assigneeId, 'family:task:new', formatted)
    res.status(201).json({ task: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.patch('/tasks/:id/status', async (req, res) => {
  try {
    const myId = req.user.id
    const { status } = req.body
    const allowed = ['ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` })

    const task = await prisma.familyTask.findUnique({ where: { id: req.params.id }, include: taskInclude })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    if (task.creatorId !== myId && task.assigneeId !== myId) return res.status(403).json({ error: 'Not authorized' })

    const updated = await prisma.familyTask.update({ where: { id: req.params.id }, data: { status }, include: taskInclude })
    const formatted = fmtTask(updated)
    const io = req.app.get('io')
    emit(io, task.creatorId,  'family:task:updated', formatted)
    emit(io, task.assigneeId, 'family:task:updated', formatted)
    res.json({ task: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.patch('/tasks/:id/checklist', async (req, res) => {
  try {
    const myId = req.user.id
    const { itemId } = req.body
    const task = await prisma.familyTask.findUnique({ where: { id: req.params.id } })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    if (task.creatorId !== myId && task.assigneeId !== myId) return res.status(403).json({ error: 'Not authorized' })

    const checklist = (task.checklist || []).map(i => i.id === itemId ? { ...i, done: !i.done } : i)
    const updated = await prisma.familyTask.update({ where: { id: req.params.id }, data: { checklist }, include: taskInclude })
    const formatted = fmtTask(updated)
    const io = req.app.get('io')
    emit(io, task.creatorId,  'family:task:updated', formatted)
    emit(io, task.assigneeId, 'family:task:updated', formatted)
    res.json({ task: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.post('/tasks/:id/comments', async (req, res) => {
  try {
    const myId = req.user.id
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'text required' })

    const task = await prisma.familyTask.findUnique({ where: { id: req.params.id }, include: taskInclude })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    if (task.creatorId !== myId && task.assigneeId !== myId) return res.status(403).json({ error: 'Not authorized' })

    const me = task.creatorId === myId ? task.creator : task.assignee
    const comments = [...(task.comments || []), { id: Date.now().toString(), text: text.trim(), by: me.name, byId: myId, at: new Date().toISOString() }]
    const updated = await prisma.familyTask.update({ where: { id: req.params.id }, data: { comments }, include: taskInclude })
    const formatted = fmtTask(updated)
    const io = req.app.get('io')
    emit(io, task.creatorId,  'family:task:updated', formatted)
    emit(io, task.assigneeId, 'family:task:updated', formatted)
    res.json({ task: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.delete('/tasks/:id', async (req, res) => {
  try {
    const myId = req.user.id
    const task = await prisma.familyTask.findUnique({ where: { id: req.params.id } })
    if (!task) return res.status(404).json({ error: 'Not found' })
    if (task.creatorId !== myId) return res.status(403).json({ error: 'Only creator can delete' })
    await prisma.familyTask.delete({ where: { id: req.params.id } })
    const io = req.app.get('io')
    emit(io, task.creatorId,  'family:task:deleted', { id: req.params.id })
    emit(io, task.assigneeId, 'family:task:deleted', { id: req.params.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
