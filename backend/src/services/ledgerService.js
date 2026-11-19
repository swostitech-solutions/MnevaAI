import { randomUUID } from 'crypto'
import { prisma } from '../config/prisma.js'
import { GENESIS_HASH, hashEntry, signHash, verifySignature } from './ledgerSigning.js'
import { getToolMeta } from './ledgerTaxonomy.js'

const MAX_SEQ_RETRIES = 3

// An update's Twin Diary entry should name only the field(s) the value
// actually changed for, not every key the client happened to send — an
// edit screen that submits its whole form on every save (most of them do)
// would otherwise log every field on the form as "changed" even when the
// user only touched one. Compares each candidate field's value against the
// record as it was BEFORE this update, not just whether the key is present
// in the request body.
function ledgerValuesEqual(a, b) {
  if (a === b) return true
  if (a == null || b == null) return a == b
  if (a instanceof Date || b instanceof Date) {
    const ta = new Date(a).getTime()
    const tb = new Date(b).getTime()
    return !isNaN(ta) && !isNaN(tb) && ta === tb
  }
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  // Objects/arrays (a pet's vaccines list, a family item's JSON fields, …)
  // must compare by content — String(obj) is always the useless literal
  // "[object Object]" for every plain object, which would make this always
  // report "unchanged" no matter how different two objects actually are.
  if (typeof a === 'object' || typeof b === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
  }
  return String(a) === String(b)
}
// `existing` is the record as fetched before the update; `patch` is the
// (already validated/coerced) object actually passed to prisma's `update`
// — only the keys present in `patch` are considered, and only the ones
// whose value actually differs from `existing` make it into the result.
export function changedFields(existing, patch) {
  return Object.keys(patch || {}).filter((k) => !ledgerValuesEqual(existing?.[k], patch[k]))
}

class LedgerService {
  // Appends one entry to the caller's hash chain: reads the last entry
  // (by seq) inside a transaction, hashes the new entry over ALL of its
  // meaningful fields (including `result`/`status`, which the previous
  // version left out of the hash entirely) chained to the previous entry's
  // hash, and signs that hash with the server's Ed25519 key. Retries a
  // handful of times on a seq collision — the partial unique index on
  // (userId, seq) is what actually guarantees two concurrent writes for the
  // same user can never both land on the same position in the chain.
  async add({ userId, tool, input, result, status = 'completed' }) {
    const action = JSON.stringify({ input, result })
    const id = randomUUID()
    const createdAt = new Date()

    for (let attempt = 0; attempt < MAX_SEQ_RETRIES; attempt++) {
      const last = await prisma.agentLedger.findFirst({
        where: { userId, seq: { not: null } },
        orderBy: { seq: 'desc' },
        select: { seq: true, hash: true },
      })
      const seq = last ? last.seq + 1 : 0
      const prevHash = last?.hash || GENESIS_HASH
      const hash = hashEntry({ id, userId, tool, status, action, createdAt, seq, prevHash })
      const signature = signHash(hash)

      const { domain, autonomyStage } = getToolMeta(tool)
      try {
        const entry = await prisma.agentLedger.create({
          data: { id, userId, tool, status, action, seq, prevHash, hash, signature, createdAt, domain, autonomyStage },
        })
        return this.toPublicEntry(entry)
      } catch (err) {
        // P2002 = unique constraint violation on (userId, seq) — another
        // write landed on this seq first. Re-read the new tail and retry.
        if (err?.code === 'P2002' && attempt < MAX_SEQ_RETRIES - 1) continue
        throw err
      }
    }
  }

  // L-14: `cursor` (an entry id) paginates past a given point instead of
  // always returning the same latest-N — callers that don't pass one keep
  // getting exactly today's behavior (latest `limit`, default 100).
  async getByUser(userId, limit = 100, cursor = null) {
    const entries = await prisma.agentLedger.findMany({
      // Failed creation attempts are retained in the audit database, but are
      // not user-facing actions. This keeps them out of every client that
      // consumes the public ledger (Twin Diary and dashboard feeds).
      where: { userId, status: { not: 'failed' } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    return entries.map(entry => this.toPublicEntry(entry))
  }

  // L-14: the /ledger route used to report entries.length (capped at
  // whatever `limit` was) as "total" — true count of a user's whole
  // (non-failed) ledger, independent of how many entries were returned.
  async countByUser(userId) {
    return prisma.agentLedger.count({ where: { userId, status: { not: 'failed' } } })
  }

  // Walks a user's whole chain in order and recomputes everything from
  // scratch — the actual, checkable version of "tamper-proof": if any past
  // row's content, ordering, or signature has been altered, this fails at
  // the exact entry where the chain no longer matches what's stored.
  //
  // L-14: this used to load the ENTIRE chain into memory in one findMany —
  // fine at hundreds of rows, not at tens of thousands. Now walks it in
  // fixed-size pages (PAGE_SIZE rows in memory at once, regardless of total
  // chain length) ordered by seq, which is what the chain is actually
  // linked by. An optional {fromSeq, fromPrevHash} lets a caller resume a
  // previously-interrupted verify instead of re-walking from genesis every
  // time — this service itself doesn't persist that checkpoint anywhere
  // (no new table), the caller is responsible for remembering where it
  // left off between calls if it wants that.
  async verifyChain(userId, { fromSeq = null, fromPrevHash = null } = {}) {
    const PAGE_SIZE = 500
    // A real count up front (cheap, index-backed) — the UI shows
    // "checked X/total" even on a failed verify, so total has to be the
    // true chain length, not just however many rows this walk happened to
    // page through before it stopped.
    const total = await prisma.agentLedger.count({ where: { userId } })
    let expectedPrevHash = fromPrevHash || GENESIS_HASH
    let checked = 0
    let cursorSeq = fromSeq

    for (;;) {
      const page = await prisma.agentLedger.findMany({
        where: { userId, ...(cursorSeq != null ? { seq: { gt: cursorSeq } } : {}) },
        orderBy: { seq: 'asc' },
        take: PAGE_SIZE,
      })
      if (page.length === 0) break

      for (const entry of page) {
        if (entry.hash == null || entry.seq == null) {
          return { valid: false, checked, total, reason: 'unchained_entry', entryId: entry.id }
        }
        if (entry.prevHash !== expectedPrevHash) {
          return { valid: false, checked, total, reason: 'chain_broken', entryId: entry.id }
        }
        const recomputed = hashEntry({
          id: entry.id, userId: entry.userId, tool: entry.tool, status: entry.status,
          action: entry.action, createdAt: entry.createdAt, seq: entry.seq, prevHash: entry.prevHash,
        })
        if (recomputed !== entry.hash) {
          return { valid: false, checked, total, reason: 'content_tampered', entryId: entry.id }
        }
        if (!entry.signature || !verifySignature(entry.hash, entry.signature)) {
          return { valid: false, checked, total, reason: 'signature_invalid', entryId: entry.id }
        }
        expectedPrevHash = entry.hash
        checked++
      }
      cursorSeq = page[page.length - 1].seq
      if (page.length < PAGE_SIZE) break
    }
    return { valid: true, checked, total, lastSeq: cursorSeq, lastHash: expectedPrevHash }
  }

  // L-14: yields pages of a user's whole chain in seq order (unbounded
  // memory in the old /twin/export route's single findMany) so a caller can
  // stream the response instead of buffering everything first.
  async *iterateChain(userId, pageSize = 500) {
    let cursorSeq = null
    for (;;) {
      const page = await prisma.agentLedger.findMany({
        where: { userId, ...(cursorSeq != null ? { seq: { gt: cursorSeq } } : {}) },
        orderBy: { seq: 'asc' },
        take: pageSize,
        select: {
          id: true, userId: true, tool: true, status: true, action: true,
          createdAt: true, seq: true, prevHash: true, hash: true, signature: true,
        },
      })
      if (page.length === 0) return
      yield page
      if (page.length < pageSize) return
      cursorSeq = page[page.length - 1].seq
    }
  }

  toPublicEntry(entry) {
    let payload = {}
    try {
      payload = JSON.parse(entry.action)
    } catch {
      payload = { action: entry.action }
    }
    const fallbackMeta = getToolMeta(entry.tool)
    return {
      id: entry.id,
      userId: entry.userId,
      tool: entry.tool,
      status: entry.status,
      input: payload.input,
      result: payload.result,
      action: payload.action || entry.action,
      ts: entry.createdAt.toISOString(),
      seq: entry.seq,
      prevHash: entry.prevHash,
      hash: entry.hash,
      sig: entry.signature,
      domain: entry.domain ?? fallbackMeta.domain,
      autonomyStage: entry.autonomyStage ?? fallbackMeta.autonomyStage,
    }
  }
}

export const ledger = new LedgerService()
