import jwt from 'jsonwebtoken'
import { prisma } from '../config/prisma.js'

// Single-device-login enforcement: a fresh /login (or the auto-login after
// signup verification) regenerates the user's `currentSessionId` and wipes
// every refresh token they had — but any access token issued to an OLDER
// device is still cryptographically valid and would keep working right up
// to its own 7-day expiry without this check. Comparing the token's
// `sessionId` claim against the DB's current value on every request is what
// actually makes logging in elsewhere immediately invalidate every other
// device, not just eventually once its token expires.
//
// That DB lookup was landing on EVERY single authenticated request across
// the whole app — a screen like Home fires ~11 of those in parallel on one
// mount, so it was 11 extra Postgres round-trips per screen open, on every
// screen, which is exactly the kind of universal per-request tax that makes
// a whole app feel slow rather than any one page. This short in-memory
// cache removes that cost for the overwhelmingly common case (nothing
// changed since the last request a few seconds ago) while keeping the
// security property intact: `setSessionCache` below is called the instant
// a real session change happens (login, password change/reset), so a
// kicked-out device is rejected immediately, not "eventually once the
// cache expires" — the TTL only matters for the case where nothing changed.
const SESSION_CACHE_TTL_MS = 10000
const _sessionCache = new Map()

// Called from routes/auth.js's startNewSession — the moment a session
// actually changes, so a newly-superseded device is rejected on its very
// next request instead of waiting out the cache TTL, and the device that
// JUST logged in doesn't have to wait either.
export function setSessionCache(userId, sessionId) {
  _sessionCache.set(userId, { exists: true, sessionId, at: Date.now() })
}

async function getCurrentSession(userId) {
  const cached = _sessionCache.get(userId)
  if (cached && Date.now() - cached.at < SESSION_CACHE_TTL_MS) return cached
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { currentSessionId: true } })
  const fresh = { exists: !!user, sessionId: user?.currentSessionId ?? null, at: Date.now() }
  _sessionCache.set(userId, fresh)
  return fresh
}

export const authMiddleware = async (req, res, next) => {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization required' })
  try {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET environment variable is not set')
    const decoded = jwt.verify(h.split(' ')[1], secret)
    const userId = decoded.id || decoded.userId

    const current = await getCurrentSession(userId)
    if (!current.exists) return res.status(401).json({ error: 'Invalid or expired token' })
    if (decoded.sessionId !== current.sessionId) {
      return res.status(401).json({
        error: 'session_superseded',
        message: 'Your account was signed in on another device.',
      })
    }

    req.user = { ...decoded, id: userId }
    next()
  } catch { res.status(401).json({ error: 'Invalid or expired token' }) }
}
