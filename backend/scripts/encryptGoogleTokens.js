// One-time backfill: encrypt any Google OAuth tokens that were saved before
// the encryption-at-rest extension in src/config/prisma.js existed. The
// extension only encrypts on WRITE, so rows nobody has touched since stay
// plaintext until this runs. Safe to re-run — rows already encrypted (or
// with no tokens at all) are skipped.
import 'dotenv/config'
import { prisma } from '../src/config/prisma.js'

const GOOGLE_TOKEN_NAMESPACES = ['gmail', 'calendar', 'googleFit', 'googleContacts', 'googleDrive', 'googleTasks']

function hasPlaintextTokens(preferences) {
  if (!preferences || typeof preferences !== 'object') return false
  return GOOGLE_TOKEN_NAMESPACES.some((ns) => {
    const section = preferences[ns]
    return section && typeof section === 'object' && section.tokens && typeof section.tokens === 'object'
  })
}

try {
  const users = await prisma.$queryRaw`SELECT id, preferences FROM "User" WHERE preferences IS NOT NULL`
  let encrypted = 0
  for (const user of users) {
    // Raw query bypasses the encryption extension, so this reads the true
    // on-disk value — exactly what we need to detect un-migrated rows.
    if (!hasPlaintextTokens(user.preferences)) continue
    // Re-saving through the extended `prisma` client (imported above)
    // encrypts every plaintext token section on the way back in.
    await prisma.user.update({ where: { id: user.id }, data: { preferences: user.preferences } })
    encrypted++
  }
  console.log(`Checked ${users.length} user(s) with preferences; encrypted Google tokens for ${encrypted}.`)
} catch (error) {
  console.error(`Token encryption backfill failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
