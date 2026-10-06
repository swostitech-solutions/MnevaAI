import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import path from "node:path";
import fs from "node:fs";
import { createServer } from "http";
import { Server as IO } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { logger } from "./config/logger.js";
import { Sentry, sentryEnabled } from "./config/sentry.js";
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
import vaultRoutes from "./routes/vault.js";
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
import { newsRouter } from "./routes/news.js";
import { familyRouter } from "./routes/family.js";
import { petRouter, startPetReminderPoller } from "./routes/pet.js";
import {
  familyItemsRouter,
  startFamilyReminderPoller,
} from "./routes/familyItems.js";
import deviceNotificationRoutes from "./routes/deviceNotifications.js";
import pushRoutes from "./routes/push.js";
import tasksRoutes from "./routes/tasks.js";
import { connectDatabase, disconnectDatabase, prisma } from "./config/prisma.js";
import { startGmailPoller } from "./services/gmailPoller.js";
import { startCalendarPoller } from "./services/calendarPoller.js";
import { startContactsPoller } from "./services/contactsPoller.js";
import { connectQdrant } from "./config/qdrant.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { startReminderWorker } from "./queues/reminder.queue.js";
import { startDailyDigestWorker, scheduleDailyDigest } from "./queues/dailyDigest.queue.js";
import { startAdvanceReminderWorker, scheduleAdvanceReminderScan } from "./queues/advanceReminder.queue.js";
import { startMeetingAutoCloseWorker, scheduleMeetingAutoCloseScan } from "./queues/meetingAutoClose.queue.js";
import { isOpenAIConfigured } from "./agents/autonomyEngine.js";
import { applyModelCompat } from "./services/openaiCompat.js";
import { backfillLedgerChain } from "./services/ledgerBackfill.js";
import { startMedicationDosePoller } from "./services/medicationDosePoller.js";

const app = express();
// React Native does not maintain the browser cache required to replay a 304
// response, so conditional JSON responses arrive without a body and look like
// empty application data. Always send the current JSON payload to mobile/API clients.
app.disable("etag");
let isShuttingDown = false;
let databaseReady = false;
let selfPingTimer = null;
// BullMQ Worker instances started once Redis is ready — closed gracefully in
// shutdown() below. Previously nothing here was ever closed, so a job
// actively being processed at the moment SIGTERM arrived had its Redis
// connection pulled out from under it mid-run (disconnectRedis fires in the
// very same shutdown pass) instead of being allowed to finish first.
const activeWorkers = [];
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

// The mobile app's native requests send no Origin header, so they never
// depend on this list. It only governs browsers: the web dashboard's own
// origins (FRONTEND_URL / FRONTEND_URL_WEB / PUBLIC_URL / RENDER_EXTERNAL_URL)
// plus localhost during development. This used to end in `return true` —
// and also trust "null" and every *.onrender.com site — so any web page
// could make credentialed cross-origin calls; security scanners (and
// Google's CASA assessment) flag that as a CORS misconfiguration.
const isProduction = process.env.NODE_ENV === "production";
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const lowered = origin.toLowerCase();
  if (
    lowered.startsWith("exp://") ||
    lowered.startsWith("exps://") ||
    lowered.startsWith("rn://") ||
    lowered.startsWith("expo://") ||
    lowered.startsWith("capacitor://")
  )
    return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (!isProduction && (host === "localhost" || host === "127.0.0.1" || host === "[::1]"))
      return true;
    if (
      appAllowedOrigins.includes(origin) ||
      appAllowedOrigins.includes(parsed.origin)
    )
      return true;
  } catch {}
  return false;
};

const corsOptions = {
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
};
app.options("*", cors(corsOptions));
app.use(cors(corsOptions));
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
    // Keyed by token alone. A previous version appended `:${req.ip}` to give
    // each device its own budget — but `trust proxy` is never set on this
    // app, so req.ip is Render's own internal proxy hop, not the client.
    // That hop rotates across a small pool of internal addresses per
    // request, so the *same* device's requests kept landing in *different*
    // token+ip buckets, each hitting its own 429 independently — visible in
    // production as the same token key paired with several different
    // 10.x.x.x addresses, all rate-limited within the same minute. The
    // token itself is already unique per login/device (a fresh JWT is
    // minted every sign-in), so it alone already gives each device its own
    // budget without needing an IP component at all.
    keyGenerator: (req) => req.headers["authorization"]?.slice(-16) || req.ip,
    skip: (req) => req.path === "/api/health",
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const key = req.headers["authorization"]?.slice(-16) || req.ip;
      logger.warn(`Rate limit exceeded — ${req.method} ${req.originalUrl} — key: ${key}`);
      res.status(429).json({ error: "Too many requests — please wait a moment" });
    },
  }),
);
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  // req.user is NOT set yet at this point — authMiddleware runs later, on
  // the /api/agent mount below, after this path-specific limiter. So
  // `req.user?.id` was always undefined here and this silently fell back to
  // the same unstable req.ip as the global limiter above (no `trust proxy`,
  // Render's internal proxy hop rotates per request) — on a much tighter
  // 60/min window, this was the more likely of the two bugs to actually
  // 429 a real request, and it sits directly in front of Ask AI's chat and
  // email-draft endpoints.
  keyGenerator: (req) => req.headers["authorization"]?.slice(-16) || req.ip,
  message: { error: "Too many requests — please wait a moment" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/agent/chat", agentLimiter);
app.use("/api/agent/draft", agentLimiter);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("short", { stream: { write: (m) => logger.info(m.trim()) } }));

// Profile photos uploaded via PATCH /api/auth/avatar (routes/auth.js) —
// served back as plain static files since they're not sensitive like Vault
// documents are, so the mobile <Image> component can load them directly by
// URL with no auth header needed.
const avatarDir = path.resolve(process.cwd(), "storage", "avatars");
fs.mkdirSync(avatarDir, { recursive: true });
app.use("/avatars", express.static(avatarDir));

// Most route handlers end in `res.status(500).json({ error: err.message })`,
// which hands internal details (Prisma/DB errors, file paths, upstream API
// responses) to the client — flagged as information disclosure by security
// scans. Rather than touch ~190 call sites, production rewrites any 500 JSON
// body's free-text message to a generic one and logs the original. Short
// machine codes like "drive_not_connected" pass through, and non-500
// statuses (400/401/404/409/503…) are untouched since those messages are
// deliberate and the app shows them.
const MACHINE_CODE = /^[a-z0-9_]{1,64}$/;
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 500 && body && typeof body === "object" && !Array.isArray(body)) {
        const cleaned = { ...body };
        let leaked = false;
        for (const key of ["error", "message", "detail", "details", "stack"]) {
          if (cleaned[key] === undefined) continue;
          if (key !== "stack" && typeof cleaned[key] === "string" && MACHINE_CODE.test(cleaned[key])) continue;
          leaked = true;
          delete cleaned[key];
        }
        if (leaked) {
          logger.error(`500 ${req.method} ${req.originalUrl}: ${JSON.stringify(body).slice(0, 1000)}`);
          cleaned.error = cleaned.error || "Something went wrong. Please try again.";
        }
        return json(cleaned);
      }
      return json(body);
    };
    next();
  });
}

// ── Public ──────────────────────────────────────────────────────────────────
// The privacy policy lives in src/public/privacy-policy.html, served at
// /privacy-policy below. /privacy used to serve a second, separately
// maintained policy; having two that disagree is exactly what Play and
// Google's OAuth review reject, so the old URL now just points at the one.
app.get("/privacy", (_, res) => res.redirect(301, "/privacy-policy"));
// Public homepage and terms — Google's OAuth consent screen needs a homepage
// that describes the app and links the privacy policy.
app.get("/", (_, res) => res.sendFile(fileURLToPath(new URL("./public/index.html", import.meta.url))));
app.get("/terms", (_, res) => res.sendFile(fileURLToPath(new URL("./public/terms.html", import.meta.url))));

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
  // Unauthenticated and spends OpenAI credit on every hit — local only.
  if (process.env.NODE_ENV === "production") return res.status(404).json({ error: "Not found" });
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey)
      return res
        .status(400)
        .json({ ok: false, message: "OPENAI_API_KEY not set" });

    const model = process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";

    const payload = applyModelCompat({
      model,
      messages: [{ role: "user", content: "Health check: say pong" }],
      stream: false,
    }, { temperature: 0.0, maxTokens: 20 });

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
// Public privacy policy — this URL is what the Play Console listing, the
// Google OAuth consent screen and the app's Signup/Settings links point at,
// so it must stay reachable without auth. #delete-account on the same page
// doubles as Play's required "delete account" web link.
app.get("/privacy-policy", (req, res) => {
  res.sendFile(fileURLToPath(new URL("./public/privacy-policy.html", import.meta.url)));
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

app.use("/api/news", authMiddleware, newsRouter);
app.use("/api/conversations", authMiddleware, conversationRoutes);
app.use("/api/messages", authMiddleware, messageRoutes);
app.use("/api/documents", authMiddleware, documentsRoutes);
app.use("/api/vault", authMiddleware, vaultRoutes);
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
app.use("/api/push", authMiddleware, pushRoutes);
app.use("/api/meetings", authMiddleware, meetingsRouter);
app.use("/api/tmdb", authMiddleware, tmdbRoutes);
app.use("/api/sms", smsRouter);
app.use("/api/notify", notifyRoutes);
app.use("/api/onboarding", authMiddleware, onboardingRoutes);
app.use("/api/family", authMiddleware, familyRouter);
app.use("/api/pet", authMiddleware, petRouter);
app.use("/api/family-items", authMiddleware, familyItemsRouter);

// Sentry's own error handler must sit between the routes and our custom
// one — it needs to see the error first to report it, then hands off to
// errorHandler.js unchanged for the actual response shape.
if (sentryEnabled) Sentry.setupExpressErrorHandler(app);
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

  // Let any job actively being processed right now finish (or hit BullMQ's
  // own internal close timeout) before the Redis connection it needs is torn
  // down below — previously nothing closed these, so an in-flight job's
  // connection could be pulled out from under it by disconnectRedis() in the
  // same pass.
  if (activeWorkers.length) {
    logger.info(`Closing ${activeWorkers.length} BullMQ worker(s)...`);
    await Promise.race([
      Promise.allSettled(activeWorkers.map((w) => w.close())),
      new Promise((resolve) => setTimeout(resolve, 10000)),
    ]);
  }

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

// Gmail/Calendar/Contacts polling used to only run for the duration of a
// user's live Socket.IO connection, and stopped 5 minutes after the last one
// disconnected — meaning new-email/new-event alerts silently stopped once
// the app had been closed for a few minutes. Every other proactive alert in
// this app (medication doses, pet/family reminders, the advance-reminder
// scan) runs globally regardless of app state; this brings Gmail/Calendar/
// Contacts in line with that by starting them here at boot for every user
// who has a relevant account connected. socketService.js still calls the
// same start functions on socket connect (harmless — each is a no-op if
// already running for that user) so a brand-new connection made mid-session
// doesn't have to wait for a server restart to start being polled.
async function startGoogleServicePollersForConnectedUsers(io) {
  const users = await prisma.user.findMany({ select: { id: true, preferences: true } });
  let gmailCalendarCount = 0;
  let contactsCount = 0;
  for (const user of users) {
    const prefs = user.preferences || {};
    if (prefs.gmail?.tokens || prefs.calendar?.tokens) {
      startGmailPoller(user.id, io);
      startCalendarPoller(user.id, io);
      gmailCalendarCount++;
    }
    if (prefs.googleContacts?.tokens && !prefs.googleContacts?.disconnected) {
      startContactsPoller(user.id, io);
      contactsCount++;
    }
  }
  logger.info(
    `📡 Google-account pollers started — Gmail/Calendar: ${gmailCalendarCount} user(s), Contacts: ${contactsCount} user(s)`,
  );
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
      startMedicationDosePoller();
      startGoogleServicePollersForConnectedUsers(io).catch((err) =>
        logger.error(`Failed to start Google-account pollers: ${err.message}`),
      );
      // Fire-and-forget: chains + signs any ledger rows written before the
      // Twin Diary's hash-chain existed. Runs every boot but is a no-op once
      // the table is fully backfilled, so it never delays startup noticeably.
      backfillLedgerChain().catch((err) =>
        logger.error(`Ledger chain backfill failed: ${err.message}`),
      );
    } else {
      logger.warn(
        "⚠️ Skipping pet/family reminder pollers — DB not ready at startup",
      );
    }

    if (redisClient) {
      try {
        activeWorkers.push(startReminderWorker(io));
        activeWorkers.push(startDailyDigestWorker());
        await scheduleDailyDigest();
        activeWorkers.push(startAdvanceReminderWorker());
        await scheduleAdvanceReminderScan();
        activeWorkers.push(startMeetingAutoCloseWorker());
        await scheduleMeetingAutoCloseScan();
        logger.info("✅ BullMQ workers started");
      } catch (error) {
        logger.warn(`⚠️ Could not start BullMQ workers: ${error.message}`);
      }
    } else {
      logger.warn("⚠️ Redis not reachable; BullMQ workers skipped");
    }
  })();

  // Self-ping exists only to reset Render's free/starter-tier inactivity
  // timer (a loopback ping never leaves the container, so it doesn't count as
  // external traffic there). RENDER_EXTERNAL_URL is set exclusively by
  // Render, so on any other host (VPS, etc.) this whole block is a no-op —
  // an always-on host has no inactivity timer to reset.
  if (process.env.RENDER_EXTERNAL_URL) {
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
  }
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
  if (sentryEnabled) Sentry.captureException(err);
  // Only exit for truly fatal errors, not OCR/file-not-found issues
  if (err.code === "EADDRINUSE" || err.code === "EACCES") {
    process.exit(1);
  }
});
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled rejection: ${err?.stack || err}`);
  if (sentryEnabled) Sentry.captureException(err);
});

export default app;
