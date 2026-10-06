import { Queue, Worker } from 'bullmq'
import { getBullRedisClient } from '../config/redis.js'
import { logger } from '../config/logger.js'
import { prisma } from '../config/prisma.js'
import { emitToUser } from '../services/realtime.js'

const CRON_PATTERN = '0 9 * * *' // once daily, 9am server time — pattern detection, not time-critical
const REPEAT_JOB_ID = 'proactive-suggestions-main'
const RECURRING_EXPENSE_MIN_COUNT = 3
const RECURRING_EXPENSE_WINDOW_DAYS = 90
const BILL_DUE_SOON_DAYS = 3
const MEDICINE_REFILL_SOON_DAYS = 3
const HEALTH_INACTIVITY_DAYS = 3

let queue

export function getProactiveSuggestionsQueue() {
  if (!queue) {
    queue = new Queue('proactive-suggestions', { connection: getBullRedisClient() })
  }
  return queue
}

// Idempotent — same as the other scan schedulers, safe to call every boot.
export async function scheduleProactiveSuggestionsScan() {
  const q = getProactiveSuggestionsQueue()
  await q.add(
    'run-proactive-suggestions-scan',
    {},
    { repeat: { pattern: CRON_PATTERN }, jobId: REPEAT_JOB_ID },
  )
  logger.info(`💡 Proactive suggestions scan scheduled — "${CRON_PATTERN}"`)
}

// Reports what an autonomous executeTool call actually did — its 'pending'
// outcome already creates a PendingAction and emits action:pending itself
// (see executeTool), so this only covers the other two: L1 Observe (never
// acts, only surfaces insight — no "approve this?" offer at all) and L4
// Inner Circle (acted immediately; tell the user after the fact).
async function notifyOutcome(userId, result, executedTitle, executedBody, insightTitle, insightBody) {
  if (result.blocked) {
    await prisma.notification.create({
      data: { userId, title: insightTitle, message: JSON.stringify({ source: 'proactive_insight', preview: insightBody }) },
    })
    emitToUser(userId, 'notification:created', { title: insightTitle })
    return
  }
  if (result.status === 'pending_approval') return
  if (result.success === false) return // genuine failure (not a gate outcome) — nothing to tell the user yet
  await prisma.notification.create({
    data: { userId, title: executedTitle, message: JSON.stringify({ source: 'proactive_action', preview: executedBody }) },
  })
  emitToUser(userId, 'notification:created', { title: executedTitle })
}

// Avoids re-proposing the same thing on every scan while an earlier
// suggestion is still sitting unapproved.
async function hasPendingActionLike(userId, tool, matches) {
  const pending = await prisma.pendingAction.findMany({ where: { userId, tool, status: 'pending' } })
  return pending.some((p) => { try { return matches(p.input) } catch { return false } })
}

// Finance: same category + same rounded amount showing up repeatedly in
// Expenses looks like a subscription nobody's tracked yet.
async function scanRecurringExpenses(userId, executeTool) {
  const since = new Date(Date.now() - RECURRING_EXPENSE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const expenses = await prisma.expense.findMany({ where: { userId, date: { gte: since }, category: { not: null } } })
  const groups = {}
  for (const e of expenses) {
    const key = `${e.category}|${Math.round(e.amount)}`
    ;(groups[key] ||= []).push(e)
  }
  const existingSubs = await prisma.subscription.findMany({ where: { userId } })
  for (const [key, list] of Object.entries(groups)) {
    if (list.length < RECURRING_EXPENSE_MIN_COUNT) continue
    const [category, amountStr] = key.split('|')
    const amount = Number(amountStr)
    if (existingSubs.some((s) => s.category === category && Math.abs(s.amount - amount) < 1)) continue
    if (await hasPendingActionLike(userId, 'create_subscription', (i) => i.category === category && Math.abs(Number(i.amount) - amount) < 1)) continue

    const name = `${category} (recurring)`
    const result = await executeTool('create_subscription', { name, category, amount, billing_cycle: 'Monthly' }, userId, { autonomous: true })
    await notifyOutcome(
      userId, result,
      '💡 Subscription added', `Noticed ${list.length} similar ${category} expenses (₹${amount}) — added it as a tracked subscription.`,
      '💡 Recurring expense noticed', `${list.length} similar ${category} expenses (₹${amount}) look like a subscription — once Finance autonomy is higher I can track it automatically.`,
    )
    return // one suggestion per scan is enough — avoid flooding a single run
  }
}

// Finance: an unpaid, non-autoPay bill due within a few days.
async function scanBillsDueSoon(userId, executeTool) {
  const now = new Date()
  const soon = new Date(now.getTime() + BILL_DUE_SOON_DAYS * 24 * 60 * 60 * 1000)
  const bills = await prisma.bill.findMany({
    where: { userId, status: { not: 'Paid' }, autoPay: false, dueDate: { gte: now, lte: soon } },
  })
  for (const bill of bills) {
    const amount = bill.expectedAmount || bill.lastBillAmount
    if (!amount) continue
    if (await hasPendingActionLike(userId, 'initiate_payment', (i) => i.bill_id === bill.id)) continue

    const result = await executeTool('initiate_payment', { bill_id: bill.id, amount, payee: bill.provider || bill.name, note: 'Auto-suggested: due soon' }, userId, { autonomous: true })
    await notifyOutcome(
      userId, result,
      '💡 Bill paid', `${bill.name} was due soon — paid it automatically.`,
      '💡 Bill due soon', `${bill.name} (₹${amount.toLocaleString('en-IN')}) is due in ${BILL_DUE_SOON_DAYS} days — once Finance autonomy is higher I can offer to pay it.`,
    )
  }
}

// Family: a parent's medication whose refillDate is coming up.
async function scanMedicineRefills(userId, executeTool) {
  const now = new Date()
  const soon = new Date(now.getTime() + MEDICINE_REFILL_SOON_DAYS * 24 * 60 * 60 * 1000)
  const meds = await prisma.parentMedication.findMany({ where: { userId, active: true, refillDate: { not: null } } })
  for (const med of meds) {
    const refill = new Date(med.refillDate)
    if (isNaN(refill.getTime()) || refill < now || refill > soon) continue
    const title = `Refill ${med.medName} for ${med.parent}`
    if (await hasPendingActionLike(userId, 'create_family_task', (i) => i.title === title)) continue

    const result = await executeTool('create_family_task', { title, due_date: med.refillDate, priority: 'Medium', category: 'Health' }, userId, { autonomous: true })
    await notifyOutcome(
      userId, result,
      '💡 Refill task added', `${title} — added as a family task.`,
      '💡 Refill coming up', `${title} within ${MEDICINE_REFILL_SOON_DAYS} days — once Family autonomy is higher I can add this as a task automatically.`,
    )
  }
}

// Health has no gated tool that fits "remind me to log data" — log_health_data
// needs real values (steps, weight...) the AI can't invent on its own, so
// there is nothing here for it to autonomously create. This is a plain
// reminder, not a data-changing action, so it never goes through
// decideGate/executeTool and isn't gated by Health's trust level at all.
async function scanHealthInactivity(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
  const healthLog = user?.preferences?.healthLog || {}
  const lastDateStr = Object.keys(healthLog).sort().pop() // "YYYY-MM-DD" keys sort correctly as strings
  const daysSince = lastDateStr ? (Date.now() - new Date(lastDateStr).getTime()) / (24 * 60 * 60 * 1000) : Infinity
  if (daysSince < HEALTH_INACTIVITY_DAYS) return

  const marker = 'health_inactivity_nudge'
  const recent = await prisma.notification.findFirst({
    where: { userId, message: { contains: marker }, createdAt: { gte: new Date(Date.now() - HEALTH_INACTIVITY_DAYS * 24 * 60 * 60 * 1000) } },
  })
  if (recent) return

  await prisma.notification.create({
    data: {
      userId,
      title: '💡 Haven\'t logged health data in a while',
      message: JSON.stringify({ source: marker, preview: `No health data logged in ${Math.floor(daysSince)} day(s) — tap to log today's.` }),
    },
  })
  emitToUser(userId, 'notification:created', { title: 'Health reminder' })
}

export function startProactiveSuggestionsWorker() {
  const worker = new Worker(
    'proactive-suggestions',
    async () => {
      // Deferred import — autonomyEngine.js is a large module and this queue
      // only needs executeTool from it, loaded once the worker actually runs.
      const { executeTool } = await import('../agents/autonomyEngine.js')
      const users = await prisma.user.findMany({ select: { id: true } })
      logger.info(`💡 Running proactive suggestions scan for ${users.length} user(s)`)
      let scanned = 0
      for (const { id: userId } of users) {
        try {
          await scanRecurringExpenses(userId, executeTool)
          await scanBillsDueSoon(userId, executeTool)
          await scanMedicineRefills(userId, executeTool)
          await scanHealthInactivity(userId)
          scanned++
        } catch (err) {
          logger.warn(`Proactive suggestions scan failed for user=${userId}: ${err.message}`)
        }
      }
      return { ok: true, scanned }
    },
    { connection: getBullRedisClient() },
  )

  worker.on('failed', (job, err) => {
    logger.error(`Proactive suggestions job failed: ${job?.id} ${err.message}`)
  })

  return worker
}
