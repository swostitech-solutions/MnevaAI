import Redis from 'ioredis'
import { logger } from './logger.js'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
let redisClient = null
let bullRedisClient = null

// General-purpose client for request-path caching (memory.service.js, etc).
// `maxRetriesPerRequest` is bounded and the offline queue is disabled so a
// command fails fast (and callers fall back gracefully, as they already do)
// instead of hanging forever while Redis is unreachable — an unbounded wait
// here previously made every request that touched it look like the whole
// app had gone offline until Redis came back.
export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
      enableOfflineQueue: false,
      commandTimeout: 3000,
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

// BullMQ requires its own connection with `maxRetriesPerRequest: null` and
// the offline queue enabled (its blocking commands rely on that) — kept
// separate from the general client above so a Redis outage that stalls
// queue commands can never also stall an unrelated request-path cache read.
export function getBullRedisClient() {
  if (!bullRedisClient) {
    bullRedisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
      enableOfflineQueue: true,
      retryStrategy: (times) => Math.min(1000 * times, 5000),
    })

    bullRedisClient.on('error', (err) => logger.error(`❌ Redis (queue) error: ${err.message}`))
  }

  return bullRedisClient
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
  if (bullRedisClient) {
    await bullRedisClient.quit()
    bullRedisClient = null
  }
}
