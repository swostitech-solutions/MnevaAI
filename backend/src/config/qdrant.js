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

export async function ensureCollection(name, options = {}) {
  const client = getQdrantClient()
  if (!client) return null

  const vectorSize = Number(options?.vectorSize || process.env.QDRANT_VECTOR_SIZE || 512)
  const distance = options.distance || 'Cosine'

  try {
    await client.getCollection(name)
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

    return true
  }
}
