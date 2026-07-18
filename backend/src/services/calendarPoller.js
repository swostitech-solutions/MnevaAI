import { listEvents } from './calendar.service.js'
import { userStore } from '../models/userStore.js'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'

const activePollers = new Map()
const POLL_INTERVAL_MS = 60_000

async function pollOnce(userId, io) {
  try {
    const user = await userStore.getById(userId)
    const tokens = user?.preferences?.calendar?.tokens || user?.preferences?.gmail?.tokens
    if (!tokens) return

    const now = new Date()
    const timeMin = now.toISOString()
    const later = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const timeMax = later.toISOString()

    const events = await listEvents(user, timeMin, timeMax, 20)
    if (!events?.length) return

    const state = activePollers.get(userId)
    if (!state) return

    const newEvents = events.filter(e => !state.lastSeenIds.has(e.id))
    if (!newEvents.length) return

    events.forEach(e => state.lastSeenIds.add(e.id))

    for (const ev of newEvents) {
      const start = ev.start?.dateTime || ev.start?.date || null
      const title = ev.summary || '(No title)'
      const preview = ev.description || ev.summary || ''

      const meetLink = ev.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri
        || ev.hangoutLink
        || null

      const notif = await prisma.notification.create({
        data: {
          userId,
          title: `📅 Meeting scheduled: ${title}`,
          message: JSON.stringify({ source: 'calendar', eventId: ev.id, meetLink, preview, start }),
        },
      })

      io.to(`u:${userId}`).emit('calendar:notification', {
        id: notif.id,
        title: notif.title,
        body: preview,
        eventId: ev.id,
        start,
        ts: notif.createdAt.toISOString(),
      })
    }

    logger.info(`Calendar poller: ${newEvents.length} new event(s) for user ${userId}`)
  } catch (err) {
    logger.debug(`Calendar poll skipped for ${userId}: ${err.message}`)
  }
}

export function startCalendarPoller(userId, io) {
  if (activePollers.has(userId)) return
  const state = { lastSeenIds: new Set(), timer: null }
  activePollers.set(userId, state)

  // seed existing events so old items don't trigger cards
  userStore.getById(userId).then(async (user) => {
    try {
      const tokens = user?.preferences?.calendar?.tokens || user?.preferences?.gmail?.tokens
      if (!tokens) {
        state.timer = setInterval(() => pollOnce(userId, io), POLL_INTERVAL_MS)
        return
      }
      const now = new Date()
      const timeMin = now.toISOString()
      const later = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const timeMax = later.toISOString()
      const events = await listEvents(user, timeMin, timeMax, 50).catch(() => [])
      events?.forEach(e => state.lastSeenIds.add(e.id))
      logger.info(`Calendar poller seeded ${state.lastSeenIds.size} existing events for user ${userId}`)
    } catch (err) { /* ignore */ }
    state.timer = setInterval(() => pollOnce(userId, io), POLL_INTERVAL_MS)
  })

  logger.info(`Calendar poller started for user ${userId}`)
}

export function stopCalendarPoller(userId) {
  const state = activePollers.get(userId)
  if (!state) return
  clearInterval(state.timer)
  activePollers.delete(userId)
  logger.info(`Calendar poller stopped for user ${userId}`)
}
