import { randomUUID } from 'node:crypto'
import { getQdrantClient, ensureCollection, clearEnsuredCollection } from '../config/qdrant.js'
import { embeddingService } from './embedding.service.js'
import { encryptToken, decryptToken, isEncryptedToken } from './tokenCrypto.js'
import { logger } from '../config/logger.js'

const DEFAULT_COLLECTION = 'mneva_memory'

// Only `payload.text` is encrypted, not the whole payload — `userId` and
// `metadata.documentId` are matched against directly in Qdrant-side filters
// (deleteByFilter in document.controller.js/auth.js, the userId filter in
// memory.service.js's recall()), which need the real plaintext value to
// match on. `text` is the actual sensitive human-readable content (chat
// messages, document chunks, health/family notes) and is never filtered on
// itself, so it's the one field safe and worthwhile to encrypt.
function encryptPayload(payload) {
  if (!payload || typeof payload.text !== 'string' || !payload.text) return payload
  return { ...payload, text: encryptToken(payload.text) }
}

function decryptPayload(payload) {
  if (!payload || !isEncryptedToken(payload.text)) return payload
  try {
    return { ...payload, text: decryptToken(payload.text) }
  } catch {
    // A key rotation or corrupted row shouldn't crash a search — surface it
    // as empty text rather than throwing through to the caller.
    return { ...payload, text: '' }
  }
}

const qdrantService = {
  isReady: false,

  async init(collectionName = DEFAULT_COLLECTION) {
    try {
      await ensureCollection(collectionName)
      this.isReady = true
      return this
    } catch {
      this.isReady = false
      return this
    }
  },

  async upsertPoints(collectionName = DEFAULT_COLLECTION, points = []) {
    const client = getQdrantClient()
    if (!client) return { success: false, inserted: 0 }

    try {
      await this.init(collectionName)
      const payload = points.map((point) => ({
        id: point.id || randomUUID(),
        vector: point.vector || [],
        payload: encryptPayload(point.payload || {}),
      }))

      await client.upsert(collectionName, {
        wait: true,
        points: payload,
      })

      return { success: true, inserted: payload.length }
    } catch (error) {
      clearEnsuredCollection(collectionName)
      return { success: false, inserted: 0, error: error.message }
    }
  },

  async deleteByFilter(collectionName = DEFAULT_COLLECTION, filter = {}) {
    const client = getQdrantClient()
    if (!client) return { success: false, deleted: 0 }

    try {
      await this.init(collectionName)
      const response = await client.delete(collectionName, {
        wait: true,
        filter,
      })
      return { success: true, deleted: response?.deleted || 0 }
    } catch (error) {
      clearEnsuredCollection(collectionName)
      return { success: false, deleted: 0, error: error.message }
    }
  },

  async search(collectionName = DEFAULT_COLLECTION, query, options = {}) {
    const client = getQdrantClient()
    if (!client) return []

    try {
      await this.init(collectionName)
      const limit = options.limit || 5
      const filter = options.filter || {}
      const text = typeof query === 'string' ? query : ''
      let embedding = []
      if (text) {
        const embResult = await embeddingService.createEmbedding(text)
        embedding = embResult.vector
        if (embResult.source === 'hash_fallback') {
          logger.warn('⚠️  Semantic search query itself used a hash-fallback embedding — results may be unreliable')
        }
      }

      // L-12: a hash-fallback vector has no real semantic meaning, so a
      // point tagged that way at write time is excluded from ever
      // surfacing as a similarity match here — same collection, just
      // filtered out instead of needing a separate one.
      const mergedFilter = {
        ...filter,
        must_not: [...(filter.must_not || []), { key: 'embeddingSource', match: { value: 'hash_fallback' } }],
      }

      const response = await client.search(collectionName, {
        vector: embedding,
        limit,
        with_payload: true,
        filter: mergedFilter,
      })

      return response.map((item) => ({
        id: item.id,
        score: item.score,
        payload: decryptPayload(item.payload || {}),
      }))
    } catch (error) {
      clearEnsuredCollection(collectionName)
      return []
    }
  },

  // How many points match a filter — e.g. how many memories exist for one
  // user (used to gate the L1 -> L2 auto-graduation on real accumulated
  // memory, not just a raw chat-message tally).
  async countByFilter(collectionName = DEFAULT_COLLECTION, filter = {}) {
    const client = getQdrantClient()
    if (!client) return 0

    try {
      await this.init(collectionName)
      const response = await client.count(collectionName, { filter, exact: true })
      return response?.count || 0
    } catch {
      clearEnsuredCollection(collectionName)
      return 0
    }
  },

  // Exhaustively lists every point in a collection, including its raw
  // (still-encrypted, or pre-encryption plaintext) payload and vector — used
  // by scripts/encryptVectorMemory.js to find and re-save points saved
  // before payload encryption existed. Not used by normal app code, which
  // only ever needs a similarity search (see search() above).
  async scrollAll(collectionName = DEFAULT_COLLECTION, { batchSize = 200 } = {}) {
    const client = getQdrantClient()
    if (!client) return []

    await this.init(collectionName)
    const points = []
    let offset
    do {
      const response = await client.scroll(collectionName, {
        limit: batchSize,
        offset,
        with_payload: true,
        with_vector: true,
      })
      for (const point of response.points || []) points.push(point)
      offset = response.next_page_offset ?? undefined
    } while (offset !== undefined && offset !== null)
    return points
  },

  async getCollections() {
    const client = getQdrantClient()
    if (!client) return []

    try {
      const result = await client.getCollections()
      return result.collections || []
    } catch {
      return []
    }
  },
}

export { qdrantService }
