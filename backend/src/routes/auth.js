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
    const user = await userStore.get(email)
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    if (!user.emailVerified) return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email before signing in.' })
    res.json({ token: sign(user), user: toPublicUser(user) })
  }
)

// ── Register — creates unverified account, sends OTP ──────────────────────────
router.post('/register',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
    body('email').isEmail().withMessage('Valid email is required'),
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

    const { email, password, name } = req.body
    if (await userStore.has(email)) return res.status(409).json({ error: 'Email already registered' })

    const hash = await bcrypt.hash(password, 12)
    const otp = generateOtp()
    const exp = new Date(Date.now() + 10 * 60 * 1000) // 10 min

    const user = await userStore.create({ email, name, passwordHash: hash })
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
