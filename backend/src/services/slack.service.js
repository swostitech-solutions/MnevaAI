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
//
// channels:history/channels:join were added so the bot can actually read
// public channels (browse channels + see messages), not just DM — Slack
// only lets a bot read history in channels it's a member of, even public
// ones, so listMessages() below auto-joins via channels:join before every
// read rather than requiring someone to manually /invite the bot first.
const SCOPES = ['channels:read', 'channels:history', 'channels:join', 'chat:write', 'im:write', 'users:read']

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

async function getBotToken(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const slack = user?.preferences?.slack
  if (!slack?.botToken || slack.disconnected) throw new Error('Slack is not connected.')
  return slack.botToken
}

async function slackApi(botToken, method, params, { post = false } = {}) {
  const url = `https://slack.com/api/${method}`
  const res = post
    ? await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(params || {}),
      })
    : await fetch(`${url}?${new URLSearchParams(params || {}).toString()}`, {
        headers: { Authorization: `Bearer ${botToken}` },
      })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`)
  return data
}

// Display-name cache, keyed by botToken (one per workspace) then Slack user
// id — channel history comes back with only raw user ids, and resolving
// each one with its own users.info call on every single message list would
// be both slow and wasteful since names essentially never change. Not
// user-scoped: the same Slack workspace's names are the same for everyone
// connected to it.
const _userNameCache = new Map()

async function resolveUserName(botToken, slackUserId) {
  if (!slackUserId) return 'Unknown'
  const cacheKey = `${botToken}:${slackUserId}`
  if (_userNameCache.has(cacheKey)) return _userNameCache.get(cacheKey)
  try {
    const data = await slackApi(botToken, 'users.info', { user: slackUserId })
    const name = data.user?.profile?.display_name || data.user?.real_name || data.user?.name || slackUserId
    _userNameCache.set(cacheKey, name)
    return name
  } catch {
    return slackUserId
  }
}

// Public channels only — matches what the bot is actually scoped for
// (channels:read/history/join are Bot Token Scopes for PUBLIC channels;
// private channels/groups would need groups:read/history, which isn't
// requested here on purpose, to keep this to what a user already sees in
// Slack's own public-channel list, not anything private).
export async function listChannels(userId) {
  const botToken = await getBotToken(userId)
  const data = await slackApi(botToken, 'conversations.list', {
    types: 'public_channel',
    exclude_archived: 'true',
    limit: '200',
  })
  return (data.channels || [])
    .sort((a, b) => (b.num_members || 0) - (a.num_members || 0))
    .map(c => ({ id: c.id, name: c.name, memberCount: c.num_members || 0, isMember: !!c.is_member }))
}

export async function listMessages(userId, channelId, limit = 30) {
  const botToken = await getBotToken(userId)

  // Slack only returns history for channels the bot is a member of, even
  // public ones — join is idempotent (a no-op, not an error, if already in).
  try {
    await slackApi(botToken, 'conversations.join', { channel: channelId }, { post: true })
  } catch { /* already a member, or a transient join hiccup — history call below still tells the real story */ }

  const data = await slackApi(botToken, 'conversations.history', { channel: channelId, limit: String(Math.min(limit, 50)) })
  const raw = (data.messages || []).filter(m => m.type === 'message' && !m.subtype)

  const names = new Map()
  for (const m of raw) {
    if (m.user && !names.has(m.user)) names.set(m.user, await resolveUserName(botToken, m.user))
  }

  return raw
    .map(m => {
      const ts = Number(m.ts) * 1000
      const date = new Date(ts)
      return {
        id: m.ts,
        user: names.get(m.user) || 'Unknown',
        text: m.text || '',
        time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        date: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      }
    })
    .sort((a, b) => Number(a.id) - Number(b.id)) // oldest first, like a real chat view
}
