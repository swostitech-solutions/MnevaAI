import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server as IO } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { logger } from "./config/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authMiddleware } from "./middleware/auth.js";
import { setupSocket } from "./services/socketService.js";
import authRoutes from "./routes/auth.js";
import agentRoutes from "./routes/agent.js";
import dashboardRoutes from "./routes/dashboard.js";
import financeRoutes from "./routes/finance.js";
import commsRoutes from "./routes/comms.js";
import healthRoutes from "./routes/health.js";
import lifeopsRoutes from "./routes/lifeops.js";
import twinRoutes from "./routes/twin.js";
import notifRoutes from "./routes/notifications.js";
import trustRoutes from "./routes/trust.js";
import searchRoutes from "./routes/search.js";
import conversationRoutes from "./routes/conversations.js";
import messageRoutes from "./routes/messages.js";
import documentsRoutes from "./routes/documents.js";
import workflowsRoutes from "./routes/workflows.js";
import preferencesRoutes from "./routes/preferences.js";
import gmailRoutes, { gmailCallbackHandler } from "./routes/gmail.js";
import calendarRoutes, { calendarCallbackHandler } from "./routes/calendar.js";
import googleFitRoutes, {
  googleFitCallbackHandler,
} from "./routes/googlefit.js";
import contactsRoutes, {
  googleContactsCallbackHandler,
} from "./routes/contacts.js";
import gdriveRoutes, { gdriveCallbackHandler } from "./routes/gdrive.js";
import gtasksRoutes, { gtasksCallbackHandler } from "./routes/gtasks.js";
import { smsRouter, meetingsRouter } from "./routes/_allRoutes.js";
import tmdbRoutes from "./routes/tmdb.js";
import notifyRoutes from "./routes/notify.js";
import { onboardingRouter as onboardingRoutes } from "./routes/onboarding.js";
import { familyRouter } from "./routes/family.js";
import { petRouter, startPetReminderPoller } from "./routes/pet.js";
import {
  familyItemsRouter,
  startFamilyReminderPoller,
} from "./routes/familyItems.js";
import deviceNotificationRoutes from "./routes/deviceNotifications.js";
import tasksRoutes from "./routes/tasks.js";
import { connectDatabase, disconnectDatabase } from "./config/prisma.js";
import { connectQdrant } from "./config/qdrant.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { startEmailWorker } from "./queues/email.queue.js";
import { startReminderWorker } from "./queues/reminder.queue.js";
import { startWorkflowWorker } from "./queues/workflow.queue.js";
import { isOpenAIConfigured } from "./agents/autonomyEngine.js";

const app = express();
// React Native does not maintain the browser cache required to replay a 304
// response, so conditional JSON responses arrive without a body and look like
// empty application data. Always send the current JSON payload to mobile/API clients.
app.disable("etag");
let isShuttingDown = false;
let databaseReady = false;
let selfPingTimer = null;
let eventLoopLagMs = 0;
let lastLoopCheckAt = Date.now();

// The app going "fully offline for a while, then fine again" with a paid
// (non-sleeping) instance and a non-sleeping DB cannot be diagnosed from the
// client side — every request, including /api/health, is served by this same
// single JS thread. If something blocks it (a heavy synchronous parse, a
// runaway loop), the whole API looks dead until it clears, with no error to
// log because nothing ever got to run. This 1s heartbeat measures how late it
// fires; a growing lag right before an outage is direct proof of a blocked
// event loop instead of a guess.
const LOOP_CHECK_INTERVAL_MS = 1000;
setInterval(() => {
  const now = Date.now();
  eventLoopLagMs = Math.max(0, now - lastLoopCheckAt - LOOP_CHECK_INTERVAL_MS);
  lastLoopCheckAt = now;
}, LOOP_CHECK_INTERVAL_MS).unref();

export function getHealthStatus({ shuttingDown = isShuttingDown, ready = databaseReady } = {}) {
  const running = !shuttingDown;
  const mem = process.memoryUsage();
  return {
    status: running ? "ok" : "stopping",
    service: "Mneva AI v2",
    version: "2.0.0",
    database: ready ? "ready" : "connecting",
    readiness: ready ? "ready" : "warming",
    shuttingDown,
    ai: isOpenAIConfigured(process.env.OPENAI_API_KEY),
    aiConfigured: isOpenAIConfigured(process.env.OPENAI_API_KEY),
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    },
    eventLoopLagMs,
    timestamp: new Date().toISOString(),
  };
}

export function shouldAllowApiRequest(req, { shuttingDown = isShuttingDown, ready = databaseReady } = {}) {
  if (shuttingDown) return false;
  // Do not block the whole API surface just because Postgres is reconnecting.
  // A warm-up or transient DB outage should keep the server reachable so the
  // app can show cached/local data instead of looking fully offline.
  if (req && req.path && req.path.startsWith("/auth/")) return true;
  if (!ready && req && req.path && req.path === "/health") return true;
  return true;
}

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));

const appAllowedOrigins = [
  ...(process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  ...(process.env.FRONTEND_URL_WEB || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  ...(process.env.PUBLIC_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  ...(process.env.RENDER_EXTERNAL_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "https://mneva-backend-v2.onrender.com",
];

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const lowered = origin.toLowerCase();
  if (lowered === "null") return true;
  if (
    lowered.startsWith("exp://") ||
    lowered.startsWith("exps://") ||
    lowered.startsWith("rn://") ||
    lowered.startsWith("expo://") ||
    lowered.startsWith("capacitor://") ||
    lowered.startsWith("file://")
  )
    return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(lowered))
    return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]")
      return true;
    if (host.endsWith(".onrender.com") || host.endsWith(".render.com"))
      return true;
    if (
      appAllowedOrigins.includes(origin) ||
      appAllowedOrigins.includes(parsed.origin)
    )
      return true;
  } catch {}
  return true;
};

app.options("*", cors({ origin: true, credentials: true }));
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
  }),
);
app.use(compression());
app.use(
  rateLimit({
    windowMs: +process.env.RATE_LIMIT_WINDOW_MS || 900000,
    // A single active session is chattier than this looks at first glance:
    // Home's own screen fires 7-11 endpoint calls per load, refreshed on
    // every navigation/focus/app-resume, plus several other screens poll
    // their own status endpoints (gmail/calendar/drive/contacts/etc). The
    // previous 2000/15min-per-token cap was tight enough that sustained
    // real usage could plausibly hit it, making every endpoint 429 at once
    // for that user until the window reset — indistinguishable from "the
    // server went offline" from the app's side. Widened with real headroom.
    max: +process.env.RATE_LIMIT_MAX || 6000,
    // Keyed by token alone, every device signed into the same account shared
    // one bucket — a handful of devices on one account (family sharing, or
    // just testing) could exhaust it within minutes from combined normal
    // polling, 429-ing every device on that account at once until the window
    // reset. That looked exactly like "the whole app goes offline, then
    // recovers on its own" (see the 05:59-06:00 log storm on one account).
    // Keying by token+IP gives each device its own budget.
    keyGenerator: (req) => {
      const tokenKey = req.headers["authorization"]?.slice(-16);
      return tokenKey ? `${tokenKey}:${req.ip}` : req.ip;
    },
    skip: (req) => req.path === "/api/health",
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const tokenKey = req.headers["authorization"]?.slice(-16);
      const key = tokenKey ? `${tokenKey}:${req.ip}` : req.ip;
      logger.warn(`Rate limit exceeded — ${req.method} ${req.originalUrl} — key: ${key}`);
      res.status(429).json({ error: "Too many requests — please wait a moment" });
    },
  }),
);
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: "Too many requests — please wait a moment" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/agent/chat", agentLimiter);
app.use("/api/agent/draft", agentLimiter);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("short", { stream: { write: (m) => logger.info(m.trim()) } }));

// ── Public ──────────────────────────────────────────────────────────────────
app.get("/privacy", (_, res) =>
  res.send(
    "<html><body><h1>Privacy Policy</h1><p>Mneva AI collects only data necessary to provide its services. We use OAuth 2.0 and never store your passwords. Contact: sbehera807@gmail.com</p></body></html>",
  ),
);
app.get("/terms", (_, res) =>
  res.send(
    "<html><body><h1>Terms of Service</h1><p>By using Mneva AI you agree to use the service responsibly. Contact: sbehera807@gmail.com</p></body></html>",
  ),
);

app.get("/api/health", (_, res) => {
  const status = getHealthStatus();
  res.status(status.status === "ok" ? 200 : 503).json(status);
});

// Keep the server reachable during DB warm-up/reconnect storms. The app can
// still show cached data or a friendly error instead of appearing completely
// unavailable when only the database is reconnecting.
app.use("/api", (req, res, next) => {
  if (!shouldAllowApiRequest(req)) {
    res.set("Retry-After", "2");
    return res.status(503).json({
      error: "Service is changing instances. Please retry shortly.",
      retryable: true,
    });
  }
  return next();
});
// Diagnostic endpoint to verify OpenAI API key and connectivity
app.get("/api/debug/openai", async (_req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey)
      return res
        .status(400)
        .json({ ok: false, message: "OPENAI_API_KEY not set" });

    const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

    const payload = {
      model,
      messages: [{ role: "user", content: "Health check: say pong" }],
      stream: false,
      temperature: 0.0,
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const message = data?.error?.message || `OpenAI API error ${resp.status}`;
      return res
        .status(resp.status)
        .json({ ok: false, status: resp.status, message, data });
    }

    return res.json({ ok: true, status: resp.status, data });
  } catch (err) {
    logger.error(`OpenAI diagnostic failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});
app.use("/api/auth", authRoutes);
app.use("/api/device-notifications", deviceNotificationRoutes);
app.get("/api/gmail/callback", gmailCallbackHandler);
app.get("/api/calendar/callback", calendarCallbackHandler);
app.get("/api/googlefit/callback", googleFitCallbackHandler);
app.get("/api/contacts/callback", googleContactsCallbackHandler);
app.get("/api/gdrive/callback", gdriveCallbackHandler);
app.get("/api/gtasks/callback", gtasksCallbackHandler);
app.get("/api/gmail/config-status", (req, res) => {
  // proxy to the router handler without auth
  const configured = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    !process.env.GOOGLE_CLIENT_ID.includes("replace") &&
    !process.env.GOOGLE_CLIENT_SECRET.includes("replace")
  );
  res.json({ configured });
});
app.use("/api/gmail", authMiddleware, gmailRoutes);
app.use("/api/calendar", authMiddleware, calendarRoutes);
app.use("/api/googlefit", authMiddleware, googleFitRoutes);
app.use("/api/contacts", authMiddleware, contactsRoutes);
app.use("/api/gdrive", authMiddleware, gdriveRoutes);
app.use("/api/gtasks", authMiddleware, gtasksRoutes);

app.use("/api/conversations", authMiddleware, conversationRoutes);
app.use("/api/messages", authMiddleware, messageRoutes);
app.use("/api/documents", authMiddleware, documentsRoutes);
app.use("/api/workflows", authMiddleware, workflowsRoutes);
app.use("/api/preferences", authMiddleware, preferencesRoutes);

// ── Protected ───────────────────────────────────────────────────────────────
app.use("/api/agent", authMiddleware, agentRoutes);
app.use("/api/dashboard", authMiddleware, dashboardRoutes);
app.use("/api/finance", authMiddleware, financeRoutes);
app.use("/api/comms", authMiddleware, commsRoutes);
app.use("/api/health-data", authMiddleware, healthRoutes);
app.use("/api/lifeops", authMiddleware, lifeopsRoutes);
app.use("/api/twin", authMiddleware, twinRoutes);
app.use("/api/notifications", authMiddleware, notifRoutes);
app.use("/api/trust", authMiddleware, trustRoutes);
app.use("/api/search", authMiddleware, searchRoutes);

app.use("/api/tasks", authMiddleware, tasksRoutes);
app.use("/api/meetings", authMiddleware, meetingsRouter);
app.use("/api/tmdb", authMiddleware, tmdbRoutes);
app.use("/api/sms", smsRouter);
app.use("/api/notify", notifyRoutes);
app.use("/api/onboarding", authMiddleware, onboardingRoutes);
app.use("/api/family", authMiddleware, familyRouter);
app.use("/api/pet", authMiddleware, petRouter);
app.use("/api/family-items", authMiddleware, familyItemsRouter);

app.use(errorHandler);

// create server and socket once; fail fast if port is unavailable
const server = createServer(app);
const allowedSocketOrigins = (
  process.env.FRONTEND_URL || "http://localhost:5174"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const io = new IO(server, {
  cors: {
    origin: allowedSocketOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000,
});
setupSocket(io);
app.set("io", io);

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}; shutting down gracefully...`);

  // Stop accepting/routing new work before closing dependencies. Previously
  // the database was disconnected first, so Render could still send API
  // requests to a process that was already tearing its data layer down.
  io.close();
  if (selfPingTimer) clearInterval(selfPingTimer);
  await Promise.race([
    new Promise((resolve) => server.close(resolve)),
    new Promise((resolve) => setTimeout(resolve, 10000)),
  ]);

  await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
  process.exit(0);
};

const listenPort = Number(process.env.PORT) || 3001;

async function connectDatabaseWithRetry() {
  let attempt = 0;
  while (true) {
    try {
      return await connectDatabase();
    } catch (error) {
      attempt += 1;
      const delay = Math.min(5000 * attempt, 30000);
      logger.warn(
        `⚠️ Database unavailable (attempt ${attempt}): ${error.message}. Retrying in ${delay / 1000}s`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ── FIX: open the port immediately, don't block on Redis/Qdrant/DB ──────────
// Previously this awaited connectRedis() -> connectQdrant() -> connectDatabase()
// in sequence BEFORE calling server.listen(). If any of those three (especially
// Redis/Qdrant, which are often hosted on their own separate free tiers) were
// slow or cold, the port never opened until all three resolved — meaning every
// restart paid the full cost of the slowest dependency, on top of any Render
// cold start. A paid Render plan does NOT fix this, since it's your own app's
// boot order, not Render's.
//
// Now: server.listen() fires right away, and all connections happen in the
// background in parallel. Render's health check (and real users) get a fast
// response immediately; features that need Redis/Qdrant/DB simply report
// "not ready" until their connection resolves, instead of blocking startup.
if (process.env.NODE_ENV !== "test") {
  server.listen(listenPort, "0.0.0.0");
}

server.on("listening", () => {
  logger.info(`🚀 Mneva AI v2 running on :${listenPort}`);

  // Fire all three connections in parallel, non-blocking.
  (async () => {
    const [redisResult, qdrantResult] = await Promise.allSettled([
      connectRedis(),
      connectQdrant(),
    ]);

    const redisClient =
      redisResult.status === "fulfilled" ? redisResult.value : null;
    const qdrantClient =
      qdrantResult.status === "fulfilled" ? qdrantResult.value : null;
    let dbOk = false;
    try {
      await connectDatabaseWithRetry();
      databaseReady = true;
      dbOk = true;
    } catch (error) {
      logger.error(`❌ Database initialization stopped: ${error.message}`);
    }

    logger.info(`📦 Redis: ${redisClient ? "✅ Ready" : "⚠️  Not reachable"}`);
    logger.info(
      `🧠 Qdrant: ${qdrantClient ? "✅ Ready" : "⚠️  Not reachable"}`,
    );
    logger.info(
      `🗄️  Database: ${dbOk ? "✅ Ready" : "⚠️  Not reachable — will retry on first request"}`,
    );
    logger.info(
      `🤖 OpenAI: ${isOpenAIConfigured(process.env.OPENAI_API_KEY) ? "✅ Ready" : "⚠️  Set OPENAI_API_KEY"}`,
    );
    logger.info(`📡 Socket.IO ready`);

    // FIX: only start the pollers once the DB connection is confirmed —
    // previously these started immediately at import-time, before
    // connectDatabase() had even been called, which meant their first poll
    // cycle(s) could race against an unready/unconnected database.
    if (dbOk) {
      startPetReminderPoller(io);
      startFamilyReminderPoller(io);
    } else {
      logger.warn(
        "⚠️ Skipping pet/family reminder pollers — DB not ready at startup",
      );
    }

    if (redisClient) {
      try {
        startEmailWorker();
        startReminderWorker(io);
        startWorkflowWorker();
        logger.info("✅ BullMQ workers started");
      } catch (error) {
        logger.warn(`⚠️ Could not start BullMQ workers: ${error.message}`);
      }
    } else {
      logger.warn("⚠️ Redis not reachable; BullMQ workers skipped");
    }
  })();

  // FIX: self-ping must NEVER fall back to localhost. A loopback ping never
  // leaves the container, so it's never seen as external traffic and does
  // NOT reset Render's inactivity timer — this was silently broken before.
  const SELF_URLS = Array.from(
    new Set(
      [
        process.env.RENDER_EXTERNAL_URL,
        process.env.PUBLIC_URL,
        "https://mneva-backend-v2.onrender.com",
        "https://mneva-backend.onrender.com",
      ].filter(Boolean),
    ),
  );
  const pingSelf = () => {
    const requests = SELF_URLS.map((url) =>
      fetch(`${url}/api/health`)
        .then(() => `${url}/api/health`)
        .catch(() => null),
    );

    return Promise.allSettled(requests).then((results) => {
      const ok = results
        .filter((result) => result.status === "fulfilled" && result.value)
        .map((result) => result.value);
      if (ok.length) {
        logger.info(`🔁 Self-ping OK (${ok[0]})`);
      } else {
        logger.warn("🔁 Self-ping failed: no external health URL responded");
      }
    });
  };

  logger.info(`🔁 Self-ping targets: ${SELF_URLS.join(", ")}/api/health`);
  pingSelf().catch(() => {});
  selfPingTimer = setInterval(() => {
    pingSelf().catch(() => {});
    // Leaves a trail in Render's log history so a past "everything was
    // unreachable" window can be diagnosed after the fact: a reset uptime
    // means the process restarted (crash/OOM), a lag spike means the event
    // loop was blocked, rising rssMB across samples means a leak.
    const status = getHealthStatus();
    logger.info(
      `📈 uptime=${status.uptimeSeconds}s rss=${status.memory.rssMB}MB heap=${status.memory.heapUsedMB}MB loopLag=${status.eventLoopLagMs}ms`,
    );
  }, 5 * 60 * 1000);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    logger.error(`Port ${listenPort} is already in use.`);
    process.exit(1);
  }
  logger.error(err?.stack || err);
  process.exit(1);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err?.stack || err}`);
  // Only exit for truly fatal errors, not OCR/file-not-found issues
  if (err.code === "EADDRINUSE" || err.code === "EACCES") {
    process.exit(1);
  }
});
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled rejection: ${err?.stack || err}`);
});

export default app;
