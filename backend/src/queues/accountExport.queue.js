// Audit item G-05: Settings' "Export My Data" only ever showed an alert
// promising an email "within 24 hours" — no backend job existed to actually
// produce one. This builds a real one: a BullMQ job (so a slow export never
// ties up the request) that gathers every module's rows for the requesting
// user, zips them, and emails the zip as an attachment via Resend (the same
// provider already used for OTP mail — no new storage/signed-link system
// needed for a personal-data-sized export).
import { Queue, Worker } from 'bullmq'
import JSZip from 'jszip'
import { getBullRedisClient } from '../config/redis.js'
import { logger } from '../config/logger.js'
import { prisma } from '../config/prisma.js'
import { ledger } from '../services/ledgerService.js'
import { sendAccountExportEmail } from '../services/email.service.js'

let queue
export function getAccountExportQueue() {
  if (!queue) queue = new Queue('account-export', { connection: getBullRedisClient() })
  return queue
}

export async function queueAccountExport(userId) {
  const q = getAccountExportQueue()
  await q.add('export', { userId }, { removeOnComplete: true, removeOnFail: 50 })
}

// Every preferences-held OAuth connection keeps a live, working credential
// under a `.tokens` (Google/Outlook) or `.botToken` (Slack) field — those
// are exactly what "no tokens in the export" (the done-when criteria) means,
// so this strips them, and the small number of other plainly-internal keys,
// rather than exporting the entire preferences blob as-is.
const GOOGLE_TOKEN_NAMESPACES = ['gmail', 'calendar', 'googleFit', 'googleContacts', 'googleDrive', 'googleTasks', 'outlook']
// Exported for S-11's export-job test coverage — this is the one function
// standing between "no tokens in the export" and a real leak.
export function redactPreferences(preferences) {
  if (!preferences || typeof preferences !== 'object') return {}
  const next = JSON.parse(JSON.stringify(preferences))
  for (const ns of GOOGLE_TOKEN_NAMESPACES) {
    if (next[ns] && typeof next[ns] === 'object') delete next[ns].tokens
  }
  if (next.slack && typeof next.slack === 'object') delete next.slack.botToken
  return next
}

// One findMany per module, all independent of each other — Promise.all is
// safe here (unlike a request-path handler, nothing here is latency
// sensitive since it already runs on a background worker).
async function gatherUserData(userId) {
  const [
    user, userProfile, tasks,
    bills, emis, expenses, fixedDeposits, loans, portfolioHoldings, subscriptions,
    parentMedications, pets, petReminders, familyItems, familyTasksCreated, familyTasksAssigned,
    familyConnections, documents, notifications, domainTrust, trustScore,
    ledgerEntries, conversations,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.task.findMany({ where: { userId } }),
    prisma.bill.findMany({ where: { userId } }),
    prisma.emi.findMany({ where: { userId } }),
    prisma.expense.findMany({ where: { userId } }),
    prisma.fixedDeposit.findMany({ where: { userId } }),
    prisma.loan.findMany({ where: { userId } }),
    prisma.portfolioHolding.findMany({ where: { userId } }),
    prisma.subscription.findMany({ where: { userId } }),
    prisma.parentMedication.findMany({ where: { userId } }),
    prisma.pet.findMany({ where: { userId } }),
    prisma.petReminder.findMany({ where: { userId } }),
    prisma.familyItem.findMany({ where: { userId } }),
    prisma.familyTask.findMany({ where: { creatorId: userId } }),
    prisma.familyTask.findMany({ where: { assigneeId: userId } }),
    prisma.familyConnection.findMany({ where: { OR: [{ requesterId: userId }, { receiverId: userId }] } }),
    prisma.document.findMany({ where: { userId }, select: { id: true, title: true, createdAt: true } }),
    prisma.notification.findMany({ where: { userId } }),
    prisma.domainTrust.findMany({ where: { userId } }),
    prisma.trustScore.findUnique({ where: { userId } }),
    prisma.agentLedger.findMany({
      where: { userId },
      orderBy: { seq: 'asc' },
      select: { id: true, tool: true, status: true, action: true, createdAt: true, seq: true, prevHash: true, hash: true, signature: true },
    }),
    prisma.conversation.findMany({ where: { userId }, include: { messages: { orderBy: { createdAt: 'asc' } } } }),
  ])

  return {
    profile: user ? {
      name: user.name, email: user.email, phone: user.phone, city: user.city,
      plan: user.plan, trustLevel: user.trustLevel, onboardingDone: user.onboardingDone,
      createdAt: user.createdAt,
    } : null,
    preferences: redactPreferences(user?.preferences),
    userProfile,
    tasks,
    finance: { bills, emis, expenses, fixedDeposits, loans, portfolioHoldings, subscriptions },
    family: {
      parentMedications, pets, petReminders, familyItems,
      familyTasksCreated, familyTasksAssigned, familyConnections,
    },
    documents,
    notifications,
    trust: { domainTrust, trustScore },
    ledger: ledgerEntries,
    conversations,
  }
}

async function buildExportZip(userId) {
  const data = await gatherUserData(userId)
  const zip = new JSZip()
  zip.file('profile.json', JSON.stringify(data.profile, null, 2))
  zip.file('preferences.json', JSON.stringify(data.preferences, null, 2))
  zip.file('onboarding_profile.json', JSON.stringify(data.userProfile, null, 2))
  zip.file('tasks.json', JSON.stringify(data.tasks, null, 2))
  zip.file('finance.json', JSON.stringify(data.finance, null, 2))
  zip.file('family.json', JSON.stringify(data.family, null, 2))
  zip.file('documents.json', JSON.stringify(data.documents, null, 2))
  zip.file('notifications.json', JSON.stringify(data.notifications, null, 2))
  zip.file('trust.json', JSON.stringify(data.trust, null, 2))
  zip.file('twin_diary_ledger.json', JSON.stringify(data.ledger, null, 2))
  zip.file('conversations.json', JSON.stringify(data.conversations, null, 2))
  zip.file('README.txt',
    'This is your Mneva AI data export.\n\n' +
    'Health log data lives inside preferences.json under "healthLog" and "healthSync".\n' +
    'Connected-account tokens (Google/Outlook/Slack) and your password are never included in this export.\n' +
    'Uploaded document FILES are not included (only their names/dates, in documents.json) — contact support if you need the files themselves.\n' +
    `Exported: ${new Date().toISOString()}\n`)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

export function startAccountExportWorker() {
  return new Worker(
    'account-export',
    async (job) => {
      const { userId } = job.data
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } })
      if (!user) return { ok: false, reason: 'user_not_found' }
      const zipBuffer = await buildExportZip(userId)
      await sendAccountExportEmail(user.email, user.name, zipBuffer)
      ledger.add({
        userId,
        tool: 'account_data_exported',
        input: {},
        result: { sizeBytes: zipBuffer.length },
        status: 'completed',
      }).catch(() => {})
      logger.info(`📦 Account export emailed to user=${userId} (${zipBuffer.length} bytes)`)
      return { ok: true, sizeBytes: zipBuffer.length }
    },
    { connection: getBullRedisClient() },
  )
}
