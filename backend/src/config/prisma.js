import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Set it to your real PostgreSQL connection string.");
}

// `$on('error', ...)` only fires for log levels configured with
// `emit: 'event'` — passing plain strings (the previous config) routes them
// to stdout instead, so the "reconnect on error" listener below was never
// actually invoked. `warn` still goes to stdout for visibility.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development"
    ? [{ level: "warn", emit: "stdout" }, { level: "error", emit: "event" }]
    : [{ level: "error", emit: "event" }],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Reconnect automatically on connection loss
prisma.$on('error', async (e) => {
  logger.error(`Prisma error: ${e?.message || e}`);
  try { await prisma.$connect(); } catch {}
});

export async function connectDatabase() {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      await prisma.$connect();
      return prisma;
    } catch (err) {
      lastErr = err;
      if (i < 2) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  console.error('[DB] Could not connect after 3 attempts:', lastErr?.message);
  throw lastErr || new Error('Database connection failed');
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
