import { prisma } from '../config/prisma.js'
import { memoryService } from '../services/memory.service.js'

export async function createMessage(req, res) {
  try {
    const { conversationId, role, content } = req.body

    if (content && content.length > 50000) {
      return res.status(400).json({ message: 'Message content too long (max 50,000 chars)' })
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: req.user.id,
      },
    })

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' })
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        role,
        content,
      },
    })

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    await memoryService.store({
      userId: req.user.id,
      text: content,
      type: role === 'assistant' ? 'assistant_reply' : 'user_message',
      metadata: {
        conversationId,
        messageId: message.id,
      },
    })

    await memoryService.setSessionContext(req.user.id, {
      lastConversationId: conversationId,
      lastMessageId: message.id,
      lastUpdatedAt: message.createdAt,
    })

    res.status(201).json(message)
  } catch (err) {
    res.status(500).json({
      message: err.message,
    })
  }
}

// Deletes one message and everything after it in the same conversation —
// backs the Ask AI screen's "edit a sent question" feature: editing a past
// message must actually remove the stale question + its old reply from
// history, not just hide them client-side, or they reappear the next time
// this conversation loads from the server.
export async function deleteMessagesFrom(req, res) {
  try {
    const { conversationId, messageId } = req.params

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: req.user.id },
    })
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' })
    }

    const anchor = await prisma.message.findFirst({
      where: { id: messageId, conversationId },
    })
    if (!anchor) {
      return res.status(404).json({ message: 'Message not found' })
    }

    await prisma.message.deleteMany({
      where: { conversationId, createdAt: { gte: anchor.createdAt } },
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

export async function getMessages(req, res) {
  try {
    const { conversationId } = req.params
    const { date } = req.query

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: req.user.id,
      },
    })

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' })
    }

    // ?date=YYYY-MM-DD (Ask AI's date filter) — that calendar day in IST,
    // unbounded by the normal 100-message cap below, since a specific day's
    // worth of chat is inherently small regardless of how long the overall
    // conversation has run.
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const dayStart = new Date(`${date}T00:00:00+05:30`)
      const dayEnd = new Date(`${date}T23:59:59.999+05:30`)
      if (isNaN(dayStart.getTime())) return res.status(400).json({ message: 'Invalid date' })

      const dayMessages = await prisma.message.findMany({
        where: { conversationId, createdAt: { gte: dayStart, lte: dayEnd } },
        orderBy: { createdAt: 'asc' },
      })
      return res.json(dayMessages)
    }

    // Bounded to the most recent 100 — a long-lived conversation would
    // otherwise grow this fetch (and the Ask AI screen's initial render)
    // unbounded. Fetched newest-first so `take` keeps the recent tail, then
    // re-sorted back to chronological order for the client.
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    })
    messages.reverse()

    res.json(messages)
  } catch (err) {
    res.status(500).json({
      message: err.message,
    })
  }
}
