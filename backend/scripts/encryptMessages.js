// One-time backfill: encrypt any Message.content saved before 'message'
// was added to the encryption-at-rest extension in src/config/prisma.js
// (audit item S-09). Same pattern as encryptSlackTokens.js — the
// extension only encrypts on write, so a row nobody has touched since
// stays plaintext until this runs. Safe to re-run — rows already
// encrypted are skipped. Runs in batches since a real conversation
// history can be tens of thousands of rows.
import 'dotenv/config'
import { prisma } from '../src/config/prisma.js'

const BATCH_SIZE = 500

try {
  let lastId = null
  let checked = 0
  let encrypted = 0
  for (;;) {
    // Raw query bypasses the encryption extension, so this reads the true
    // on-disk value — exactly what we need to detect un-migrated rows, and
    // to paginate without the extension's own findMany re-decrypting what
    // we haven't encrypted yet.
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, content FROM "Message" ${lastId ? 'WHERE id > $2' : ''} ORDER BY id ASC LIMIT $1`,
      BATCH_SIZE,
      ...(lastId ? [lastId] : []),
    )
    if (rows.length === 0) break
    for (const row of rows) {
      checked++
      if (typeof row.content === 'string' && !row.content.startsWith('encv1:')) {
        // Re-saving through the extended `prisma` client (imported above)
        // encrypts the plaintext content on the way back in.
        await prisma.message.update({ where: { id: row.id }, data: { content: row.content } })
        encrypted++
      }
    }
    lastId = rows[rows.length - 1].id
  }
  console.log(`Checked ${checked} message(s); encrypted ${encrypted}.`)
} catch (error) {
  console.error(`Message encryption backfill failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
