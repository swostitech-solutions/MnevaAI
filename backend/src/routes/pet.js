import express from 'express'
import { prisma } from '../config/prisma.js'

export const petRouter = express.Router()

const emit = (io, userId, event, data) => { if (io) io.to(`u:${userId}`).emit(event, data) }

const fmtPet = (p) => ({
  id: p.id, name: p.name, species: p.species, breed: p.breed, sex: p.sex,
  dob: p.dob, microchip: p.microchip, weight: p.weight, height: p.height,
  coatType: p.coatType, colorMarkings: p.colorMarkings,
  vaccines: p.vaccines || [], medications: p.medications || [],
  allergies: p.allergies || [], vet: p.vet || null,
  feeding: p.feeding || null, groomings: p.groomings || [],
  exercises: p.exercises || [],
  createdAt: p.createdAt, updatedAt: p.updatedAt,
})

const fmtReminder = (r) => ({
  id: r.id, petId: r.petId, type: r.type, title: r.title,
  remindAt: r.remindAt, notes: r.notes, done: r.done, createdAt: r.createdAt,
})

async function syncPetMemory(userId, prismaClient) {
  const pets = await prismaClient.pet.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  if (!pets.length) return
  const lines = pets.map(p => {
    const parts = [`${p.name} (${p.species}${p.breed ? ', ' + p.breed : ''}${p.sex ? ', ' + p.sex : ''})`]
    if (p.dob) parts.push(`DOB: ${p.dob}`)
    if (p.weight) parts.push(`Weight: ${p.weight}`)
    const meds = (p.medications || []).map(m => m.name).filter(Boolean)
    if (meds.length) parts.push(`Meds: ${meds.join(', ')}`)
    const vaccines = (p.vaccines || []).map(v => v.name).filter(Boolean)
    if (vaccines.length) parts.push(`Vaccines: ${vaccines.join(', ')}`)
    const allergies = (p.allergies || []).map(a => a.name).filter(Boolean)
    if (allergies.length) parts.push(`Allergies: ${allergies.join(', ')}`)
    if (p.vet?.name) parts.push(`Vet: Dr. ${p.vet.name}${p.vet.clinic ? ' at ' + p.vet.clinic : ''}`)
    if (p.feeding?.foodName) parts.push(`Food: ${p.feeding.foodName}${p.feeding.times ? ', ' + p.feeding.times + 'x/day' : ''}`)
    return parts.join(' | ')
  })
  const memoryText = `Pet care: ${lines.join(' || ')}`
  const profile = await prismaClient.userProfile.findUnique({ where: { userId } })
  const existing = Array.isArray(profile?.aiMemories) ? profile.aiMemories : []
  const filtered = existing.filter(e => !String(e?.text || e?.payload?.text || '').startsWith('Pet care:'))
  const updated = [{ text: memoryText, type: 'pet_care', updatedAt: new Date().toISOString() }, ...filtered].slice(0, 50)
  await prismaClient.userProfile.upsert({
    where: { userId },
    update: { aiMemories: updated },
    create: { userId, aiMemories: updated },
  })
}

// ── Pet Profile ───────────────────────────────────────────────────────────────

petRouter.get('/', async (req, res) => {
  try {
    const pets = await prisma.pet.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } })
    res.json({ pets: pets.map(fmtPet) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

petRouter.post('/', async (req, res) => {
  try {
    const { name, species, breed, sex, dob, microchip, weight, height, coatType, colorMarkings } = req.body
    if (!name?.trim() || !species) return res.status(400).json({ error: 'name and species required' })
    const pet = await prisma.pet.create({
      data: { userId: req.user.id, name: name.trim(), species, breed: breed?.trim() || null, sex: sex || null, dob: dob?.trim() || null, microchip: microchip?.trim() || null, weight: weight?.trim() || null, height: height?.trim() || null, coatType: coatType || null, colorMarkings: colorMarkings?.trim() || null },
    })
    await syncPetMemory(req.user.id, prisma)
    const formatted = fmtPet(pet)
    emit(req.app.get('io'), req.user.id, 'pet:created', formatted)
    res.status(201).json({ pet: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

petRouter.patch('/:id', async (req, res) => {
  try {
    const pet = await prisma.pet.findUnique({ where: { id: req.params.id } })
    if (!pet || pet.userId !== req.user.id) return res.status(404).json({ error: 'Not found' })
    const { name, species, breed, sex, dob, microchip, weight, height, coatType, colorMarkings,
            vaccines, medications, allergies, vet, feeding, groomings, exercises } = req.body
    const updated = await prisma.pet.update({
      where: { id: req.params.id },
      data: {
        ...(name          !== undefined && { name: name.trim() }),
        ...(species       !== undefined && { species }),
        ...(breed         !== undefined && { breed: breed?.trim() || null }),
        ...(sex           !== undefined && { sex: sex || null }),
        ...(dob           !== undefined && { dob: dob?.trim() || null }),
        ...(microchip     !== undefined && { microchip: microchip?.trim() || null }),
        ...(weight        !== undefined && { weight: weight?.trim() || null }),
        ...(height        !== undefined && { height: height?.trim() || null }),
        ...(coatType      !== undefined && { coatType: coatType || null }),
        ...(colorMarkings !== undefined && { colorMarkings: colorMarkings?.trim() || null }),
        ...(vaccines      !== undefined && { vaccines }),
        ...(medications   !== undefined && { medications }),
        ...(allergies     !== undefined && { allergies }),
        ...(vet           !== undefined && { vet }),
        ...(feeding       !== undefined && { feeding }),
        ...(groomings     !== undefined && { groomings }),
        ...(exercises     !== undefined && { exercises }),
      },
    })
    await syncPetMemory(req.user.id, prisma)
    const formatted = fmtPet(updated)
    emit(req.app.get('io'), req.user.id, 'pet:updated', formatted)
    res.json({ pet: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

petRouter.delete('/:id', async (req, res) => {
  try {
    const pet = await prisma.pet.findUnique({ where: { id: req.params.id } })
    if (!pet || pet.userId !== req.user.id) return res.status(404).json({ error: 'Not found' })
    await prisma.pet.delete({ where: { id: req.params.id } })
    await syncPetMemory(req.user.id, prisma)
    emit(req.app.get('io'), req.user.id, 'pet:deleted', { id: req.params.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Pet Reminders ─────────────────────────────────────────────────────────────

petRouter.get('/:petId/reminders', async (req, res) => {
  try {
    const pet = await prisma.pet.findUnique({ where: { id: req.params.petId } })
    if (!pet || pet.userId !== req.user.id) return res.status(404).json({ error: 'Not found' })
    const reminders = await prisma.petReminder.findMany({
      where: { petId: req.params.petId },
      orderBy: { remindAt: 'asc' },
    })
    res.json({ reminders: reminders.map(fmtReminder) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

petRouter.post('/:petId/reminders', async (req, res) => {
  try {
    const pet = await prisma.pet.findUnique({ where: { id: req.params.petId } })
    if (!pet || pet.userId !== req.user.id) return res.status(404).json({ error: 'Not found' })
    const { type, title, remindAt, notes } = req.body
    if (!type || !title?.trim()) return res.status(400).json({ error: 'type and title required' })
    let remindAtDate = null
    if (remindAt) {
      remindAtDate = new Date(remindAt)
      if (isNaN(remindAtDate.getTime())) remindAtDate = null
    }
    const reminder = await prisma.petReminder.create({
      data: { petId: req.params.petId, userId: req.user.id, type, title: title.trim(), remindAt: remindAtDate, notes: notes?.trim() || null },
    })
    const formatted = fmtReminder(reminder)
    emit(req.app.get('io'), req.user.id, 'pet:reminder:created', { ...formatted, petName: pet.name })
    res.status(201).json({ reminder: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

petRouter.patch('/:petId/reminders/:id', async (req, res) => {
  try {
    const reminder = await prisma.petReminder.findUnique({ where: { id: req.params.id } })
    if (!reminder || reminder.userId !== req.user.id) return res.status(404).json({ error: 'Not found' })
    const { done, title, type, remindAt, notes } = req.body
    let remindAtDate = reminder.remindAt
    if (remindAt !== undefined) {
      remindAtDate = remindAt ? new Date(remindAt) : null
      if (remindAtDate && isNaN(remindAtDate.getTime())) remindAtDate = null
    }
    const updated = await prisma.petReminder.update({
      where: { id: req.params.id },
      data: {
        ...(done      !== undefined && { done: Boolean(done) }),
        ...(title     !== undefined && { title: title.trim() }),
        ...(type      !== undefined && { type }),
        ...(notes     !== undefined && { notes: notes?.trim() || null }),
        remindAt: remindAtDate,
      },
    })
    const formatted = fmtReminder(updated)
    emit(req.app.get('io'), req.user.id, 'pet:reminder:updated', formatted)
    res.json({ reminder: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

petRouter.delete('/:petId/reminders/:id', async (req, res) => {
  try {
    const reminder = await prisma.petReminder.findUnique({ where: { id: req.params.id } })
    if (!reminder || reminder.userId !== req.user.id) return res.status(404).json({ error: 'Not found' })
    await prisma.petReminder.delete({ where: { id: req.params.id } })
    emit(req.app.get('io'), req.user.id, 'pet:reminder:deleted', { id: req.params.id, petId: req.params.petId })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Real-time reminder alert poller ──────────────────────────────────────────
// Runs every 60s, fires pet:alert for reminders due within the next minute
export function startPetReminderPoller(io) {
  setInterval(async () => {
    try {
      const now = new Date()
      const windowEnd = new Date(now.getTime() + 60 * 1000)
      const due = await prisma.petReminder.findMany({
        where: { done: false, remindAt: { gte: now, lte: windowEnd } },
        include: { pet: { select: { name: true, species: true } } },
      })
      for (const r of due) {
        io.to(`u:${r.userId}`).emit('pet:alert', {
          id: r.id, petId: r.petId,
          petName: r.pet.name, petSpecies: r.pet.species,
          type: r.type, title: r.title,
          remindAt: r.remindAt, notes: r.notes,
        })
      }
    } catch { /* silent */ }
  }, 60 * 1000)
}
