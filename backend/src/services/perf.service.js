import { randomUUID } from 'node:crypto'
import { logger } from '../config/logger.js'

// Audit item L-01: nobody could say where a turn actually spends its time —
// every latency number in the report was a guess. This gives every /chat
// turn a request id and a set of stage timers, logs one structured line per
// turn, and keeps a small rolling window per stage so p50/p95 can be read
// back without a separate metrics store.
const MAX_SAMPLES_PER_STAGE = 500
const samples = new Map() // stage -> number[] (ms), capped ring buffer

function recordSample(stage, ms) {
  let list = samples.get(stage)
  if (!list) {
    list = []
    samples.set(stage, list)
  }
  list.push(ms)
  if (list.length > MAX_SAMPLES_PER_STAGE) list.shift()
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

// L-08: a caller-supplied id lets the app subscribe to this turn's live
// token-stream socket events BEFORE the request even lands here (it has no
// other way to learn the id in time to catch early chunks) — falls back to
// a server-generated one for any caller that doesn't pass one.
export function createPerfTimer(label, externalRequestId = null) {
  const trimmed = typeof externalRequestId === 'string' ? externalRequestId.trim().slice(0, 80) : ''
  const requestId = trimmed || randomUUID()
  const start = Date.now()
  let lastMark = start
  const stages = []

  return {
    requestId,
    // Records the time since the PREVIOUS mark (or start) under `stage`.
    mark(stage) {
      const now = Date.now()
      const ms = now - lastMark
      stages.push({ stage, ms })
      recordSample(stage, ms)
      lastMark = now
      return ms
    },
    finish(extra = {}) {
      const total = Date.now() - start
      recordSample(`${label}:total`, total)
      const breakdown = stages.map(s => `${s.stage}=${s.ms}ms`).join(' ')
      logger.info(`[perf] ${label} requestId=${requestId} total=${total}ms ${breakdown}${extra.note ? ` note=${extra.note}` : ''}`)
      return { requestId, total, stages }
    },
  }
}

// Returns p50/p95/count for every stage seen so far (process-local, resets
// on restart — there's no time-series store behind this, so "last 24h" from
// the audit item is really "last 500 samples per stage since boot").
export function getPerfStats() {
  const out = {}
  for (const [stage, list] of samples.entries()) {
    const sorted = [...list].sort((a, b) => a - b)
    out[stage] = {
      count: sorted.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted[sorted.length - 1] ?? null,
    }
  }
  return out
}
