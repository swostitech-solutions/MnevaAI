import express from 'express'
import { prisma } from '../config/prisma.js'

export const pushRouter = express.Router()

pushRouter.post('/register', async (req, res) => {
  try {
    const { token, platform } = req.body
    if (!token || !platform) return res.status(400).json({ error: 'token and platform are required' })
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId: req.user.id, platform },
      create: { userId: req.user.id, token, platform },
    })
    res.status(201).json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

pushRouter.delete('/register', async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'token is required' })
    await prisma.pushToken.deleteMany({ where: { token, userId: req.user.id } })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default pushRouter
