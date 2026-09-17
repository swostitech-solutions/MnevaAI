import { prisma } from '../config/prisma.js'
import { ledger } from './ledgerService.js'
import { emitToUser } from './realtime.js'
import { qdrantService } from './qdrant.service.js'

// Which trust-autonomy domain (Settings > Trust > Autonomy toggles) gates
// each AI tool. Only tools with a real, hard-to-reverse, externally-visible
// side effect are gated — sending an email or moving money, not drafting a
// reminder or a stubbed cab/food booking that has no real provider wired up.
export const GATED_DOMAINS = {
  initiate_payment: 'finance',
  send_email: 'communications',
}

// L1 -> L2 auto-graduation, deliberately NOT based on a raw chat-message
// tally (10 empty "hi"s shouldn't count as Mneva having learned anything).
// Both conditions must hold: real accumulated memory (proof it's actually
// read/understood something about you — conversations, documents, connected
// data all feed the same memory store) AND a minimum account age, so this
// can never fire in one sitting no matter how much someone chats at once.
const L1_GRADUATION_MEMORY_COUNT = 20
const L1_GRADUATION_MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

// Called after every user-sent chat message — a no-op for anyone not
// currently at L1, so it's cheap to call unconditionally from
// message.controller.js rather than needing its own trigger plumbing.
export async function checkObserveGraduation(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { trustLevel: true, createdAt: true } })
  if ((user?.trustLevel || 1) !== 1) return

  const accountAgeMs = Date.now() - new Date(user.createdAt).getTime()
  if (accountAgeMs < L1_GRADUATION_MIN_ACCOUNT_AGE_MS) return

  const memoryCount = await qdrantService.countByFilter('mneva_memory', {
    must: [{ key: 'userId', match: { value: userId } }],
  })
  if (memoryCount < L1_GRADUATION_MEMORY_COUNT) return

  await prisma.user.update({ where: { id: userId }, data: { trustLevel: 2 } })
  const ledgerEntry = await ledger.add({
    userId, tool: 'trust_level_changed',
    input: { from: 1, to: 2, reason: 'observe_graduation' },
    result: { level: 2 }, status: 'completed',
  })
  await prisma.notification.create({
    data: {
      userId,
      title: '⬆️ Trust level increased',
      message: "Mneva has learned enough about you now, so it raised your trust level to L2 — it'll start proposing things for you to approve.",
    },
  })
  // Reuses the exact same event Settings.js/Askai.js already listen for
  // from the approval-streak path — no separate frontend wiring needed.
  emitToUser(userId, 'trust:levelChanged', { level: 2, previousLevel: 1 })
  emitToUser(userId, 'ledger:updated', ledgerEntry)
}

export async function getAutonomyPolicy(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { trustLevel: true, preferences: true } })
  return {
    trustLevel: user?.trustLevel || 2,
    autonomy: user?.preferences?.autonomy || {},
    rejections: user?.preferences?.autonomyRejections || {},
    privacy: user?.preferences?.privacy || {},
  }
}

// L1 Observe: never acts, only surfaces insight.
// L2 Suggest / L3 Draft & Prep: always drafts and waits for a tap to approve.
// L4 Inner Circle: acts immediately — unless the user has ever denied a
// pending action in this same domain, in which case it falls back to asking
// again. That's a one-way trust downgrade per domain: once denied, this
// domain stays "ask first" at every level, including L4, until a person
// resets it (there's no auto-recovery — see Settings).
// `amount` only matters for initiate_payment — the one truly irreversible
// action this gate covers. Everything else (currently just send_email)
// ignores it.
export function decideGate(tool, policy, amount = 0) {
  const domain = GATED_DOMAINS[tool]
  if (!domain) return { mode: 'execute', domain: null }
  if (policy.autonomy[domain] === false) return { mode: 'blocked', domain, reason: 'domain_disabled' }
  if (policy.trustLevel <= 1) return { mode: 'blocked', domain, reason: 'observe_mode' }

  // A large payment always needs a real approval tap, no matter how much
  // trust has been earned — same ₹1,000 line Bills' own biometric gate
  // already draws between "routine" and "needs a human," now applied here
  // too so "Inner Circle" never means unattended large payments.
  const isLargePayment = tool === 'initiate_payment' && amount >= 1000
  if (isLargePayment) return { mode: 'pending', domain }

  // Once a domain has been explicitly denied, it goes back to asking every
  // time regardless of level — applies uniformly now, not just at L4.
  if (policy.rejections[domain]) return { mode: 'pending', domain }

  // L3 ("one tap") auto-executes small, routine payments — this is the
  // actual functional difference from L2, which asked for everything.
  if (policy.trustLevel >= 3 && tool === 'initiate_payment') return { mode: 'execute', domain }
  // L4 auto-executes everything else this gate covers (e.g. email).
  if (policy.trustLevel >= 4) return { mode: 'execute', domain }

  return { mode: 'pending', domain }
}

export function blockedMessage(reason, actionLabel) {
  if (reason === 'observe_mode') {
    return `I'm set to Observe mode, so I won't ${actionLabel} automatically — raise your trust level in Settings if you'd like me to help with this.`
  }
  if (reason === 'domain_disabled') {
    return `That category is turned off in your autonomy settings, so I won't ${actionLabel} automatically — enable it in Settings if you'd like me to help with this.`
  }
  return `I can't ${actionLabel} automatically right now.`
}

export async function executeSendEmailSideEffect(userId, input) {
  const { sendEmail } = await import('./gmail.service.js')
  const { userStore } = await import('../models/userStore.js')
  const user = await userStore.getById(userId)
  const result = await sendEmail(user, input.recipient, input.email_id, input.draft)
  return { success: true, result }
}

// Mirrors the real side effect of POST /api/finance/pay (marks the Bill
// Paid) so an AI-approved payment and a manually-tapped one behave the same.
export async function executePaymentSideEffect(userId, input) {
  const billId = input.bill_id || input.billId
  if (billId) {
    const bill = await prisma.bill.findUnique({ where: { id: billId } })
    if (bill && bill.userId === userId) {
      const updated = await prisma.bill.update({ where: { id: bill.id }, data: { status: 'Paid' } })
      emitToUser(userId, 'bill:updated', updated)
    }
  }
  return { success: true, actionId: `pay_${Date.now()}`, paid: true, ...input }
}

export async function createPendingAction(userId, tool, domain, input, summary) {
  const action = await prisma.pendingAction.create({ data: { userId, tool, domain, input, summary } })
  emitToUser(userId, 'action:pending', { id: action.id, tool, domain, summary, input, createdAt: action.createdAt })
  return action
}

export async function listPendingActions(userId) {
  return prisma.pendingAction.findMany({ where: { userId, status: 'pending' }, orderBy: { createdAt: 'desc' } })
}

async function setDomainRejected(userId, domain) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
  const prefs = user?.preferences || {}
  prefs.autonomyRejections = { ...(prefs.autonomyRejections || {}), [domain]: true }
  await prisma.user.update({ where: { id: userId }, data: { preferences: prefs } })
}

// How many consecutive approvals raise the trust level by one, and how many
// consecutive denials lower it by one. A streak resets to zero the moment
// the opposite decision happens, or the moment it triggers a level change —
// so every level always needs its own fresh run of good behavior, and one
// old good streak years back can't paper over recent rejections.
const APPROVALS_TO_LEVEL_UP = 5
const REJECTIONS_TO_LEVEL_DOWN = 2

// Called on every resolved pending action — this is the one place trust
// score AND trust level move, so "approve in chat" and "hit the HTTP
// approve route directly" always produce the exact same trust consequence.
async function applyTrustFeedback(userId, decision) {
  const approved = decision === 'approve'
  const trustScore = await prisma.trustScore.upsert({
    where: { userId },
    update: approved
      ? { approvedActions: { increment: 1 }, score: { increment: 1 }, approvalStreak: { increment: 1 }, rejectionStreak: 0 }
      : { rejectedActions: { increment: 1 }, score: { decrement: 1 }, rejectionStreak: { increment: 1 }, approvalStreak: 0 },
    create: approved
      ? { userId, approvedActions: 1, score: 1, approvalStreak: 1, rejectionStreak: 0 }
      : { userId, rejectedActions: 1, score: -1, rejectionStreak: 1, approvalStreak: 0 },
  })

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { trustLevel: true } })
  const currentLevel = user?.trustLevel || 2
  let newLevel = currentLevel
  if (approved && trustScore.approvalStreak >= APPROVALS_TO_LEVEL_UP && currentLevel < 4) newLevel = currentLevel + 1
  else if (!approved && trustScore.rejectionStreak >= REJECTIONS_TO_LEVEL_DOWN && currentLevel > 1) newLevel = currentLevel - 1

  if (newLevel === currentLevel) return

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { trustLevel: newLevel } }),
    prisma.trustScore.update({ where: { userId }, data: { approvalStreak: 0, rejectionStreak: 0 } }),
  ])
  const levelUp = newLevel > currentLevel
  const ledgerEntry = await ledger.add({
    userId, tool: 'trust_level_changed',
    input: { from: currentLevel, to: newLevel, reason: levelUp ? 'approval_streak' : 'rejection_streak' },
    result: { level: newLevel }, status: 'completed',
  })
  await prisma.notification.create({
    data: {
      userId,
      title: levelUp ? '⬆️ Trust level increased' : '⬇️ Trust level decreased',
      message: levelUp
        ? `You've been approving Mneva's suggestions consistently, so it raised your trust level to L${newLevel}.`
        : `Mneva lowered your trust level to L${newLevel} after a couple of declined actions.`,
    },
  })
  emitToUser(userId, 'trust:levelChanged', { level: newLevel, previousLevel: currentLevel })
  emitToUser(userId, 'ledger:updated', ledgerEntry)
}

// The single place both the socket handlers and the HTTP /api/agent
// approve/deny routes call, so "tap approve in chat" and "hit the API
// directly" go through identical enforcement and produce identical ledger
// entries.
export async function resolvePendingAction(userId, actionId, decision, opts = {}) {
  const action = await prisma.pendingAction.findUnique({ where: { id: actionId } })
  if (!action || action.userId !== userId) return { error: 'not_found' }
  if (action.status !== 'pending') return { error: 'already_resolved', status: action.status }

  if (decision === 'deny') {
    await prisma.pendingAction.update({ where: { id: actionId }, data: { status: 'rejected', resolvedAt: new Date() } })
    await setDomainRejected(userId, action.domain)
    const ledgerEntry = await ledger.add({
      userId, tool: action.tool, input: action.input,
      result: { success: false, rejectedByUser: true }, status: 'rejected',
    })
    emitToUser(userId, 'ledger:updated', ledgerEntry)
    await applyTrustFeedback(userId, 'deny')
    return { status: 'rejected' }
  }

  // Approving a ≥ ₹1,000 payment still needs the same biometric confirmation
  // as tapping "Pay" directly in Bills — approving in chat isn't a way
  // around that gate.
  if (action.tool === 'initiate_payment') {
    const amount = Number(action.input?.amount) || 0
    if (amount >= 1000) {
      const policy = await getAutonomyPolicy(userId)
      const gateOn = policy.privacy.biometricGate !== false
      if (gateOn && opts.biometricConfirmed !== true) return { error: 'biometric_required' }
    }
  }

  let result
  if (action.tool === 'send_email') result = await executeSendEmailSideEffect(userId, action.input)
  else if (action.tool === 'initiate_payment') result = await executePaymentSideEffect(userId, action.input)
  else result = { success: false, error: 'Unsupported action type' }

  await prisma.pendingAction.update({ where: { id: actionId }, data: { status: 'approved', resolvedAt: new Date() } })
  const ledgerEntry = await ledger.add({
    userId, tool: action.tool, input: action.input, result,
    status: result?.success === false ? 'failed' : 'completed',
  })
  emitToUser(userId, 'ledger:updated', ledgerEntry)
  // The user approved it either way — a downstream failure (e.g. Gmail not
  // connected) isn't a trust signal about their judgment, so this still
  // counts as a positive approval for the streak.
  await applyTrustFeedback(userId, 'approve')
  return { status: 'approved', result }
}
