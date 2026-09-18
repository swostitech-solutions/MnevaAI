import { prisma } from '../config/prisma.js'

export async function createConversation(req, res) {
  try {
    const { title } = req.body

    const conversation = await prisma.conversation.create({
      data: {
        title: title || 'New Conversation',
        userId: req.user.id,
      },
    })

    res.status(201).json(conversation)
  } catch (err) {
    res.status(500).json({
      message: err.message,
    })
  }
}

export async function getConversations(req, res) {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    res.json(conversations)
  } catch (err) {
    res.status(500).json({
      message: err.message,
    })
  }
}

// GET /api/conversations/latest — the most recent conversation + its message
// history in one round trip. Ask AI's initial load previously had to wait on
// GET /api/conversations, then GET /api/messages/:id (two sequential
// requests, each paying its own network latency) before it could show
// anything. Same bounded-to-100 fetch as message.controller.js's
// getMessages, since a long-lived conversation shouldn't grow this payload
// unbounded either.
export async function getLatestConversation(req, res) {
  try {
    let conversation = await prisma.conversation.findFirst({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { title: 'New Conversation', userId: req.user.id },
      })
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    messages.reverse()

    res.json({ conversation, messages })
  } catch (err) {
    res.status(500).json({
      message: err.message,
    })
  }
}
