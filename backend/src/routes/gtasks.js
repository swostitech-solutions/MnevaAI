import express from 'express'
import { userStore } from '../models/userStore.js'
import { logger } from '../config/logger.js'

const router = express.Router()

const TASKS_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/tasks',
]

const getRedirectUri = () =>
  process.env.GOOGLE_TASKS_REDIRECT_URI ||
  `${process.env.PUBLIC_URL || 'http://localhost:3001'}/api/gtasks/callback`

const getFrontendUrl = () =>
  process.env.FRONTEND_URL_WEB || process.env.FRONTEND_URL || 'http://localhost:5174'

export async function gtasksCallbackHandler(req, res) {
  const mobileScheme = process.env.MOBILE_APP_SCHEME || 'mneva'
  const frontendUrl = getFrontendUrl()
  try {
    const { code, state, error } = req.query
    if (error) return res.redirect(`${frontendUrl}/settings?tasks=error&msg=${encodeURIComponent(error)}`)
    if (!code) return res.redirect(`${frontendUrl}/settings?tasks=error&msg=missing_code`)

    let decoded
    try {
      let s = state.replace(/-/g, '+').replace(/_/g, '/')
      while (s.length % 4) s += '='
      decoded = JSON.parse(Buffer.from(s, 'base64').toString('utf8'))
    } catch { return res.redirect(`${frontendUrl}/settings?tasks=error&msg=invalid_state`) }

    const { google } = await import('googleapis')
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri(),
    )
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    let email = null
    try {
      const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2Client })
      email = (await oauth2Api.userinfo.get()).data.email
    } catch {}

    const user = await userStore.getById(decoded.userId)
    if (!user) return res.redirect(`${frontendUrl}/settings?tasks=error&msg=user_not_found`)

    const prefs = user.preferences || {}
    prefs.googleTasks = { tokens, email, connectedAt: new Date().toISOString() }
    const { prisma } = await import('../config/prisma.js')
    await prisma.user.update({ where: { id: user.id }, data: { preferences: prefs } })
    logger.info(`Google Tasks connected for user ${user.id}`)

    if (decoded.platform === 'mobile') return res.redirect(`${mobileScheme}://settings?tasks=connected`)
    return res.redirect(`${frontendUrl}/settings?tasks=connected`)
  } catch (err) {
    const isMobile = (() => { try { let s = req.query.state?.replace(/-/g,'+').replace(/_/g,'/'); while(s?.length%4) s+='='; return JSON.parse(Buffer.from(s,'base64').toString()).platform==='mobile' } catch { return false } })()
    if (isMobile) return res.redirect(`${mobileScheme}://settings?tasks=error&msg=${encodeURIComponent(err.message)}`)
    return res.redirect(`${getFrontendUrl()}/settings?tasks=error&msg=${encodeURIComponent(err.message)}`)
  }
}

router.get('/connect', async (req, res) => {
  try {
    const { google } = await import('googleapis')
    const redirectUri = getRedirectUri()
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    )
    const platform = req.query.platform || 'web'
    const rawState = JSON.stringify({ userId: req.user.id, ts: Date.now(), platform })
    const state = Buffer.from(rawState).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: TASKS_SCOPES,
      state,
    })
    res.json({ url })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/status', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const cfg = user?.preferences?.googleTasks || {}
    const connected = !!(cfg.tokens?.access_token || cfg.tokens?.refresh_token)
    res.json({ connected, email: cfg.email || null })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/disconnect', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const prefs = user?.preferences || {}
    delete prefs.googleTasks
    const { prisma } = await import('../config/prisma.js')
    await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/list', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const cfg = user?.preferences?.googleTasks
    if (!cfg?.tokens) return res.status(409).json({ error: 'tasks_not_connected' })

    const { google } = await import('googleapis')
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri(),
    )
    oauth2Client.setCredentials(cfg.tokens)
    const tasks = google.tasks({ version: 'v1', auth: oauth2Client })
    const lists = await tasks.tasklists.list({ maxResults: 10 })
    const allTasks = []
    for (const list of lists.data.items || []) {
      const result = await tasks.tasks.list({ tasklist: list.id, maxResults: 20, showCompleted: false })
      allTasks.push(...(result.data.items || []).map(t => ({ ...t, listTitle: list.title })))
    }
    res.json({ tasks: allTasks })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
