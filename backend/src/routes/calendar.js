import express from 'express'
import { createCalendarAuthUrl, exchangeCodeForTokens, saveCalendarTokens, listEvents, clearCalendarConnection, createMeetingWithGoogleMeet } from '../services/calendar.service.js'
import { userStore } from '../models/userStore.js'
import { logger } from '../config/logger.js'
import { ledger } from '../services/ledgerService.js'

const router = express.Router()

export async function calendarCallbackHandler(req, res) {
  try {
    const { code, state } = req.query
    if (!code) return res.status(400).send('Missing code')
    // accept URL-safe base64 state or plain JSON
    let decoded = null
    if (state) {
      try {
        let s = state.replace(/-/g, '+').replace(/_/g, '/')
        while (s.length % 4) s += '='
        decoded = JSON.parse(Buffer.from(s, 'base64').toString('utf8'))
      } catch {
        try { decoded = JSON.parse(state) } catch { decoded = null }
      }
    }
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
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/settings?calendar=connected`)
  } catch (err) {
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
    const url = createCalendarAuthUrl(req.user.id, redirectUri)
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
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/meetings', async (req, res) => {
  try {
    const { title, start, end, description, attendees } = req.body
    if (!title || !start) return res.status(400).json({ error: 'title and start are required' })
    const endTime = end || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString()
    const meeting = await createMeetingWithGoogleMeet(req.user.id, { title, start, end: endTime, description, attendees: attendees || [] })
    await ledger.add({
      userId: req.user.id,
      tool: 'schedule_event',
      input: { title, start, end: endTime, description, attendees: attendees || [] },
      result: { success: true, ...meeting },
      status: 'completed',
    })
    const { prisma } = await import('../config/prisma.js')
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: `📅 Meeting scheduled: ${title}`,
        message: JSON.stringify({ source: 'calendar', eventId: meeting.eventId, meetLink: meeting.meetLink || null, preview: title, start, end: endTime, description: description || null, attendees: attendees || [] }),
      },
    })
    res.json({ success: true, meeting })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// GET /api/calendar/meetings — returns scheduled meetings from notifications + live calendar events
router.get('/meetings', async (req, res) => {
  try {
    const { prisma } = await import('../config/prisma.js')
    // Pull from notifications (source of truth for meetings created via Mneva)
    const notifs = await prisma.notification.findMany({
      where: { userId: req.user.id, title: { contains: 'Meeting scheduled' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    // Deduplicate by eventId — keep only the latest notification per event
    const seenEventIds = new Set();
    const dedupedNotifs = notifs.filter(n => {
      let parsed = {};
      try { parsed = JSON.parse(n.message) } catch {}
      const key = parsed.eventId || n.id;
      if (seenEventIds.has(key)) return false;
      seenEventIds.add(key);
      return true;
    });
    const meetings = dedupedNotifs.map(n => {
      let parsed = {}
      try { parsed = JSON.parse(n.message) } catch {}
      return {
        id: n.id,
        title: n.title.replace(/^📅 Meeting scheduled: /, ''),
        start: parsed.start || null,
        end: parsed.end || null,
        meetLink: parsed.meetLink || null,
        description: parsed.description || null,
        attendees: parsed.attendees || [],
        eventId: parsed.eventId || null,
      }
    }).filter(m => m.start)
    res.json(meetings)
  } catch (err) { res.status(500).json({ error: err.message }) }
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
