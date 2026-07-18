import express from 'express'
import { prisma } from '../config/prisma.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { preferences: true },
    })

    res.json({
      preferences: user?.preferences || {},
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/', async (req, res) => {
  try {
    const preferences = req.body && typeof req.body === 'object' ? req.body : {}
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { preferences },
      select: { preferences: true },
    })

    res.json({ preferences: user.preferences || {} })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
