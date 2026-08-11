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

export function createGmailAuthUrl(userId, redirectUri, platform = 'web') {
  const oauth2Client = createOAuthClient(redirectUri)
  const rawState = JSON.stringify({ userId, ts: Date.now(), platform })
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
    const time = parsedDate ? parsedDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : ''

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

// Meeting request detection keywords
const MEETING_KEYWORDS = [
  'can we meet', 'let\'s meet', 'lets meet', 'schedule a call', 'schedule a meeting',
  'hop on a call', 'quick call', 'catch up', 'sync up', 'sync call', 'connect with you',
  'set up a meeting', 'book a meeting', 'arrange a meeting', 'meeting request',
  'would you be available', 'are you available', 'free for a call', 'free to talk',
  'discuss over a call', 'zoom call', 'google meet', 'teams call', 'video call',
  'interview', 'demo call', 'product demo', 'introductory call', 'intro call',
  'follow-up call', 'follow up call', 'check-in call', 'check in call',
]

export function detectMeetingRequest(subject, snippet, from) {
  const text = `${subject} ${snippet}`.toLowerCase()
  const hit = MEETING_KEYWORDS.find(kw => text.includes(kw))
  if (!hit) return null
  // Extract sender name from "Name <email>" format
  const nameMatch = from.match(/^([^<]+)</)
  const senderName = nameMatch ? nameMatch[1].trim() : from.replace(/<.*>/, '').trim()
  const senderEmail = (from.match(/<([^>]+)>/) || [])[1] || from.trim()
  return { senderName, senderEmail, keyword: hit }
}

// Urgency keywords — subject/snippet match raises score
const URGENT_KEYWORDS = [
  'urgent', 'asap', 'action required', 'action needed', 'immediate', 'immediately',
  'deadline', 'due today', 'overdue', 'past due', 'final notice', 'last chance',
  'meeting', 'interview', 'appointment', 'call scheduled', 'zoom', 'google meet',
  'invoice', 'payment due', 'payment failed', 'transaction', 'otp', 'verification',
  'confirm', 'approval needed', 'approve', 'sign', 'contract', 'offer letter',
  'follow up', 'follow-up', 'reminder', 'important', 'priority', 'critical',
  'alert', 'warning', 'security', 'password', 'account', 'suspended', 'blocked',
]

function scoreEmail(subject, snippet) {
  const text = `${subject} ${snippet}`.toLowerCase()
  let score = 0
  for (const kw of URGENT_KEYWORDS) {
    if (text.includes(kw)) score += 1
  }
  // Boost for multiple keyword hits
  return score
}

// Fetch today's unread primary emails and return only urgent ones (score >= 1)
export async function getUrgentEmails(user, maxResults = 20) {
  try {
    const authClient = await getAuthenticatedGmailClient(user)
    const gmail = google.gmail({ version: 'v1', auth: authClient })

    // today's unread primary inbox emails
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '/')
    const q = `in:inbox is:unread after:${todayStr} category:primary`

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults,
    })

    const messages = listRes.data.messages || []
    if (!messages.length) return []

    const emails = await Promise.all(messages.map(async (msg) => {
      const data = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      })
      const headers = data.data.payload?.headers || []
      const subject = getHeaderValue(headers, 'Subject') || '(No subject)'
      const from    = getHeaderValue(headers, 'From')    || 'Unknown'
      const snippet = data.data.snippet || ''
      const internalDate = data.data.internalDate
      const ts = internalDate ? Number(internalDate) : Date.now()
      const time = new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      const urgencyScore = scoreEmail(subject, snippet)
      return { id: msg.id, subject, from, snippet, time, urgencyScore }
    }))

    // Return only emails with at least 1 urgency keyword hit, sorted by score desc
    return emails
      .filter(e => e.urgencyScore >= 1)
      .sort((a, b) => b.urgencyScore - a.urgencyScore)
      .slice(0, 5)
  } catch {
    return []
  }
}
