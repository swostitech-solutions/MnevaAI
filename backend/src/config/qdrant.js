import { QdrantClient } from '@qdrant/js-client-rest'
import { logger } from './logger.js'

const qdrantUrl = process.env.QDRANT_URL || process.env.QDRANT_HOST || 'http://localhost:6333'
let qdrantClient = null

export function getQdrantClient() {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: qdrantUrl,
      apiKey: process.env.QDRANT_API_KEY || undefined,
    })
  }

  return qdrantClient
}

export async function connectQdrant() {
  const client = getQdrantClient()

  try {
    await client.getCollections()
    logger.info(`✅ Qdrant connected at ${qdrantUrl}`)
    return client
  } catch (error) {
    logger.warn(`⚠️ Qdrant unavailable at ${qdrantUrl}: ${error.message}`)
    return null
  }
}

// Audit item L-05: every upsert/search/delete used to call ensureCollection,
// which made a real getCollection request to Qdrant first — one extra
// network round trip per memory read or write. A collection that exists
// doesn't stop existing between requests, so once it's been verified once
// this process doesn't need to ask again; qdrantService's catch blocks call
// clearEnsuredCollection() to force a re-check only when an operation
// actually fails, not on every call.
const ensuredCollections = new Set()

export function clearEnsuredCollection(name) {
  ensuredCollections.delete(name)
}

export async function ensureCollection(name, options = {}) {
  if (ensuredCollections.has(name)) return true

  const client = getQdrantClient()
  if (!client) return null

  const vectorSize = Number(options?.vectorSize || process.env.QDRANT_VECTOR_SIZE || 512)
  const distance = options.distance || 'Cosine'

  try {
    await client.getCollection(name)
    ensuredCollections.add(name)
    return true
  } catch (error) {
    const isMissing = error?.status === 404 || /not found/i.test(error?.message || '')
    if (!isMissing) throw error

    await client.createCollection(name, {
      vectors: {
        size: vectorSize,
        distance,
      },
      ...options,
    })

    ensuredCollections.add(name)
    return true
  }
}
