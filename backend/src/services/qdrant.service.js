import { randomUUID } from 'node:crypto'
import { getQdrantClient, ensureCollection } from '../config/qdrant.js'
import { embeddingService } from './embedding.service.js'
import { encryptToken, decryptToken, isEncryptedToken } from './tokenCrypto.js'

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
      const embedding = text ? await embeddingService.createEmbedding(text) : []

      const response = await client.search(collectionName, {
        vector: embedding,
        limit,
        with_payload: true,
        filter,
      })

      return response.map((item) => ({
        id: item.id,
        score: item.score,
        payload: decryptPayload(item.payload || {}),
      }))
    } catch (error) {
      return []
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
