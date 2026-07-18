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
