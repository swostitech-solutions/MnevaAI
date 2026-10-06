import { google } from 'googleapis'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'
import { createOAuthState } from './oauthState.js'

const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  // Needed only for endActiveMeetConference below (force-ending a live Meet
  // call via the separate meet.googleapis.com API) — NOT required for
  // creating/reading events or Meet links, which calendar.events already
  // covers. Existing connections made before this was added don't have it;
  // those users must reconnect (Settings → Integrations) before this will
  // work for them, since Google only grants scopes present at consent time.
  'https://www.googleapis.com/auth/meetings.space.created',
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
  const state = createOAuthState({ userId, platform })
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

// Checks whether a new meeting would land on top of something the user
// already has scheduled. Meetings and reminders are the only two record
// types saved with an actual clock time (a plain to-do Task has none), so
// those are the only things that can conflict — both are stored as
// Notification rows with the real start/end buried in `message` JSON, not
// a queryable column, so this has to fetch and parse rather than filter in
// SQL. Shared by the manual meeting route (routes/calendar.js) and the
// schedule_event AI tool (agents/autonomyEngine.js) so a clash is caught
// the same way no matter how the meeting was created.
export async function findScheduleConflict(userId, startISO, endISO) {
  const notifs = await prisma.notification.findMany({
    where: {
      userId,
      OR: [
        { title: { contains: 'Meeting scheduled' } },
        { title: '🔔 Reminder set' },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  const newStart = new Date(startISO).getTime()
  const newEnd = new Date(endISO).getTime()
  for (const n of notifs) {
    let parsed = {}
    try { parsed = JSON.parse(n.message) } catch { continue }
    if (!parsed.start) continue
    const existingStart = new Date(parsed.start).getTime()
    if (Number.isNaN(existingStart)) continue
    const isReminder = n.title === '🔔 Reminder set'
    // A reminder has no duration of its own — it only conflicts if it falls
    // inside the new meeting's window. A meeting has a real end time (or
    // the same implicit 1-hour default createMeetingWithGoogleMeet uses),
    // so two meetings conflict on any overlap between their windows.
    const overlaps = isReminder
      ? existingStart >= newStart && existingStart < newEnd
      : (() => {
          const existingEnd = parsed.end ? new Date(parsed.end).getTime() : existingStart + 60 * 60 * 1000
          return newStart < existingEnd && existingStart < newEnd
        })()
    if (overlaps) {
      return {
        title: isReminder ? (parsed.preview || 'Reminder') : n.title.replace(/^📅 Meeting scheduled: /, ''),
        kind: isReminder ? 'reminder' : 'meeting',
        start: parsed.start,
        end: parsed.end || null,
      }
    }
  }
  return null
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

  // conferenceId is what endActiveMeetConference below needs to find and
  // end this specific call later — distinct from the Calendar eventId.
  return { eventId: ev.id, htmlLink: ev.htmlLink, meetLink, conferenceId: ev.conferenceData?.conferenceId || null, title: ev.summary, start: ev.start?.dateTime, end: ev.end?.dateTime, timeZone: meetingTimeZone }
}

// Force-ends a live Meet call for everyone still on it, via the separate
// Meet REST API (meet.googleapis.com) — NOT the Calendar API, which has no
// such capability (deleting/updating the calendar event does nothing to an
// already-ongoing call). Needs the meetings.space.created scope above, so
// this throws for any connection made before that scope existed.
//
// UNVERIFIED as of writing — this has not yet been tested against a real
// connected account. In particular it's unconfirmed whether this works for
// a personal Gmail account or only Google Workspace; that's exactly what
// the manual "end call" trigger this backs is for finding out before any
// automatic/scheduled version gets built on top of it.
export async function endActiveMeetConference(userId, conferenceId) {
  if (!conferenceId) throw new Error('No conferenceId stored for this meeting — it may predate this feature.')
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const oauth2 = await getAuthClientForUser(user)
  if (!oauth2) throw new Error('Calendar not connected.')
  const { token } = await oauth2.getAccessToken()
  if (!token) throw new Error('Could not obtain a Google access token — try reconnecting Calendar in Settings.')
  const res = await fetch(`https://meet.googleapis.com/v2/spaces/${conferenceId}:endActiveConference`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // 403 here most likely means the connected account is missing the
    // meetings.space.created scope (reconnect needed) or doesn't support
    // this API at all for its account type — both real possibilities per
    // the UNVERIFIED note above, not necessarily a bug.
    throw new Error(`Meet API endActiveConference failed (${res.status}): ${body || res.statusText}`)
  }
  return true
}
