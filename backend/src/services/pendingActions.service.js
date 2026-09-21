import { prisma } from '../config/prisma.js'
import { ledger } from './ledgerService.js'
import { emitToUser } from './realtime.js'

// Which trust-autonomy domain gates each AI tool. Only tools with a real,
// hard-to-reverse, externally-visible side effect are gated — pure
// read/query tools (get_daily_brief, get_emails, get_health_data,
// get_portfolio, search_contacts, etc.) never are. See "Stages in Mneva
// AI.pdf" for the per-domain L1-L4 progression this whole file implements.
export const GATED_DOMAINS = {
  initiate_payment: 'finance',
  create_subscription: 'finance',
  create_loan: 'finance',
  create_emi: 'finance',
  create_fixed_deposit: 'finance',
  add_portfolio_holding: 'finance',
  send_email: 'communications',
  schedule_event: 'communications',
  log_health_data: 'health',
  add_parent_medication: 'family',
  create_family_task: 'family',
  add_pet: 'family',
  add_pet_reminder: 'family',
  add_family_item: 'family',
}

export const DOMAINS = ['finance', 'communications', 'health', 'family']
export const DOMAIN_LABEL = { finance: 'Finance', communications: 'Communication', health: 'Health Core', family: 'Family' }

// Per-domain trust thresholds — see "Stages in Mneva AI.pdf". The PDF
// describes stages in prose, not exact numbers; values without a citation
// in the comment are inferred sample-size floors needed to make "80%
// accepted" and "rejects more than 20%" stable instead of swinging wildly
// on the first one or two actions.
const L1_MIN_DAYS = 14                 // PDF: "Minimum 14 days"
const L1_MIN_ACTIONS = 15              // PDF: "minimum 15 action items in each domain"
const L2_MIN_DAYS = 30                 // PDF: "minimum 30 days in L2"
const L2_MIN_ACTIONS_FOR_EVAL = 15     // inferred floor before evaluating the 80% bar
const L2_ACCEPT_RATE_TO_L3 = 0.80      // PDF: "80% accepted score in L2"
const L3_MIN_ACTIONS_FOR_DEMOTE = 5    // inferred floor before evaluating the 20% demotion
const L3_REJECT_RATE_DEMOTE = 0.20     // PDF: "rejects more than 20% then again reduces to L2"
const L3_MIN_ACTIONS_FOR_L4 = 15       // inferred floor before evaluating the 90% bar
const L3_ACCEPT_RATE_TO_L4 = 0.90      // PDF: "up to 90 % success – Then to L4"

function daysSince(date) {
  return (Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000)
}

// Lazily creates a domain's row at L1 the first time it's ever read — every
// user who existed before this feature shipped already has all 4 rows from
// the migration backfill (seeded at their prior global trustLevel); this
// only matters for a user created after that.
export async function getDomainTrust(userId, domain) {
  return prisma.domainTrust.upsert({
    where: { userId_domain: { userId, domain } },
    update: {},
    create: { userId, domain },
  })
}

export async function getAllDomainTrust(userId) {
  const rows = await Promise.all(DOMAINS.map((d) => getDomainTrust(userId, d)))
  return Object.fromEntries(DOMAINS.map((d, i) => [d, rows[i]]))
}

// L1 Observe: never acts, only surfaces insight. L2 Suggest / L3 Draft &
// Prep: always drafts and waits for a tap to approve. L4 Inner Circle: acts
// immediately. `amount` only matters for initiate_payment — a large payment
// always needs a real approval tap no matter the level, same as Bills' own
// biometric gate.
export function decideGate(tool, domainTrust, amount = 0) {
  const domain = GATED_DOMAINS[tool]
  if (!domain) return { mode: 'execute', domain: null }
  if (domainTrust.enabled === false) return { mode: 'blocked', domain, reason: 'domain_disabled' }
  if (domainTrust.level <= 1) return { mode: 'blocked', domain, reason: 'observe_mode' }

  const isLargePayment = tool === 'initiate_payment' && amount >= 1000
  if (isLargePayment) return { mode: 'pending', domain }

  if (domainTrust.level >= 4) return { mode: 'execute', domain }
  return { mode: 'pending', domain }
}

export function blockedMessage(reason, actionLabel) {
  if (reason === 'observe_mode') {
    return `I'm set to Observe mode for this, so I won't ${actionLabel} automatically — raise this domain's trust level in Trust & Autonomy if you'd like me to help with this.`
  }
  if (reason === 'domain_disabled') {
    return `That category is turned off in your autonomy settings, so I won't ${actionLabel} automatically — enable it in Trust & Autonomy if you'd like me to help with this.`
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

async function notifyLevelChange(userId, domain, from, to) {
  const ledgerEntry = await ledger.add({
    userId, tool: 'trust_level_changed',
    input: { domain, from, to, reason: to > from ? 'progression' : 'demotion' },
    result: { domain, level: to }, status: 'completed',
  })
  await prisma.notification.create({
    data: {
      userId,
      title: to > from ? '⬆️ Trust level increased' : '⬇️ Trust level decreased',
      message: to > from
        ? `Mneva's ${DOMAIN_LABEL[domain]} trust level is now L${to}.`
        : `Mneva's ${DOMAIN_LABEL[domain]} trust level was lowered to L${to} after too many declined actions.`,
    },
  })
  emitToUser(userId, 'domainTrust:levelChanged', { domain, level: to, previousLevel: from })
  emitToUser(userId, 'ledger:updated', ledgerEntry)
}

// Any transition (promotion OR demotion) resets the domain's counters and
// clock to zero — the new level always needs its own fresh run, matching
// the PDF's "last 15 actions and then comes to L3 with better
// understanding" for a demotion, and preventing an old streak years back
// from carrying into a level it didn't actually earn there.
async function transitionDomain(userId, row, newLevel) {
  await prisma.domainTrust.update({
    where: { id: row.id },
    data: { level: newLevel, levelEnteredAt: new Date(), actionsAtLevel: 0, acceptedAtLevel: 0, rejectedAtLevel: 0, pendingL2Confirm: false },
  })
  await notifyLevelChange(userId, row.domain, row.level, newLevel)
}

async function evaluateDomainTransition(userId, row) {
  const { domain, level, actionsAtLevel, acceptedAtLevel, rejectedAtLevel, levelEnteredAt } = row
  const days = daysSince(levelEnteredAt)

  if (level === 1) {
    if (days >= L1_MIN_DAYS && actionsAtLevel >= L1_MIN_ACTIONS) {
      // Finance asks first — everywhere else auto-promotes silently, same
      // as the pattern this replaces (checkObserveGraduation).
      if (domain === 'finance') {
        if (!row.pendingL2Confirm) {
          await prisma.domainTrust.update({ where: { id: row.id }, data: { pendingL2Confirm: true } })
          await prisma.notification.create({
            data: { userId, title: '🎯 Ready for Suggest mode', message: "Mneva has learned enough about your finance habits — open Trust & Autonomy to turn on Suggest mode." },
          })
          emitToUser(userId, 'domainTrust:pendingConfirm', { domain })
        }
        return
      }
      await transitionDomain(userId, row, 2)
    }
    return
  }

  if (level === 2) {
    const total = acceptedAtLevel + rejectedAtLevel
    if (days >= L2_MIN_DAYS && total >= L2_MIN_ACTIONS_FOR_EVAL && acceptedAtLevel / total >= L2_ACCEPT_RATE_TO_L3) {
      await transitionDomain(userId, row, 3)
    }
    return
  }

  if (level === 3) {
    const total = acceptedAtLevel + rejectedAtLevel
    if (total >= L3_MIN_ACTIONS_FOR_DEMOTE && rejectedAtLevel / total > L3_REJECT_RATE_DEMOTE) {
      await transitionDomain(userId, row, 2)
      return
    }
    if (total >= L3_MIN_ACTIONS_FOR_L4 && acceptedAtLevel / total >= L3_ACCEPT_RATE_TO_L4) {
      await transitionDomain(userId, row, 4)
    }
  }
}

// The core state machine — called once per gated-tool invocation (the
// moment autonomyEngine.js's executeTool makes a gate decision, whichever
// way it goes) and again when a pending one is later approved/denied.
export async function recordDomainAction(userId, domain, outcome) {
  const row = await getDomainTrust(userId, domain)
  const data = { actionsAtLevel: { increment: 1 } }
  if (outcome === 'approved') data.acceptedAtLevel = { increment: 1 }
  if (outcome === 'rejected') data.rejectedAtLevel = { increment: 1 }
  const updated = await prisma.domainTrust.update({ where: { id: row.id }, data })
  await evaluateDomainTransition(userId, updated)
}

// Finance-only manual confirmation for the L1->L2 promotion (see the PDF's
// "Asks user before going to L2 in finance domain").
export async function confirmFinanceL2(userId) {
  const row = await getDomainTrust(userId, 'finance')
  if (!row.pendingL2Confirm) return { error: 'not_pending' }
  await transitionDomain(userId, row, 2)
  return { success: true }
}

// A few tools log under a different name in the Twin Diary ledger than
// their AI tool name, to match the label the equivalent MANUAL creation
// routes already use for the same kind of record (see ledgerTaxonomy.js).
// Their executeTool case bodies self-log under this name on direct
// execution; this keeps the pending-approval path's ledger entry consistent
// with that instead of showing the raw tool name only when it went through
// approval.
const LEDGER_TOOL_ALIAS = {
  log_health_data: 'health_data_synced',
  create_family_task: 'family_task_created',
  add_family_item: 'family_item_created',
}

// The single place both the socket handlers and the HTTP /api/agent
// approve/deny routes call, so "tap approve in chat" and "hit the API
// directly" go through identical enforcement and produce identical ledger
// entries and identical trust-level consequences.
export async function resolvePendingAction(userId, actionId, decision, opts = {}) {
  const action = await prisma.pendingAction.findUnique({ where: { id: actionId } })
  if (!action || action.userId !== userId) return { error: 'not_found' }
  if (action.status !== 'pending') return { error: 'already_resolved', status: action.status }

  if (decision === 'deny') {
    await prisma.pendingAction.update({ where: { id: actionId }, data: { status: 'rejected', resolvedAt: new Date() } })
    const ledgerEntry = await ledger.add({
      userId, tool: LEDGER_TOOL_ALIAS[action.tool] || action.tool, input: action.input,
      result: { success: false, rejectedByUser: true }, status: 'rejected',
    })
    emitToUser(userId, 'ledger:updated', ledgerEntry)
    await recordDomainAction(userId, action.domain, 'rejected')
    return { status: 'rejected' }
  }

  // Approving a ≥ ₹1,000 payment still needs the same biometric confirmation
  // as tapping "Pay" directly in Bills — approving in chat isn't a way
  // around that gate. (Biometric gate is a privacy setting, unrelated to
  // per-domain trust level — read directly rather than through DomainTrust.)
  if (action.tool === 'initiate_payment') {
    const amount = Number(action.input?.amount) || 0
    if (amount >= 1000) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
      const gateOn = user?.preferences?.privacy?.biometricGate !== false
      if (gateOn && opts.biometricConfirmed !== true) return { error: 'biometric_required' }
    }
  }

  // Dynamic import avoids a circular import — autonomyEngine.js imports
  // FROM this file (GATED_DOMAINS, decideGate, recordDomainAction, etc.).
  // `skipGate` re-runs the tool's real side effect without re-evaluating
  // (and re-deferring) the gate that already sent this to pending in the
  // first place.
  const { executeTool } = await import('../agents/autonomyEngine.js')
  const result = await executeTool(action.tool, action.input, userId, { skipGate: true })

  await prisma.pendingAction.update({ where: { id: actionId }, data: { status: 'approved', resolvedAt: new Date() } })
  const ledgerEntry = await ledger.add({
    userId, tool: LEDGER_TOOL_ALIAS[action.tool] || action.tool, input: action.input, result,
    status: result?.success === false ? 'failed' : 'completed',
  })
  emitToUser(userId, 'ledger:updated', ledgerEntry)
  // The user approved it either way — a downstream failure (e.g. Gmail not
  // connected) isn't a trust signal about their judgment, so this still
  // counts as a positive approval for the domain's acceptance rate.
  await recordDomainAction(userId, action.domain, 'approved')
  return { status: 'approved', result }
}
