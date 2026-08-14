import express from 'express'
import { prisma } from '../config/prisma.js'

export const familyRouter = express.Router()

const fmt = (conn, myId) => ({
  id:           conn.id,
  status:       conn.status,
  relationship: conn.relationship,
  direction:    conn.requesterId === myId ? 'SENT' : 'RECEIVED',
  name:         conn.requesterId === myId ? conn.receiver.name  : conn.requester.name,
  email:        conn.requesterId === myId ? conn.receiver.email : conn.requester.email,
  avatar:       conn.requesterId === myId ? conn.receiver.avatar: conn.requester.avatar,
  createdAt:    conn.createdAt,
})

const include = {
  requester: { select: { id: true, name: true, email: true, avatar: true } },
  receiver:  { select: { id: true, name: true, email: true, avatar: true } },
}

// GET /api/family/connections
familyRouter.get('/connections', async (req, res) => {
  try {
    const myId = req.user.id
    const conns = await prisma.familyConnection.findMany({
      where: { OR: [{ requesterId: myId }, { receiverId: myId }] },
      include,
      orderBy: { createdAt: 'desc' },
    })
    res.json({ connections: conns.map(c => fmt(c, myId)) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/family/connections — send request
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
      include,
    })

    // Notify receiver via socket
    const io = req.app.get('io')
    if (io) io.to(`u:${receiver.id}`).emit('family:request', fmt(conn, receiver.id))

    res.status(201).json({ connection: fmt(conn, myId) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/family/connections/:id — accept or reject
familyRouter.patch('/connections/:id', async (req, res) => {
  try {
    const myId = req.user.id
    const { status } = req.body
    if (!['ACCEPTED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'status must be ACCEPTED or REJECTED' })

    const conn = await prisma.familyConnection.findUnique({ where: { id: req.params.id }, include })
    if (!conn) return res.status(404).json({ error: 'Connection not found' })
    if (conn.receiverId !== myId) return res.status(403).json({ error: 'Not authorized' })

    const updated = await prisma.familyConnection.update({
      where: { id: req.params.id },
      data: { status },
      include,
    })

    const io = req.app.get('io')
    if (io) io.to(`u:${conn.requesterId}`).emit('family:updated', fmt(updated, conn.requesterId))

    res.json({ connection: fmt(updated, myId) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/family/connections/:id — remove
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
