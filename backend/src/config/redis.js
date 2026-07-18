import Redis from 'ioredis'
import { logger } from './logger.js'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
let redisClient = null

export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
      enableOfflineQueue: true,
      retryStrategy: (times) => {
        if (times > 10) return null
        return Math.min(1000 * times, 5000)
      },
    })

    redisClient.on('connect', () => logger.info('✅ Redis connected'))
    redisClient.on('ready', () => logger.info('✅ Redis ready'))
    redisClient.on('reconnecting', () => logger.warn('🔄 Redis reconnecting'))
    redisClient.on('error', (err) => logger.error(`❌ Redis error: ${err.message}`))
  }

  return redisClient
}

export async function connectRedis() {
  const client = getRedisClient()

  try {
    await client.connect()
    await client.ping()
    return client
  } catch (error) {
    logger.warn(`⚠️ Redis unavailable: ${error.message}`)
    return null
  }
}

export async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}
