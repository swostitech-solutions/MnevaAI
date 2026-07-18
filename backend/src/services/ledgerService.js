import { createHash } from 'crypto'
import { prisma } from '../config/prisma.js'

class LedgerService {
  async add({ userId, tool, input, result, status = 'completed' }) {
    const ts = new Date().toISOString()
    const sig = createHash('sha256').update(`${userId}:${tool}:${ts}:${JSON.stringify(input)}`).digest('hex').slice(0, 8)
    const entry = await prisma.agentLedger.create({
      data: {
        userId,
        tool,
        status,
        signature: `sha256:${sig}`,
        action: JSON.stringify({ input, result }),
      },
    })
    return this.toPublicEntry(entry)
  }

  async getByUser(userId, limit = 100) {
    const entries = await prisma.agentLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return entries.map(entry => this.toPublicEntry(entry))
  }

  toPublicEntry(entry) {
    let payload = {}
    try {
      payload = JSON.parse(entry.action)
    } catch {
      payload = { action: entry.action }
    }
    return {
      id: entry.id,
      userId: entry.userId,
      tool: entry.tool,
      status: entry.status,
      input: payload.input,
      result: payload.result,
      action: payload.action || entry.action,
      ts: entry.createdAt.toISOString(),
      sig: entry.signature,
      verified: Boolean(entry.signature),
    }
  }
}

export const ledger = new LedgerService()
