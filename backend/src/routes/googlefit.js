import express from 'express'
import { createFitAuthUrl, exchangeFitCode, saveFitTokens, clearFitTokens, getHealthData } from '../services/googleFit.service.js'
import { userStore } from '../models/userStore.js'
import { logger } from '../config/logger.js'

const router = express.Router()

const REDIRECT_URI = () =>
  process.env.GOOGLE_FIT_REDIRECT_URI ||
  `${process.env.PUBLIC_URL || 'http://localhost:3001'}/api/googlefit/callback`

// Public callback — no auth middleware
export async function googleFitCallbackHandler(req, res) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174'
  try {
    const { code, state, error } = req.query
    if (error) return res.redirect(`${frontendUrl}/health?fit=error&msg=${encodeURIComponent(error)}`)
    if (!code) return res.redirect(`${frontendUrl}/health?fit=error&msg=missing_code`)

    let decoded = null
    try {
      let s = state.replace(/-/g, '+').replace(/_/g, '/')
      while (s.length % 4) s += '='
      decoded = JSON.parse(Buffer.from(s, 'base64').toString('utf8'))
    } catch { return res.redirect(`${frontendUrl}/health?fit=error&msg=invalid_state`) }

    const tokens = await exchangeFitCode(code, REDIRECT_URI())
    const user = await userStore.getById(decoded.userId)
    if (!user) return res.redirect(`${frontendUrl}/health?fit=error&msg=user_not_found`)

    // get email from token
    let email = user.email
    try {
      const { google } = await import('googleapis')
      const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, REDIRECT_URI())
      oauth2Client.setCredentials(tokens)
      const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2Client })
      const info = await oauth2Api.userinfo.get()
      email = info.data.email || email
    } catch { /* fallback */ }

    await saveFitTokens(user.id, tokens, email)
    logger.info(`Google Fit connected for user ${user.id}`)
    // Support mobile deep link: if state contains platform=mobile, redirect to app scheme
    const isMobile = decoded.platform === 'mobile'
    const mobileScheme = process.env.MOBILE_APP_SCHEME || 'mneva'
    if (isMobile) {
      return res.redirect(`${mobileScheme}://googlefit?fit=connected`)
    }
    return res.redirect(`${frontendUrl}/health?fit=connected`)
  } catch (err) {
    logger.error('Google Fit callback error:', err.message)
    const { state } = req.query
    let isMobile = false
    try {
      let s = state.replace(/-/g, '+').replace(/_/g, '/')
      while (s.length % 4) s += '='
      isMobile = JSON.parse(Buffer.from(s, 'base64').toString('utf8')).platform === 'mobile'
    } catch {}
    const mobileScheme = process.env.MOBILE_APP_SCHEME || 'mneva'
    if (isMobile) return res.redirect(`${mobileScheme}://googlefit?fit=error&msg=${encodeURIComponent(err.message)}`)
    return res.redirect(`${frontendUrl}/health?fit=error&msg=${encodeURIComponent(err.message)}`)
  }
}

// GET /api/googlefit/connect
router.get('/connect', async (req, res) => {
  try {
    const platform = req.query.platform || 'web'
    const url = createFitAuthUrl(req.user.id, REDIRECT_URI(), platform)
    res.json({ url })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/googlefit/status
router.get('/status', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const fit = user?.preferences?.googleFit || {}
    const connected = !fit.disconnected && !!(fit.tokens?.refresh_token || fit.tokens?.access_token)
    res.json({ connected, email: fit.email || null, connectedAt: fit.connectedAt || null })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/googlefit/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    await clearFitTokens(req.user.id)
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/googlefit/debug-height  — raw height data from Fit API
router.get('/debug-height', async (req, res) => {
  try {
    const { getFitAuthClientForUser, fetchHeightRaw } = await import('../services/googleFit.service.js')
    const user = await userStore.getById(req.user.id)
    const auth = await getFitAuthClientForUser(user)
    if (!auth) return res.status(400).json({ error: 'no_auth' })
    const now = Date.now()
    // try multiple time windows
    const results = {}
    for (const [label, startMs] of [
      ['1yr',  now - 365 * 86400000],
      ['5yr',  now - 5 * 365 * 86400000],
      ['10yr', now - 10 * 365 * 86400000],
    ]) {
      try {
        results[label] = await fetchHeightRaw(auth, startMs, now)
      } catch (e) { results[label] = { error: e.message } }
    }
    res.json(results)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/googlefit/data  — real health metrics
router.get('/data', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const data = await getHealthData(user)
    res.json(data)
  } catch (err) {
    if (err.message === 'no_health_data') return res.status(200).json({ period: 'today', source: null, heartRate: null, steps: { value: 0, goal: 10000, pct: 0 }, sleep: null, calories: null, weight: null, weeklySteps: [] })
    if (err.message.includes('not connected')) return res.status(409).json({ error: 'fit_not_connected', message: 'Google Fit not connected. Go to Health page to connect.' })
    res.status(500).json({ error: err.message })
  }
})

export default router
