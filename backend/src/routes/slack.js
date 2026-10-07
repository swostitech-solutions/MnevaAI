import express from 'express'
import { decodeSlackState, createSlackAuthUrl, exchangeCodeForTokens, saveSlackTokens, clearSlackConnection, sendSlackMessage } from '../services/slack.service.js'
import { logger } from '../config/logger.js'
import { userStore } from '../models/userStore.js'
import { ledger } from '../services/ledgerService.js'

const router = express.Router()

export async function slackCallbackHandler(req, res) {
  try {
    const { code, state, error: slackError } = req.query
    const isMobile = (() => { try { return decodeSlackState(state)?.platform === 'mobile' } catch { return false } })()
    const mobileScheme = process.env.MOBILE_APP_SCHEME || 'mneva'
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174'
    const redirect = (path) => res.redirect(isMobile ? `${mobileScheme}://${path}` : `${frontendUrl}/${path}`)

    if (slackError) return redirect(`settings?slack=error&msg=${encodeURIComponent(slackError)}`)
    if (!code) return res.status(400).send('Missing code')

    const decoded = decodeSlackState(state)
    if (!decoded || !decoded.userId) {
      logger.warn('Slack callback received invalid state', { state })
      return redirect(`settings?slack=error&msg=${encodeURIComponent('Invalid Slack state')}`)
    }

    const redirectUri = process.env.SLACK_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/slack/callback`
    const oauthResponse = await exchangeCodeForTokens(code, redirectUri)
    const user = await userStore.getById(decoded.userId)
    if (!user) return res.status(404).send('User not found')

    await saveSlackTokens(user.id, oauthResponse)
    logger.info('Slack tokens saved for user', { userId: user.id, teamName: oauthResponse.team?.name })
    ledger.add({
      userId: user.id,
      tool: 'account_connected',
      input: { service: 'slack' },
      result: { team: oauthResponse.team?.name || null },
      status: 'completed',
    }).catch(() => {})

    return redirect('settings?slack=connected')
  } catch (err) {
    const isMobile = (() => { try { return decodeSlackState(req.query.state)?.platform === 'mobile' } catch { return false } })()
    const mobileScheme = process.env.MOBILE_APP_SCHEME || 'mneva'
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174'
    if (isMobile) return res.redirect(`${mobileScheme}://settings?slack=error&msg=${encodeURIComponent(err.message)}`)
    return res.redirect(`${frontendUrl}/settings?slack=error&msg=${encodeURIComponent(err.message)}`)
  }
}

router.get('/config-status', (_req, res) => {
  const configured = !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET)
  res.json({ configured })
})

router.get('/connect', async (req, res) => {
  try {
    const redirectUri = process.env.SLACK_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/slack/callback`
    const platform = req.query.platform || 'web'
    const url = createSlackAuthUrl(req.user.id, redirectUri, platform)
    res.json({ url })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/status', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const slack = user?.preferences?.slack || {}
    const connected = !slack.disconnected && !!slack.botToken && !!slack.slackUserId
    res.json({ connected, team: slack.teamName || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/disconnect', async (req, res) => {
  try {
    await clearSlackConnection(req.user.id)
    ledger.add({
      userId: req.user.id,
      tool: 'account_disconnected',
      input: { service: 'slack' },
      result: {},
      status: 'completed',
    }).catch(() => {})
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Manual-send endpoint — same "prove it actually works" role the Meet
// end-call endpoint served earlier: lets Settings offer a "Send test
// message" action once connected, and is itself the one real send path
// notifications can call into.
router.post('/send-test', async (req, res) => {
  try {
    const result = await sendSlackMessage(req.user.id, req.body?.text || '👋 Mneva AI is connected to your Slack!')
    res.json({ success: true, result })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
})

export default router
