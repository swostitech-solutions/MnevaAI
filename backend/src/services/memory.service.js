import { randomUUID } from 'node:crypto'
import { getRedisClient } from '../config/redis.js'
import { qdrantService } from './qdrant.service.js'
import { embeddingService } from './embedding.service.js'
import { logger } from '../config/logger.js'

const MEMORY_COLLECTION = 'mneva_memory'
// L-06: process-local by design — a real multi-instance deployment would
// need this backed by Redis/Qdrant instead so every instance saw the same
// fallback data. Current deployment is a single Node process (no
// clustering/pm2), so this is a documented assumption, not an active bug.
const fallbackMemoryStore = new Map()

async function getUserMemoryKey(userId) {
  return `user:${userId}:memory:recent`
}

function isGenericDocumentQuery(query = '') {
  const text = String(query || '').trim().toLowerCase()
  if (!text) return true
  return /(read|summarize|describe|explain|what('s| is)|tell me|show me|this|that|there|content)/i.test(text)
}

function makeFallbackEntry(point) {
  return {
    id: point.id,
    score: 1,
    payload: point.payload,
  }
}

export const memoryService = {
  async getRecentMemories(userId = null, limit = 5) {
    const recentEntries = []
    for (const list of fallbackMemoryStore.values()) {
      for (const entry of list) {
        if (!userId || entry.payload?.userId === userId) {
          recentEntries.push(makeFallbackEntry(entry))
        }
      }
    }

    recentEntries.sort((a, b) => (b.payload?.createdAt || '').localeCompare(a.payload?.createdAt || ''))
    return recentEntries.slice(0, limit)
  },

  // Audit item L-06: this used to re-fetch session context from Redis on
  // every call (callers like /chat already load it separately in the same
  // request) purely to stash it in a `memory:search:{userId}:{query}` cache
  // key that nothing ever reads back — both removed. Qdrant search is the
  // only real work here.
  async recall(query = '', userId = null, limit = 5) {
    const qdrantResults = await qdrantService.search(MEMORY_COLLECTION, query, {
      limit,
      filter: userId ? { must: [{ key: 'userId', match: { value: userId } }] } : undefined,
    })

    if (qdrantResults.length) {
      return qdrantResults
    }

    const normalized = String(query).toLowerCase()
    const fallbackEntries = []
    for (const list of fallbackMemoryStore.values()) {
      for (const entry of list) {
        if (!userId || entry.payload.userId === userId) {
          const text = String(entry.payload.text || '').toLowerCase()
          const isRelevant = !normalized || text.includes(normalized) || isGenericDocumentQuery(query)
          if (isRelevant) {
            fallbackEntries.push(makeFallbackEntry(entry))
          }
        }
      }
    }

    if (!fallbackEntries.length && isGenericDocumentQuery(query)) {
      return this.getRecentMemories(userId, limit)
    }

    return fallbackEntries.slice(0, limit)
  },

  async store(record = {}) {
    const userId = record.userId || 'anonymous'
    const text = String(record.text || record.content || '')
    if (!text) return { success: false, reason: 'empty_text' }

    const point = {
      id: record.id || randomUUID(),
      vector: await embeddingService.createEmbedding(text),
      payload: {
        userId,
        text,
        type: record.type || 'memory',
        metadata: record.metadata || {},
        createdAt: record.createdAt || new Date().toISOString(),
      },
    }

    const upsertResult = await qdrantService.upsertPoints(MEMORY_COLLECTION, [point])

    if (!upsertResult.success) {
      if (!fallbackMemoryStore.has(userId)) {
        fallbackMemoryStore.set(userId, [])
      }
      fallbackMemoryStore.get(userId).unshift(point)
      fallbackMemoryStore.get(userId).splice(100)

      const redis = getRedisClient()
      try {
        const key = await getUserMemoryKey(userId)
        await redis.lpush(key, JSON.stringify(point.payload))
        await redis.ltrim(key, 0, 49)
        await redis.expire(key, 60 * 60 * 24)
      } catch {
        // ignore cache failures
      }

      return { success: true, pointId: point.id, payload: point.payload, fallback: true }
    }

    const redis = getRedisClient()
    try {
      const key = await getUserMemoryKey(userId)
      await redis.lpush(key, JSON.stringify(point.payload))
      await redis.ltrim(key, 0, 49)
      await redis.expire(key, 60 * 60 * 24)
    } catch {
      // ignore cache failures
    }

    return { success: true, pointId: point.id, payload: point.payload }
  },

  async setSessionContext(userId, context = {}) {
    const redis = getRedisClient()
    if (!redis) return false

    const key = `session:${userId}`
    await redis.set(key, JSON.stringify({
      ...context,
      updatedAt: new Date().toISOString(),
    }), 'EX', 60 * 60)
    return true
  },

  async getSessionSnapshot(userId) {
    return this.getSessionContext(userId)
  },

  async getSessionContext(userId) {
    const redis = getRedisClient()
    if (!redis) return null

    const key = `session:${userId}`
    const raw = await redis.get(key)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  },
}
