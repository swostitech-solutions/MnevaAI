import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'
import { GENESIS_HASH, hashEntry, signHash } from './ledgerSigning.js'

// Retroactively chains + signs any ledger rows that predate this feature (or
// that a previous crash left mid-write without a hash). Safe to call on
// every boot: it only ever looks at rows where hash IS NULL, processes each
// affected user's full history in creation order, and does nothing at all
// once the table is fully backfilled — this is what makes the ledger's
// "tamper-proof" claim actually true for entries created before today, not
// just ones created from now on.
export async function backfillLedgerChain() {
  const usersWithGaps = await prisma.agentLedger.findMany({
    where: { hash: null },
    select: { userId: true },
    distinct: ['userId'],
  })
  if (!usersWithGaps.length) return

  let totalBackfilled = 0
  for (const { userId } of usersWithGaps) {
    const entries = await prisma.agentLedger.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })

    let prevHash = GENESIS_HASH
    let seq = 0
    for (const entry of entries) {
      if (entry.hash != null && entry.seq != null) {
        // Already chained (written after this feature shipped, or by an
        // earlier backfill run) — carry its hash forward as the anchor for
        // whatever comes next instead of touching it.
        prevHash = entry.hash
        seq = entry.seq + 1
        continue
      }
      const hash = hashEntry({
        id: entry.id, userId: entry.userId, tool: entry.tool, status: entry.status,
        action: entry.action, createdAt: entry.createdAt, seq, prevHash,
      })
      const signature = signHash(hash)
      await prisma.agentLedger.update({
        where: { id: entry.id },
        data: { seq, prevHash, hash, signature },
      })
      prevHash = hash
      seq += 1
      totalBackfilled += 1
    }
  }
  if (totalBackfilled > 0) {
    logger.info(`Ledger chain backfilled: ${totalBackfilled} entries across ${usersWithGaps.length} user(s)`)
  }
}
