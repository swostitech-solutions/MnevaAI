import express from 'express'
import { userStore } from '../models/userStore.js'
import { logger } from '../config/logger.js'
import { ledger } from '../services/ledgerService.js'
import { createOAuthState, verifyOAuthState } from '../services/oauthState.js'

const router = express.Router()

// The only Drive call is files.list for name/type/modified time/link (see
// GET /files), so request just metadata access. Google's OAuth review asks
// for the narrowest scope that covers each feature; the old drive.readonly +
// documents/spreadsheets/presentations.readonly scopes allowed reading file
// contents that nothing here ever reads. Tokens granted before this change
// still carry the wider scopes and keep working.
const DRIVE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
]

const getRedirectUri = () =>
  process.env.GOOGLE_DRIVE_REDIRECT_URI ||
  `${process.env.PUBLIC_URL || 'http://localhost:3001'}/api/gdrive/callback`

const getFrontendUrl = () =>
  process.env.FRONTEND_URL_WEB || process.env.FRONTEND_URL || 'http://localhost:5174'

export async function gdriveCallbackHandler(req, res) {
  const mobileScheme = process.env.MOBILE_APP_SCHEME || 'mneva'
  const frontendUrl = getFrontendUrl()
  try {
    const { code, state, error } = req.query
    if (error) return res.redirect(`${frontendUrl}/settings?drive=error&msg=${encodeURIComponent(error)}`)
    if (!code) return res.redirect(`${frontendUrl}/settings?drive=error&msg=missing_code`)

    const decoded = verifyOAuthState(state)
    if (!decoded) return res.redirect(`${frontendUrl}/settings?drive=error&msg=invalid_state`)

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
    if (!user) return res.redirect(`${frontendUrl}/settings?drive=error&msg=user_not_found`)

    const prefs = user.preferences || {}
    prefs.googleDrive = { tokens, email, connectedAt: new Date().toISOString() }
    const { prisma } = await import('../config/prisma.js')
    await prisma.user.update({ where: { id: user.id }, data: { preferences: prefs } })
    logger.info(`Google Drive connected for user ${user.id}`)
    ledger.add({
      userId: user.id,
      tool: 'account_connected',
      input: { service: 'drive' },
      result: { email },
      status: 'completed',
    }).catch(() => {})

    if (decoded.platform === 'mobile') {
      const fromParam = decoded.from ? `&from=${decoded.from}` : ''
      return res.redirect(`${mobileScheme}://settings?drive=connected${fromParam}`)
    }
    return res.redirect(`${frontendUrl}/settings?drive=connected`)
  } catch (err) {
    const isMobile = (() => { try { let s = req.query.state?.replace(/-/g,'+').replace(/_/g,'/'); while(s?.length%4) s+='='; const d = JSON.parse(Buffer.from(s,'base64').toString()); return { mobile: d.platform==='mobile', from: d.from||null } } catch { return { mobile: false, from: null } } })()
    if (isMobile.mobile) {
      const fromParam = isMobile.from ? `&from=${isMobile.from}` : ''
      return res.redirect(`${mobileScheme}://settings?drive=error&msg=${encodeURIComponent(err.message)}${fromParam}`)
    }
    return res.redirect(`${getFrontendUrl()}/settings?drive=error&msg=${encodeURIComponent(err.message)}`)
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
    const from = req.query.from || null
    const state = createOAuthState({ userId: req.user.id, platform, ...(from ? { from } : {}) })
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: DRIVE_SCOPES,
      state,
    })
    res.json({ url })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/status', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const cfg = user?.preferences?.googleDrive || {}
    const connected = !!(cfg.tokens?.access_token || cfg.tokens?.refresh_token)
    res.json({ connected, email: cfg.email || null })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/disconnect', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const prefs = user?.preferences || {}
    delete prefs.googleDrive
    const { prisma } = await import('../config/prisma.js')
    await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } })
    ledger.add({
      userId: req.user.id,
      tool: 'account_disconnected',
      input: { service: 'drive' },
      result: {},
      status: 'completed',
    }).catch(() => {})
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/files', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const cfg = user?.preferences?.googleDrive
    if (!cfg?.tokens) return res.status(409).json({ error: 'drive_not_connected' })

    const { google } = await import('googleapis')
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri(),
    )
    oauth2Client.setCredentials(cfg.tokens)

    const type = req.query.type || 'drive'
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const mimeTypes = {
      docs:   'application/vnd.google-apps.document',
      sheets: 'application/vnd.google-apps.spreadsheet',
      slides: 'application/vnd.google-apps.presentation',
    }
    const q = mimeTypes[type] ? `mimeType='${mimeTypes[type]}'` : undefined
    const result = await drive.files.list({
      pageSize: 50,
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
      ...(q ? { q } : {}),
      orderBy: 'modifiedTime desc',
    })
    res.json({ files: result.data.files || [] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
