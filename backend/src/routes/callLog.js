import express from 'express'
import { prisma } from '../config/prisma.js'

export const callLogRouter = express.Router()

// Fixed Asia/Kolkata offset (no DST in India) — same assumption the rest of
// this codebase already makes for "which calendar day is this" questions
// (see medicationDosePoller.js). Returns "YYYY-MM-DD" in IST for an epoch-ms
// timestamp, so "talked on 4 of the last 7 days" means the same thing
// regardless of what timezone the phone itself is set to.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
export function istDayKey(epochMs) {
  return new Date(epochMs + IST_OFFSET_MS).toISOString().slice(0, 10)
}

// A contact counts as "frequent" once at least MIN_DAYS of the last
// WINDOW_DAYS calendar days show a call — "almost every day", not just
// "called a few times ever". Recomputed on every sync.
const FREQUENT_WINDOW_DAYS = 7
const FREQUENT_MIN_DAYS = 4
// callDates keeps only this many of the most recent distinct days — a
// rolling window for judging cadence, not a call history archive.
const ROLLING_WINDOW_DAYS = 30

function lastNDayKeys(n, fromMs = Date.now()) {
  const keys = []
  for (let i = 0; i < n; i++) keys.push(istDayKey(fromMs - i * 24 * 60 * 60 * 1000))
  return keys
}

// Strips everything but digits and keeps the last 10 — enough to match the
// same Indian mobile number across differently-formatted call log entries
// (+91, leading 0, spaces/dashes) without needing a full libphonenumber
// dependency for what's otherwise just a grouping key.
function normalizeNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return null
  return digits.slice(-10)
}

// Shared by POST /sync below and anything else that needs the same
// "merge these raw call-log rows into CallContact" logic (kept as a
// function, not inlined in the route, for that reason).
export async function syncCallLogEntries(userId, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return { contactsTouched: 0 }

  const byNumber = new Map()
  for (const e of entries) {
    const number = normalizeNumber(e?.number)
    // Calls with no number at all (private/withheld) can't be attributed
    // to a contact, so there's nothing to track them against.
    if (!number) continue
    const dateMs = Number(e?.date)
    if (!Number.isFinite(dateMs) || dateMs <= 0) continue
    if (!byNumber.has(number)) byNumber.set(number, [])
    byNumber.get(number).push({ dateMs, name: e?.name ? String(e.name).trim() : null })
  }
  if (byNumber.size === 0) return { contactsTouched: 0 }

  const existing = await prisma.callContact.findMany({
    where: { userId, phoneNumber: { in: [...byNumber.keys()] } },
  })
  const existingByNumber = new Map(existing.map((c) => [c.phoneNumber, c]))
  const recentKeys = new Set(lastNDayKeys(FREQUENT_WINDOW_DAYS))

  const writes = []
  for (const [number, rows] of byNumber) {
    const prev = existingByNumber.get(number)
    const prevDates = Array.isArray(prev?.callDates) ? prev.callDates : []
    const newDates = rows.map((r) => istDayKey(r.dateMs))
    const mergedDates = [...new Set([...prevDates, ...newDates])].sort().slice(-ROLLING_WINDOW_DAYS)

    const maxDateMs = Math.max(...rows.map((r) => r.dateMs))
    const lastCallAt = prev?.lastCallAt && prev.lastCallAt.getTime() > maxDateMs ? prev.lastCallAt : new Date(maxDateMs)
    // Prefer a real name over one we've already stored, but never overwrite
    // a known name with a blank one from an unsaved-number call.
    const contactName = rows.find((r) => r.name)?.name || prev?.contactName || null
    const isFrequent = mergedDates.filter((d) => recentKeys.has(d)).length >= FREQUENT_MIN_DAYS

    writes.push(prisma.callContact.upsert({
      where: { userId_phoneNumber: { userId, phoneNumber: number } },
      create: {
        userId, phoneNumber: number, contactName,
        callDates: mergedDates, lastCallAt, totalCalls: rows.length, isFrequent,
      },
      update: {
        contactName, callDates: mergedDates, lastCallAt,
        totalCalls: { increment: rows.length }, isFrequent,
      },
    }))
  }

  await prisma.$transaction(writes)
  return { contactsTouched: writes.length }
}

callLogRouter.post('/sync', async (req, res) => {
  try {
    const { entries } = req.body
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries must be an array' })
    // A single device sync batch should never be unbounded -- 2000 covers
    // even a first-ever sync of 30 days of a busy phone's call log with
    // plenty of headroom, while still capping worst-case request size.
    if (entries.length > 2000) return res.status(400).json({ error: 'Too many entries in one sync — send in smaller batches.' })

    const result = await syncCallLogEntries(req.user.id, entries)
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

callLogRouter.post('/disable', async (req, res) => {
  try {
    // Turning the feature off deletes what was synced, rather than leaving
    // it to quietly go stale — re-enabling later starts a fresh picture
    // instead of resuming from old call patterns.
    await prisma.callContact.deleteMany({ where: { userId: req.user.id } })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
