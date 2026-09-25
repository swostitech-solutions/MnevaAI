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

export function createCalendarAuthUrl(userId, redirectUri, platform = 'web') {
  const oauth2 = getOAuthClient(redirectUri)
  const rawState = JSON.stringify({ userId, ts: Date.now(), platform })
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

// Meetings are always read and shown in India Standard Time (IST) — the
// calendar event, the invite email Google sends to attendees, and every
// in-app label — regardless of the phone's or server's own timezone.
export const MEETING_TIME_ZONE = 'Asia/Kolkata'
export async function resolveMeetingTimeZone() {
  return MEETING_TIME_ZONE
}

export async function createMeetingWithGoogleMeet(userId, { title, start, end, description = '', attendees = [] }) {
  const meetingTimeZone = MEETING_TIME_ZONE
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const oauth2 = await getAuthClientForUser(user)
  if (!oauth2) throw new Error('Google Calendar not connected. Connect it in Settings → Integrations.')

  const calendar = google.calendar({ version: 'v3', auth: oauth2 })
  const requestId = `mneva-meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const eventBody = {
    summary: title,
    // States the time in words too, so the invite reads "IST" explicitly
    // and can't be mistaken for another zone.
    description: `${description ? description + '\n\n' : ''}Time: ${new Date(start).toLocaleString('en-IN', { timeZone: MEETING_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} IST (India Standard Time)`,
    start: { dateTime: new Date(start).toISOString(), timeZone: meetingTimeZone },
    end: { dateTime: new Date(end).toISOString(), timeZone: meetingTimeZone },
    conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    extendedProperties: { private: { mnevaSource: 'meeting' } },
    // Without this, Google Calendar applies the user's own default reminder
    // and alerts them natively — a second, uncontrolled notification on top
    // of the ones Mneva schedules itself at the user's configured lead
    // times. This event exists so the meeting is visible on their calendar,
    // not so Google Calendar can also alert them independently.
    reminders: { useDefault: false, overrides: [] },
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

  return { eventId: ev.id, htmlLink: ev.htmlLink, meetLink, title: ev.summary, start: ev.start?.dateTime, end: ev.end?.dateTime, timeZone: meetingTimeZone }
}
