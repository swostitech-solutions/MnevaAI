import { Expo } from 'expo-server-sdk'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'

const expo = new Expo()

// Fire-and-forget, same convention as every socket `emit()` helper in this
// codebase: a failed push must never break the caller's own request/job.
// Sends to every device this user has registered (they may have more than
// one), and immediately drops any token Expo already knows is dead —
// otherwise PushToken rows for uninstalled apps would accumulate forever.
export async function sendPushToUser(userId, { title, body, data } = {}) {
  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId } })
    if (!tokens.length) return

    const messages = tokens
      .filter((t) => Expo.isExpoPushToken(t.token))
      .map((t) => ({ to: t.token, title, body, data, sound: 'default', priority: 'high' }))
    if (!messages.length) return

    const chunks = expo.chunkPushNotifications(messages)
    const deadTokens = []
    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk)
        tickets.forEach((ticket, i) => {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            deadTokens.push(chunk[i].to)
          }
        })
      } catch (err) {
        logger.warn(`Push chunk failed: ${err.message}`)
      }
    }
    if (deadTokens.length) {
      await prisma.pushToken.deleteMany({ where: { token: { in: deadTokens } } })
    }
  } catch (err) {
    logger.warn(`sendPushToUser failed for ${userId}: ${err.message}`)
  }
}
