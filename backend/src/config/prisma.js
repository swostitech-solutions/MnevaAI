import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";
import { encryptToken, decryptToken, isEncryptedToken } from "../services/tokenCrypto.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Set it to your real PostgreSQL connection string.");
}

// `$on('error', ...)` only fires for log levels configured with
// `emit: 'event'` — passing plain strings (the previous config) routes them
// to stdout instead, so the "reconnect on error" listener below was never
// actually invoked. `warn` still goes to stdout for visibility.
const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === "development"
    ? [{ level: "warn", emit: "stdout" }, { level: "error", emit: "event" }]
    : [{ level: "error", emit: "event" }],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Google OAuth tokens (Gmail/Calendar/Fit/Contacts/Drive/Tasks) live inside
// User.preferences — a JSON blob — alongside unrelated, non-sensitive
// settings (autonomy toggles, notification prefs, etc). A refresh token IS
// a credential (it grants ongoing account access on its own), so it's
// encrypted at rest here rather than stored as plaintext JSON.
//
// This is done as a Prisma Client Extension on the one shared `prisma`
// export every file in this backend imports, instead of touching the ~13
// gmail/calendar/fit/contacts/drive/tasks call sites individually — every
// read transparently decrypts, every write transparently encrypts, so none
// of that existing (already-working) OAuth code needs to change or even be
// aware this happens. Existing plaintext rows keep working unmodified until
// scripts/encryptGoogleTokens.js re-saves them (see that script).
const GOOGLE_TOKEN_NAMESPACES = ["gmail", "calendar", "googleFit", "googleContacts", "googleDrive", "googleTasks"];

function withEncryptedTokens(preferences) {
  if (!preferences || typeof preferences !== "object") return preferences;
  let changed = false;
  const next = { ...preferences };
  for (const ns of GOOGLE_TOKEN_NAMESPACES) {
    const section = next[ns];
    if (section && typeof section === "object" && section.tokens && typeof section.tokens === "object") {
      next[ns] = { ...section, tokens: encryptToken(section.tokens) };
      changed = true;
    }
  }
  return changed ? next : preferences;
}

function withDecryptedTokens(preferences) {
  if (!preferences || typeof preferences !== "object") return preferences;
  let changed = false;
  const next = { ...preferences };
  for (const ns of GOOGLE_TOKEN_NAMESPACES) {
    const section = next[ns];
    if (section && typeof section === "object" && isEncryptedToken(section.tokens)) {
      next[ns] = { ...section, tokens: decryptToken(section.tokens) };
      changed = true;
    }
  }
  return changed ? next : preferences;
}

function decryptResult(result) {
  if (!result) return result;
  if (Array.isArray(result)) return result.map(decryptResult);
  if (result.preferences) return { ...result, preferences: withDecryptedTokens(result.preferences) };
  return result;
}

export const prisma = basePrisma.$extends({
  name: "googleTokenEncryption",
  query: {
    user: {
      async create({ args, query }) {
        if (args.data?.preferences) args.data.preferences = withEncryptedTokens(args.data.preferences);
        return decryptResult(await query(args));
      },
      async update({ args, query }) {
        if (args.data?.preferences) args.data.preferences = withEncryptedTokens(args.data.preferences);
        return decryptResult(await query(args));
      },
      async upsert({ args, query }) {
        if (args.create?.preferences) args.create.preferences = withEncryptedTokens(args.create.preferences);
        if (args.update?.preferences) args.update.preferences = withEncryptedTokens(args.update.preferences);
        return decryptResult(await query(args));
      },
      async findUnique({ args, query }) {
        return decryptResult(await query(args));
      },
      async findFirst({ args, query }) {
        return decryptResult(await query(args));
      },
      async findMany({ args, query }) {
        return decryptResult(await query(args));
      },
    },
  },
});

// Reconnect automatically on connection loss — registered on the base
// client since $extends()'s result doesn't expose $on.
basePrisma.$on('error', async (e) => {
  logger.error(`Prisma error: ${e?.message || e}`);
  try { await basePrisma.$connect(); } catch {}
});

export async function connectDatabase() {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      await basePrisma.$connect();
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
  await basePrisma.$disconnect();
}
