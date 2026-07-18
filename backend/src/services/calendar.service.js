import { google } from 'googleapis'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'

const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'openid', 'email', 'profile'
]

function getOAuthClient(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  )
}

export function createCalendarAuthUrl(userId, redirectUri) {
  const oauth2 = getOAuthClient(redirectUri)
  // use URL-safe base64 for state and request consent so refresh_token is returned
  const rawState = JSON.stringify({ userId, ts: Date.now() })
  const state = Buffer.from(rawState).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const opts = { access_type: 'offline', prompt: 'consent', scope: CALENDAR_SCOPES, state }
  if (redirectUri) opts.redirect_uri = redirectUri
  const url = oauth2.generateAuthUrl(opts)
  return url
}

export async function exchangeCodeForTokens(code, redirectUri) {
  const oauth2 = getOAuthClient(redirectUri)
  const r = await oauth2.getToken(code)
  return r.tokens
}

export async function saveCalendarTokens(userId, tokens, calendarEmail = null) {
  // store tokens in user.preferences.calendar
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const prefs = user?.preferences || {}
  prefs.calendar = { ...prefs.calendar, tokens, email: calendarEmail, disconnected: false }
  await prisma.user.update({ where: { id: userId }, data: { preferences: prefs } })
}

export async function clearCalendarConnection(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const prefs = user?.preferences || {}
  prefs.calendar = { ...prefs.calendar, tokens: null, email: null, disconnected: true }
  await prisma.user.update({ where: { id: userId }, data: { preferences: prefs } })
}

async function getAuthClientForUser(user) {
  if (user?.preferences?.calendar?.disconnected) return null
  const tokens = user?.preferences?.calendar?.tokens || user?.preferences?.gmail?.tokens
  if (!tokens) return null
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || `${process.env.HOST_ORIGIN || 'http://localhost:3001'}/api/calendar/callback`
  const oauth2 = getOAuthClient(redirectUri)
  oauth2.setCredentials(tokens)
  return oauth2
}

export async function listEvents(user, timeMin, timeMax, maxResults = 20) {
  try {
    const oauth2 = await getAuthClientForUser(user)
    if (!oauth2) throw new Error('Calendar not connected')
    const calendar = google.calendar({ version: 'v3', auth: oauth2 })
    const res = await calendar.events.list({ calendarId: 'primary', timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults })
    return res.data.items || []
  } catch (err) {
    logger.debug('Calendar listEvents failed', err.message)
    throw err
  }
}

export async function createEventIfConnected(userId, event) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const oauth2 = await getAuthClientForUser(user)
    if (!oauth2) return null
    const calendar = google.calendar({ version: 'v3', auth: oauth2 })
    const ev = await calendar.events.insert({ calendarId: 'primary', requestBody: event })
    return ev.data
  } catch (err) {
    logger.warn('Failed to create calendar event', err.message)
    return null
  }
}

export async function createMeetingWithGoogleMeet(userId, { title, start, end, description = '', attendees = [] }) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const oauth2 = await getAuthClientForUser(user)
  if (!oauth2) throw new Error('Google Calendar not connected. Connect it in Settings → Integrations.')

  const calendar = google.calendar({ version: 'v3', auth: oauth2 })
  const requestId = `mneva-meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const eventBody = {
    summary: title,
    description,
    start: { dateTime: new Date(start).toISOString(), timeZone: 'Asia/Kolkata' },
    end: { dateTime: new Date(end).toISOString(), timeZone: 'Asia/Kolkata' },
    conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    ...(attendees.length && { attendees: attendees.map(email => ({ email })) }),
  }

  const res = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    sendUpdates: attendees.length ? 'all' : 'none',
    requestBody: eventBody,
  })

  const ev = res.data
  const meetLink = ev.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri
    || ev.hangoutLink
    || null

  return { eventId: ev.id, htmlLink: ev.htmlLink, meetLink, title: ev.summary, start: ev.start?.dateTime, end: ev.end?.dateTime }
}
