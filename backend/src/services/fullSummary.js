import { prisma } from '../config/prisma.js'
import { userStore } from '../models/userStore.js'
import { getUrgentEmails } from './gmail.service.js'

const DAY_MS = 24 * 60 * 60 * 1000
const LOOKAHEAD_DAYS = 7

// Bill/EMI/refill due dates are a mix of DateTime columns and free-text
// strings (FamilyTask.dueDate, ParentMedication.refillDate) depending on the
// model, so this has to parse leniently rather than assume a Date instance.
function isWithinLookahead(dateLike, now) {
  if (!dateLike) return false
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() >= now.getTime() - DAY_MS && d.getTime() <= now.getTime() + LOOKAHEAD_DAYS * DAY_MS
}

// Cross-module aggregator — pulls the pending/upcoming items from every
// domain (Communications, Priorities, Family, Health, Finance) into one
// response, so the AI can answer "give me my full summary" in a single
// call instead of the LLM having to chain several single-domain tools.
export async function buildFullSummary(userId) {
  const now = new Date()
  const weekEnd = new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS)

  const [
    user,
    pendingTasks,
    unreadAlerts,
    familyTasks,
    medications,
    petReminders,
    familyItems,
    bills,
    loans,
    emis,
    subscriptions,
    fixedDeposits,
  ] = await Promise.all([
    userStore.getById(userId),
    prisma.task.findMany({ where: { userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.notification.findMany({ where: { userId, read: false, priority: { gte: 60 } }, orderBy: { priority: 'desc' }, take: 10 }),
    prisma.familyTask.findMany({ where: { OR: [{ assigneeId: userId }, { creatorId: userId }], status: { notIn: ['COMPLETED', 'DONE'] } }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.parentMedication.findMany({ where: { userId, active: true } }),
    prisma.petReminder.findMany({ where: { userId, done: false, remindAt: { gte: now, lte: weekEnd } }, orderBy: { remindAt: 'asc' } }),
    prisma.familyItem.findMany({ where: { userId, done: false, remindAt: { gte: now, lte: weekEnd } }, orderBy: { remindAt: 'asc' } }),
    prisma.bill.findMany({ where: { userId, status: { in: ['Upcoming', 'Due', 'Overdue'] } } }),
    prisma.loan.findMany({ where: { userId, status: 'Active' } }),
    prisma.emi.findMany({ where: { userId, status: 'Active' } }),
    prisma.subscription.findMany({ where: { userId, status: 'Active' } }),
    prisma.fixedDeposit.findMany({ where: { userId, status: 'Active' } }),
  ])

  // Gmail requires a connected account — degrade silently rather than fail
  // the whole summary when it isn't connected.
  let urgentEmails = []
  try {
    if (user) urgentEmails = await getUrgentEmails(user, 20)
  } catch { /* not connected or token expired */ }

  const upcomingBills = bills
    .filter(b => isWithinLookahead(b.dueDate, now))
    .map(b => ({ name: b.name, amount: b.expectedAmount ?? b.lastBillAmount ?? 0, dueDate: b.dueDate, status: b.status }))

  const upcomingPayments = [
    ...loans.filter(l => isWithinLookahead(l.nextEmiDate, now)).map(l => ({ kind: 'loan_emi', name: l.name, amount: l.emiAmount, dueDate: l.nextEmiDate })),
    ...emis.filter(e => isWithinLookahead(e.nextPaymentDate, now)).map(e => ({ kind: 'emi', name: e.name, amount: e.emiAmount, dueDate: e.nextPaymentDate })),
  ]

  const upcomingSubscriptions = subscriptions
    .filter(s => isWithinLookahead(s.nextBillingDate, now))
    .map(s => ({ name: s.name, amount: s.amount, dueDate: s.nextBillingDate }))

  const maturingFixedDeposits = fixedDeposits
    .filter(f => isWithinLookahead(f.maturityDate, now))
    .map(f => ({ name: f.name, amount: f.maturityAmount ?? f.principalAmount, maturityDate: f.maturityDate }))

  const medicationRefills = medications
    .filter(m => isWithinLookahead(m.refillDate, now))
    .map(m => ({ medName: m.medName, parent: m.parent, refillDate: m.refillDate }))

  // Health has no stored "needs attention" flag today — report today's
  // logged snapshot as informational context, not a flagged alert.
  let healthToday = null
  try {
    const prefs = user?.preferences || {}
    const todayKey = now.toISOString().slice(0, 10)
    healthToday = prefs.healthLog?.[todayKey] || prefs.healthSync || null
  } catch { /* preferences blob missing/malformed */ }

  const sections = {
    communications: {
      urgentEmails: urgentEmails.map(e => ({ subject: e.subject, from: e.from, time: e.time, urgencyScore: e.urgencyScore })),
      unreadAlerts: unreadAlerts.map(n => ({ title: n.title, priority: n.priority })),
    },
    priorities: {
      pendingTasks: pendingTasks.map(t => ({ title: t.title, description: t.description })),
    },
    family: {
      tasks: familyTasks.map(t => ({ title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate })),
      medicationRefills,
      petReminders: petReminders.map(r => ({ title: r.title, type: r.type, remindAt: r.remindAt })),
      upcoming: familyItems.map(i => ({ domain: i.domain, type: i.type, remindAt: i.remindAt })),
    },
    health: {
      today: healthToday,
    },
    finance: {
      upcomingBills,
      upcomingPayments,
      upcomingSubscriptions,
      maturingFixedDeposits,
    },
  }

  const counts = {
    urgentEmails: urgentEmails.length,
    unreadAlerts: unreadAlerts.length,
    pendingTasks: pendingTasks.length,
    familyTasks: familyTasks.length,
    medicationRefills: medicationRefills.length,
    petReminders: petReminders.length,
    familyUpcoming: familyItems.length,
    financeDueSoon: upcomingBills.length + upcomingPayments.length + upcomingSubscriptions.length + maturingFixedDeposits.length,
  }
  const totalImportant = Object.values(counts).reduce((sum, n) => sum + n, 0)

  return {
    generatedAt: now.toISOString(),
    totalImportant,
    counts,
    sections,
  }
}

// Raw due-dated items (not the display-shaped sections above) for the
// advance-reminder scanner — one row per item with a real due date, so it
// can compute "due date minus N minutes" per user-configured lead time.
// Deliberately excludes items with no due date (tasks, unread alerts) since
// there's nothing to count down to.
export async function getDueSoonItems(userId) {
  const now = new Date()
  const weekEnd = new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS)
  const inFutureWindow = (dateLike) => {
    if (!dateLike) return false
    const d = new Date(dateLike)
    return !Number.isNaN(d.getTime()) && d.getTime() > now.getTime() && d.getTime() <= weekEnd.getTime()
  }

  const [bills, loans, emis, subscriptions, fixedDeposits, medications, petReminders, familyItems] = await Promise.all([
    prisma.bill.findMany({ where: { userId, status: { in: ['Upcoming', 'Due', 'Overdue'] } } }),
    prisma.loan.findMany({ where: { userId, status: 'Active' } }),
    prisma.emi.findMany({ where: { userId, status: 'Active' } }),
    prisma.subscription.findMany({ where: { userId, status: 'Active' } }),
    prisma.fixedDeposit.findMany({ where: { userId, status: 'Active' } }),
    prisma.parentMedication.findMany({ where: { userId, active: true } }),
    prisma.petReminder.findMany({ where: { userId, done: false } }),
    prisma.familyItem.findMany({ where: { userId, done: false } }),
  ])

  const items = []
  for (const b of bills) if (inFutureWindow(b.dueDate)) items.push({ itemType: 'bill', itemId: b.id, title: `${b.name} bill due`, dueDate: new Date(b.dueDate) })
  for (const l of loans) if (inFutureWindow(l.nextEmiDate)) items.push({ itemType: 'loan', itemId: l.id, title: `${l.name} EMI due`, dueDate: new Date(l.nextEmiDate) })
  for (const e of emis) if (inFutureWindow(e.nextPaymentDate)) items.push({ itemType: 'emi', itemId: e.id, title: `${e.name} payment due`, dueDate: new Date(e.nextPaymentDate) })
  for (const s of subscriptions) if (inFutureWindow(s.nextBillingDate)) items.push({ itemType: 'subscription', itemId: s.id, title: `${s.name} renews`, dueDate: new Date(s.nextBillingDate) })
  for (const f of fixedDeposits) if (inFutureWindow(f.maturityDate)) items.push({ itemType: 'fixed_deposit', itemId: f.id, title: `${f.name} matures`, dueDate: new Date(f.maturityDate) })
  for (const m of medications) if (inFutureWindow(m.refillDate)) items.push({ itemType: 'medication', itemId: m.id, title: `${m.medName} refill for ${m.parent}`, dueDate: new Date(m.refillDate) })
  for (const p of petReminders) if (inFutureWindow(p.remindAt)) items.push({ itemType: 'pet_reminder', itemId: p.id, title: p.title, dueDate: new Date(p.remindAt) })
  for (const fi of familyItems) if (inFutureWindow(fi.remindAt)) items.push({ itemType: 'family_item', itemId: fi.id, title: `${fi.type} (${fi.domain})`, dueDate: new Date(fi.remindAt) })

  return items
}
