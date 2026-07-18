import { google } from 'googleapis'
import { prisma } from '../config/prisma.js'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
  'profile',
]

function createOAuthClient(redirectUri) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env')
  }
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_REDIRECT_URI,
  )
  return client
}

export function createGmailAuthUrl(userId, redirectUri) {
  const oauth2Client = createOAuthClient(redirectUri)
  // use URL-safe base64 for state to avoid '+' '/' issues when round-tripping via query params
  const rawState = JSON.stringify({ userId, ts: Date.now() })
  const state = Buffer.from(rawState).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const opts = {
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  }
  if (redirectUri) opts.redirect_uri = redirectUri
  return oauth2Client.generateAuthUrl(opts)
}

export function decodeGmailState(state) {
  if (!state) return null
  try {
    // convert URL-safe base64 back to standard base64
    let s = state.replace(/-/g, '+').replace(/_/g, '/')
    // pad with '=' to make length a multiple of 4
    while (s.length % 4) s += '='
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8'))
  } catch {
    // fallback: maybe state was passed as plain JSON string
    try {
      return JSON.parse(state)
    } catch {
      return null
    }
  }
}

export async function exchangeCodeForTokens(code, redirectUri) {
  const oauth2Client = createOAuthClient(redirectUri)
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

async function saveUserPreferences(userId, preferences) {
  return prisma.user.update({
    where: { id: userId },
    data: { preferences },
  })
}

export async function saveGmailTokens(userId, tokens, emailAddress = null) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
  const preferences = user?.preferences || {}
  preferences.gmail = preferences.gmail || {}
  preferences.gmail.tokens = preferences.gmail.tokens || {}

  if (tokens.access_token) preferences.gmail.tokens.access_token = tokens.access_token
  if (tokens.refresh_token) preferences.gmail.tokens.refresh_token = tokens.refresh_token
  if (tokens.expiry_date) preferences.gmail.tokens.expiry_date = tokens.expiry_date
  preferences.gmail.email = emailAddress || preferences.gmail.email || null

  await saveUserPreferences(userId, preferences)
}

export async function clearGmailConnection(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
  const preferences = user?.preferences || {}
  if (!preferences.gmail) {
    return await saveUserPreferences(userId, preferences)
  }
  delete preferences.gmail.tokens
  delete preferences.gmail.email
  return saveUserPreferences(userId, preferences)
}

function buildAuthClientFromTokens(tokens) {
  const oauth2Client = createOAuthClient()
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  })

  oauth2Client.on('tokens', async (newTokens) => {
    if (!newTokens) return
    const patch = {}
    if (newTokens.access_token) patch.access_token = newTokens.access_token
    if (newTokens.refresh_token) patch.refresh_token = newTokens.refresh_token
    if (newTokens.expiry_date) patch.expiry_date = newTokens.expiry_date
    if (Object.keys(patch).length > 0) {
      const user = await prisma.user.findUnique({ where: { id: oauth2Client.state?.userId }, select: { preferences: true } })
      if (user) {
        const preferences = user.preferences || {}
        preferences.gmail = preferences.gmail || {}
        preferences.gmail.tokens = { ...preferences.gmail.tokens, ...patch }
        await saveUserPreferences(oauth2Client.state.userId, preferences)
      }
    }
  })

  return oauth2Client
}

export async function getStoredGmailTokens(user) {
  return user?.preferences?.gmail?.tokens || null
}

export async function getAuthenticatedGmailClient(user) {
  const tokens = await getStoredGmailTokens(user)
  if (!tokens?.refresh_token) {
    throw new Error('Gmail is not connected for this user.')
  }

  const oauth2Client = buildAuthClientFromTokens(tokens)
  oauth2Client.state = { userId: user.id }
  return oauth2Client
}

function getHeaderValue(headers = [], name) {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

function decodeEmailBody(payload) {
  if (!payload) return ''

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8')
  }

  if (payload.parts?.length) {
    const part = payload.parts.find(p => p.mimeType === 'text/plain') || payload.parts.find(p => p.mimeType === 'text/html') || payload.parts[0]
    return decodeEmailBody(part)
  }

  return ''
}

export async function listEmails(user, filter = 'all', limit = 20) {
  const authClient = await getAuthenticatedGmailClient(user)
  const gmail = google.gmail({ version: 'v1', auth: authClient })

  let q = 'in:inbox'
  if (filter === 'unread') q = 'in:inbox is:unread'
  if (filter === 'important') q = 'in:inbox is:important'
  if (filter === 'primary') q = 'in:inbox category:primary'
  if (filter === 'social') q = 'in:inbox category:social'
  if (filter === 'promotions' || filter === 'promotion') q = 'in:inbox category:promotions'
  if (filter === 'updates') q = 'in:inbox category:updates'
  if (filter === 'forums') q = 'in:inbox category:forums'

  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX'],
    q,
    maxResults: Math.min(limit, 50),
  })

  const messages = listResponse.data.messages || []
  const response = await Promise.all(messages.map(async (message) => {
    const messageData = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'Date'],
    })
    const payload = messageData.data.payload || {}
    const from = getHeaderValue(payload.headers, 'From')
    const subject = getHeaderValue(payload.headers, 'Subject')
    const dateHeader = getHeaderValue(payload.headers, 'Date')
    const internalDate = messageData.data.internalDate || messageData.data.internalDate
    const ts = internalDate ? Number(internalDate) : Date.parse(dateHeader)
    const parsedDate = Number.isFinite(ts) ? new Date(ts) : null
    const date = parsedDate ? parsedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : (dateHeader || '')
    const time = parsedDate ? parsedDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''

    const labelIds = messageData.data.labelIds || []
    const category = labelIds.includes('CATEGORY_SOCIAL') ? 'Social'
      : labelIds.includes('CATEGORY_PROMOTIONS') ? 'Promotions'
      : labelIds.includes('CATEGORY_UPDATES') ? 'Updates'
      : labelIds.includes('CATEGORY_FORUMS') ? 'Forums'
      : 'Primary'

    return {
      id: message.id,
      subject: subject || '(No subject)',
      from: from || 'Unknown sender',
      date,
      time,
      preview: messageData.data.snippet || '',
      unread: labelIds.includes('UNREAD'),
      category,
    }
  }))

  const labelResponse = await gmail.users.labels.get({ userId: 'me', id: 'UNREAD' })
  const unreadCount = labelResponse.data.messagesUnread || 0

  return { emails: response, total: response.length, unreadCount }
}

export async function getEmailBody(user, messageId) {
  const authClient = await getAuthenticatedGmailClient(user)
  const gmail = google.gmail({ version: 'v1', auth: authClient })
  const messageData = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })
  return {
    subject: getHeaderValue(messageData.data.payload.headers, 'Subject'),
    from: getHeaderValue(messageData.data.payload.headers, 'From'),
    body: decodeEmailBody(messageData.data.payload),
  }
}

export async function sendEmail(user, recipient, subject, body) {
  const authClient = await getAuthenticatedGmailClient(user)
  const gmail = google.gmail({ version: 'v1', auth: authClient })
  const raw = Buffer.from([
    `From: ${user.email}`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })

  return result.data
}
