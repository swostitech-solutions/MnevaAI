import crypto from 'node:crypto'
import { logger } from '../config/logger.js'

export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 512)

function deterministicVector(text = '') {
  const bytes = crypto.createHash('sha256').update(String(text).trim().toLowerCase()).digest()
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => {
    const byte = bytes[i % bytes.length]
    return ((byte + i * 13) % 256 - 127.5) / 127.5
  })
  const magnitude = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0)) || 1
  return vector.map(n => n / magnitude)
}

let voyageClient = null

async function getVoyageClient() {
  if (voyageClient) return voyageClient
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) {
    logger.warn('⚠️  VOYAGE_API_KEY not set — semantic memory disabled, using hash fallback')
    return null
  }
  try {
    const { VoyageAIClient } = await import('voyageai')
    voyageClient = new VoyageAIClient({ apiKey })
    return voyageClient
  } catch {
    logger.warn('⚠️  voyageai package not found — run: npm install voyageai')
    return null
  }
}

export const embeddingService = {
  async createEmbedding(text = '') {
    const normalized = String(text || '').trim()
    if (!normalized) return deterministicVector('')

    try {
      const client = await getVoyageClient()
      if (client) {
        const res = await client.embed({ input: [normalized], model: 'voyage-3-lite' })
        const vec = res?.data?.[0]?.embedding
        if (Array.isArray(vec) && vec.length > 0) return vec
      }
    } catch (err) {
      logger.warn(`⚠️  Voyage embedding failed: ${err.message} — using hash fallback`)
    }

    return deterministicVector(normalized)
  },

  async createEmbeddingBatch(texts = []) {
    return Promise.all(texts.map(t => this.createEmbedding(t)))
  },
}
