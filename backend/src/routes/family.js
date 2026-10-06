import express from 'express'
import { prisma } from '../config/prisma.js'
import { sendPushToUser } from '../services/pushService.js'
import { ledger } from '../services/ledgerService.js'
import { emitToUser } from '../services/realtime.js'

export const familyRouter = express.Router()

const userSelect  = { id: true, name: true, email: true, avatar: true }
// Connections additionally need each side's gender, to correctly invert the
// relationship label for whichever side didn't set it (see
// inverseRelationship below) — nobody else needs this, so it's kept off the
// plain userSelect used everywhere else (task creator/assignee, etc).
const userSelectWithGender = { ...userSelect, userProfile: { select: { gender: true } } }
const connInclude = {
  requester: { select: userSelectWithGender },
  receiver:  { select: userSelectWithGender },
}
const taskInclude = {
  creator:  { select: userSelect },
  assignee: { select: userSelect },
}

// `relationship` on FamilyConnection is set once, by whoever sent the
// request, and means "what the receiver is to me" — e.g. the requester
// picked "Father" because the receiver is their father. Showing that same
// label back to the receiver is wrong for every non-symmetric relationship:
// the receiver must see the requester as "Son"/"Daughter" (or "Child" if
// gender isn't set), not "Father" right back at them. This computes that
// inverse from the requester's own gender for the cases where it matters,
// and leaves symmetric ones (Spouse, Partner, Relative, Other) and the
// gender-neutral Grandparent/Grandchild pair unchanged either way.
const GENDERED_INVERSE = {
  Father:   { Male: 'Son',    Female: 'Daughter', fallback: 'Child' },
  Mother:   { Male: 'Son',    Female: 'Daughter', fallback: 'Child' },
  Son:      { Male: 'Father', Female: 'Mother',   fallback: 'Parent' },
  Daughter: { Male: 'Father', Female: 'Mother',   fallback: 'Parent' },
  Brother:  { Male: 'Brother', Female: 'Sister',  fallback: 'Sibling' },
  Sister:   { Male: 'Brother', Female: 'Sister',  fallback: 'Sibling' },
}
const SELF_INVERSE = {
  Spouse: 'Spouse', Partner: 'Partner', Relative: 'Relative', Other: 'Other',
  // No clean inverse exists for "the person I care for" — Relative is the
  // closest honest fallback rather than inventing a new label.
  Caregiver: 'Relative',
  Grandparent: 'Grandchild', Grandchild: 'Grandparent',
}
export function inverseRelationship(relationship, otherGender) {
  const gendered = GENDERED_INVERSE[relationship]
  if (gendered) return gendered[otherGender] || gendered.fallback
  return SELF_INVERSE[relationship] || relationship
}

const fmtConn = (conn, myId) => {
  const iAmRequester = conn.requesterId === myId
  const other = iAmRequester ? conn.receiver : conn.requester
  return {
    id:           conn.id,
    status:       conn.status,
    // The requester sees exactly what they picked; the receiver sees the
    // correctly inverted label computed from the requester's gender.
    relationship: iAmRequester ? conn.relationship : inverseRelationship(conn.relationship, conn.requester.userProfile?.gender),
    direction:    iAmRequester ? 'SENT' : 'RECEIVED',
    name:         other.name,
    email:        other.email,
    avatar:       other.avatar,
    otherId:      other.id,
    createdAt:    conn.createdAt,
  }
}

const fmtTask = (t) => ({
  id:           t.id,
  connectionId: t.connectionId,
  title:        t.title,
  description:  t.description,
  status:       t.status,
  priority:     t.priority,
  category:     t.category,
  dueDate:      t.dueDate,
  recurrence:   t.recurrence,
  checklist:    t.checklist,
  comments:     t.comments,
  createdAt:    t.createdAt,
  updatedAt:    t.updatedAt,
  createdBy:  { id: t.creator.id,  name: t.creator.name,  avatar: t.creator.avatar },
  assignedTo: { id: t.assignee.id, name: t.assignee.name, avatar: t.assignee.avatar },
})

const emit = (io, userId, event, data) => { if (io) io.to(`u:${userId}`).emit(event, data) }

// A due date already in the past is never something to newly set (creating
// or re-dating a task to "yesterday" is always a mistake, not intent).
// dueDate is a plain "YYYY-MM-DD" (Asia/Kolkata) with no time-of-day, so
// today itself is always allowed.
function isPastDueDate(dueDate) {
  if (!dueDate) return false
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  return String(dueDate).slice(0, 10) < todayKey
}

// ── Connections ───────────────────────────────────────────────────────────────

familyRouter.get('/connections', async (req, res) => {
  try {
    const myId = req.user.id
    const rows = await prisma.familyConnection.findMany({
      where: { OR: [{ requesterId: myId }, { receiverId: myId }] },
      include: connInclude,
      orderBy: { createdAt: 'desc' },
    })
    res.json({ connections: rows.map(c => fmtConn(c, myId)) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.post('/connections', async (req, res) => {
  try {
    const myId = req.user.id
    const { receiverEmail, relationship } = req.body
    if (!receiverEmail || !relationship) return res.status(400).json({ error: 'receiverEmail and relationship required' })

    const receiver = await prisma.user.findFirst({ where: { email: { equals: receiverEmail, mode: 'insensitive' } } })
    if (!receiver) return res.status(404).json({ error: 'User not found' })
    if (receiver.id === myId) return res.status(400).json({ error: 'Cannot connect to yourself' })

    const existing = await prisma.familyConnection.findFirst({
      where: { OR: [{ requesterId: myId, receiverId: receiver.id }, { requesterId: receiver.id, receiverId: myId }] },
    })
    if (existing) return res.status(409).json({ error: 'Connection already exists' })

    const conn = await prisma.familyConnection.create({
      data: { requesterId: myId, receiverId: receiver.id, relationship },
      include: connInclude,
    })
    const io = req.app.get('io')
    emit(io, receiver.id, 'family:request', fmtConn(conn, receiver.id))
    res.status(201).json({ connection: fmtConn(conn, myId) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.patch('/connections/:id', async (req, res) => {
  try {
    const myId = req.user.id
    const { status } = req.body
    if (!['ACCEPTED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'status must be ACCEPTED or REJECTED' })

    const conn = await prisma.familyConnection.findUnique({ where: { id: req.params.id }, include: connInclude })
    if (!conn) return res.status(404).json({ error: 'Not found' })
    if (conn.receiverId !== myId) return res.status(403).json({ error: 'Not authorized' })

    const updated = await prisma.familyConnection.update({ where: { id: req.params.id }, data: { status }, include: connInclude })
    const io = req.app.get('io')
    emit(io, conn.requesterId, 'family:updated', fmtConn(updated, conn.requesterId))
    res.json({ connection: fmtConn(updated, myId) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.delete('/connections/:id', async (req, res) => {
  try {
    const myId = req.user.id
    const conn = await prisma.familyConnection.findUnique({ where: { id: req.params.id } })
    if (!conn) return res.status(404).json({ error: 'Not found' })
    if (conn.requesterId !== myId && conn.receiverId !== myId) return res.status(403).json({ error: 'Not authorized' })
    await prisma.familyConnection.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Tasks ─────────────────────────────────────────────────────────────────────

familyRouter.get('/tasks', async (req, res) => {
  try {
    const myId = req.user.id
    const tasks = await prisma.familyTask.findMany({
      where: { OR: [{ creatorId: myId }, { assigneeId: myId }] },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    })
    res.json({ tasks: tasks.map(fmtTask) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.post('/tasks', async (req, res) => {
  try {
    const myId = req.user.id
    const { connectionId, assigneeId, title, description, priority, category, dueDate, recurrence, checklist } = req.body
    if (!connectionId || !assigneeId || !title) return res.status(400).json({ error: 'connectionId, assigneeId and title required' })
    if (isPastDueDate(dueDate)) return res.status(400).json({ error: 'Due date cannot be in the past — please pick today or a future date.' })

    const conn = await prisma.familyConnection.findUnique({ where: { id: connectionId } })
    if (!conn || (conn.requesterId !== myId && conn.receiverId !== myId)) return res.status(403).json({ error: 'Not authorized' })
    if (conn.status !== 'ACCEPTED') return res.status(400).json({ error: 'Connection not accepted yet' })

    const task = await prisma.familyTask.create({
      data: {
        connectionId, creatorId: myId, assigneeId,
        title, description: description || null,
        priority: priority || 'Medium', category: category || null,
        dueDate: dueDate || null, recurrence: recurrence || 'None',
        checklist: checklist || [],
        status: myId === assigneeId ? 'ACCEPTED' : 'PENDING_ACCEPTANCE',
      },
      include: taskInclude,
    })

    const formatted = fmtTask(task)
    const io = req.app.get('io')
    emit(io, myId,       'family:task:new', formatted)
    if (assigneeId !== myId) {
      emit(io, assigneeId, 'family:task:new', formatted)
      // Only the assignee needs a push — the creator is already looking at
      // the screen that just created this.
      sendPushToUser(assigneeId, { title: 'New family task', body: title, data: { type: 'family_task', taskId: task.id } })
    }
    ledger.add({
      userId: myId,
      tool: 'family_task_created',
      input: { title, assigneeId },
      result: { taskId: task.id },
      status: 'completed',
    }).catch(() => {})
    res.status(201).json({ task: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Edit core task fields (title/description/priority/category/dueDate/
// recurrence) — separate from the /status route above, which the ASSIGNEE
// also uses (Accept/Reject/Start/Complete). Editing the task's own content
// is creator-only, same as delete.
familyRouter.patch('/tasks/:id', async (req, res) => {
  try {
    const myId = req.user.id
    const { title, description, priority, category, dueDate, recurrence } = req.body
    const task = await prisma.familyTask.findUnique({ where: { id: req.params.id } })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    if (task.creatorId !== myId) return res.status(403).json({ error: 'Only the creator can edit this task' })
    if (title !== undefined && !title.trim()) return res.status(400).json({ error: 'title cannot be empty' })
    if (dueDate !== undefined && isPastDueDate(dueDate)) return res.status(400).json({ error: 'Due date cannot be in the past — please pick today or a future date.' })

    const updated = await prisma.familyTask.update({
      where: { id: req.params.id },
      data: {
        ...(title       !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(priority     !== undefined && { priority }),
        ...(category     !== undefined && { category: category || null }),
        ...(dueDate       !== undefined && { dueDate: dueDate || null }),
        ...(recurrence   !== undefined && { recurrence: recurrence || 'None' }),
      },
      include: taskInclude,
    })
    const formatted = fmtTask(updated)
    const io = req.app.get('io')
    emit(io, task.creatorId,  'family:task:updated', formatted)
    emit(io, task.assigneeId, 'family:task:updated', formatted)
    ledger.add({
      userId: myId,
      tool: 'family_task_edited',
      input: { title: formatted.title, changedFields: Object.keys(req.body || {}) },
      result: { taskId: updated.id },
      status: 'completed',
    }).catch(() => {})
    res.json({ task: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.patch('/tasks/:id/status', async (req, res) => {
  try {
    const myId = req.user.id
    const { status } = req.body
    const allowed = ['ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` })

    const task = await prisma.familyTask.findUnique({ where: { id: req.params.id }, include: taskInclude })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    if (task.creatorId !== myId && task.assigneeId !== myId) return res.status(403).json({ error: 'Not authorized' })

    const updated = await prisma.familyTask.update({ where: { id: req.params.id }, data: { status }, include: taskInclude })
    const formatted = fmtTask(updated)
    const io = req.app.get('io')
    emit(io, task.creatorId,  'family:task:updated', formatted)
    emit(io, task.assigneeId, 'family:task:updated', formatted)
    ledger.add({
      userId: myId,
      tool: 'family_task_status_changed',
      input: { status, title: task.title },
      result: { taskId: task.id },
      status: 'completed',
    }).catch(() => {})
    res.json({ task: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.patch('/tasks/:id/checklist', async (req, res) => {
  try {
    const myId = req.user.id
    const { itemId } = req.body
    const task = await prisma.familyTask.findUnique({ where: { id: req.params.id } })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    if (task.creatorId !== myId && task.assigneeId !== myId) return res.status(403).json({ error: 'Not authorized' })

    const checklist = (task.checklist || []).map(i => i.id === itemId ? { ...i, done: !i.done } : i)
    const updated = await prisma.familyTask.update({ where: { id: req.params.id }, data: { checklist }, include: taskInclude })
    const formatted = fmtTask(updated)
    const io = req.app.get('io')
    emit(io, task.creatorId,  'family:task:updated', formatted)
    emit(io, task.assigneeId, 'family:task:updated', formatted)
    res.json({ task: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.post('/tasks/:id/comments', async (req, res) => {
  try {
    const myId = req.user.id
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'text required' })

    const task = await prisma.familyTask.findUnique({ where: { id: req.params.id }, include: taskInclude })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    if (task.creatorId !== myId && task.assigneeId !== myId) return res.status(403).json({ error: 'Not authorized' })

    const me = task.creatorId === myId ? task.creator : task.assignee
    const comments = [...(task.comments || []), { id: Date.now().toString(), text: text.trim(), by: me.name, byId: myId, at: new Date().toISOString() }]
    const updated = await prisma.familyTask.update({ where: { id: req.params.id }, data: { comments }, include: taskInclude })
    const formatted = fmtTask(updated)
    const io = req.app.get('io')
    emit(io, task.creatorId,  'family:task:updated', formatted)
    emit(io, task.assigneeId, 'family:task:updated', formatted)
    res.json({ task: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.delete('/tasks/:id', async (req, res) => {
  try {
    const myId = req.user.id
    const task = await prisma.familyTask.findUnique({ where: { id: req.params.id } })
    if (!task) return res.status(404).json({ error: 'Not found' })
    if (task.creatorId !== myId) return res.status(403).json({ error: 'Only creator can delete' })
    await prisma.familyTask.delete({ where: { id: req.params.id } })
    const io = req.app.get('io')
    emit(io, task.creatorId,  'family:task:deleted', { id: req.params.id })
    emit(io, task.assigneeId, 'family:task:deleted', { id: req.params.id })
    ledger.add({
      userId: myId,
      tool: 'family_task_deleted',
      input: { title: task.title },
      result: { taskId: task.id },
      status: 'completed',
    }).catch(() => {})
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Parent Medications ────────────────────────────────────────────────────────

const fmtMed = (m) => ({
  id: m.id, medName: m.medName, dosage: m.dosage, frequency: m.frequency,
  mealTime: m.mealTime, parent: m.parent, startDate: m.startDate,
  duration: m.duration, doctor: m.doctor, notes: m.notes,
  refillDate: m.refillDate, doseTimes: Array.isArray(m.doseTimes) ? m.doseTimes : [], active: m.active,
  createdAt: m.createdAt, updatedAt: m.updatedAt,
})

// "HH:mm" 24-hour strings only — anything else is silently dropped rather
// than stored malformed, since the poller does a literal string match.
function cleanDoseTimes(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t))))].sort()
}

async function syncMedMemory(userId, prismaClient) {
  const meds = await prismaClient.parentMedication.findMany({
    where: { userId, active: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!meds.length) return
  const summary = meds.map(m =>
    `${m.parent}: ${m.medName} ${m.dosage}, ${m.frequency}${m.mealTime ? ', ' + m.mealTime : ''}${m.doctor ? ', Dr. ' + m.doctor : ''}${m.refillDate ? ', refill ' + m.refillDate : ''}`
  ).join(' | ')
  const memoryText = `Parent medications: ${summary}`
  const profile = await prismaClient.userProfile.findUnique({ where: { userId } })
  const existing = Array.isArray(profile?.aiMemories) ? profile.aiMemories : []
  const filtered = existing.filter(e => !String(e?.text || e?.payload?.text || '').startsWith('Parent medications:'))
  const updated = [{ text: memoryText, type: 'parent_medication', updatedAt: new Date().toISOString() }, ...filtered].slice(0, 50)
  await prismaClient.userProfile.upsert({
    where: { userId },
    update: { aiMemories: updated },
    create: { userId, aiMemories: updated },
  })
}

// Doctor names: letters, spaces and . ' - only — no digits.
const isValidDoctorName = (v) => !v || (/^[^\d!@#$%^&*()_+=\[\]{}<>?/\\|~`":;,]+$/.test(v) && /[A-Za-z\u00C0-\uFFFF]/.test(v))

// ParentMedication.parent is one of Dad/Mom/Both \u2014 this maps it to the
// matching FamilyConnection.relationship label(s) so a medicine added for
// "Dad" can find the connection where he himself is on the other end. Only
// meaningful when the current user is the one who sent that connection
// request \u2014 relationship is stored as "what the other side is to the
// requester", so a connection the current user only received (someone else
// labeled them, not the reverse) won't match here.
function relationshipsForParent(parent) {
  if (parent === 'Dad') return ['Father']
  if (parent === 'Mom') return ['Mother']
  if (parent === 'Both') return ['Father', 'Mother']
  return []
}

// Notifies whichever connected family member this medicine is actually
// about (if any) \u2014 e.g. adding a medicine for "Dad" pushes to the
// connection whose relationship is "Father", since the medicine concerns
// them, not just the person who logged it. Shared by the manual route
// below and the add_parent_medication AI tool (autonomyEngine.js), which
// creates the record via Prisma directly and so needs its own call into
// this \u2014 same reason create_loan calls into finance.js's emiDataFromLoan.
export async function notifyConnectedParent(userId, med) {
  const relationships = relationshipsForParent(med.parent)
  if (!relationships.length) return
  const connections = await prisma.familyConnection.findMany({
    where: {
      status: 'ACCEPTED',
      relationship: { in: relationships },
      OR: [{ requesterId: userId }, { receiverId: userId }],
    },
  })
  if (!connections.length) return
  const creator = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  for (const conn of connections) {
    const otherId = conn.requesterId === userId ? conn.receiverId : conn.requesterId
    emitToUser(otherId, 'parent_med:created_for_you', med)
    sendPushToUser(otherId, {
      title: 'New medicine added for you',
      body: `${creator?.name || 'A family member'} added ${med.medName} (${med.dosage}) for you`,
      data: { type: 'parent_medication', medicationId: med.id },
    })
  }
}

familyRouter.get('/parent-medications', async (req, res) => {
  try {
    const meds = await prisma.parentMedication.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ medications: meds.map(fmtMed) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.post('/parent-medications', async (req, res) => {
  try {
    const { medName, dosage, frequency, mealTime, parent, startDate, duration, doctor, notes, refillDate, doseTimes } = req.body
    if (!isValidDoctorName(doctor?.trim())) return res.status(400).json({ error: 'Doctor name can only contain letters' })
    if (!medName?.trim() || !dosage?.trim() || !frequency || !parent) {
      return res.status(400).json({ error: 'medName, dosage, frequency and parent are required' })
    }
    const med = await prisma.parentMedication.create({
      data: {
        userId: req.user.id,
        medName: medName.trim(), dosage: dosage.trim(), frequency,
        mealTime: mealTime || null, parent,
        startDate: startDate?.trim() || null, duration: duration?.trim() || null,
        doctor: doctor?.trim() || null, notes: notes?.trim() || null,
        refillDate: refillDate?.trim() || null,
        doseTimes: cleanDoseTimes(doseTimes),
      },
    })
    await syncMedMemory(req.user.id, prisma)
    const formatted = fmtMed(med)
    emit(req.app.get('io'), req.user.id, 'parent_med:created', formatted)
    sendPushToUser(req.user.id, {
      title: 'Medicine added',
      body: `${formatted.medName} (${formatted.dosage}) added for ${formatted.parent}`,
      data: { type: 'parent_medication', medicationId: med.id },
    })
    notifyConnectedParent(req.user.id, formatted).catch(() => {})
    ledger.add({
      userId: req.user.id,
      tool: 'parent_medication_created',
      input: { medName: formatted.medName, dosage: formatted.dosage, parent: formatted.parent },
      result: { medicationId: med.id },
      status: 'completed',
    }).catch(() => {})
    res.status(201).json({ medication: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.patch('/parent-medications/:id', async (req, res) => {
  try {
    const med = await prisma.parentMedication.findUnique({ where: { id: req.params.id } })
    if (!med) return res.status(404).json({ error: 'Not found' })
    if (med.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    const { medName, dosage, frequency, mealTime, parent, startDate, duration, doctor, notes, refillDate, doseTimes, active } = req.body
    if (doctor !== undefined && !isValidDoctorName(String(doctor || '').trim())) return res.status(400).json({ error: 'Doctor name can only contain letters' })
    const updated = await prisma.parentMedication.update({
      where: { id: req.params.id },
      data: {
        ...(medName    !== undefined && { medName: medName.trim() }),
        ...(dosage     !== undefined && { dosage: dosage.trim() }),
        ...(frequency  !== undefined && { frequency }),
        ...(mealTime   !== undefined && { mealTime: mealTime || null }),
        ...(parent     !== undefined && { parent }),
        ...(startDate  !== undefined && { startDate: startDate?.trim() || null }),
        ...(duration   !== undefined && { duration: duration?.trim() || null }),
        ...(doctor     !== undefined && { doctor: doctor?.trim() || null }),
        ...(notes      !== undefined && { notes: notes?.trim() || null }),
        ...(refillDate !== undefined && { refillDate: refillDate?.trim() || null }),
        ...(doseTimes  !== undefined && { doseTimes: cleanDoseTimes(doseTimes) }),
        ...(active     !== undefined && { active: Boolean(active) }),
      },
    })
    await syncMedMemory(req.user.id, prisma)
    const formatted = fmtMed(updated)
    emit(req.app.get('io'), req.user.id, 'parent_med:updated', formatted)
    ledger.add({
      userId: req.user.id,
      tool: 'parent_medication_updated',
      input: { medName: formatted.medName, changedFields: Object.keys(req.body || {}) },
      result: { medicationId: updated.id },
      status: 'completed',
    }).catch(() => {})
    res.json({ medication: formatted })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

familyRouter.delete('/parent-medications/:id', async (req, res) => {
  try {
    const med = await prisma.parentMedication.findUnique({ where: { id: req.params.id } })
    if (!med) return res.status(404).json({ error: 'Not found' })
    if (med.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    await prisma.parentMedication.delete({ where: { id: req.params.id } })
    await syncMedMemory(req.user.id, prisma)
    emit(req.app.get('io'), req.user.id, 'parent_med:deleted', { id: req.params.id })
    ledger.add({
      userId: req.user.id,
      tool: 'parent_medication_deleted',
      input: { medName: med.medName, parent: med.parent },
      result: { medicationId: med.id },
      status: 'completed',
    }).catch(() => {})
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
