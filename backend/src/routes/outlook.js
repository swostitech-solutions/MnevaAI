import express from 'express'
import {
  decodeOutlookState, createOutlookAuthUrl, exchangeCodeForTokens, saveOutlookTokens,
  clearOutlookConnection, getOutlookProfile, listEmails, getEmailBody, sendEmail,
  listEvents, createEvent, listDriveFiles, listTaskLists, listTasks, createTask, completeTask,
} from '../services/outlook.service.js'
import { logger } from '../config/logger.js'
import { userStore } from '../models/userStore.js'
import { ledger } from '../services/ledgerService.js'

const router = express.Router()

export async function outlookCallbackHandler(req, res) {
  try {
    const { code, state } = req.query
    if (!code) return res.status(400).send('Missing code')

    const decoded = decodeOutlookState(state)
    if (!decoded || !decoded.userId) {
      logger.warn('Outlook callback received invalid state', { state })
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174'
      return res.redirect(`${frontendUrl}/settings?outlook=error&msg=${encodeURIComponent('Invalid Outlook state')}`)
    }

    const redirectUri = process.env.OUTLOOK_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/outlook/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri)
    const user = await userStore.getById(decoded.userId)
    if (!user) return res.status(404).send('User not found')

    await saveOutlookTokens(user.id, tokens)
    let outlookEmail = user.email
    try {
      const profile = await getOutlookProfile({ ...user, preferences: { ...user.preferences, outlook: { tokens } } })
      outlookEmail = profile.mail || profile.userPrincipalName || outlookEmail
      await saveOutlookTokens(user.id, tokens, outlookEmail)
    } catch { /* fall back to user.email */ }

    logger.info('Outlook tokens saved for user', { userId: user.id })
    ledger.add({
      userId: user.id,
      tool: 'account_connected',
      input: { service: 'outlook' },
      result: { email: outlookEmail },
      status: 'completed',
    }).catch(() => {})

    const isMobile = decoded.platform === 'mobile'
    const mobileScheme = process.env.MOBILE_APP_SCHEME || 'mneva'
    if (isMobile) return res.redirect(`${mobileScheme}://settings?outlook=connected`)
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/settings?outlook=connected`)
  } catch (err) {
    const isMobile = req.query.state && (() => { try { return JSON.parse(Buffer.from(req.query.state, 'base64').toString()).platform === 'mobile' } catch { return false } })()
    const mobileScheme = process.env.MOBILE_APP_SCHEME || 'mneva'
    if (isMobile) return res.redirect(`${mobileScheme}://settings?outlook=error&msg=${encodeURIComponent(err.message)}`)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174'
    return res.redirect(`${frontendUrl}/settings?outlook=error&msg=${encodeURIComponent(err.message)}`)
  }
}

router.get('/config-status', (_req, res) => {
  const configured = !!(process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET)
  res.json({ configured })
})

router.get('/connect', async (req, res) => {
  try {
    const redirectUri = process.env.OUTLOOK_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/outlook/callback`
    const platform = req.query.platform || 'web'
    const url = createOutlookAuthUrl(req.user.id, redirectUri, platform)
    res.json({ url })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/status', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const outlook = user?.preferences?.outlook || {}
    res.json({ connected: !!outlook?.tokens?.refresh_token, email: outlook?.email || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/disconnect', async (req, res) => {
  try {
    await clearOutlookConnection(req.user.id)
    ledger.add({
      userId: req.user.id,
      tool: 'account_disconnected',
      input: { service: 'outlook' },
      result: {},
      status: 'completed',
    }).catch(() => {})
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function handleOutlookError(err, res) {
  const msg = err?.message || ''
  if (msg.includes('Outlook is not connected')) return res.status(409).json({ error: 'outlook_not_connected', message: 'Outlook is not connected.' })
  if (msg.includes('Failed to refresh')) return res.status(401).json({ error: 'outlook_token_expired', message: 'Outlook token expired. Reconnect Outlook in Settings.' })
  res.status(500).json({ error: 'outlook_error', message: msg })
}

// Mail
router.get('/emails', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const { filter = 'all', limit = 20 } = req.query
    res.json(await listEmails(user, filter, Number(limit)))
  } catch (err) { handleOutlookError(err, res) }
})

router.get('/emails/:id', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    res.json(await getEmailBody(user, req.params.id))
  } catch (err) { handleOutlookError(err, res) }
})

router.post('/emails/send', async (req, res) => {
  try {
    const { recipient, subject, body } = req.body
    if (!recipient || !subject || !body) return res.status(400).json({ error: 'recipient, subject, and body are required' })
    const user = await userStore.getById(req.user.id)
    await sendEmail(user, recipient, subject, body)
    res.json({ success: true })
  } catch (err) { handleOutlookError(err, res) }
})

// Calendar
router.get('/events', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    res.json(await listEvents(user, Number(req.query.limit) || 20))
  } catch (err) { handleOutlookError(err, res) }
})

router.post('/events', async (req, res) => {
  try {
    const { title, start, end, location, attendees } = req.body
    if (!title || !start || !end) return res.status(400).json({ error: 'title, start, and end are required' })
    const user = await userStore.getById(req.user.id)
    const event = await createEvent(user, { title, start, end, location, attendees })
    res.json({ success: true, event })
  } catch (err) { handleOutlookError(err, res) }
})

// OneDrive / Word / Excel / PowerPoint (type: all | word | excel | powerpoint)
router.get('/files', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const { type = 'all', limit = 50 } = req.query
    res.json({ files: await listDriveFiles(user, type, Number(limit)) })
  } catch (err) { handleOutlookError(err, res) }
})

// Microsoft To Do
router.get('/tasklists', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    res.json({ lists: await listTaskLists(user) })
  } catch (err) { handleOutlookError(err, res) }
})

router.get('/tasklists/:listId/tasks', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    res.json({ tasks: await listTasks(user, req.params.listId) })
  } catch (err) { handleOutlookError(err, res) }
})

router.post('/tasklists/:listId/tasks', async (req, res) => {
  try {
    const { title } = req.body
    if (!title) return res.status(400).json({ error: 'title is required' })
    const user = await userStore.getById(req.user.id)
    const task = await createTask(user, req.params.listId, title)
    res.json({ success: true, task })
  } catch (err) { handleOutlookError(err, res) }
})

router.patch('/tasklists/:listId/tasks/:taskId/complete', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    await completeTask(user, req.params.listId, req.params.taskId)
    res.json({ success: true })
  } catch (err) { handleOutlookError(err, res) }
})

export default router
