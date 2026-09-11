import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'
import { sendPushToUser } from './pushService.js'

const TIME_ZONE = 'Asia/Kolkata'

function currentClockTime(now) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now)
}

function currentDateKey(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}

// Checks every active medication's configured dose times against the
// current minute (Asia/Kolkata) and pushes "time to take" once per
// medication/time/day — separate from the refill-date advance reminders,
// which only warn when the supply is about to run out, not when to
// actually take a dose.
export function startMedicationDosePoller() {
  setInterval(async () => {
    try {
      const now = new Date()
      const nowClock = currentClockTime(now)
      const dateKey = currentDateKey(now)

      const meds = await prisma.parentMedication.findMany({ where: { active: true } })
      for (const med of meds) {
        const doseTimes = Array.isArray(med.doseTimes) ? med.doseTimes : []
        if (!doseTimes.includes(nowClock)) continue

        try {
          // The unique (userId, itemType, itemId, leadMinutes) constraint is
          // the actual dedup — a duplicate create throws and is skipped, no
          // read-then-write race possible.
          await prisma.reminderSchedule.create({
            data: {
              userId: med.userId,
              itemType: 'medication_dose',
              itemId: `${med.id}:${nowClock}:${dateKey}`,
              leadMinutes: 0,
            },
          })
        } catch (err) {
          if (err.code === 'P2002') continue // already sent for this dose today
          throw err
        }

        sendPushToUser(med.userId, {
          title: '💊 Time to take your medicine',
          body: `${med.medName} (${med.dosage}) for ${med.parent}`,
          data: { type: 'medication_dose', medicationId: med.id },
        })
      }
    } catch (err) {
      logger.warn(`Medication dose poller failed: ${err.message}`)
    }
  }, 60 * 1000)
}
