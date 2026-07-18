import { randomUUID } from 'node:crypto'
import { getQdrantClient, ensureCollection } from '../config/qdrant.js'
import { embeddingService } from './embedding.service.js'

const DEFAULT_COLLECTION = 'mneva_memory'

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
        payload: point.payload || {},
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
        payload: item.payload || {},
      }))
    } catch (error) {
      return []
    }
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
