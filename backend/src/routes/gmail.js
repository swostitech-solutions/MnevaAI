import express from 'express'
import { decodeGmailState, createGmailAuthUrl, exchangeCodeForTokens, saveGmailTokens, clearGmailConnection, listEmails, getEmailBody, sendEmail } from '../services/gmail.service.js'
import { saveCalendarTokens, clearCalendarConnection } from '../services/calendar.service.js'
import { logger } from '../config/logger.js'
import { userStore } from '../models/userStore.js'

const router = express.Router()

export async function gmailCallbackHandler(req, res) {
  try {
    const { code, state } = req.query
    if (!code) return res.status(400).send('Missing code')

    const decoded = decodeGmailState(state)
    if (!decoded || !decoded.userId) {
      logger.warn('Gmail callback received invalid state', { state })
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174'
      return res.redirect(`${frontendUrl}/settings?gmail=error&msg=${encodeURIComponent('Invalid Gmail state')}`)
    }

    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/gmail/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri)
    const user = await userStore.getById(decoded.userId)
    if (!user) return res.status(404).send('User not found')

    // fetch the actual Gmail address that just authorized
    let gmailEmail = user.email
    try {
      const { google } = await import('googleapis')
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri,
      )
      oauth2Client.setCredentials(tokens)
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
      const info = await oauth2.userinfo.get()
      gmailEmail = info.data.email || gmailEmail
    } catch { /* fallback to user.email */ }

    await saveGmailTokens(user.id, tokens, gmailEmail)
    await saveCalendarTokens(user.id, tokens, gmailEmail)
    logger.info('Combined Gmail+Calendar tokens saved for user', { userId: user.id })
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/settings?gmail=connected`)
  } catch (err) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174'
    return res.redirect(`${frontendUrl}/settings?gmail=error&msg=${encodeURIComponent(err.message)}`)
  }
}

router.get('/config-status', (_req, res) => {
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET &&
    !process.env.GOOGLE_CLIENT_ID.includes('replace') && !process.env.GOOGLE_CLIENT_SECRET.includes('replace'))
  res.json({ configured })
})

router.get('/connect', async (req, res) => {
  try {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/gmail/callback`
    const url = createGmailAuthUrl(req.user.id, redirectUri)
    res.json({ url })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/status', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const gmail = user?.preferences?.gmail || {}
    res.json({ connected: !!gmail?.tokens?.refresh_token, email: gmail?.email || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/disconnect', async (req, res) => {
  try {
    await clearGmailConnection(req.user.id)
    await clearCalendarConnection(req.user.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/emails', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const { filter = 'all', limit = 20 } = req.query
    const result = await listEmails(user, filter, Number(limit))
    res.json(result)
  } catch (err) {
    const msg = err?.message || ''
    if (msg.includes('Gmail is not connected')) return res.status(409).json({ error: 'gmail_not_connected', message: 'Gmail is not connected.' })
    if (msg.includes('Gmail API has not been used') || msg.includes('is disabled')) return res.status(503).json({ error: 'gmail_api_disabled', message: 'Gmail API is disabled. Enable it at https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=769657045922' })
    if (msg.includes('invalid_grant')) return res.status(401).json({ error: 'gmail_token_expired', message: 'Gmail token expired. Reconnect Gmail in Settings.' })
    res.status(500).json({ error: 'gmail_error', message: msg })
  }
})

router.get('/emails/:id/draft', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const email = await getEmailBody(user, req.params.id)
    res.json({ email, draft: '' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/emails/:id/send', async (req, res) => {
  try {
    const { recipient, subject, draft } = req.body
    if (!recipient || !subject || !draft) return res.status(400).json({ error: 'recipient, subject, and draft are required' })

    const user = await userStore.getById(req.user.id)
    const result = await sendEmail(user, recipient, subject, draft)
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
