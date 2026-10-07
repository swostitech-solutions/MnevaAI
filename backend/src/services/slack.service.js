import { prisma } from '../config/prisma.js'
import { createOAuthState, verifyOAuthState } from './oauthState.js'

// Bot Token Scopes only (no User Token Scopes) — this app was registered
// for a single workspace (Swostitech Solutions), not for distribution
// across arbitrary workspaces, so there's one shared bot token for the
// whole app rather than a separate OAuth grant per Mneva user the way
// Gmail/Calendar work. Each user still goes through this same OAuth
// "Allow" screen individually though, and Slack's oauth.v2.access response
// includes an `authed_user.id` for whoever just clicked Allow — that's how
// one specific Mneva user's own Slack user id gets identified and linked,
// without needing any User Token Scopes.
const SCOPES = ['channels:read', 'chat:write', 'im:write', 'users:read']

function requireConfig() {
  if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
    throw new Error('Slack OAuth is not configured. Add SLACK_CLIENT_ID and SLACK_CLIENT_SECRET to backend/.env')
  }
}

export function createSlackAuthUrl(userId, redirectUri, platform = 'web') {
  requireConfig()
  const state = createOAuthState({ userId, platform })
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID,
    scope: SCOPES.join(','),
    redirect_uri: redirectUri,
    state,
  })
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`
}

export function decodeSlackState(state) {
  return verifyOAuthState(state)
}

// Slack's token endpoint returns { ok, access_token (bot token, xoxb-...),
// authed_user: { id }, team: { id, name }, ... } — unlike Google, errors
// come back as a 200 with ok:false, not an HTTP error status, so that has
// to be checked explicitly.
export async function exchangeCodeForTokens(code, redirectUri) {
  requireConfig()
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID,
    client_secret: process.env.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  })
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack OAuth failed: ${data.error || 'unknown_error'}`)
  return data
}

export async function saveSlackTokens(userId, oauthResponse) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const prefs = user?.preferences || {}
  prefs.slack = {
    botToken: oauthResponse.access_token,
    slackUserId: oauthResponse.authed_user?.id || null,
    teamId: oauthResponse.team?.id || null,
    teamName: oauthResponse.team?.name || null,
    disconnected: false,
  }
  await prisma.user.update({ where: { id: userId }, data: { preferences: prefs } })
}

export async function clearSlackConnection(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const prefs = user?.preferences || {}
  prefs.slack = { ...prefs.slack, botToken: null, slackUserId: null, disconnected: true }
  await prisma.user.update({ where: { id: userId }, data: { preferences: prefs } })
}

// Sends a plain text message to the Slack user this account is linked to,
// as a DM. Opens (or reuses) the DM channel first — conversations.open is
// idempotent, cheap to call every time rather than caching the channel id.
export async function sendSlackMessage(userId, text) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const slack = user?.preferences?.slack
  if (!slack?.botToken || slack.disconnected) throw new Error('Slack is not connected.')
  if (!slack.slackUserId) throw new Error('No linked Slack user — reconnect Slack in Settings.')

  const openRes = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${slack.botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: slack.slackUserId }),
  })
  const openData = await openRes.json()
  if (!openData.ok) throw new Error(`Slack conversations.open failed: ${openData.error}`)

  const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${slack.botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: openData.channel.id, text }),
  })
  const msgData = await msgRes.json()
  if (!msgData.ok) throw new Error(`Slack chat.postMessage failed: ${msgData.error}`)
  return msgData
}
