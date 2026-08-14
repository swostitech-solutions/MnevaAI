import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { body, validationResult } from 'express-validator'
import { toPublicUser, userStore } from '../models/userStore.js'
import { prisma } from '../config/prisma.js'
import { sendOtpEmail } from '../services/email.service.js'

const router = express.Router()
const SECRET = process.env.JWT_SECRET
if (!SECRET) throw new Error('JWT_SECRET environment variable is not set')

const sign = (user) => jwt.sign(
  { id: user.id, email: user.email, name: user.name, trustLevel: user.trustLevel, onboardingDone: user.onboardingDone || false },
  SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
)

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// ── Login ──────────────────────────────────────────────────────────────────────
router.post('/login',
  [body('email').isEmail(), body('password').isLength({ min: 6 })],
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ error: 'Invalid email or password format' })
    const { email, password } = req.body
    // Single DB query — select only the fields needed for login + JWT
    const user = await prisma.user.findUnique({
      where: { email: email?.toLowerCase()?.trim() },
      select: { id: true, email: true, name: true, passwordHash: true, emailVerified: true, trustLevel: true, onboardingDone: true },
    })
    // Return same error for missing user and wrong password — prevents user enumeration
    if (!user) {
      // Run a dummy compare to prevent timing attacks
      await bcrypt.compare(password, '$2a$10$dummyhashfortimingattackprevention000000000000000000000')
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    if (!user.emailVerified) return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email before signing in.' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    // Return token immediately — client navigates without waiting for anything else
    res.json({ token: sign(user), user: toPublicUser(user) })
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
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ error: errs.array()[0].msg })

    const { email, password, name, phone } = req.body
    if (await userStore.has(email)) return res.status(409).json({ error: 'Email already registered' })
    const existingPhone = await prisma.user.findUnique({ where: { phone } })
    if (existingPhone) return res.status(409).json({ error: 'Phone number already registered' })

    const hash = await bcrypt.hash(password, 10)
    const otp = generateOtp()
    const exp = new Date(Date.now() + 10 * 60 * 1000) // 10 min

    const user = await userStore.create({ email, name, phone, passwordHash: hash })
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: false, verifyToken: otp, verifyTokenExp: exp },
    })

    try {
      await sendOtpEmail(email, name, otp)
      res.status(201).json({ pendingVerification: true, email })
    } catch (err) {
      console.warn(`[DEV] OTP for ${email}: ${otp}`)
      // Always return devOtp when email can't be sent (domain not verified / no Resend key)
      res.status(201).json({ pendingVerification: true, email, devOtp: otp })
    }
  }
)

// ── Verify OTP ─────────────────────────────────────────────────────────────────
router.post('/verify-email',
  [body('email').isEmail(), body('otp').isLength({ min: 6, max: 6 })],
  async (req, res) => {
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

    res.json({ token: sign(verified), user: toPublicUser(verified) })
  }
)

// ── Resend OTP ─────────────────────────────────────────────────────────────────
router.post('/resend-otp',
  [body('email').isEmail()],
  async (req, res) => {
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
  }
)

// ── Update Phone ─────────────────────────────────────────────────────────────────
router.patch('/phone', async (req, res) => {
  const h = req.headers.authorization
  if (!h) return res.status(401).json({ error: 'No token' })
  try {
    const d = jwt.verify(h.split(' ')[1], SECRET)
    const { phone } = req.body
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ error: 'Valid 10-digit Indian mobile number required' })
    const existing = await prisma.user.findFirst({ where: { phone, NOT: { id: d.id } } })
    if (existing) return res.status(409).json({ error: 'Phone number already registered to another account' })
    const updated = await prisma.user.update({ where: { id: d.id }, data: { phone } })
    res.json(toPublicUser(updated))
  } catch { res.status(401).json({ error: 'Invalid token' }) }
})

// ── Update Avatar ─────────────────────────────────────────────────────────────────
router.patch('/avatar', async (req, res) => {
  const h = req.headers.authorization
  if (!h) return res.status(401).json({ error: 'No token' })
  try {
    const d = jwt.verify(h.split(' ')[1], SECRET)
    const { avatar } = req.body
    if (!avatar) return res.status(400).json({ error: 'avatar required' })
    const updated = await prisma.user.update({ where: { id: d.id }, data: { avatar } })
    res.json(toPublicUser(updated))
  } catch { res.status(401).json({ error: 'Invalid token' }) }
})

// ── User Search (email + phone must both match; graceful if target has no phone yet) ──
router.get('/users/search', async (req, res) => {
  const h = req.headers.authorization
  if (!h) return res.status(401).json({ error: 'No token' })
  try {
    jwt.verify(h.split(' ')[1], SECRET)
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
  } catch { res.status(401).json({ error: 'Invalid token' }) }
})

// ── Me ─────────────────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const h = req.headers.authorization
  if (!h) return res.status(401).json({ error: 'No token' })
  try {
    const d = jwt.verify(h.split(' ')[1], SECRET)
    const user = await userStore.getById(d.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(toPublicUser(user))
  } catch { res.status(401).json({ error: 'Invalid token' }) }
})

export default router
