import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server as IO } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { logger } from './config/logger.js'
import { errorHandler } from './middleware/errorHandler.js'
import { authMiddleware } from './middleware/auth.js'
import { setupSocket } from './services/socketService.js'
import authRoutes from './routes/auth.js'
import agentRoutes from './routes/agent.js'
import dashboardRoutes from './routes/dashboard.js'
import financeRoutes from './routes/finance.js'
import commsRoutes from './routes/comms.js'
import healthRoutes from './routes/health.js'
import lifeopsRoutes from './routes/lifeops.js'
import twinRoutes from './routes/twin.js'
import notifRoutes from './routes/notifications.js'
import trustRoutes from './routes/trust.js'
import searchRoutes from './routes/search.js'
import conversationRoutes from './routes/conversations.js'
import messageRoutes from './routes/messages.js'
import documentsRoutes from './routes/documents.js'
import workflowsRoutes from './routes/workflows.js'
import preferencesRoutes from './routes/preferences.js'
import gmailRoutes, { gmailCallbackHandler } from './routes/gmail.js'
import calendarRoutes, { calendarCallbackHandler } from './routes/calendar.js'
import googleFitRoutes, { googleFitCallbackHandler } from './routes/googlefit.js'
import contactsRoutes, { googleContactsCallbackHandler } from './routes/contacts.js'
import { smsRouter } from './routes/_allRoutes.js'
import notifyRoutes from './routes/notify.js'
import { onboardingRouter as onboardingRoutes } from './routes/onboarding.js'
import { connectDatabase, disconnectDatabase } from './config/prisma.js'
import { connectQdrant } from './config/qdrant.js'
import { connectRedis, disconnectRedis } from './config/redis.js'
import { startEmailWorker } from './queues/email.queue.js'
import { startReminderWorker } from './queues/reminder.queue.js'
import { startWorkflowWorker } from './queues/workflow.queue.js'
import { isDeepSeekConfigured } from './agents/autonomyEngine.js'

const app = express()

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }))
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5174')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS origin denied: ${origin}`))
  },
  credentials: true,
}))
app.use(compression())
app.use(rateLimit({
  windowMs: +process.env.RATE_LIMIT_WINDOW_MS || 900000,
  max: +process.env.RATE_LIMIT_MAX || 2000,
  keyGenerator: (req) => req.headers['authorization']?.slice(-16) || req.ip,
  skip: req => req.path === '/api/health',
  standardHeaders: true,
  legacyHeaders: false,
}))
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests — please wait a moment' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/agent/chat', agentLimiter)
app.use('/api/agent/draft', agentLimiter)
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(morgan('short', { stream: { write: m => logger.info(m.trim()) } }))

// ── Public ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({
  status: 'ok', service: 'Mneva AI v2', version: '2.0.0',
  ai: isDeepSeekConfigured(process.env.DEEPSEEK_API_KEY),
  aiConfigured: isDeepSeekConfigured(process.env.DEEPSEEK_API_KEY),
  timestamp: new Date().toISOString()
}))
// Diagnostic endpoint to verify DeepSeek API key and connectivity
app.get('/api/debug/deepseek', async (_req, res) => {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
    if (!apiKey) return res.status(400).json({ ok: false, message: 'DEEPSEEK_API_KEY not set' })

    const base = process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com'
    const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat'

    const payload = {
      model,
      messages: [{ role: 'user', content: 'Health check: say pong' }],
      stream: false,
      temperature: 0.0,
    }

    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    })

    const data = await resp.json().catch(() => null)
    if (!resp.ok) {
      const message = data?.error?.message || `DeepSeek API error ${resp.status}`
      return res.status(resp.status).json({ ok: false, status: resp.status, message, data })
    }

    return res.json({ ok: true, status: resp.status, data })
  } catch (err) {
    logger.error('DeepSeek diagnostic failed', err)
    return res.status(500).json({ ok: false, error: String(err) })
  }
})
app.use('/api/auth', authRoutes)
app.get('/api/gmail/callback', gmailCallbackHandler)
app.get('/api/calendar/callback', calendarCallbackHandler)
app.get('/api/googlefit/callback', googleFitCallbackHandler)
app.get('/api/contacts/callback', googleContactsCallbackHandler)
app.get('/api/gmail/config-status', (req, res) => {
  // proxy to the router handler without auth
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET &&
    !process.env.GOOGLE_CLIENT_ID.includes('replace') && !process.env.GOOGLE_CLIENT_SECRET.includes('replace'))
  res.json({ configured })
})
app.use('/api/gmail', authMiddleware, gmailRoutes)
app.use('/api/calendar', authMiddleware, calendarRoutes)
app.use('/api/googlefit', authMiddleware, googleFitRoutes)
app.use('/api/contacts', authMiddleware, contactsRoutes)

app.use('/api/conversations', authMiddleware, conversationRoutes)
app.use('/api/messages', authMiddleware, messageRoutes)
app.use('/api/documents', authMiddleware, documentsRoutes)
app.use('/api/workflows', authMiddleware, workflowsRoutes)
app.use('/api/preferences', authMiddleware, preferencesRoutes)

// ── Protected ───────────────────────────────────────────────────────────────
app.use('/api/agent',         authMiddleware, agentRoutes)
app.use('/api/dashboard',     authMiddleware, dashboardRoutes)
app.use('/api/finance',       authMiddleware, financeRoutes)
app.use('/api/comms',         authMiddleware, commsRoutes)
app.use('/api/health-data',   authMiddleware, healthRoutes)
app.use('/api/lifeops',       authMiddleware, lifeopsRoutes)
app.use('/api/twin',          authMiddleware, twinRoutes)
app.use('/api/notifications', authMiddleware, notifRoutes)
app.use('/api/trust',         authMiddleware, trustRoutes)
app.use('/api/search',        authMiddleware, searchRoutes)

import tasksRoutes from './routes/tasks.js'
app.use('/api/tasks', authMiddleware, tasksRoutes)
app.use('/api/sms', smsRouter)
app.use('/api/notify', notifyRoutes)
app.use('/api/onboarding', authMiddleware, onboardingRoutes)

app.use(errorHandler)

// create server and socket once; fail fast if port is unavailable
const server = createServer(app)
const allowedSocketOrigins = (process.env.FRONTEND_URL || 'http://localhost:5174')
  .split(',')
  .map(url => url.trim())
  .filter(Boolean)

const io = new IO(server, {
  cors: { 
    origin: allowedSocketOrigins, 
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
})
setupSocket(io)
app.set('io', io)

let isShuttingDown = false

const shutdown = async (signal) => {
  if (isShuttingDown) return
  isShuttingDown = true
  logger.info(`Received ${signal}; shutting down gracefully...`)

  await Promise.allSettled([
    disconnectDatabase(),
    disconnectRedis(),
  ])

  server.close(() => {
    process.exit(0)
  })

  setTimeout(() => process.exit(1), 10000)
}

const listenPort = Number(process.env.PORT) || 3001

const redisClient = await connectRedis()
const qdrantClient = await connectQdrant()
await connectDatabase()

if (redisClient) {
  try {
    startEmailWorker()
    startReminderWorker(io)
    startWorkflowWorker()
    logger.info('✅ BullMQ workers started')
  } catch (error) {
    logger.warn(`⚠️ Could not start BullMQ workers: ${error.message}`)
  }
} else {
  logger.warn('⚠️ Redis not reachable; BullMQ workers skipped')
}

server.listen(listenPort, '0.0.0.0')

server.on('listening', () => {
  logger.info(`🚀 Mneva AI v2 running on :${listenPort}`)
  logger.info(`📦 Redis: ${redisClient ? '✅ Ready' : '⚠️  Not reachable'}`)
  logger.info(`🧠 Qdrant: ${qdrantClient ? '✅ Ready' : '⚠️  Not reachable'}`)
  logger.info(`🤖 DeepSeek AI: ${isDeepSeekConfigured(process.env.DEEPSEEK_API_KEY) ? '✅ Ready' : '⚠️  Set DEEPSEEK_API_KEY'}`)
  logger.info(`📡 Socket.IO ready`)
})

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    logger.error(`Port ${listenPort} is already in use.`)
    process.exit(1)
  }
  logger.error(err)
  process.exit(1)
})

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err)
  // Only exit for truly fatal errors, not OCR/file-not-found issues
  if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
    process.exit(1)
  }
})
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err)
})

export default app
