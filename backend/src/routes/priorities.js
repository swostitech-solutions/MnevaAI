import express from 'express'
import { prisma } from '../config/prisma.js'

const router = express.Router()

// Audit item G-21: generic, module-agnostic store for the Priorities
// screen's past-due "Did you complete this?" answer — see the
// PriorityConfirmation model comment in schema.prisma for why this is a
// shared itemKey store instead of a field on each individual module.
router.get('/confirmations', async (req, res) => {
  try {
    const rows = await prisma.priorityConfirmation.findMany({ where: { userId: req.user.id } })
    res.json({ confirmations: rows.map(r => ({ itemKey: r.itemKey, action: r.action })) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/confirmations', async (req, res) => {
  try {
    const { itemKey, action } = req.body
    if (!itemKey || !['done', 'pending'].includes(action)) {
      return res.status(400).json({ error: "itemKey and action ('done' or 'pending') are required" })
    }
    await prisma.priorityConfirmation.upsert({
      where: { userId_itemKey: { userId: req.user.id, itemKey } },
      update: { action },
      create: { userId: req.user.id, itemKey, action },
    })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
