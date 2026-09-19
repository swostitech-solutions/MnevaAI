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
export const authMiddleware = async (req, res, next) => {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization required' })
  try {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET environment variable is not set')
    const decoded = jwt.verify(h.split(' ')[1], secret)
    const userId = decoded.id || decoded.userId

    const current = await prisma.user.findUnique({ where: { id: userId }, select: { currentSessionId: true } })
    if (!current) return res.status(401).json({ error: 'Invalid or expired token' })
    if (decoded.sessionId !== current.currentSessionId) {
      return res.status(401).json({
        error: 'session_superseded',
        message: 'Your account was signed in on another device.',
      })
    }

    req.user = { ...decoded, id: userId }
    next()
  } catch { res.status(401).json({ error: 'Invalid or expired token' }) }
}
