import { listContacts } from './googleContacts.service.js'
import { userStore } from '../models/userStore.js'
import { logger } from '../config/logger.js'

const activePollers = new Map()
const POLL_INTERVAL_MS = 5 * 60_000 // 5 minutes — contacts change rarely

async function pollOnce(userId, io) {
  try {
    const user = await userStore.getById(userId)
    const cfg = user?.preferences?.googleContacts
    if (!cfg?.tokens || cfg.disconnected) return

    const state = activePollers.get(userId)
    if (!state) return

    const { contacts, total } = await listContacts(user, { pageSize: 50 })

    // Detect new contacts since last poll
    const newContacts = contacts.filter(c => !state.knownIds.has(c.id))
    if (!newContacts.length) return

    contacts.forEach(c => state.knownIds.add(c.id))

    io.to(`u:${userId}`).emit('contacts:updated', {
      newCount: newContacts.length,
      total,
      contacts: newContacts.slice(0, 5), // preview of new ones
      ts: new Date().toISOString(),
    })

    logger.info(`Contacts poller: ${newContacts.length} new contact(s) for user ${userId}`)
  } catch (err) {
    logger.debug(`Contacts poll skipped for ${userId}: ${err.message}`)
  }
}

export function startContactsPoller(userId, io) {
  if (activePollers.has(userId)) return

  const state = { knownIds: new Set(), timer: null }
  activePollers.set(userId, state)

  // Seed existing contact IDs first so we don't fire events for old contacts
  userStore.getById(userId).then(async (user) => {
    const cfg = user?.preferences?.googleContacts
    if (cfg?.tokens && !cfg.disconnected) {
      try {
        const { contacts } = await listContacts(user, { pageSize: 100 })
        contacts.forEach(c => state.knownIds.add(c.id))
        logger.info(`Contacts poller seeded ${state.knownIds.size} IDs for user ${userId}`)
      } catch { /* not connected yet */ }
    }
    state.timer = setInterval(() => pollOnce(userId, io), POLL_INTERVAL_MS)
  })

  logger.info(`Contacts poller started for user ${userId}`)
}

export function stopContactsPoller(userId) {
  const state = activePollers.get(userId)
  if (!state) return
  clearInterval(state.timer)
  activePollers.delete(userId)
  logger.info(`Contacts poller stopped for user ${userId}`)
}
