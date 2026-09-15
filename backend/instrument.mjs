// Loaded via `node --import ./instrument.mjs` — Sentry's Node SDK needs to
// patch modules (Express, http, pg, etc.) before they're first imported to
// auto-instrument them, and with ESM every static `import` in server.js
// resolves before any of its own top-level code runs, so calling
// Sentry.init() from inside server.js itself is always too late. This file
// is the fix: --import guarantees it runs before server.js is loaded at all.
import 'dotenv/config'
import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Trace ~10% of requests in production — enough to catch systemic
    // slowness without paying to trace every request on the free tier.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  })
}
