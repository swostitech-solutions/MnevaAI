import { prisma } from '../config/prisma.js'
import { createOAuthState, verifyOAuthState } from './oauthState.js'

// Microsoft Graph covers Outlook Mail, Outlook Calendar, OneDrive, and
// Word/Excel/PowerPoint (which are just files living on OneDrive) and
// Microsoft To Do through ONE API with ONE OAuth grant — unlike Google,
// which needs a separate client/scope/token per product. So there's a
// single `outlook` connection (one `preferences.outlook.tokens` entry) that
// unlocks all of those; ConnectedAccounts.js in the app presents them as one
// chain (Outlook Mail primary, the rest linked) for the same reason Gmail+
// Calendar are chained — they share one grant.
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

const SCOPES = [
  'openid', 'profile', 'offline_access',
  'User.Read', 'Mail.Read', 'Mail.Send',
  'Calendars.ReadWrite', 'Files.ReadWrite', 'Tasks.ReadWrite',
]

function requireConfig() {
  if (!process.env.OUTLOOK_CLIENT_ID || !process.env.OUTLOOK_CLIENT_SECRET) {
    throw new Error('Outlook OAuth is not configured. Add OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET to backend/.env')
  }
}

export function createOutlookAuthUrl(userId, redirectUri, platform = 'web') {
  requireConfig()
  const state = createOAuthState({ userId, platform })
  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri || process.env.OUTLOOK_REDIRECT_URI,
    response_mode: 'query',
    scope: SCOPES.join(' '),
    state,
    prompt: 'consent',
  })
  return `${AUTHORITY}/authorize?${params.toString()}`
}

export function decodeOutlookState(state) {
  return verifyOAuthState(state)
}

export async function exchangeCodeForTokens(code, redirectUri) {
  requireConfig()
  const body = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID,
    client_secret: process.env.OUTLOOK_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri || process.env.OUTLOOK_REDIRECT_URI,
    grant_type: 'authorization_code',
  })
  const resp = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error_description || data.error || 'Failed to exchange Outlook authorization code')
  // expires_in is seconds-from-now; store as an absolute timestamp like the
  // Google integrations do, so refresh logic everywhere can compare against
  // Date.now() the same way.
  return { ...data, expiry_date: Date.now() + (data.expires_in || 3600) * 1000 }
}

async function refreshTokens(refreshToken) {
  requireConfig()
  const body = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID,
    client_secret: process.env.OUTLOOK_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: SCOPES.join(' '),
  })
  const resp = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error_description || data.error || 'Failed to refresh Outlook token')
  return { ...data, expiry_date: Date.now() + (data.expires_in || 3600) * 1000 }
}

async function saveUserPreferences(userId, preferences) {
  return prisma.user.update({ where: { id: userId }, data: { preferences } })
}

export async function saveOutlookTokens(userId, tokens, emailAddress = null) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
  const preferences = user?.preferences || {}
  preferences.outlook = preferences.outlook || {}
  preferences.outlook.tokens = preferences.outlook.tokens || {}

  if (tokens.access_token) preferences.outlook.tokens.access_token = tokens.access_token
  // Microsoft only returns a refresh_token on the very first consent (and on
  // refresh, usually a rotated one) — never overwrite a previously-stored
  // one with nothing.
  if (tokens.refresh_token) preferences.outlook.tokens.refresh_token = tokens.refresh_token
  if (tokens.expiry_date) preferences.outlook.tokens.expiry_date = tokens.expiry_date
  preferences.outlook.email = emailAddress || preferences.outlook.email || null

  await saveUserPreferences(userId, preferences)
}

export async function clearOutlookConnection(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
  const preferences = user?.preferences || {}
  if (!preferences.outlook) return saveUserPreferences(userId, preferences)
  delete preferences.outlook.tokens
  delete preferences.outlook.email
  return saveUserPreferences(userId, preferences)
}

export async function getStoredOutlookTokens(user) {
  return user?.preferences?.outlook?.tokens || null
}

// Returns a valid access token, transparently refreshing (and persisting
// the refreshed tokens) when the stored one is expired or about to be.
async function getValidAccessToken(user) {
  const tokens = await getStoredOutlookTokens(user)
  if (!tokens?.refresh_token) throw new Error('Outlook is not connected for this user.')

  const expiresSoon = !tokens.expiry_date || tokens.expiry_date - Date.now() < 60000
  if (!expiresSoon) return tokens.access_token

  const refreshed = await refreshTokens(tokens.refresh_token)
  await saveOutlookTokens(user.id, refreshed)
  return refreshed.access_token
}

async function graphFetch(user, path, options = {}) {
  const accessToken = await getValidAccessToken(user)
  const resp = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (resp.status === 204) return null
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data?.error?.message || `Microsoft Graph error ${resp.status}`)
  return data
}

export async function getOutlookProfile(user) {
  return graphFetch(user, '/me?$select=displayName,mail,userPrincipalName')
}

// ── Outlook Mail ──────────────────────────────────────────────────────
export async function listEmails(user, filter = 'all', limit = 20) {
  const params = new URLSearchParams({
    $top: String(Math.min(limit, 50)),
    $select: 'subject,from,receivedDateTime,bodyPreview,isRead',
    $orderby: 'receivedDateTime desc',
  })
  if (filter === 'unread') params.set('$filter', 'isRead eq false')

  const data = await graphFetch(user, `/me/mailFolders/inbox/messages?${params.toString()}`)
  const emails = (data.value || []).map(m => {
    const dt = m.receivedDateTime ? new Date(m.receivedDateTime) : null
    return {
      id: m.id,
      subject: m.subject || '(No subject)',
      from: m.from?.emailAddress ? `${m.from.emailAddress.name || ''} <${m.from.emailAddress.address}>` : 'Unknown sender',
      date: dt ? dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
      time: dt ? dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '',
      preview: m.bodyPreview || '',
      unread: !m.isRead,
    }
  })
  const unreadCount = emails.filter(e => e.unread).length
  return { emails, total: emails.length, unreadCount }
}

export async function getEmailBody(user, messageId) {
  const m = await graphFetch(user, `/me/messages/${encodeURIComponent(messageId)}?$select=subject,from,body,receivedDateTime`)
  return {
    subject: m.subject || '(No subject)',
    from: m.from?.emailAddress ? `${m.from.emailAddress.name || ''} <${m.from.emailAddress.address}>` : 'Unknown sender',
    body: m.body?.contentType === 'text' ? m.body.content : '',
    bodyHtml: m.body?.contentType === 'html' ? m.body.content : null,
  }
}

export async function sendEmail(user, recipient, subject, body) {
  return graphFetch(user, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: recipient } }],
      },
    }),
  })
}

// ── Outlook Calendar ──────────────────────────────────────────────────
export async function listEvents(user, limit = 20) {
  const params = new URLSearchParams({
    $top: String(Math.min(limit, 50)),
    $select: 'subject,start,end,location,organizer,webLink',
    $orderby: 'start/dateTime',
  })
  const data = await graphFetch(user, `/me/events?${params.toString()}`)
  return (data.value || []).map(e => ({
    id: e.id,
    title: e.subject || '(No title)',
    start: e.start?.dateTime || null,
    end: e.end?.dateTime || null,
    location: e.location?.displayName || '',
    organizer: e.organizer?.emailAddress?.address || '',
    link: e.webLink || null,
  }))
}

export async function createEvent(user, { title, start, end, location, attendees = [] }) {
  return graphFetch(user, '/me/events', {
    method: 'POST',
    body: JSON.stringify({
      subject: title,
      start: { dateTime: start, timeZone: 'Asia/Kolkata' },
      end: { dateTime: end, timeZone: 'Asia/Kolkata' },
      location: location ? { displayName: location } : undefined,
      attendees: attendees.map(a => ({ emailAddress: { address: a }, type: 'required' })),
    }),
  })
}

// ── OneDrive / Word / Excel / PowerPoint ──────────────────────────────
// Word/Excel/PowerPoint "Online" aren't separate Graph APIs — they're just
// .docx/.xlsx/.pptx files living on OneDrive, opened in the browser via
// their own webUrl (which Office automatically renders as Word/Excel/
// PowerPoint Online). `type` filters the same OneDrive file list by
// extension so each of those three can show "its own" files.
const OFFICE_EXTENSIONS = {
  word: ['.doc', '.docx'],
  excel: ['.xls', '.xlsx'],
  powerpoint: ['.ppt', '.pptx'],
}

export async function listDriveFiles(user, type = 'all', limit = 50) {
  const params = new URLSearchParams({
    $top: String(Math.min(limit, 100)),
    $select: 'id,name,file,folder,webUrl,lastModifiedDateTime,size',
    $orderby: 'lastModifiedDateTime desc',
  })
  const data = await graphFetch(user, `/me/drive/root/children?${params.toString()}`)
  let files = (data.value || []).filter(f => f.file) // skip folders

  const exts = OFFICE_EXTENSIONS[type]
  if (exts) files = files.filter(f => exts.some(ext => f.name?.toLowerCase().endsWith(ext)))

  return files.map(f => ({
    id: f.id,
    name: f.name,
    url: f.webUrl,
    modifiedAt: f.lastModifiedDateTime,
    sizeBytes: f.size || 0,
  }))
}

// ── Microsoft To Do ────────────────────────────────────────────────────
export async function listTaskLists(user) {
  const data = await graphFetch(user, '/me/todo/lists')
  return (data.value || []).map(l => ({ id: l.id, name: l.displayName }))
}

export async function listTasks(user, listId) {
  const data = await graphFetch(user, `/me/todo/lists/${encodeURIComponent(listId)}/tasks?$orderby=createdDateTime desc`)
  return (data.value || []).map(t => ({
    id: t.id,
    title: t.title,
    completed: t.status === 'completed',
    dueAt: t.dueDateTime?.dateTime || null,
  }))
}

export async function createTask(user, listId, title) {
  return graphFetch(user, `/me/todo/lists/${encodeURIComponent(listId)}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export async function completeTask(user, listId, taskId) {
  return graphFetch(user, `/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed' }),
  })
}
