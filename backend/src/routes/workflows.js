import express from 'express'
import { prisma } from '../config/prisma.js'
import { enqueueWorkflow } from '../queues/workflow.queue.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const workflows = await prisma.workflow.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ workflows })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body
    const workflow = await prisma.workflow.create({
      data: {
        name,
        description,
        userId: req.user.id,
        status: 'PENDING',
      },
    })

    await enqueueWorkflow({
      workflowId: workflow.id,
      userId: req.user.id,
    })

    res.status(201).json(workflow)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    })

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' })
    }

    res.json(workflow)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
