import jwt from 'jsonwebtoken'
import { logger } from '../config/logger.js'
import { runLangGraphOrchestrator } from '../agents/langGraphOrchestrator.js'
import { userStore } from '../models/userStore.js'
import { ledger } from './ledgerService.js'
import { prisma } from '../config/prisma.js'
import { startGmailPoller, stopGmailPoller, sendGmailReply } from './gmailPoller.js'
import { startCalendarPoller, stopCalendarPoller } from './calendarPoller.js'
import { startContactsPoller, stopContactsPoller } from './contactsPoller.js'

export function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('Auth required'))
    try {
      const secret = process.env.JWT_SECRET
      if (!secret) throw new Error('JWT_SECRET environment variable is not set')
      socket.user = jwt.verify(token, secret)
      next()
    } catch { next(new Error('Invalid token')) }
  })

  io.on('connection', (socket) => {
    logger.info(`🔌 Connected: ${socket.user.name} (${socket.id})`)
    socket.join(`u:${socket.user.id}`)

    // Real-time agent message
    socket.on('agent:query', async ({ messages, conversationId }) => {
      try {
        socket.emit('agent:thinking', { conversationId })
        const user = await userStore.getById(socket.user.id) || socket.user
        const result = await runLangGraphOrchestrator({ messages, user })
        socket.emit('agent:reply', { conversationId, ...result, ts: new Date().toISOString() })
      } catch (err) {
        logger.error(`Socket agent error: ${err.message}`)
        socket.emit('agent:error', { conversationId, error: err.message })
      }
    })

    // Action approval
    socket.on('action:approve', ({ actionId }) => {
      logger.info(`✅ Action approved: ${actionId} by ${socket.user.name}`)
      io.to(`u:${socket.user.id}`).emit('action:confirmed', { actionId, ts: new Date().toISOString() })
    })
    socket.on('action:deny', ({ actionId }) => {
      logger.info(`✕ Action denied: ${actionId}`)
      socket.emit('action:denied', { actionId })
    })

    // Ledger sync
    socket.on('ledger:fetch', async () => {
      const entries = await ledger.getByUser(socket.user.id)
      socket.emit('ledger:data', { entries })
    })

    // Send reply directly from notification card
    socket.on('gmail:send_reply', async ({ emailId, recipient, subject, draft, notifId }) => {
      try {
        await sendGmailReply(socket.user.id, emailId, recipient, subject, draft)
        if (notifId) {
          try {
            await prisma.notification.update({ where: { id: notifId }, data: { read: true } })
          } catch (err) {
            logger.warn(`Failed to mark notification ${notifId} read after reply: ${err.message}`)
          }
        }
        socket.emit('gmail:reply_sent', { emailId, notifId, ts: new Date().toISOString() })
        logger.info(`Gmail reply sent by ${socket.user.name} to ${recipient}`)
      } catch (err) {
        socket.emit('gmail:reply_error', { emailId, notifId, error: err.message })
      }
    })

    startGmailPoller(socket.user.id, io)
    startCalendarPoller(socket.user.id, io)
    startContactsPoller(socket.user.id, io)

    socket.on('disconnect', () => {
      logger.info(`🔌 Disconnected: ${socket.user.name}`)
      stopGmailPoller(socket.user.id)
      stopCalendarPoller(socket.user.id)
      stopContactsPoller(socket.user.id)
    })
  })
}
