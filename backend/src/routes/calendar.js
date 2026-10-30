import express from 'express'
import { createCalendarAuthUrl, exchangeCodeForTokens, saveCalendarTokens, listEvents, clearCalendarConnection, createMeetingWithGoogleMeet, MEETING_TIME_ZONE, findScheduleConflict, endActiveMeetConference } from '../services/calendar.service.js'
import { userStore } from '../models/userStore.js'
import { logger } from '../config/logger.js'
import { ledger } from '../services/ledgerService.js'
import { prisma } from '../config/prisma.js'
import { emitToUser } from '../services/realtime.js'
import { stopCalendarPoller } from '../services/calendarPoller.js'
import { verifyOAuthState } from '../services/oauthState.js'

const router = express.Router()

// Do not present ordinary calendar appointments as video meetings.  This is
// kept at the API boundary too, so every client gets the same distinction.
function hasJoinableMeetingLink(link) {
  return typeof link === 'string' && /^https?:\/\/\S+$/i.test(link.trim())
}

// "Today" for the wrap-up endpoint below needs to mean the user's actual
// calendar day, not whatever timezone the server process happens to be
// running in. Asia/Kolkata has no DST (always a fixed UTC+5:30), so a plain
// offset is exact here — unlike most timezones, this never needs a real
// tz library to get right. The app's whole product is India-first (see
// autonomyEngine.js's "Use Indian context" rule), so this is the one
// timezone day boundaries are computed in.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
function istDayBounds(daysAgo = 0) {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS)
  const y = nowIst.getUTCFullYear(), m = nowIst.getUTCMonth(), d = nowIst.getUTCDate() - daysAgo
  return {
    start: new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS),
    end: new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - IST_OFFSET_MS),
  }
}

export async function calendarCallbackHandler(req, res) {
  try {
    const { code, state } = req.query
    if (!code) return res.status(400).send('Missing code')
    const decoded = verifyOAuthState(state)
    if (!decoded || !decoded.userId) {
      logger.warn('Calendar callback received invalid state', { state })
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174'
      return res.redirect(`${frontendUrl}/settings?calendar=error&msg=${encodeURIComponent('Invalid state')}`)
    }

    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/calendar/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri)
    const user = await userStore.getById(decoded.userId)
    if (!user) return res.status(404).send('User not found')

    // try to fetch calendar email info (best-effort)
    let calendarEmail = null
    try {
      const { google } = await import('googleapis')
      const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri)
      oauth2.setCredentials(tokens)
      const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 })
      const info = await oauth2Api.userinfo.get()
      calendarEmail = info.data.email
    } catch { /* ignore */ }

    await saveCalendarTokens(user.id, tokens, calendarEmail)
    logger.info('Calendar tokens saved', { userId: user.id, hasRefresh: !!tokens.refresh_token, tokenKeys: Object.keys(tokens || {}) })
    ledger.add({
      userId: user.id,
      tool: 'account_connected',
      input: { service: 'calendar' },
      result: { email: calendarEmail },
      status: 'completed',
    }).catch(() => {})
    const isMobile = decoded.platform === 'mobile'
    const mobileScheme = process.env.MOBILE_APP_SCHEME || 'mneva'
    if (isMobile) return res.redirect(`${mobileScheme}://settings?calendar=connected`)
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/settings?calendar=connected`)
  } catch (err) {
    const isMobile = (() => { try { let s = req.query.state?.replace(/-/g,'+').replace(/_/g,'/'); while(s?.length%4) s+='='; return JSON.parse(Buffer.from(s,'base64').toString()).platform==='mobile' } catch { return false } })()
    const mobileScheme = process.env.MOBILE_APP_SCHEME || 'mneva'
    if (isMobile) return res.redirect(`${mobileScheme}://settings?calendar=error&msg=${encodeURIComponent(err.message)}`)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174'
    return res.redirect(`${frontendUrl}/settings?calendar=error&msg=${encodeURIComponent(err.message)}`)
  }
}

router.get('/config-status', (_req, res) => {
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && !process.env.GOOGLE_CLIENT_ID.includes('replace'))
  res.json({ configured })
})

router.get('/connect', async (req, res) => {
  try {
    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/calendar/callback`
    const platform = req.query.platform || 'web'
    const url = createCalendarAuthUrl(req.user.id, redirectUri, platform)
    res.json({ url })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/status', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const cal = user?.preferences?.calendar || {}
    const gmail = user?.preferences?.gmail || {}
    const connected = !cal?.disconnected && !!(cal?.tokens?.refresh_token || cal?.tokens?.access_token || gmail?.tokens?.refresh_token || gmail?.tokens?.access_token)
    const email = cal?.email || gmail?.email || null
    res.json({ connected, email, tokensPresent: !!cal?.tokens || !!gmail?.tokens })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/disconnect', async (req, res) => {
  try {
    await clearCalendarConnection(req.user.id)
    stopCalendarPoller(req.user.id)
    ledger.add({
      userId: req.user.id,
      tool: 'account_disconnected',
      input: { service: 'calendar' },
      result: {},
      status: 'completed',
    }).catch(() => {})
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/meetings', async (req, res) => {
  try {
    const { title, start, end, description, attendees } = req.body
    if (!title || !start) return res.status(400).json({ error: 'title and start are required' })
    const startDt = new Date(start)
    if (Number.isNaN(startDt.getTime())) return res.status(400).json({ success: false, error: 'That start date and time is not valid.' })
    // One minute of grace: the scheduler's default time is "now", which is
    // already a few seconds old by the time the request lands.
    if (startDt.getTime() < Date.now() - 60 * 1000) {
      return res.status(400).json({ success: false, error: 'That date and time is in the past — please pick a future date and time.' })
    }
    if (end && new Date(end).getTime() <= startDt.getTime()) {
      return res.status(400).json({ success: false, error: 'The meeting must end after it starts.' })
    }
    const endTime = end || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString()
    const timeZone = MEETING_TIME_ZONE
    const conflict = await findScheduleConflict(req.user.id, start, endTime)
    if (conflict) {
      const conflictTime = new Date(conflict.start).toLocaleTimeString('en-IN', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true })
      return res.status(409).json({
        success: false,
        error: `You already have "${conflict.title}" at ${conflictTime} — please pick another time.`,
        conflict,
      })
    }
    // Google Calendar can intermittently reject this (e.g. a connection made
    // before a scope was added, or a transiently stale/expired token) even
    // though the account is genuinely connected. The AI's own schedule_event
    // tool (agents/autonomyEngine.js) already degrades gracefully in that
    // case — the meeting is still tracked inside Mneva, just without a real
    // Google Calendar event / Meet link — so this manual "Schedule" flow
    // must not hard-fail the whole request on the same error.
    let meeting
    let calendarError = null
    try {
      meeting = await createMeetingWithGoogleMeet(req.user.id, { title, start, end: endTime, description, attendees: attendees || [] })
    } catch (err) {
      calendarError = err.message || 'Calendar event could not be created.'
      meeting = { eventId: null, meetLink: null, conferenceId: null, title, start, end: endTime, timeZone }
      logger.warn(`Calendar meeting saved locally: ${calendarError}`)
    }
    const ledgerEntry = await ledger.add({
      userId: req.user.id,
      tool: 'schedule_event',
      input: { title, start, end: endTime, description, attendees: attendees || [] },
      result: { success: true, ...meeting },
      status: 'completed',
    })
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: `📅 Meeting scheduled: ${title}`,
        message: JSON.stringify({ source: 'calendar', eventId: meeting.eventId, meetLink: meeting.meetLink || null, conferenceId: meeting.conferenceId || null, preview: title, start, end: endTime, description: description || null, attendees: attendees || [] }),
      },
    })
    // Calendar meetings created from the Ask AI sheet must use the same task
    // source as meetings created through the AI tool, so all dashboards see it.
    const meetingTask = await prisma.task.create({
      data: {
        userId: req.user.id,
        title,
        // Formatted in the meeting's own zone — with no zone given this used the
        // server's clock (UTC on Render), so the task showed a different time
        // than the one that was scheduled.
        description: `Meeting · ${new Date(start).toLocaleTimeString('en-IN', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true })}`,
        status: 'PENDING',
      },
    })
    emitToUser(req.user.id, 'task:created', meetingTask)
    emitToUser(req.user.id, 'ledger:updated', ledgerEntry)
    emitToUser(req.user.id, 'meeting:created', { ...meeting, title, start, end: endTime })
    res.json({
      success: true,
      meeting,
      // Not an error — the meeting IS scheduled inside Mneva either way.
      // The client can use this to show a small "no Google Meet link —
      // reconnect Calendar in Settings" notice instead of treating the
      // whole action as failed.
      calendarWarning: calendarError,
    })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// GET /api/calendar/meetings — returns scheduled meetings from notifications + live calendar events
// Pull from notifications (source of truth for meetings and reminders
// created via Mneva, including locally saved entries when Calendar is not
// connected). Shared by GET /meetings and the wrap-up endpoint below, so
// both see the exact same dedup/parse logic instead of two copies drifting
// apart.
export async function getMeetingsForUser(userId, { take = 20 } = {}) {
  const { prisma } = await import('../config/prisma.js')
  const notifs = await prisma.notification.findMany({
    where: {
      userId,
      OR: [
        { title: { contains: 'Meeting scheduled' } },
        { title: '🔔 Reminder set' },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take,
  })
  // A retry can create two identical in-app notification rows. Deduplicate
  // by the actual scheduled item, not just a Google event id (reminders and
  // local meetings deliberately have no event id).
  const itemsBySchedule = new Map();
  for (const n of notifs) {
    let parsed = {};
    try { parsed = JSON.parse(n.message) } catch {}
    const title = n.title === '🔔 Reminder set'
      ? (parsed.preview || 'Reminder')
      : n.title.replace(/^📅 Meeting scheduled: /, '')
    const key = `${title.trim().toLowerCase()}:${parsed.start || n.createdAt.toISOString()}`;
    const existing = itemsBySchedule.get(key)
    // Prefer the original reminder record over the Calendar mirror left by
    // older app versions, so its category remains correct.
    if (!existing || parsed.source === 'reminder') itemsBySchedule.set(key, n)
  }
  const dedupedNotifs = [...itemsBySchedule.values()];
  return dedupedNotifs.map(n => {
    let parsed = {}
    try { parsed = JSON.parse(n.message) } catch {}
    return {
      id: n.id,
      title: n.title === '🔔 Reminder set' ? (parsed.preview || 'Reminder') : n.title.replace(/^📅 Meeting scheduled: /, ''),
      kind: parsed.source === 'reminder' || !hasJoinableMeetingLink(parsed.meetLink)
        ? 'reminder'
        : 'meeting',
      start: parsed.start || null,
      end: parsed.end || null,
      meetLink: parsed.meetLink || null,
      description: parsed.description || null,
      attendees: parsed.attendees || [],
      eventId: parsed.eventId || null,
      conferenceId: parsed.conferenceId || null,
    }
  }).filter(m => m.start)
}

router.get('/meetings', async (req, res) => {
  try {
    const meetings = await getMeetingsForUser(req.user.id)
    res.json(meetings)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/calendar/meeting-context?attendees=a@x.com,b@y.com&title=...
// The "tap a meeting for the full picture" view on Priorities — who's
// attending (echoed back from the query), the user's last Gmail threads
// with those attendees (from:X OR to:X per attendee), and documents
// relevant to the meeting's title (reuses the same memory recall the
// document-search chat route uses). Every attendee not already known is
// just a dead-end lookup, not an error, so this always returns 200 with
// best-effort sections rather than failing the whole card over one missing
// piece — Gmail not being connected, or no attendees being listed, still
// shows whatever sections it does have data for.
router.get('/meeting-context', async (req, res) => {
  try {
    const userId = req.user.id
    const attendees = String(req.query.attendees || '')
      .split(',').map(s => s.trim()).filter(Boolean)
    const title = String(req.query.title || '').trim()

    const [threadsOutcome, docsOutcome] = await Promise.allSettled([
      (async () => {
        if (!attendees.length) return { connected: true, threads: [] }
        const user = await userStore.getById(userId)
        if (!user?.preferences?.gmail?.tokens?.refresh_token) return { connected: false, threads: [] }
        const { searchEmails } = await import('../services/gmail.service.js')
        const q = attendees.map(email => `(from:${email} OR to:${email})`).join(' OR ')
        const threads = await searchEmails(user, q, 6)
        return { connected: true, threads }
      })(),
      (async () => {
        if (!title) return []
        const { memoryService } = await import('../services/memory.service.js')
        const results = await memoryService.recall(title, userId, 5)
        return results
          .map(r => ({
            text: String(r.payload?.text || r.payload?.content || '').slice(0, 200),
            type: r.payload?.type || null,
          }))
          .filter(d => d.text)
      })(),
    ])

    res.json({
      attendees,
      gmailConnected: threadsOutcome.status === 'fulfilled' ? threadsOutcome.value.connected : false,
      threads: threadsOutcome.status === 'fulfilled' ? threadsOutcome.value.threads : [],
      docs: docsOutcome.status === 'fulfilled' ? docsOutcome.value : [],
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/calendar/wrapup?period=day|week — Priorities' "end-of-day
// wrap-up" / "weekly review" card: a short, computed (no AI call needed)
// summary of what got done vs what's still carrying over, from the exact
// same Task + meeting/reminder data Priorities.js already tracks
// client-side (status, the meeting_done:/meeting_cancelled: sentinel task
// rows) — just aggregated here instead of per-render on the client.
router.get('/wrapup', async (req, res) => {
  try {
    const userId = req.user.id
    const period = req.query.period === 'week' ? 'week' : 'day'
    const todayBounds = istDayBounds(0)
    const rangeStart = period === 'week' ? istDayBounds(6).start : todayBounds.start
    const rangeEnd = todayBounds.end

    const [tasksInRange, doneMarkers, cancelledMarkers, meetings] = await Promise.all([
      prisma.task.findMany({ where: { userId, createdAt: { gte: rangeStart, lte: rangeEnd } } }),
      prisma.task.findMany({ where: { userId, title: { startsWith: 'meeting_done:' } } }),
      prisma.task.findMany({ where: { userId, title: { startsWith: 'meeting_cancelled:' } } }),
      getMeetingsForUser(userId, { take: 100 }),
    ])

    const doneMeetingIds = new Set(doneMarkers.map(t => t.title.replace('meeting_done:', '')))
    const cancelledMeetingIds = new Set(cancelledMarkers.map(t => t.title.replace('meeting_cancelled:', '')))

    // Real freeform tasks only — the meeting_done:/meeting_cancelled:
    // sentinel rows and the reminder/meeting "shadow" task rows (same
    // exclusion Priorities.js's own pendingTasks uses) aren't things the
    // user actually typed as a task.
    const realTasks = tasksInRange.filter(t =>
      !/^meeting_(done|cancelled):/i.test(t.title) &&
      !/^(Reminder|Meeting) ·/i.test(t.description || '')
    )
    const tasksDone = realTasks.filter(t => t.status === 'COMPLETED')
    const tasksCarrying = realTasks.filter(t => t.status !== 'COMPLETED')

    const meetingsInRange = meetings.filter(m => {
      const t = new Date(m.start).getTime()
      return t >= rangeStart.getTime() && t <= rangeEnd.getTime()
    })
    const now = Date.now()
    const meetingsDone = meetingsInRange.filter(m => doneMeetingIds.has(m.id) || cancelledMeetingIds.has(m.id))
    // "Carrying over" only applies to something still ahead that hasn't
    // been marked done/cancelled — a past one nobody confirmed yet is
    // "awaiting confirmation" (Priorities.js's own separate state), not
    // something to list as carrying into the next day/week.
    const meetingsCarrying = meetingsInRange.filter(m =>
      !doneMeetingIds.has(m.id) && !cancelledMeetingIds.has(m.id) && new Date(m.start).getTime() >= now
    )

    res.json({
      period,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      completed: {
        count: tasksDone.length + meetingsDone.length,
        tasks: tasksDone.map(t => t.title),
        meetings: meetingsDone.map(m => m.title),
      },
      carryingOver: {
        count: tasksCarrying.length + meetingsCarrying.length,
        tasks: tasksCarrying.map(t => t.title),
        meetings: meetingsCarrying.map(m => m.title),
      },
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/calendar/meetings/:id/end-call — force-ends the live Meet call
// for everyone still on it (not just this device). Manual-trigger first:
// see the UNVERIFIED note on endActiveMeetConference in calendar.service.js
// — this is also how that gets tested against a real connected account
// before any automatic/scheduled version is built on top of it.
router.post('/meetings/:id/end-call', async (req, res) => {
  try {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id } })
    if (!n || n.userId !== req.user.id) return res.status(404).json({ error: 'Meeting not found' })
    let parsed = {}
    try { parsed = JSON.parse(n.message) } catch {}
    if (!parsed.conferenceId) return res.status(400).json({ error: 'No conferenceId stored for this meeting — it may predate this feature.' })
    await endActiveMeetConference(req.user.id, parsed.conferenceId)
    res.json({ success: true })
  } catch (err) { res.status(400).json({ success: false, error: err.message }) }
})

router.get('/events', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const timeMin = req.query.timeMin || new Date().toISOString()
    const timeMax = req.query.timeMax || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const events = await listEvents(user, timeMin, timeMax, 50)
    res.json({ events })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DEBUG: return a safe summary of stored calendar prefs for the authenticated user
router.get('/debug', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id)
    const cal = user?.preferences?.calendar || null
    if (!cal) return res.json({ present: false })
    const keys = cal.tokens ? Object.keys(cal.tokens) : []
    const summary = {
      present: true,
      email: cal.email || null,
      tokensPresent: !!cal.tokens,
      hasRefresh: !!(cal.tokens && cal.tokens.refresh_token),
      hasAccess: !!(cal.tokens && cal.tokens.access_token),
      tokenKeys: keys,
      expiry: cal.tokens?.expiry_date || null,
    }
    res.json({ summary })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
