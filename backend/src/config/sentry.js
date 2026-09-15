import * as Sentry from '@sentry/node'

// Sentry.init() itself runs in instrument.mjs (loaded via `node --import`,
// required so it patches Express/http before server.js's own imports
// resolve) — this file just exposes the SDK and an enabled flag to the rest
// of the app for setupExpressErrorHandler()/captureException() calls.
export const sentryEnabled = !!process.env.SENTRY_DSN

export { Sentry }
