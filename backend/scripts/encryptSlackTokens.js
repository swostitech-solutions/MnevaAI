// One-time backfill: encrypt any Slack bot token saved before 'slack' was
// added to the encryption-at-rest extension in src/config/prisma.js (audit
// items G-07/S-01). Same pattern as encryptGoogleTokens.js — the extension
// only encrypts on WRITE, so rows nobody has touched since stay plaintext
// until this runs. Safe to re-run — rows already encrypted (or with no
// Slack connection at all) are skipped.
import 'dotenv/config'
import { prisma } from '../src/config/prisma.js'

function hasPlaintextSlackToken(preferences) {
  if (!preferences || typeof preferences !== 'object') return false
  const slack = preferences.slack
  return !!(slack && typeof slack === 'object' && typeof slack.botToken === 'string' && !slack.botToken.startsWith('encv1:'))
}

try {
  const users = await prisma.$queryRaw`SELECT id, preferences FROM "User" WHERE preferences IS NOT NULL`
  let encrypted = 0
  for (const user of users) {
    // Raw query bypasses the encryption extension, so this reads the true
    // on-disk value — exactly what we need to detect un-migrated rows.
    if (!hasPlaintextSlackToken(user.preferences)) continue
    // Re-saving through the extended `prisma` client (imported above)
    // encrypts the plaintext botToken on the way back in.
    await prisma.user.update({ where: { id: user.id }, data: { preferences: user.preferences } })
    encrypted++
  }
  console.log(`Checked ${users.length} user(s) with preferences; encrypted Slack tokens for ${encrypted}.`)
} catch (error) {
  console.error(`Slack token encryption backfill failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
