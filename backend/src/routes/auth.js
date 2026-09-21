import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { body, validationResult } from 'express-validator'
import { toPublicUser, userStore } from '../models/userStore.js'
import { prisma } from '../config/prisma.js'
import { sendOtpEmail, sendPasswordResetEmail } from '../services/email.service.js'
import { qdrantService } from '../services/qdrant.service.js'
import { getRedisClient } from '../config/redis.js'
import { deletePersistedFile } from '../controllers/document.controller.js'
import { deleteVaultFileBlob } from '../controllers/vault.controller.js'
import { logger } from '../config/logger.js'
import { authMiddleware, setSessionCache } from '../middleware/auth.js'

const router = express.Router()
const SECRET = process.env.JWT_SECRET
if (!SECRET) throw new Error('JWT_SECRET environment variable is not set')

const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000 // 60 days

const sign = (user, sessionId) => jwt.sign(
  { id: user.id, email: user.email, name: user.name, trustLevel: user.trustLevel, onboardingDone: user.onboardingDone || false, sessionId },
  SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
)

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

// Single-device-login enforcement. Called only on a genuine fresh login (NOT
// on /refresh, which continues an existing session) — generates a new
// session id, stores it as this user's current one, and deletes every
// existing refresh token for them. Any other device's access token stops
// matching the very next time authMiddleware checks it, and its refresh
// token is simply gone, so it can't silently renew past this either.
async function startNewSession(userId) {
  const sessionId = crypto.randomUUID()
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { currentSessionId: sessionId } }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ])
  // Keeps authMiddleware's short-lived session cache correct the instant
  // this changes, instead of it possibly serving a stale value for up to
  // its TTL — both directions matter: the device that just logged in must
  // not get rejected, and a now-superseded device must not keep working.
  setSessionCache(userId, sessionId)
  return sessionId
}

// The access JWT above still expires after 7 days — that's unchanged, and
// deliberately so (shortening it now would turn every normal API call into a
// refresh candidate, a much bigger behavior change than what was asked for).
// This refresh token is the renewal path for *after* that: a long-lived,
// opaque, random value stored only as a hash (a DB read alone can't be
// replayed as the token), rotated on every use so an old one stops working
// the moment it's exchanged.
async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex')
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) },
  })
  return token
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// ── Login ──────────────────────────────────────────────────────────────────────
router.post('/login',
  [body('email').isEmail(), body('password').isLength({ min: 6 })],
  async (req, res) => {
    try {
      const errs = validationResult(req)
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Invalid email or password format' })
      const { email, password } = req.body
      const user = await prisma.user.findUnique({
        where: { email: email?.toLowerCase()?.trim() },
        select: { id: true, email: true, name: true, passwordHash: true, emailVerified: true, trustLevel: true, onboardingDone: true },
      })
      if (!user) {
        await bcrypt.compare(password, '$2a$10$dummyhashfortimingattackprevention000000000000000000000')
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      if (!user.emailVerified) return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email before signing in.' })
      const ok = await bcrypt.compare(password, user.passwordHash)
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
      const sessionId = await startNewSession(user.id)
      res.json({ token: sign(user, sessionId), refreshToken: await issueRefreshToken(user.id), user: toPublicUser(user) })
    } catch (err) {
      const isDbDown = err?.message?.includes("Can't reach database") || err?.code === 'P1001' || err?.code === 'P1002'
      if (isDbDown) return res.status(503).json({ error: 'service_unavailable', message: 'Database is temporarily unavailable. Please try again in a moment.' })
      res.status(500).json({ error: 'Login failed. Please try again.' })
    }
  }
)

// ── Register — creates unverified account, sends OTP ──────────────────────────
router.post('/register',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit Indian mobile number is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('confirmPassword').custom((v, { req }) => {
      if (v !== req.body.password) throw new Error('Passwords do not match')
      return true
    }),
    body('agreedToTerms').equals('true').withMessage('You must agree to the Terms of Service'),
  ],
  async (req, res) => {
    try {
      const errs = validationResult(req)
      if (!errs.isEmpty()) return res.status(400).json({ error: errs.array()[0].msg })

      const { email, password, name, phone } = req.body
      if (await userStore.has(email)) return res.status(409).json({ error: 'Email already registered' })
      const existingPhone = await prisma.user.findUnique({ where: { phone } })
      if (existingPhone) return res.status(409).json({ error: 'Phone number already registered' })

      const hash = await bcrypt.hash(password, 10)
      const otp = generateOtp()
      const exp = new Date(Date.now() + 10 * 60 * 1000)

      const user = await userStore.create({ email, name, phone, passwordHash: hash })
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: false, verifyToken: otp, verifyTokenExp: exp },
      })

      try {
        await sendOtpEmail(email, name, otp)
        res.status(201).json({ pendingVerification: true, email })
      } catch {
        console.warn(`[DEV] OTP for ${email}: ${otp}`)
        res.status(201).json({ pendingVerification: true, email, devOtp: otp })
      }
    } catch (err) {
      const isDbDown = err?.message?.includes("Can't reach database") || err?.code === 'P1001' || err?.code === 'P1002'
      if (isDbDown) return res.status(503).json({ error: 'service_unavailable', message: 'Database is temporarily unavailable. Please try again in a moment.' })
      res.status(500).json({ error: err.message || 'Registration failed. Please try again.' })
    }
  }
)

// ── Verify OTP ─────────────────────────────────────────────────────────────────
router.post('/verify-email',
  [body('email').isEmail(), body('otp').isLength({ min: 6, max: 6 })],
  async (req, res) => {
    try {
      const errs = validationResult(req)
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Invalid request' })

      const { email, otp } = req.body
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) return res.status(404).json({ error: 'User not found' })
      if (user.emailVerified) return res.status(400).json({ error: 'Email already verified' })
      if (!user.verifyToken || user.verifyToken !== otp) return res.status(400).json({ error: 'Invalid verification code' })
      if (user.verifyTokenExp && new Date() > user.verifyTokenExp) return res.status(400).json({ error: 'Code expired. Request a new one.' })

      const verified = await prisma.user.update({
        where: { email },
        data: { emailVerified: true, verifyToken: null, verifyTokenExp: null },
      })
      const sessionId = await startNewSession(verified.id)
      res.json({ token: sign(verified, sessionId), refreshToken: await issueRefreshToken(verified.id), user: toPublicUser(verified) })
    } catch (err) {
      const isDbDown = err?.message?.includes("Can't reach database") || err?.code === 'P1001' || err?.code === 'P1002'
      if (isDbDown) return res.status(503).json({ error: 'service_unavailable', message: 'Database is temporarily unavailable. Please try again in a moment.' })
      res.status(500).json({ error: 'Verification failed. Please try again.' })
    }
  }
)

// ── Resend OTP ─────────────────────────────────────────────────────────────────
router.post('/resend-otp',
  [body('email').isEmail()],
  async (req, res) => {
    try {
      const errs = validationResult(req)
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Valid email required' })

      const { email } = req.body
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) return res.status(404).json({ error: 'User not found' })
      if (user.emailVerified) return res.status(400).json({ error: 'Email already verified' })

      const otp = generateOtp()
      const exp = new Date(Date.now() + 10 * 60 * 1000)
      await prisma.user.update({ where: { email }, data: { verifyToken: otp, verifyTokenExp: exp } })

      try {
        await sendOtpEmail(email, user.name, otp)
        res.json({ sent: true })
      } catch {
        console.warn(`[DEV] Resent OTP for ${email}: ${otp}`)
        res.json({ sent: true, devOtp: otp })
      }
    } catch (err) {
      const isDbDown = err?.message?.includes("Can't reach database") || err?.code === 'P1001' || err?.code === 'P1002'
      if (isDbDown) return res.status(503).json({ error: 'service_unavailable', message: 'Database is temporarily unavailable. Please try again in a moment.' })
      res.status(500).json({ error: 'Failed to resend OTP. Please try again.' })
    }
  }
)

// ── Forgot Password ───────────────────────────────────────────────────────────
// Deliberately returns the same { sent: true } response whether or not this
// email is registered — a forgot-password endpoint is a well-known target
// for account enumeration (probing emails one by one to learn which are
// registered), and leaking that here would be worse than on /register's
// "already registered" check, which the user themself triggered on purpose.
router.post('/forgot-password',
  [body('email').isEmail()],
  async (req, res) => {
    try {
      const errs = validationResult(req)
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Valid email required' })

      const email = req.body.email.toLowerCase().trim()
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) return res.json({ sent: true })

      const otp = generateOtp()
      const exp = new Date(Date.now() + 10 * 60 * 1000)
      await prisma.user.update({ where: { id: user.id }, data: { resetToken: otp, resetTokenExp: exp } })

      try {
        await sendPasswordResetEmail(email, user.name, otp)
        res.json({ sent: true })
      } catch {
        console.warn(`[DEV] Password reset OTP for ${email}: ${otp}`)
        res.json({ sent: true, devOtp: otp })
      }
    } catch (err) {
      const isDbDown = err?.message?.includes("Can't reach database") || err?.code === 'P1001' || err?.code === 'P1002'
      if (isDbDown) return res.status(503).json({ error: 'service_unavailable', message: 'Database is temporarily unavailable. Please try again in a moment.' })
      res.status(500).json({ error: 'Failed to send reset code. Please try again.' })
    }
  }
)

// ── Reset Password ────────────────────────────────────────────────────────────
// One generic "Invalid or expired code" for a wrong OTP, an OTP for an email
// that never requested one, and a nonexistent email alike — never reveals
// which case it was, for the same account-enumeration reason as above.
// Rotates the session on success (see startNewSession) exactly like Change
// Password does, and for the same reason, only more so — a password reset
// is very often triggered by "someone else might have my password", so
// every existing session, on any device, is invalidated. The device that
// completed the reset gets a fresh token pair back so it's logged straight
// in, no separate sign-in step needed.
router.post('/reset-password',
  [body('email').isEmail(), body('otp').isLength({ min: 6, max: 6 })],
  async (req, res) => {
    try {
      const errs = validationResult(req)
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Invalid request' })

      const { otp, newPassword } = req.body
      const email = req.body.email.toLowerCase().trim()
      if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' })

      const user = await prisma.user.findUnique({ where: { email } })
      if (!user || !user.resetToken || user.resetToken !== otp) {
        return res.status(400).json({ error: 'Invalid or expired code' })
      }
      if (user.resetTokenExp && new Date() > user.resetTokenExp) {
        return res.status(400).json({ error: 'Code expired. Request a new one.' })
      }

      const newHash = await bcrypt.hash(newPassword, 10)
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash, resetToken: null, resetTokenExp: null },
      })

      const sessionId = await startNewSession(updated.id)
      res.json({
        token: sign(updated, sessionId),
        refreshToken: await issueRefreshToken(updated.id),
        user: toPublicUser(updated),
      })
    } catch (err) {
      const isDbDown = err?.message?.includes("Can't reach database") || err?.code === 'P1001' || err?.code === 'P1002'
      if (isDbDown) return res.status(503).json({ error: 'service_unavailable', message: 'Database is temporarily unavailable. Please try again in a moment.' })
      res.status(500).json({ error: 'Could not reset password. Please try again.' })
    }
  }
)

// ── Update Phone ─────────────────────────────────────────────────────────────────
// These five routes used to each do their own inline jwt.verify, bypassing
// the single-device-session check that every other authenticated route gets
// via authMiddleware — a device kicked out by a login elsewhere could still
// successfully call these. Routed through the same middleware now, so the
// check applies uniformly everywhere, not just on routes mounted with it.
router.patch('/phone', authMiddleware, async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ error: 'Valid 10-digit Indian mobile number required' })
    const existing = await prisma.user.findFirst({ where: { phone, NOT: { id: req.user.id } } })
    if (existing) return res.status(409).json({ error: 'Phone number already registered to another account' })
    const updated = await prisma.user.update({ where: { id: req.user.id }, data: { phone } })
    res.json(toPublicUser(updated))
  } catch { res.status(500).json({ error: 'Could not update phone number.' }) }
})

// ── Update Avatar ─────────────────────────────────────────────────────────────────
router.patch('/avatar', authMiddleware, async (req, res) => {
  try {
    const { avatar } = req.body
    if (!avatar) return res.status(400).json({ error: 'avatar required' })
    const updated = await prisma.user.update({ where: { id: req.user.id }, data: { avatar } })
    res.json(toPublicUser(updated))
  } catch { res.status(500).json({ error: 'Could not update avatar.' }) }
})

// ── Change Password ────────────────────────────────────────────────────────────
// Requires the CURRENT password — proves this is genuinely the account
// owner, not just whoever's holding a still-valid session on a shared or
// lost device — and rotates the session afterward via the same
// single-device mechanism a fresh login uses (startNewSession above). Any
// other copy of the old session (a lost/stolen device, an old login
// somewhere) is invalidated the moment the password changes, which is
// exactly what a password change is supposed to guarantee. The device
// making this call gets a fresh token pair back so it isn't logged out by
// its own request.
router.patch('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' })
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' })

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return res.status(404).json({ error: 'User not found' })

    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' })

    const sameAsOld = await bcrypt.compare(newPassword, user.passwordHash)
    if (sameAsOld) return res.status(400).json({ error: 'New password must be different from your current password' })

    const newHash = await bcrypt.hash(newPassword, 10)
    const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } })

    const sessionId = await startNewSession(user.id)
    res.json({
      success: true,
      token: sign(updated, sessionId),
      refreshToken: await issueRefreshToken(user.id),
    })
  } catch (err) {
    res.status(500).json({ error: 'Could not change password. Please try again.' })
  }
})

// ── User Search (email + phone must both match; graceful if target has no phone yet) ──
router.get('/users/search', authMiddleware, async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase()
    const phone = String(req.query.phone || '').trim()
    if (!email || !phone) return res.json({ user: null })

    // First find by email
    const userByEmail = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, name: true, email: true, avatar: true, phone: true },
    })

    if (!userByEmail) return res.json({ user: null })

    // If user has a phone set, it must match exactly
    if (userByEmail.phone && userByEmail.phone !== phone) return res.json({ user: null })

    // If user has no phone yet, still return them so they can be found
    // but flag it so the app can prompt them to add their phone
    const { phone: _p, ...publicUser } = userByEmail
    res.json({ user: publicUser, targetHasNoPhone: !userByEmail.phone })
  } catch { res.status(500).json({ error: 'Search failed.' }) }
})

// ── Me ─────────────────────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(toPublicUser(user))
  } catch { res.status(500).json({ error: 'Could not load account.' }) }
})

// ── Refresh ────────────────────────────────────────────────────────────────────
// Exchanges a still-valid refresh token for a new access token, so a session
// older than the 7-day access JWT doesn't dead-end into a forced manual
// sign-in — the client calls this transparently on a 401 (see
// mneva/src/api/client.js). Rotated on every use: the presented token is
// deleted and a fresh one issued, so it can't be replayed after this.
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' })

    const tokenHash = hashToken(refreshToken)
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } })
    if (!stored) return res.status(401).json({ error: 'Invalid refresh token' })
    if (stored.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {})
      return res.status(401).json({ error: 'Refresh token expired' })
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } })
    if (!user) {
      await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {})
      return res.status(404).json({ error: 'User not found' })
    }
    // A refresh token predating single-device-login enforcement (no session
    // id ever established for this user) must not silently mint a valid
    // session of its own — that would let an old device keep working
    // forever without ever going through /login, the only place that
    // actually establishes a session id. Force a real login instead.
    if (!user.currentSessionId) {
      await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {})
      return res.status(401).json({ error: 'Invalid refresh token' })
    }

    // Rotate: the old token is consumed here and can't be exchanged again.
    // Re-signed with the user's CURRENT session id (unchanged) — a refresh
    // continues the same session, it doesn't start a new one, so it must
    // never invalidate this same device's own access token.
    await prisma.refreshToken.delete({ where: { id: stored.id } })
    res.json({ token: sign(user, user.currentSessionId), refreshToken: await issueRefreshToken(user.id) })
  } catch (err) {
    res.status(500).json({ error: 'Could not refresh session. Please sign in again.' })
  }
})

// ── Logout ─────────────────────────────────────────────────────────────────────
// Best-effort server-side revocation of the refresh token so a signed-out
// device can't silently renew its session again later. Never fails hard —
// logging out locally must always succeed even if this call doesn't.
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(refreshToken) } })
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Delete account ───────────────────────────────────────────────────────────
// Every userId foreign key in the schema is declared with onDelete: Cascade,
// so prisma.user.delete alone removes every row referencing this account
// (tasks, family data, finance records, notifications, the signed ledger,
// etc). What cascade can't reach — files on disk/S3 and vector embeddings in
// Qdrant, since those live outside Postgres — is cleaned up explicitly here
// first, using the same helpers already used for single-document deletion.
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ error: 'User not found' })

    const documents = await prisma.document.findMany({
      where: { userId },
      select: { filePath: true },
    })
    for (const doc of documents) {
      if (doc.filePath) await deletePersistedFile(doc.filePath)
    }

    const vaultFiles = await prisma.vaultFile.findMany({
      where: { userId },
      select: { filePath: true },
    })
    for (const file of vaultFiles) {
      if (file.filePath) await deleteVaultFileBlob(file.filePath)
    }

    await qdrantService.deleteByFilter('mneva_memory', {
      must: [{ key: 'userId', match: { value: userId } }],
    }).catch(() => {})

    const redis = getRedisClient()
    if (redis) {
      await redis.del(`user:${userId}:memory:recent`).catch(() => {})
      await redis.del(`session:${userId}`).catch(() => {})
    }

    await prisma.user.delete({ where: { id: userId } })

    logger.info(`Account deleted: ${userId}`)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
