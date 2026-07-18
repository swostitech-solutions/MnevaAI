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

export async function getMessages(req, res) {
  try {
    const { conversationId } = req.params

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: req.user.id,
      },
    })

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' })
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    res.json(messages)
  } catch (err) {
    res.status(500).json({
      message: err.message,
    })
  }
}
