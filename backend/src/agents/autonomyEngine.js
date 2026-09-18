import { logger } from '../config/logger.js'
import { ledger } from '../services/ledgerService.js'
import { prisma } from '../config/prisma.js'
import { emitToUser } from '../services/realtime.js'
import { applyModelCompat } from '../services/openaiCompat.js'
import { memoryService } from '../services/memory.service.js'
import { getAutonomyPolicy, decideGate, blockedMessage, executeSendEmailSideEffect, executePaymentSideEffect, createPendingAction } from '../services/pendingActions.service.js'
import { getBodyMetricsForActivity, metForActivity, computeBmi, computeDistanceKmFromSteps, computeStepsFromDistanceKm, computeCaloriesBurned, getLatestKnownField } from '../services/activityCalc.js'

function validTimeZone(value) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return value
  } catch {
    return 'Asia/Kolkata'
  }
}

function timeZoneOffsetAt(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
  const localAsUtc = Date.UTC(parts.year, Number(parts.month) - 1, parts.day, parts.hour, parts.minute, parts.second)
  return localAsUtc - date.getTime()
}

// Tool calls often contain a local ISO value without an offset. Node parses
// that in the server timezone (UTC on Render), which shifts the user's alarm.
export function normalizeScheduledTime(value, timeZone) {
  const raw = String(value || '').trim()
  if (!raw) return null

  // Offset/Z timestamps already identify an exact instant.
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const instant = new Date(raw)
    return Number.isNaN(instant.getTime()) ? null : instant
  }

  // Some tool calls or UI inputs pass ISO-ish values without timezone offsets.
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (isoMatch) {
    const [, year, month, day, hour, minute, second = '0'] = isoMatch
    const utcGuess = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second))
    let instant = new Date(utcGuess.getTime() - timeZoneOffsetAt(utcGuess, timeZone))
    // Recalculate once to handle daylight-saving transitions in non-Indian zones.
    instant = new Date(utcGuess.getTime() - timeZoneOffsetAt(instant, timeZone))
    return Number.isNaN(instant.getTime()) ? null : instant
  }

  // Handle natural-language phrases like 'today 6:30 pm', 'tomorrow 9am',
  // 'next Monday 2:15 pm', 'in 2 hours', etc.
  const lower = raw.toLowerCase()
  const now = new Date()
  const baseDate = new Date(now)

  const relativeHourMatch = lower.match(/in\s+(\d+)\s*hours?/) || lower.match(/\+(\d+)\s*hours?/) || lower.match(/after\s+(\d+)\s*hours?/)
  if (relativeHourMatch) {
    const hours = Number(relativeHourMatch[1])
    const instant = new Date(now.getTime() + hours * 60 * 60 * 1000)
    return Number.isNaN(instant.getTime()) ? null : instant
  }

  const relativeMinuteMatch = lower.match(/in\s+(\d+)\s*minutes?/) || lower.match(/\+(\d+)\s*minutes?/) || lower.match(/after\s+(\d+)\s*minutes?/)
  if (relativeMinuteMatch) {
    const minutes = Number(relativeMinuteMatch[1])
    const instant = new Date(now.getTime() + minutes * 60 * 1000)
    return Number.isNaN(instant.getTime()) ? null : instant
  }

  const timeMatch = raw.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  let hour = 9
  let minute = 0
  if (timeMatch) {
    hour = Number(timeMatch[1])
    minute = Number(timeMatch[2] || '0')
    const meridiem = (timeMatch[3] || '').toLowerCase()
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
  }

  const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  const dayKeywordMap = {
    today: 0,
    tomorrow: 1,
  }

  let targetDate = new Date(baseDate)
  let matchedDay = false

  for (const [keyword, offsetDays] of Object.entries(dayKeywordMap)) {
    if (lower.includes(keyword)) {
      targetDate.setDate(baseDate.getDate() + offsetDays)
      matchedDay = true
      break
    }
  }

  if (!matchedDay && /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(lower)) {
    const currentDay = new Date(baseDate).getDay()
    const targetIndex = weekdays.findIndex((day) => lower.includes(day))
    if (targetIndex >= 0) {
      let diff = (targetIndex - currentDay + 7) % 7
      if (diff === 0 && now.getHours() >= hour) diff = 7
      targetDate.setDate(new Date(baseDate).getDate() + diff)
      matchedDay = true
    }
  }

  if (matchedDay) {
    targetDate.setHours(hour, minute, 0, 0)
    if (targetDate.getTime() <= now.getTime()) {
      targetDate = new Date(targetDate)
      targetDate.setDate(targetDate.getDate() + 1)
      targetDate.setHours(hour, minute, 0, 0)
    }
    return Number.isNaN(targetDate.getTime()) ? null : targetDate
  }

  if (lower.includes('today')) {
    targetDate = new Date(baseDate)
    targetDate.setHours(hour, minute, 0, 0)
    if (targetDate.getTime() <= now.getTime()) {
      targetDate.setDate(targetDate.getDate() + 1)
    }
    return targetDate
  }

  if (lower.includes('tomorrow')) {
    targetDate = new Date(baseDate)
    targetDate.setDate(targetDate.getDate() + 1)
    targetDate.setHours(hour, minute, 0, 0)
    return targetDate
  }

  return null
}

async function getUserTimeZone(userId) {
  const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { timezone: true } }).catch(() => null)
  return validTimeZone(profile?.timezone || 'Asia/Kolkata')
}

function actionIdentity(name, input = {}) {
  if (name === 'set_reminder') return `${name}:${String(input.message || '').trim().toLowerCase()}:${input.time || ''}`
  if (name === 'schedule_event') return `${name}:${String(input.title || '').trim().toLowerCase()}:${input.start || ''}`
  return null
}

// The model's prose is not a record of an action.  Explicitly require the
// corresponding tool on direct create requests, otherwise a fluent text-only
// reply can incorrectly say "reminder set" without creating a Task.
export function requestedSchedulingTool(messages = []) {
  const userMessages = messages.filter(message => message?.role === 'user')
  const latestText = String(userMessages[userMessages.length - 1]?.content || '').trim()
  const text = latestText.toLowerCase()

  if (!text || /^(hi|hello|hey|hii|hey there|good morning|good evening|good afternoon|namaste|hi there)$/i.test(text)) {
    return null
  }

  if (/\b(remind me|set (?:a )?reminder|create (?:a )?reminder|add (?:a )?reminder|alert me|set (?:an )?alert)\b/.test(text)) {
    return 'set_reminder'
  }
  if (/\b(schedule|create|set up|book|add)\b[\s\S]{0,100}\b(meeting|appointment|calendar event|event)\b|\b(meeting|appointment|calendar event)\b[\s\S]{0,100}\b(schedule|create|set up|book|add)\b/.test(text)) {
    return 'schedule_event'
  }
  return null
}

// Keep the confirmation after a scheduling action grounded in the tool
// results.  A model-written "updated schedule for today" can accidentally
// blend old and future reminders into one list.  This only reports the items
// successfully created by the current request and groups them by their real
// calendar day.
function formatScheduledActionConfirmation(results = [], timeZone = 'Asia/Kolkata') {
  const entries = results
    .filter(entry => ['set_reminder', 'schedule_event'].includes(entry.tool) && entry.result?.success)
    .map((entry) => ({
      title: entry.tool === 'set_reminder' ? entry.result.message : entry.input.title,
      scheduledAt: entry.result.scheduled || entry.input.start,
      kind: entry.tool === 'set_reminder' ? 'Reminder' : 'Meeting',
    }))
    .filter(entry => entry.title && entry.scheduledAt && !Number.isNaN(new Date(entry.scheduledAt).getTime()))

  if (!entries.length) return null

  const dayKey = (date) => new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
  const today = new Date()
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
  const todayKey = dayKey(today)
  const tomorrowKey = dayKey(tomorrow)
  const groups = new Map()

  entries.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).forEach((entry) => {
    const date = new Date(entry.scheduledAt)
    const key = dayKey(date)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  })

  const dateLabel = (date) => {
    const key = dayKey(date)
    if (key === todayKey) return 'Today'
    if (key === tomorrowKey) return 'Tomorrow'
    return new Intl.DateTimeFormat('en-IN', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  }
  const timeLabel = (date) => new Intl.DateTimeFormat('en-IN', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date)
  const total = entries.length
  const lines = [`${total === 1 ? `${entries[0].kind} set` : `${total} schedule items set`} successfully.`]
  for (const group of groups.values()) {
    lines.push(`\n${dateLabel(new Date(group[0].scheduledAt))}`)
    group.forEach(item => lines.push(`• ${item.title} — ${timeLabel(new Date(item.scheduledAt))}`))
  }
  return lines.join('\n')
}

function calendarDayKey(value, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))
}

export function formatLeadMinutes(minutes) {
  if (minutes < 60) return `${minutes} min`
  if (minutes % 60 === 0) return `${minutes / 60} hr${minutes / 60 !== 1 ? 's' : ''}`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatTodaySchedule(schedule = [], timeZone = 'Asia/Kolkata') {
  const todayKey = calendarDayKey(new Date(), timeZone)
  const title = `Today's schedule`
  if (!schedule.length) return `${title}\n\nNo reminders or meetings are scheduled for today.`
  const time = (value) => new Intl.DateTimeFormat('en-IN', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(value))
  const items = [...schedule].sort((a, b) => new Date(a.start) - new Date(b.start))
  // This guard keeps the response correct even if a caller accidentally
  // supplies a record from another calendar day.
  const todayItems = items.filter(item => calendarDayKey(item.start, timeZone) === todayKey)
  if (!todayItems.length) return `${title}\n\nNo reminders or meetings are scheduled for today.`
  return `${title}\n\n${todayItems.map(item => `• ${item.title} — ${time(item.start)}`).join('\n')}`
}

export function isOpenAIConfigured(apiKey = process.env.OPENAI_API_KEY) {
  const value = String(apiKey || '').trim()
  if (!value) return false
  const placeholderPatterns = [/replace/i, /your-key/i, /example/i, /placeholder/i, /dummy/i]
  if (placeholderPatterns.some(p => p.test(value))) return false
  return value.startsWith('sk-')
}

function getOpenAIErrorMessage(error) {
  const detail = error?.message || error?.error?.message || ''
  const lower = String(detail).toLowerCase()
  if (lower.includes('insufficient_quota') || lower.includes('billing')) {
    return 'OpenAI rejected the request due to insufficient quota. Check your billing at platform.openai.com.'
  }
  if (lower.includes('invalid api key') || lower.includes('authentication') || lower.includes('unauthorized')) {
    return 'OpenAI rejected the request because the API key is invalid or expired.'
  }
  return detail || 'Unknown OpenAI error'
}

async function callOpenAI({ model, system, messages, tools, toolChoice = null }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!isOpenAIConfigured(apiKey)) return null

  let payload = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map(message => ({
        role: message.role,
        content: typeof message.content === 'string'
          ? message.content
          : (Array.isArray(message.content)
            ? message.content.map(part => {
                if (part.type === 'text') return { type: 'text', text: part.text || '' }
                return part
              })
            : ''),
      })),
    ],
  }
  payload = applyModelCompat(payload, { temperature: 0.2 })

  if (Array.isArray(tools) && tools.length) {
    payload.tools = tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema || { type: 'object', properties: {}, required: [] },
      },
    }))
  }
  if (toolChoice) payload.tool_choice = { type: 'function', function: { name: toolChoice } }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI API error ${response.status}`
    throw new Error(message)
  }

  const choice = data.choices?.[0]
  const message = choice?.message ?? {}
  const content = []

  if (typeof message.content === 'string' && message.content.trim()) {
    content.push({ type: 'text', text: message.content })
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part?.type === 'text' && part.text) {
        content.push({ type: 'text', text: part.text })
      }
    }
  }

  if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
    for (const toolCall of message.tool_calls) {
      let parsedInput = {}
      try {
        parsedInput = JSON.parse(toolCall.function?.arguments || '{}')
      } catch {
        parsedInput = { raw: toolCall.function?.arguments || '' }
      }

      content.push({
        type: 'tool_use',
        id: toolCall.id || `tool_${Date.now()}`,
        name: toolCall.function?.name,
        input: parsedInput,
      })
    }
  }

  return {
    content,
    stop_reason: Array.isArray(message.tool_calls) && message.tool_calls.length ? 'tool_use' : (choice?.finish_reason || 'end_turn'),
    raw: data,
  }
}

// ── Data-entry helpers (Finance/Family record-creation tools) ───────────────
// These exist so the agent can ask for as few fields as possible — anything
// a bank/lender would compute automatically (an EMI amount, a maturity
// value, a next billing date) gets computed here instead of turned into
// another question for the user.

// Reducing-balance EMI formula — the same math a bank would use to quote it.
function computeEmi(principal, annualRatePercent, months) {
  const p = Number(principal)
  const n = Number(months)
  const r = Number(annualRatePercent || 0) / 12 / 100
  if (!p || !n || n <= 0) return null
  if (!r) return Math.round((p / n) * 100) / 100
  const factor = Math.pow(1 + r, n)
  return Math.round(((p * r * factor) / (factor - 1)) * 100) / 100
}

// Compound-interest maturity value for a Fixed Deposit.
function computeFdMaturity(principal, annualRatePercent, months, compoundingFrequency = 'Quarterly') {
  const p = Number(principal)
  const monthsNum = Number(months)
  const rate = Number(annualRatePercent)
  if (!p || !monthsNum || !rate) return null
  const compoundsPerYear = { Monthly: 12, Quarterly: 4, 'Half-Yearly': 2, Yearly: 1, Cumulative: 4 }[compoundingFrequency] || 4
  const years = monthsNum / 12
  const amount = p * Math.pow(1 + rate / 100 / compoundsPerYear, compoundsPerYear * years)
  return Math.round(amount * 100) / 100
}

function addMonthsToDate(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + Number(months))
  return d
}

function nextBillingDateFor(startDate, billingCycle) {
  const start = new Date(startDate)
  if (billingCycle === 'Weekly') {
    const d = new Date(start)
    d.setDate(d.getDate() + 7)
    return d
  }
  const monthsMap = { Monthly: 1, Quarterly: 3, 'Half-Yearly': 6, Yearly: 12 }
  return addMonthsToDate(start, monthsMap[billingCycle] || 1)
}

function parseFlexibleDate(value, fallback = new Date()) {
  if (!value) return fallback
  const d = new Date(value)
  return isNaN(d.getTime()) ? fallback : d
}

// Resolves a spoken name/email ("mom", "priya@x.com", "myself") to one of
// the user's ACCEPTED family connections — creating a FamilyTask needs a
// real connectionId + assigneeId, which only exist once two accounts are
// actually linked (Family → Connections), so this can legitimately fail.
async function resolveFamilyConnection(userId, assigneeName) {
  const connections = await prisma.familyConnection.findMany({
    where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { receiverId: userId }] },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      receiver: { select: { id: true, name: true, email: true } },
    },
  })
  if (!connections.length) return { error: 'no_connections' }

  const withPartner = connections.map((c) => ({
    connectionId: c.id,
    partner: c.requesterId === userId ? c.receiver : c.requester,
  }))

  if (!assigneeName || /^(me|myself|i|self)$/i.test(assigneeName.trim())) {
    return { connectionId: withPartner[0].connectionId, assigneeId: userId }
  }
  const needle = assigneeName.trim().toLowerCase()
  const match = withPartner.find(({ partner }) =>
    partner.name?.toLowerCase().includes(needle) || partner.email?.toLowerCase().includes(needle)
  )
  if (!match) return { error: 'not_found', available: withPartner.map((w) => w.partner.name || w.partner.email) }
  return { connectionId: match.connectionId, assigneeId: match.partner.id }
}

// Required sub-fields per FamilyItem domain+type — mirrors exactly what each
// manual-entry screen (ChildrenActivities.js, HomeMaintenance.js,
// CelebrationGifting.js, FamilyCalendar.js) collects, so an AI-created item
// looks identical to a hand-entered one.
const FAMILY_ITEM_REQUIRED_FIELDS = {
  children: { child: ['name'], activity: ['name', 'day'], event: ['title', 'date'] },
  home: { task: ['title'], contact: ['name'], warranty: ['item'] },
  celebration: { occasion: ['person', 'date'], gift: ['person', 'item'] },
  calendar: { event: ['title', 'date'] },
}

// Code-level guard for every data-entry tool's required fields — the system
// prompt already tells the model to ask the user before calling these with
// something missing, but a model doesn't always comply (observed: it once
// called add_parent_medication with an empty med_name and a guessed
// "Father", saving a broken record instead of asking). This makes an
// incomplete call fail loudly with a specific list of what's missing, so the
// agent loop is forced to relay that back as a real question instead of
// silently writing bad data.
function missingRequired(input, fieldSpecs) {
  return fieldSpecs.filter(([key]) => {
    const v = input[key]
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
  }).map(([, label]) => label)
}

// ── 13 Domain Tools (matching pitch deck capabilities) ──────────────────────
export const MNEVA_TOOLS = [
  {
    name: 'get_daily_brief',
    description: 'Generate the morning brief ONLY when the user explicitly asks for their daily brief, morning summary, what is pending today, or what needs attention. Do NOT call this for reminders, scheduling, or any other request.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_full_summary',
    description: 'Generate a COMPLETE cross-module summary spanning Communications (urgent emails, unread alerts), Priorities (pending tasks), Family (family tasks, medication refills, pet reminders, upcoming family events), Health (today\'s logged metrics), and Finance (bills/EMIs/subscriptions due soon, maturing fixed deposits). Use this ONLY when the user explicitly asks for everything important, a full/complete summary, or "what all is going on across everything" — not for a single-domain question, which should use the domain-specific tool instead (get_emails, get_health_data, query_bills, get_daily_brief, etc.).',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'query_bills',
    description: 'Fetch upcoming utility, telecom, credit card, and housing bills with due dates and payment status.',
    input_schema: { type: 'object', properties: { filter: { type: 'string', enum: ['all','due_soon','pending','paid'], description: 'Filter bills by status' } }, required: ['filter'] }
  },
  {
    name: 'initiate_payment',
    description: 'Initiate a UPI bill payment. Returns a pending action requiring user approval + biometric for amounts ≥ ₹1,000.',
    input_schema: { type: 'object', properties: { bill_id: { type: 'string' }, amount: { type: 'number' }, payee: { type: 'string' }, note: { type: 'string' } }, required: ['bill_id', 'amount', 'payee'] }
  },
  {
    name: 'get_portfolio',
    description: 'Fetch investment portfolio: mutual funds, equities, SIPs, account balances, CIBIL score, net worth via Account Aggregator.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_spending_summary',
    description: 'Fetch category-wise spending breakdown with insights and savings rate.',
    input_schema: { type: 'object', properties: { period: { type: 'string', enum: ['today','week','month','last_month'] } }, required: ['period'] }
  },
  {
    name: 'get_emails',
    description: 'Fetch inbox emails with smart filtering. Returns summaries, unread count, follow-up radar.',
    input_schema: { type: 'object', properties: { filter: { type: 'string', enum: ['all','unread','important'] }, limit: { type: 'number' } }, required: ['filter'] }
  },
  {
    name: 'draft_reply',
    description: 'Generate a context-aware email reply draft that matches the user\'s writing style and tone.',
    input_schema: { type: 'object', properties: { email_id: { type: 'string' }, instruction: { type: 'string', description: 'Optional tone or content instructions' } }, required: ['email_id'] }
  },
  {
    name: 'send_email',
    description: 'Send an approved email draft. Requires trust level ≥ 2.',
    input_schema: { type: 'object', properties: { email_id: { type: 'string' }, draft: { type: 'string' }, recipient: { type: 'string' } }, required: ['email_id', 'draft', 'recipient'] }
  },
  {
    name: 'get_health_data',
    description: 'Fetch health metrics (heart rate, steps, sleep, calories), appointments, and medication tracker.',
    input_schema: { type: 'object', properties: { include: { type: 'array', items: { type: 'string', enum: ['metrics','appointments','medications'] } } }, required: ['include'] }
  },
  {
    name: 'book_cab',
    description: 'Book a cab via Ola/Uber. Returns booking details with driver info and estimated fare.',
    input_schema: { type: 'object', properties: { pickup: { type: 'string' }, destination: { type: 'string' }, pickup_time: { type: 'string' }, cab_type: { type: 'string', enum: ['mini','sedan','xl','auto','bike'] } }, required: ['pickup', 'destination', 'cab_type'] }
  },
  {
    name: 'order_food',
    description: 'Place a food order via Swiggy or Zomato.',
    input_schema: { type: 'object', properties: { restaurant: { type: 'string' }, items: { type: 'array', items: { type: 'string' } }, platform: { type: 'string', enum: ['swiggy','zomato'] }, address: { type: 'string' } }, required: ['restaurant', 'items', 'platform'] }
  },
  {
    name: 'set_reminder',
    description: 'Set a reminder or commitment tracker entry. time must be a complete future ISO datetime; include a UTC offset when known (e.g. 2026-07-08T10:00:00+05:30), never a time-only value.',
    input_schema: { type: 'object', properties: { message: { type: 'string' }, time: { type: 'string', description: 'Future ISO datetime, e.g. 2026-07-08T10:00:00+05:30' }, repeat: { type: 'string', enum: ['once','daily','weekly','monthly'] }, domain: { type: 'string' } }, required: ['message', 'time'] }
  },
  {
    name: 'schedule_event',
    description: 'Schedule a meeting, event, or appointment on Google Calendar. Use this when the user wants to create a calendar event, schedule a meeting, or block time.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title / meeting name' },
        start: { type: 'string', description: 'Future start datetime in ISO format with UTC offset, e.g. 2026-07-08T10:00:00+05:30' },
        end: { type: 'string', description: 'End datetime in ISO format with UTC offset. If not provided, defaults to 1 hour after start.' },
        description: { type: 'string', description: 'Optional event description or agenda' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Optional list of attendee email addresses' },
      },
      required: ['title', 'start']
    }
  },
  {
    name: 'get_connected_accounts',
    description: 'Get the status of all connected accounts and integrations — Gmail, Google Calendar, Google Drive, Google Contacts, Google Fit, Google Tasks. Use this when the user asks which accounts are connected, what is linked, or about their integrations.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'personal_search',
    description: 'Search across the user\'s connected data — emails, payments, commitments, health records, documents.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, domains: { type: 'array', items: { type: 'string' } } }, required: ['query'] }
  },
  {
    name: 'search_contacts',
    description: 'Search the user\'s Google Contacts by name, email, or phone. Use when user asks to find a contact, look up someone, or get contact details.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Name, email, or phone to search for' } }, required: ['query'] }
  },
  {
    name: 'get_contact',
    description: 'Get full details of a specific contact by their resource name (id). Use after search_contacts to get complete info.',
    input_schema: { type: 'object', properties: { resource_name: { type: 'string', description: 'Contact resource name e.g. people/c12345' } }, required: ['resource_name'] }
  },

  // ── Data-entry tools: Finance / Health / Family ──────────────────────────
  // For every tool below: only the `required` fields are things the model
  // cannot reasonably guess or compute — ask the user for exactly those
  // before calling the tool, never invent a value for one. Every other
  // field is genuinely optional; either omit it or fill it if the user
  // volunteered it. Several numeric fields (EMI amount, FD maturity value,
  // next billing date) are computed automatically when left out.
  {
    name: 'create_subscription',
    description: 'Add a recurring subscription (Netflix, Spotify, SaaS tool, gym membership, etc.) to Finance → Subscriptions.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Subscription name, e.g. "Netflix"' },
        category: { type: 'string', enum: ['Streaming', 'Software', 'Cloud', 'Gaming', 'News', 'Fitness', 'Education', 'Other'] },
        amount: { type: 'number', description: 'Amount charged per billing cycle' },
        billing_cycle: { type: 'string', enum: ['Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'], description: 'Defaults to Monthly' },
        provider: { type: 'string' },
        start_date: { type: 'string', description: 'ISO date the subscription started. Defaults to today.' },
        payment_method: { type: 'string', enum: ['Card', 'Bank', 'UPI', 'Wallet', 'Other'] },
        auto_renewal: { type: 'boolean', description: 'Defaults to true' },
        notes: { type: 'string' },
      },
      required: ['name', 'category', 'amount'],
    },
  },
  {
    name: 'create_loan',
    description: 'Add a loan (personal, home, car, education, business, gold, etc.) to Finance → Loans.',
    input_schema: {
      type: 'object',
      properties: {
        loan_type: { type: 'string', enum: ['Personal Loan', 'Home Loan', 'Car Loan', 'Education Loan', 'Business Loan', 'Gold Loan', 'Other'] },
        lender_name: { type: 'string', description: 'Bank or lender name' },
        principal_amount: { type: 'number', description: 'Original loan amount' },
        interest_rate: { type: 'number', description: 'Annual interest rate, %' },
        number_of_emis: { type: 'number', description: 'Total loan tenure in months' },
        name: { type: 'string', description: 'A short label for this loan. Defaults to "<loan_type> from <lender_name>".' },
        outstanding_amount: { type: 'number', description: 'Amount still owed. Defaults to the full principal (nothing paid yet).' },
        interest_type: { type: 'string', enum: ['Fixed', 'Floating'], description: 'Defaults to Fixed' },
        interest_calculation: { type: 'string', enum: ['Reducing Balance', 'Flat Rate'], description: 'Defaults to Reducing Balance' },
        emi_frequency: { type: 'string', enum: ['Monthly', 'Bi-weekly', 'Quarterly'], description: 'Defaults to Monthly' },
        emi_amount: { type: 'number', description: 'Monthly EMI amount. Computed automatically from principal/rate/tenure if omitted.' },
        loan_start_date: { type: 'string', description: 'ISO date the loan started. Defaults to today.' },
        account_number: { type: 'string' },
        auto_debit: { type: 'boolean' },
        notes: { type: 'string' },
      },
      required: ['loan_type', 'lender_name', 'principal_amount', 'interest_rate', 'number_of_emis'],
    },
  },
  {
    name: 'create_emi',
    description: 'Add an EMI plan (product/credit-card/other EMI, distinct from a bank Loan) to Finance → EMIs.',
    input_schema: {
      type: 'object',
      properties: {
        emi_type: { type: 'string', enum: ['Loan EMI', 'Credit Card EMI', 'Product EMI', 'Other'] },
        provider: { type: 'string', description: 'Bank, card issuer, or store financing this EMI' },
        total_amount: { type: 'number', description: 'Total price being paid off' },
        number_of_installments: { type: 'number' },
        name: { type: 'string', description: 'Defaults to "<emi_type> - <product_name or provider>".' },
        product_name: { type: 'string' },
        down_payment: { type: 'number', description: 'Defaults to 0' },
        interest_rate: { type: 'number', description: 'Annual %, defaults to 0 (no-cost EMI)' },
        emi_amount: { type: 'number', description: 'Computed automatically from the financed amount/rate/installments if omitted.' },
        frequency: { type: 'string', enum: ['Monthly', 'Bi-weekly', 'Quarterly'], description: 'Defaults to Monthly' },
        payment_method: { type: 'string', enum: ['Card', 'Bank', 'UPI', 'Wallet', 'Other'] },
        start_date: { type: 'string', description: 'Defaults to today' },
        auto_debit: { type: 'boolean' },
        notes: { type: 'string' },
      },
      required: ['emi_type', 'provider', 'total_amount', 'number_of_installments'],
    },
  },
  {
    name: 'create_fixed_deposit',
    description: 'Add a bank Fixed Deposit to Finance → Fixed Deposits.',
    input_schema: {
      type: 'object',
      properties: {
        bank_name: { type: 'string' },
        principal_amount: { type: 'number' },
        interest_rate: { type: 'number', description: 'Annual %' },
        maturity_date: { type: 'string', description: 'ISO date. Provide this OR tenure_months.' },
        tenure_months: { type: 'number', description: 'Used to compute maturity_date if that is not given.' },
        name: { type: 'string', description: 'Defaults to "FD - <bank_name>".' },
        start_date: { type: 'string', description: 'Defaults to today' },
        compounding_frequency: { type: 'string', enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'Cumulative'], description: 'Defaults to Quarterly' },
        interest_payout: { type: 'string', enum: ['On Maturity', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'], description: 'Defaults to On Maturity' },
        account_number: { type: 'string' },
        nominee: { type: 'string' },
        auto_renewal: { type: 'boolean' },
        notes: { type: 'string' },
      },
      required: ['bank_name', 'principal_amount', 'interest_rate'],
    },
  },
  {
    name: 'add_portfolio_holding',
    description: 'Add an investment holding (stock, mutual fund, SIP, ETF, bonds, gold, crypto, etc.) to Finance → Portfolio. There is no live market-data feed — prices/values are whatever the user states, not fetched.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'e.g. "Reliance Industries", "HDFC Flexi Cap Fund"' },
        type: { type: 'string', enum: ['Stock', 'Mutual Fund', 'SIP', 'ETF', 'Bonds', 'Gold', 'Crypto', 'Fixed Income', 'Other'] },
        invested_amount: { type: 'number', description: 'Total amount invested' },
        current_value: { type: 'number', description: 'Current value. Defaults to invested_amount if not stated (assumes no gain/loss yet).' },
        platform: { type: 'string', enum: ['Groww', 'Zerodha', 'Angel One', 'Upstox', 'Kite', 'Other'] },
        quantity: { type: 'number', description: 'Units/shares held' },
        avg_buy_price: { type: 'number', description: 'Per unit' },
        current_price: { type: 'number', description: 'Per unit' },
        purchase_date: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name', 'type', 'invested_amount'],
    },
  },
  {
    name: 'log_health_data',
    description: 'Log manual health metrics (Activity, Body, Vitals, or Nutrition) for today into the Health module. Accepts any combination of metrics — provide at least one.',
    input_schema: {
      type: 'object',
      properties: {
        steps: { type: 'number' },
        heart_rate: { type: 'number' },
        blood_pressure_systolic: { type: 'number' },
        blood_pressure_diastolic: { type: 'number' },
        blood_oxygen: { type: 'number' },
        weight: { type: 'number', description: 'kg' },
        height: { type: 'number', description: 'cm' },
        bmi: { type: 'number' },
        body_fat: { type: 'number', description: '%' },
        muscle_mass: { type: 'number', description: 'kg' },
        waist: { type: 'number', description: 'cm' },
        body_temp: { type: 'number', description: '°F' },
        sleep: { type: 'number', description: 'Hours slept' },
        calories: { type: 'number' },
        protein: { type: 'number', description: 'grams' },
        carbs: { type: 'number', description: 'grams' },
        fat: { type: 'number', description: 'grams' },
        fiber: { type: 'number', description: 'grams' },
        water: { type: 'number', description: 'Liters' },
        active_minutes: { type: 'number' },
        workout_type: { type: 'string', description: 'e.g. walking, running, cycling, swimming, yoga, gym/strength' },
        workout_duration: { type: 'number', description: 'Minutes' },
        workout_calories: { type: 'number', description: 'Calories burned. If omitted, this is estimated automatically from steps/distance/duration and the user\'s own weight — do not calculate it yourself, just pass whatever the user actually gave (steps, workout_type, workout_duration, distance) and leave this out.' },
        distance: { type: 'number', description: 'km. If omitted but steps are given, this is estimated automatically from the user\'s own height — do not calculate it yourself.' },
      },
      required: [],
    },
  },
  {
    name: 'add_parent_medication',
    description: 'Add a parent/elder\'s medication tracker entry to Family → Parent Medication.',
    input_schema: {
      type: 'object',
      properties: {
        parent: { type: 'string', enum: ['Dad', 'Mom', 'Both'] },
        med_name: { type: 'string' },
        dosage: { type: 'string', description: 'e.g. "500mg", "1 tablet"' },
        frequency: { type: 'string', enum: ['Once daily', 'Twice daily', 'Thrice daily', 'Every 8 hrs', 'Weekly', 'As needed'] },
        dose_times: { type: 'array', items: { type: 'string' }, description: '24h "HH:mm" times, e.g. ["08:00","20:00"]' },
        meal_time: { type: 'string', enum: ['Before meal', 'After meal', 'With meal', 'Empty stomach'] },
        doctor: { type: 'string' },
        duration: { type: 'string', description: 'e.g. "7 days", "Ongoing"' },
        refill_date: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['parent', 'med_name', 'dosage', 'frequency'],
    },
  },
  {
    name: 'create_family_task',
    description: 'Add a shared family task to Family → Tasks. Requires the user to already have at least one accepted family connection (Family → Connections) — if they don\'t, tell them to add one there first.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        assignee_name: { type: 'string', description: 'Name/email of the connected family member this is for, or "myself". Defaults to myself.' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Urgent'] },
        category: { type: 'string' },
        due_date: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_pet',
    description: 'Add a new pet profile to Family → Pet Care.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        species: { type: 'string', enum: ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish', 'Other'] },
        breed: { type: 'string' },
        sex: { type: 'string', enum: ['Male', 'Female'] },
        dob: { type: 'string' },
        weight: { type: 'string' },
      },
      required: ['name', 'species'],
    },
  },
  {
    name: 'add_pet_reminder',
    description: 'Add a reminder (vet visit, vaccine, grooming, medication) for an existing pet in Family → Pet Care.',
    input_schema: {
      type: 'object',
      properties: {
        pet_name: { type: 'string', description: 'Name of the existing pet this reminder is for' },
        type: { type: 'string', enum: ['Vaccination', 'Medication', 'Grooming', 'Vet Appointment', 'Feeding'] },
        title: { type: 'string', description: 'e.g. "Rabies booster"' },
        remind_at: { type: 'string', description: 'Future ISO datetime with offset, e.g. 2026-09-25T09:00:00+05:30' },
        notes: { type: 'string' },
      },
      required: ['pet_name', 'type', 'title', 'remind_at'],
    },
  },
  {
    name: 'add_family_item',
    description: `Add an item to a family module — pick domain + type, then fill "fields" with exactly the keys listed below (all as strings). Wherever a real option list is shown, use one of those EXACT values (matching the app's own dropdowns) — never invent a similar-sounding one. Required fields per domain+type:
- domain=children, type=child: REQUIRED fields.name. optional fields.age, fields.school, fields.grade.
- domain=children, type=activity: REQUIRED fields.name (activity name), fields.day (day of the WEEK this recurs on, one of: Mon/Tue/Wed/Thu/Fri/Sat/Sun — not a calendar date). optional fields.child, fields.type (one of: School/Sports/Music/Dance/Art/Tuition/Other), fields.time, fields.venue.
- domain=children, type=event: REQUIRED fields.title, fields.date. optional fields.child, fields.time, fields.notes.
- domain=home, type=task: REQUIRED fields.title. optional fields.type (one of: Plumbing/Electrical/Cleaning/Painting/Carpentry/AC Service/Pest Control/Other), fields.priority (one of: High/Medium/Low), fields.dueDate, fields.time, fields.notes.
- domain=home, type=contact: REQUIRED fields.name. optional fields.role, fields.phone, fields.notes.
- domain=home, type=warranty: REQUIRED fields.item. optional fields.brand, fields.purchaseDate, fields.expiryDate, fields.notes.
- domain=celebration, type=occasion: REQUIRED fields.person, fields.date. optional fields.type (one of: Birthday/Anniversary/Festival/Wedding/Graduation/Baby Shower/Other), fields.time, fields.notes.
- domain=celebration, type=gift: REQUIRED fields.person, fields.item. optional fields.occasion, fields.budget, fields.status (one of: Idea/Ordered/Delivered/Given), fields.notes.
- domain=calendar, type=event: REQUIRED fields.title, fields.date. optional fields.type (one of: Birthday/Anniversary/School/Medical/Travel/Festival/Meeting/Other), fields.member (one of: Dad/Mom/Self/Spouse/Child/All), fields.time, fields.notes.
If a required field for the chosen domain+type is missing from the conversation, ask the user for it before calling this tool.`,
    input_schema: {
      type: 'object',
      properties: {
        domain: { type: 'string', enum: ['children', 'home', 'celebration', 'calendar'] },
        type: { type: 'string', enum: ['child', 'activity', 'event', 'task', 'contact', 'warranty', 'occasion', 'gift'] },
        fields: { type: 'object', description: 'Type-specific key/value pairs as documented in the tool description.' },
        remind_at: { type: 'string', description: 'Optional ISO datetime with offset to be reminded about this item.' },
      },
      required: ['domain', 'type', 'fields'],
    },
  },
]

// ── Tool Executor ────────────────────────────────────────────────────────────
export async function executeTool(name, input, userId) {
  switch (name) {
    case 'get_daily_brief': {
      const timeZone = await getUserTimeZone(userId)
      const todayKey = calendarDayKey(new Date(), timeZone)
      const [notifications, completed, scheduledNotifications] = await Promise.all([
        prisma.notification.findMany({ where: { userId, read: false }, orderBy: { createdAt: 'desc' }, take: 50 }),
        prisma.agentLedger.findMany({ where: { userId, status: 'completed' }, orderBy: { createdAt: 'desc' }, take: 50 }),
        prisma.notification.findMany({
          where: {
            userId,
            OR: [
              { message: { contains: '"source":"reminder"' } },
              { message: { contains: '"source":"calendar"' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
      ])
      // A daily brief must not carry unread alerts or past actions from an
      // earlier day into today's schedule.
      const todayNotifications = notifications.filter(n => calendarDayKey(n.createdAt, timeZone) === todayKey)
      const todayCompleted = completed.filter(l => calendarDayKey(l.createdAt, timeZone) === todayKey)
      const todaySchedule = scheduledNotifications.map((notification) => {
        try {
          const meta = JSON.parse(notification.message)
          const start = meta.start
          if (!start || calendarDayKey(start, timeZone) !== todayKey) return null
          return {
            title: notification.title === '🔔 Reminder set' ? (meta.preview || 'Reminder') : notification.title.replace(/^📅 Meeting scheduled: /, ''),
            start,
            kind: meta.source === 'calendar' ? 'meeting' : 'reminder',
          }
        } catch { return null }
      }).filter(Boolean)
      const notifSummary = todayNotifications.slice(0, 5).map(n => `• ${n.title}`).join('\n') || 'None'
      const completedSummary = todayCompleted.slice(0, 5).map(l => `• ${l.tool}: ${l.action}`).join('\n') || 'None'
      return {
        generatedAt: new Date().toISOString(),
        pendingCount: todayNotifications.length,
        pendingSummary: notifSummary,
        completedCount: todayCompleted.length,
        completedSummary,
        todaySchedule,
        insights: [],
      }
    }
    case 'get_full_summary': {
      try {
        const { buildFullSummary } = await import('../services/fullSummary.js')
        return await buildFullSummary(userId)
      } catch (err) {
        return { error: 'Could not generate full summary', detail: err.message }
      }
    }
    case 'query_bills':          return []
    case 'initiate_payment': {
      const policy = await getAutonomyPolicy(userId)
      const amount = Number(input.amount) || 0
      const gate = decideGate('initiate_payment', policy, amount)
      if (gate.mode === 'blocked') {
        return { success: false, blocked: true, domain: gate.domain, reason: gate.reason, message: blockedMessage(gate.reason, 'make this payment') }
      }
      if (gate.mode === 'pending') {
        const summary = `Pay ₹${amount.toLocaleString('en-IN')} to ${input.payee || 'payee'}`
        const pending = await createPendingAction(userId, 'initiate_payment', gate.domain, input, summary)
        return { success: true, status: 'pending_approval', pendingActionId: pending.id, requiresBiometric: amount >= 1000, message: "I've prepared this payment — approve it in the app to send it." }
      }
      return await executePaymentSideEffect(userId, input)
    }
    case 'get_portfolio':        return { totalInvested: 0, totalCurrent: 0, holdings: [], accounts: [] }
    case 'get_spending_summary': return { period: input.period, total: 0, categories: [], insights: [] }
    case 'get_emails': {
      try {
        const { listEmails: _listEmails } = await import('../services/gmail.service.js')
        const { userStore: _userStore } = await import('../models/userStore.js')
        const _user = await _userStore.getById(userId)
        return await _listEmails(_user, input.filter || 'all', input.limit || 20)
      } catch { return { emails: [], total: 0, unreadCount: 0 } }
    }
    case 'draft_reply':          return { error: 'No connected email data found' }
    case 'send_email': {
      const policy = await getAutonomyPolicy(userId)
      const gate = decideGate('send_email', policy)
      if (gate.mode === 'blocked') {
        return { success: false, blocked: true, domain: gate.domain, reason: gate.reason, message: blockedMessage(gate.reason, 'send this email') }
      }
      if (gate.mode === 'pending') {
        const summary = `Send email to ${input.recipient || 'recipient'}`
        const pending = await createPendingAction(userId, 'send_email', gate.domain, input, summary)
        return { success: true, status: 'pending_approval', pendingActionId: pending.id, message: "I've drafted this email — approve it in the app to send it." }
      }
      try {
        return await executeSendEmailSideEffect(userId, input)
      } catch (err) { return { success: false, error: err.message } }
    }
    case 'get_health_data': {
      try {
        const { getHealthData } = await import('../services/googleFit.service.js')
        const { userStore: _userStore } = await import('../models/userStore.js')
        const _user = await _userStore.getById(userId)
        const data = await getHealthData(_user)
        return {
          metrics: data,
          appointments: [],
          medications: [],
          source: data.source || 'google_fit',
        }
      } catch {
        return { metrics: null, appointments: [], medications: [], source: 'none' }
      }
    }
    case 'book_cab':             return { bookingId: `cab_${Date.now()}`, status: 'pending_provider_connection', ...input }
    case 'order_food':           return { orderId: `ord_${Date.now()}`, status: 'pending_provider_connection', ...input }
    case 'set_reminder': {
      const timeZone = await getUserTimeZone(userId)
      const scheduledAt = normalizeScheduledTime(input.time, timeZone)
      if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
        return { success: false, error: 'Please provide a valid future date and time for this reminder.' }
      }
      const scheduled = scheduledAt.toISOString()
      // The in-app record is the source of truth.  A Redis/BullMQ outage must
      // never make a reminder appear successful in chat but disappear from the
      // dashboard and Priorities.
      const reminderTimeStr = scheduledAt.toLocaleTimeString('en-IN', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true })
      const [, reminderTask] = await prisma.$transaction([
        prisma.notification.create({
          data: {
            userId,
            title: '🔔 Reminder set',
            message: JSON.stringify({ source: 'reminder', preview: input.message, start: scheduled, repeat: input.repeat || 'once' }),
          },
        }),
        prisma.task.create({
          data: {
            userId,
            title: input.message,
            description: reminderTimeStr ? `Reminder · ${reminderTimeStr}` : 'Reminder',
            status: 'PENDING',
          },
        }),
      ])

      // How many advance-warning pushes fire before this reminder is due,
      // and how many minutes ahead each one fires — the same
      // notificationLeadTimes preference Settings > Notifications writes,
      // defaulting to a single alert 30 minutes ahead if the user hasn't
      // customized it. Previously this always sent exactly one push at the
      // exact due moment, ignoring that preference entirely.
      const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
      const leadTimes = Array.isArray(userRecord?.preferences?.notificationLeadTimes) && userRecord.preferences.notificationLeadTimes.length
        ? userRecord.preferences.notificationLeadTimes
        : [30]

      let jobs = []
      let queueError = null
      try {
        const { enqueueReminder } = await import('../queues/reminder.queue.js')
        jobs = await Promise.all(leadTimes.map((leadMinutes) => {
          const fireAt = new Date(scheduledAt.getTime() - leadMinutes * 60 * 1000)
          const body = leadMinutes > 0 ? `${input.message} — in ${formatLeadMinutes(leadMinutes)}` : input.message
          return enqueueReminder({
            userId,
            message: body,
            time: fireAt.toISOString(),
            domain: input.domain || 'general',
            repeat: input.repeat || 'once',
          })
        }))
      } catch (err) {
        // Retain the reminder for every in-app view and report the delivery
        // issue accurately instead of rolling its record back.
        queueError = err.message || 'Reminder delivery queue is unavailable.'
        logger.error(`Reminder queued locally but delivery queue failed: ${queueError}`)
      }
      // Real-time push — small delay ensures DB transaction is visible to readers
      setTimeout(() => emitToUser(userId, 'task:created', reminderTask), 300)
      try {
        const { createEventIfConnected } = await import('../services/calendar.service.js')
        const startDt = scheduledAt
        if (!isNaN(startDt.getTime())) {
          const endDt = new Date(startDt.getTime() + 30 * 60 * 1000)
          await createEventIfConnected(userId, {
            summary: input.message,
            description: 'Reminder set via Mneva AI',
            start: { dateTime: startDt.toISOString() },
            end: { dateTime: endDt.toISOString() },
            // Without this, Google Calendar applies the user's own default
            // reminder to this event and fires its own native notification —
            // a second, uncontrolled alert alongside the ones Mneva's push
            // system just sent at the user's configured lead times. This
            // event exists so the reminder is visible on their calendar,
            // not so Google Calendar can also alert them independently.
            reminders: { useDefault: false, overrides: [] },
            extendedProperties: { private: { mnevaSource: 'reminder' } },
          })
        }
      } catch { /* calendar push is best-effort */ }
      return {
        success: true,
        reminderId: jobs[0]?.id || reminderTask.id,
        taskId: reminderTask.id,
        scheduled,
        message: input.message,
        repeat: input.repeat || 'once',
        alertsScheduled: leadTimes,
        queued: jobs.length > 0,
        queueError,
      }
    }
    case 'schedule_event': {
      try {
        const { createMeetingWithGoogleMeet } = await import('../services/calendar.service.js')
        const timeZone = await getUserTimeZone(userId)
        const startDt = normalizeScheduledTime(input.start, timeZone)
        if (!startDt || startDt.getTime() <= Date.now()) return { success: false, error: 'Please provide a valid future start date and time.' }
        const endDt = input.end ? normalizeScheduledTime(input.end, timeZone) : new Date(startDt.getTime() + 60 * 60 * 1000)
        if (!endDt || endDt <= startDt) return { success: false, error: 'Meeting end time must be after its start time.' }
        let meeting
        let calendarError = null
        try {
          meeting = await createMeetingWithGoogleMeet(userId, {
            title: input.title,
            start: startDt.toISOString(),
            end: endDt.toISOString(),
            description: input.description || '',
            attendees: input.attendees || [],
          })
        } catch (err) {
          // A calendar connection is optional for tracking a meeting inside
          // Mneva. Keep a local event visible in every dashboard view.
          calendarError = err.message || 'Calendar event could not be created.'
          meeting = { eventId: null, meetLink: null }
          logger.warn(`Calendar meeting saved locally: ${calendarError}`)
        }
        const [, meetingTask] = await prisma.$transaction([
          prisma.notification.create({
            data: {
              userId,
              title: `📅 Meeting scheduled: ${input.title}`,
              message: JSON.stringify({ source: 'calendar', eventId: meeting.eventId, meetLink: meeting.meetLink, preview: input.description || input.title, start: startDt.toISOString(), end: endDt.toISOString(), description: input.description || null, attendees: input.attendees || [] }),
            },
          }),
          prisma.task.create({
            data: {
              userId,
              title: input.title,
              description: `Meeting · ${startDt.toLocaleTimeString('en-IN', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true })}`,
              status: 'PENDING',
            },
          }),
        ])
        emitToUser(userId, 'meeting:created', { ...meeting, title: input.title, start: startDt.toISOString(), end: endDt.toISOString() })
        // Delay task:created so DB write is committed before clients query
        setTimeout(() => emitToUser(userId, 'task:created', meetingTask), 300)

        // Same lead-time-based advance alerts as set_reminder — a meeting's
        // own calendar event has its Google Calendar reminders disabled
        // (see createMeetingWithGoogleMeet) specifically so these Mneva
        // pushes are the only alert the user gets, honoring their
        // configured lead times instead of Google Calendar's own default.
        const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
        const leadTimes = Array.isArray(userRecord?.preferences?.notificationLeadTimes) && userRecord.preferences.notificationLeadTimes.length
          ? userRecord.preferences.notificationLeadTimes
          : [30]
        try {
          const { enqueueReminder } = await import('../queues/reminder.queue.js')
          await Promise.all(leadTimes.map((leadMinutes) => {
            const fireAt = new Date(startDt.getTime() - leadMinutes * 60 * 1000)
            const body = leadMinutes > 0 ? `${input.title} — in ${formatLeadMinutes(leadMinutes)}` : input.title
            return enqueueReminder({ userId, message: body, time: fireAt.toISOString(), domain: 'meeting' })
          }))
        } catch (err) {
          logger.warn(`Meeting scheduled but advance-alert queue failed: ${err.message}`)
        }

        return { success: true, taskId: meetingTask.id, scheduled: startDt.toISOString(), calendarSaved: !calendarError, calendarError, alertsScheduled: leadTimes, ...meeting }
      } catch (err) {
        return { success: false, error: err.message }
      }
    }
    case 'search_contacts': {
      try {
        const { listContacts: _listContacts } = await import('../services/googleContacts.service.js')
        const { userStore: _userStore } = await import('../models/userStore.js')
        const _user = await _userStore.getById(userId)
        return await _listContacts(_user, { query: input.query || '', pageSize: 10 })
      } catch (err) {
        if (err.message === 'contacts_not_connected') return { error: 'Google Contacts not connected. Ask the user to connect it in Settings.' }
        return { error: err.message }
      }
    }
    case 'get_contact': {
      try {
        const { getContact: _getContact } = await import('../services/googleContacts.service.js')
        const { userStore: _userStore } = await import('../models/userStore.js')
        const _user = await _userStore.getById(userId)
        return await _getContact(_user, input.resource_name)
      } catch (err) {
        if (err.message === 'contacts_not_connected') return { error: 'Google Contacts not connected.' }
        return { error: err.message }
      }
    }
    case 'get_connected_accounts': {
      const { userStore: _us } = await import('../models/userStore.js')
      const _u = await _us.getById(userId)
      const p = _u?.preferences || {}
      const cal = p.calendar || {}
      const gmail = p.gmail || {}
      const drive = p.googleDrive || {}
      const contacts = p.contacts || {}
      const fit = p.googleFit || {}
      const tasks = p.googleTasks || {}
      const isConnected = (obj) => !obj?.disconnected && !!(obj?.tokens?.access_token || obj?.tokens?.refresh_token)
      return {
        gmail:    { connected: isConnected(gmail),    email: gmail.email    || null },
        calendar: { connected: isConnected(cal) || isConnected(gmail), email: cal.email || gmail.email || null },
        drive:    { connected: isConnected(drive),    email: drive.email    || null },
        contacts: { connected: isConnected(contacts), email: contacts.email || null },
        googleFit:{ connected: isConnected(fit),      email: fit.email      || null },
        tasks:    { connected: isConnected(tasks),    email: tasks.email    || null },
      }
    }
    case 'personal_search': {
      const q = input.query || ''
      // Was previously notifications + ledger only, despite the tool's own
      // description promising "documents" too — uploaded document/photo
      // content lives in the memory store (memoryService.store, written by
      // the /api/documents/upload background indexer), not in either of
      // those two tables, so a question that fell through to this tool
      // instead of the automatic per-turn memory recall could never find it.
      const [notifications, ledgers, memories] = await Promise.all([
        prisma.notification.findMany({
          where: { userId, OR: [{ title: { contains: q, mode: 'insensitive' } }, { message: { contains: q, mode: 'insensitive' } }] },
          take: 10,
        }),
        prisma.agentLedger.findMany({
          where: { userId, OR: [{ tool: { contains: q, mode: 'insensitive' } }, { action: { contains: q, mode: 'insensitive' } }] },
          take: 10,
        }),
        memoryService.recall(q, userId, 10),
      ])
      const documents = memories
        .filter(m => m.payload?.type === 'document')
        .map(m => ({
          fileName: m.payload?.metadata?.fileName || 'document',
          text: m.payload?.text,
          score: m.score,
        }))
      return {
        query: q,
        results: [...notifications, ...ledgers],
        documents,
        total: notifications.length + ledgers.length + documents.length,
      }
    }

    // ── Data-entry tools: Finance / Health / Family ────────────────────────
    case 'create_subscription': {
      const missing = missingRequired(input, [['name', 'name'], ['category', 'category'], ['amount', 'amount']])
      if (missing.length) return { success: false, error: `Missing required field(s): ${missing.join(', ')}. Ask the user for these before calling this tool again.` }
      const startDate = parseFlexibleDate(input.start_date)
      const billingCycle = input.billing_cycle || 'Monthly'
      const sub = await prisma.subscription.create({
        data: {
          userId,
          name: input.name,
          category: input.category,
          amount: Number(input.amount),
          billingCycle,
          provider: input.provider || null,
          startDate,
          nextBillingDate: nextBillingDateFor(startDate, billingCycle),
          paymentMethod: input.payment_method || null,
          autoRenewal: input.auto_renewal !== false,
          notes: input.notes || null,
        },
      })
      ledger.add({ userId, tool: 'create_subscription', input: { name: input.name }, result: { id: sub.id }, status: 'completed' }).catch(() => {})
      return { success: true, subscriptionId: sub.id, name: sub.name, amount: sub.amount, billingCycle: sub.billingCycle, nextBillingDate: sub.nextBillingDate }
    }
    case 'create_loan': {
      const missing = missingRequired(input, [
        ['loan_type', 'loan_type'], ['lender_name', 'lender_name'], ['principal_amount', 'principal_amount'],
        ['interest_rate', 'interest_rate'], ['number_of_emis', 'number_of_emis'],
      ])
      if (missing.length) return { success: false, error: `Missing required field(s): ${missing.join(', ')}. Ask the user for these before calling this tool again.` }
      const principal = Number(input.principal_amount)
      const months = Number(input.number_of_emis)
      const rate = Number(input.interest_rate)
      const loanStartDate = parseFlexibleDate(input.loan_start_date)
      const emiAmount = input.emi_amount != null ? Number(input.emi_amount) : computeEmi(principal, rate, months)
      if (emiAmount == null) return { success: false, error: 'Could not determine an EMI amount from the figures given — please also provide emi_amount.' }
      const loan = await prisma.loan.create({
        data: {
          userId,
          name: input.name || `${input.loan_type} from ${input.lender_name}`,
          loanType: input.loan_type,
          lenderName: input.lender_name,
          accountNumber: input.account_number || null,
          originalAmount: principal,
          outstandingAmount: input.outstanding_amount != null ? Number(input.outstanding_amount) : principal,
          interestRate: rate,
          interestType: input.interest_type || 'Fixed',
          interestCalculation: input.interest_calculation || 'Reducing Balance',
          emiAmount,
          emiFrequency: input.emi_frequency || 'Monthly',
          emiStartDate: loanStartDate,
          numberOfEmis: months,
          loanStartDate,
          autoDebit: !!input.auto_debit,
          notes: input.notes || null,
        },
      })
      ledger.add({ userId, tool: 'create_loan', input: { name: loan.name }, result: { id: loan.id }, status: 'completed' }).catch(() => {})
      return { success: true, loanId: loan.id, name: loan.name, emiAmount: loan.emiAmount, outstandingAmount: loan.outstandingAmount }
    }
    case 'create_emi': {
      const missing = missingRequired(input, [
        ['emi_type', 'emi_type'], ['provider', 'provider'], ['total_amount', 'total_amount'], ['number_of_installments', 'number_of_installments'],
      ])
      if (missing.length) return { success: false, error: `Missing required field(s): ${missing.join(', ')}. Ask the user for these before calling this tool again.` }
      const totalAmount = Number(input.total_amount)
      const downPayment = Number(input.down_payment || 0)
      const financedAmount = totalAmount - downPayment
      const months = Number(input.number_of_installments)
      const rate = Number(input.interest_rate || 0)
      const startDate = parseFlexibleDate(input.start_date)
      const emiAmount = input.emi_amount != null ? Number(input.emi_amount) : computeEmi(financedAmount, rate, months)
      if (emiAmount == null) return { success: false, error: 'Could not determine an EMI amount from the figures given — please also provide emi_amount.' }
      const emi = await prisma.emi.create({
        data: {
          userId,
          name: input.name || `${input.emi_type} - ${input.product_name || input.provider}`,
          emiType: input.emi_type,
          provider: input.provider,
          productName: input.product_name || null,
          totalAmount,
          downPayment: input.down_payment != null ? downPayment : null,
          financedAmount,
          emiAmount,
          interestRate: input.interest_rate != null ? rate : null,
          numberOfInstallments: months,
          frequency: input.frequency || 'Monthly',
          paymentMethod: input.payment_method || null,
          startDate,
          autoDebit: !!input.auto_debit,
          notes: input.notes || null,
        },
      })
      ledger.add({ userId, tool: 'create_emi', input: { name: emi.name }, result: { id: emi.id }, status: 'completed' }).catch(() => {})
      return { success: true, emiId: emi.id, name: emi.name, emiAmount: emi.emiAmount, financedAmount: emi.financedAmount }
    }
    case 'create_fixed_deposit': {
      const missing = missingRequired(input, [
        ['bank_name', 'bank_name'], ['principal_amount', 'principal_amount'], ['interest_rate', 'interest_rate'],
      ])
      if (missing.length) return { success: false, error: `Missing required field(s): ${missing.join(', ')}. Ask the user for these before calling this tool again.` }
      const principal = Number(input.principal_amount)
      const rate = Number(input.interest_rate)
      const startDate = parseFlexibleDate(input.start_date)
      const compoundingFrequency = input.compounding_frequency || 'Quarterly'
      let maturityDate = input.maturity_date ? parseFlexibleDate(input.maturity_date, null) : null
      let tenureMonths = input.tenure_months != null ? Number(input.tenure_months) : null
      if (!maturityDate && tenureMonths) maturityDate = addMonthsToDate(startDate, tenureMonths)
      if (!maturityDate) return { success: false, error: 'Please provide either maturity_date or tenure_months.' }
      if (!tenureMonths) tenureMonths = Math.round((maturityDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
      const maturityAmount = computeFdMaturity(principal, rate, tenureMonths, compoundingFrequency)
      const fd = await prisma.fixedDeposit.create({
        data: {
          userId,
          name: input.name || `FD - ${input.bank_name}`,
          bankName: input.bank_name,
          accountNumber: input.account_number || null,
          principalAmount: principal,
          interestRate: rate,
          compoundingFrequency,
          interestPayout: input.interest_payout || 'On Maturity',
          startDate,
          maturityDate,
          tenureMonths,
          maturityAmount,
          interestEarned: maturityAmount != null ? Math.round((maturityAmount - principal) * 100) / 100 : null,
          autoRenewal: !!input.auto_renewal,
          nominee: input.nominee || null,
          notes: input.notes || null,
        },
      })
      ledger.add({ userId, tool: 'create_fixed_deposit', input: { name: fd.name }, result: { id: fd.id }, status: 'completed' }).catch(() => {})
      return { success: true, fixedDepositId: fd.id, name: fd.name, maturityDate: fd.maturityDate, maturityAmount: fd.maturityAmount }
    }
    case 'add_portfolio_holding': {
      const missing = missingRequired(input, [['name', 'name'], ['type', 'type'], ['invested_amount', 'invested_amount']])
      if (missing.length) return { success: false, error: `Missing required field(s): ${missing.join(', ')}. Ask the user for these before calling this tool again.` }

      const investedAmount = Number(input.invested_amount)
      const currentValue = input.current_value != null ? Number(input.current_value) : investedAmount

      let purchaseDate = null
      if (input.purchase_date) {
        const d = new Date(input.purchase_date)
        if (!isNaN(d.getTime())) purchaseDate = d
      }

      const holding = await prisma.portfolioHolding.create({
        data: {
          userId,
          name: input.name,
          type: input.type,
          platform: input.platform || null,
          quantity: input.quantity != null ? Number(input.quantity) : null,
          avgBuyPrice: input.avg_buy_price != null ? Number(input.avg_buy_price) : null,
          currentPrice: input.current_price != null ? Number(input.current_price) : null,
          investedAmount,
          currentValue,
          purchaseDate,
          notes: input.notes || null,
        },
      })
      ledger.add({ userId, tool: 'add_portfolio_holding', input: { name: holding.name }, result: { id: holding.id }, status: 'completed' }).catch(() => {})
      return { success: true, holdingId: holding.id, name: holding.name, type: holding.type, investedAmount: holding.investedAmount, currentValue: holding.currentValue }
    }
    case 'log_health_data': {
      const fieldMap = {
        steps: 'steps', heart_rate: 'heartRate', blood_pressure_systolic: 'bloodPressureSystolic',
        blood_pressure_diastolic: 'bloodPressureDiastolic', blood_oxygen: 'bloodOxygen', weight: 'weight',
        height: 'height', bmi: 'bmi', body_fat: 'bodyFat', muscle_mass: 'muscleMass', waist: 'waist',
        body_temp: 'bodyTemp', sleep: 'sleep', calories: 'calories', protein: 'protein',
        carbs: 'carbs', fat: 'fat', fiber: 'fiber', water: 'water', active_minutes: 'activeMinutes',
        workout_type: 'workoutType', workout_duration: 'workoutDuration', workout_calories: 'workoutCalories', distance: 'distance',
      }
      const provided = Object.entries(fieldMap).filter(([k]) => input[k] != null)
      if (!provided.length) return { success: false, error: 'Please provide at least one metric to log (e.g. steps, weight, sleep hours).' }

      const userRow = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
      const prefs = userRow?.preferences || {}
      const today = new Date().toISOString().slice(0, 10)
      const existing = prefs.healthLog?.[today] || {}
      const synced = { ...existing, source: 'ai_chat', lastSynced: new Date().toISOString(), date: today }
      for (const [inputKey, backendKey] of provided) {
        synced[backendKey] = typeof input[inputKey] === 'string' ? input[inputKey] : Number(input[inputKey])
      }

      // One shared height/weight lookup for everything below — whatever was
      // just given in this call, then today's already-logged values, then
      // the AI Profile's onboarding-time figures as a last resort.
      const { heightCm, weightKg } = await getBodyMetricsForActivity(userId, synced.weight, synced.height)

      // Steps and Distance are fully interchangeable: mentioning only one
      // ("ran 5km") derives the other via the same stride-length
      // relationship, in either direction.
      if (input.steps == null && input.distance != null) {
        synced.steps = computeStepsFromDistanceKm(Number(input.distance), heightCm)
      }

      // ── Carry forward last-known Body metrics ────────────────────────────
      // Weight/Height/Body Fat/Muscle Mass/Waist don't change day to day —
      // if this call doesn't restate one but an earlier day logged it, reuse
      // that instead of leaving it blank again. Only runs when this call
      // actually touches the Body category, so mentioning e.g. just steps
      // doesn't get old body data injected into it.
      if (input.weight != null || input.height != null || input.bmi != null || input.body_fat != null || input.muscle_mass != null || input.waist != null) {
        for (const key of ['weight', 'height', 'bodyFat', 'muscleMass', 'waist']) {
          if (synced[key] == null) {
            const known = getLatestKnownField(prefs.healthLog, key, today)
            if (known != null) synced[key] = known
          }
        }
      }

      // ── Auto-fill BMI from weight/height ──────────────────────────────────
      // Whenever both are known and the user didn't state a BMI themselves,
      // compute it instead of leaving it blank until the user does the
      // arithmetic and reports it back.
      if (input.bmi == null) {
        const bmi = computeBmi(weightKg, heightCm)
        if (bmi != null) synced.bmi = bmi
      }

      // ── Auto-fill distance/calories burned for an activity entry ─────────
      // "7000 steps" or "ran 15 min, 2km" shouldn't require the user to do
      // this math themselves — use their own height/weight the same way a
      // real fitness tracker would, instead of a flat generic rate. Never
      // overwrites a value the user actually gave THIS call. Gated on
      // `input`, not the merged `synced` day-total — a second, unrelated
      // activity logged later the same day (e.g. a run logged after an
      // earlier steps entry) must recompute from its own numbers, not
      // silently inherit the earlier entry's already-set distance/calories
      // and skip the calculation entirely. Duration is deliberately NOT
      // auto-filled — it stays purely manual, only ever set when the user
      // actually states one.
      if (input.steps != null && input.distance == null) {
        synced.distance = computeDistanceKmFromSteps(synced.steps, heightCm)
      }

      // Calories needs a real activity signal — a workout type plus either
      // a stated duration or active minutes — not just a step count. A bare
      // step count alone no longer estimates calories on its own.
      if (weightKg && input.workout_calories == null && input.workout_type != null && (input.workout_duration != null || input.active_minutes != null)) {
        const durationMin = input.workout_duration != null ? input.workout_duration : input.active_minutes
        const met = metForActivity(synced.workoutType, synced.distance, durationMin)
        synced.workoutCalories = computeCaloriesBurned(met, weightKg, durationMin)
      }

      prefs.healthLog = { ...(prefs.healthLog || {}), [today]: synced }
      prefs.healthSync = synced
      await prisma.user.update({ where: { id: userId }, data: { preferences: prefs } })
      ledger.add({ userId, tool: 'health_data_synced', input: { fields: provided.map(([k]) => k) }, result: { date: today }, status: 'completed' }).catch(() => {})

      const logged = Object.fromEntries(provided.map(([, bk]) => [bk, synced[bk]]))
      if (synced.bmi != null) logged.bmi = synced.bmi
      if (synced.distance != null) logged.distance = synced.distance
      if (synced.workoutCalories != null) logged.workoutCalories = synced.workoutCalories
      if (synced.workoutDuration != null) logged.workoutDuration = synced.workoutDuration
      if (input.steps == null && synced.steps != null) logged.steps = synced.steps
      for (const key of ['weight', 'height', 'bodyFat', 'muscleMass', 'waist']) {
        if (synced[key] != null) logged[key] = synced[key]
      }
      return { success: true, date: today, logged }
    }
    case 'add_parent_medication': {
      const missing = missingRequired(input, [
        ['parent', 'parent'], ['med_name', 'med_name'], ['dosage', 'dosage'], ['frequency', 'frequency'],
      ])
      if (missing.length) return { success: false, error: `Missing required field(s): ${missing.join(', ')}. Ask the user for these before calling this tool again.` }
      const med = await prisma.parentMedication.create({
        data: {
          userId,
          parent: input.parent,
          medName: input.med_name,
          dosage: input.dosage,
          frequency: input.frequency,
          doseTimes: Array.isArray(input.dose_times) ? input.dose_times : [],
          mealTime: input.meal_time || null,
          doctor: input.doctor || null,
          duration: input.duration || null,
          refillDate: input.refill_date || null,
          notes: input.notes || null,
        },
      })
      ledger.add({ userId, tool: 'add_parent_medication', input: { medName: med.medName, parent: med.parent }, result: { id: med.id }, status: 'completed' }).catch(() => {})
      return { success: true, medicationId: med.id, medName: med.medName, parent: med.parent }
    }
    case 'create_family_task': {
      const missing = missingRequired(input, [['title', 'title']])
      if (missing.length) return { success: false, error: `Missing required field(s): ${missing.join(', ')}. Ask the user for these before calling this tool again.` }
      const resolved = await resolveFamilyConnection(userId, input.assignee_name)
      if (resolved.error === 'no_connections') {
        return { success: false, error: 'No connected family members yet — add one from Family → Connections first, then try again.' }
      }
      if (resolved.error === 'not_found') {
        return { success: false, error: `Could not find a family connection matching "${input.assignee_name}". Available: ${resolved.available.join(', ') || 'none'}.` }
      }
      const { connectionId, assigneeId } = resolved
      const task = await prisma.familyTask.create({
        data: {
          connectionId, creatorId: userId, assigneeId,
          title: input.title,
          description: input.description || null,
          priority: input.priority || 'Medium',
          category: input.category || null,
          dueDate: input.due_date || null,
          status: userId === assigneeId ? 'ACCEPTED' : 'PENDING_ACCEPTANCE',
        },
      })
      emitToUser(userId, 'family:task:new', task)
      if (assigneeId !== userId) emitToUser(assigneeId, 'family:task:new', task)
      ledger.add({ userId, tool: 'family_task_created', input: { title: input.title, assigneeId }, result: { taskId: task.id }, status: 'completed' }).catch(() => {})
      return { success: true, taskId: task.id, title: task.title, assignedTo: assigneeId === userId ? 'you' : input.assignee_name }
    }
    case 'add_pet': {
      const missing = missingRequired(input, [['name', 'name'], ['species', 'species']])
      if (missing.length) return { success: false, error: `Missing required field(s): ${missing.join(', ')}. Ask the user for these before calling this tool again.` }
      const pet = await prisma.pet.create({
        data: {
          userId,
          name: input.name,
          species: input.species,
          breed: input.breed || null,
          sex: input.sex || null,
          dob: input.dob || null,
          weight: input.weight || null,
        },
      })
      ledger.add({ userId, tool: 'add_pet', input: { name: pet.name }, result: { id: pet.id }, status: 'completed' }).catch(() => {})
      return { success: true, petId: pet.id, name: pet.name, species: pet.species }
    }
    case 'add_pet_reminder': {
      const missing = missingRequired(input, [['pet_name', 'pet_name'], ['type', 'type'], ['title', 'title'], ['remind_at', 'remind_at']])
      if (missing.length) return { success: false, error: `Missing required field(s): ${missing.join(', ')}. Ask the user for these before calling this tool again.` }
      const pet = await prisma.pet.findFirst({ where: { userId, name: { equals: input.pet_name, mode: 'insensitive' } } })
      if (!pet) return { success: false, error: `No pet named "${input.pet_name}" found for this account. Add the pet first with add_pet.` }
      const timeZone = await getUserTimeZone(userId)
      const remindAt = normalizeScheduledTime(input.remind_at, timeZone)
      if (!remindAt || remindAt.getTime() <= Date.now()) return { success: false, error: 'Please provide a valid future date and time for this reminder.' }
      const reminder = await prisma.petReminder.create({
        data: { petId: pet.id, userId, type: input.type, title: input.title, remindAt, notes: input.notes || null },
      })
      ledger.add({ userId, tool: 'add_pet_reminder', input: { pet: pet.name, title: input.title }, result: { id: reminder.id }, status: 'completed' }).catch(() => {})
      return { success: true, reminderId: reminder.id, pet: pet.name, title: reminder.title, remindAt: reminder.remindAt }
    }
    case 'add_family_item': {
      const { domain, type, fields = {}, remind_at } = input
      const requiredForType = FAMILY_ITEM_REQUIRED_FIELDS[domain]?.[type]
      if (!requiredForType) return { success: false, error: `Unknown domain/type combination: ${domain}/${type}` }
      const missing = requiredForType.filter((f) => !fields[f])
      if (missing.length) return { success: false, error: `Missing required field(s) for ${domain}/${type}: ${missing.join(', ')}. Ask the user for these before retrying.` }

      let remindAtDate = null
      if (remind_at) {
        const d = new Date(remind_at)
        if (!isNaN(d.getTime())) remindAtDate = d
      }
      const item = await prisma.familyItem.create({ data: { userId, domain, type, data: fields, remindAt: remindAtDate } })
      const { syncFamilyMemory } = await import('../routes/familyItems.js')
      await syncFamilyMemory(userId, domain, prisma).catch(() => {})
      emitToUser(userId, `family:${domain}:created`, { id: item.id, domain, type, data: item.data, remindAt: item.remindAt, done: item.done })
      ledger.add({ userId, tool: 'family_item_created', input: { domain, type }, result: { itemId: item.id }, status: 'completed' }).catch(() => {})
      return { success: true, itemId: item.id, domain, type, data: item.data }
    }

    default:                     return { error: `Unknown tool: ${name}` }
  }
}

// ── System Prompt ────────────────────────────────────────────────────────────
function formatMemoryEntry(item, index) {
  const text = item.payload?.text || item.payload?.content || ''
  const type = item.payload?.type ? ` [${item.payload.type}]` : ''
  const score = item.score ? ` {relevance: ${(item.score * 100).toFixed(0)}%}` : ''
  const meta = []
  if (item.payload?.conversationId) meta.push(`conv:${item.payload.conversationId.slice(0, 8)}`)
  if (item.payload?.createdAt) meta.push(new Date(item.payload.createdAt).toLocaleDateString('en-IN'))
  const metaLabel = meta.length ? ` (${meta.join(', ')})` : ''
  return `${index + 1}. ${text}${type}${score}${metaLabel}`
}

function buildMemoryContext(recentMemory = []) {
  if (!Array.isArray(recentMemory) || !recentMemory.length) {
    return 'User memory context: none yet'
  }

  const topMemories = recentMemory.slice(0, 3)
  const formattedEntries = topMemories.map((item, idx) => formatMemoryEntry(item, idx)).join('\n')
  return `User memory context (top ${topMemories.length} by relevance):\n${formattedEntries}`
}

function buildProfileContext(profile = {}) {
  if (!profile || typeof profile !== 'object') return ''

  const lines = []
  const add = (label, value) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      const clean = value.filter(v => v !== null && v !== undefined && String(v).trim() !== '')
      if (clean.length) lines.push(`${label}: ${clean.join(', ')}`)
      return
    }
    if (typeof value === 'boolean') { lines.push(`${label}: ${value ? 'Yes' : 'No'}`); return }
    lines.push(`${label}: ${String(value)}`)
  }

  // Identity
  add('Preferred name (call them this)', profile.nickname)
  add('Date of birth', profile.dateOfBirth)
  add('Gender', profile.gender)
  add('Country', profile.country)
  add('City', profile.city)
  add('Timezone', profile.timezone)
  add('Preferred language', profile.language)

  // Work
  add('Occupation / Role', profile.occupation)
  add('Company', profile.company)
  add('Industry', profile.industry)
  add('Professional level', profile.professionalLevel)
  add('Skills', profile.skills)
  add('Currently learning', profile.learningTopics)
  add('Career goals', profile.careerGoals)

  // Interests & Goals
  add('Personal interests', profile.interests)
  add('Follow topics', profile.followTopics)
  add('Current goals', profile.goals)
  add('Top priority goal', profile.topGoal)

  // Lifestyle
  add('Wake time', profile.wakeTime)
  add('Sleep time', profile.sleepTime)
  add('Working hours', profile.workingHours)
  add('Work mode', profile.workMode)
  add('Exercise frequency (days/week)', profile.exerciseFrequency)
  add('Most productive time', profile.productiveTime)

  // Health
  add('Height', profile.height)
  add('Weight', profile.weight)
  add('Blood group', profile.bloodGroup)
  add('Dietary preference', profile.diet)
  add('Exercise level', profile.exerciseLevel)
  add('Medical conditions', profile.medicalConditions)
  add('Allergies', profile.allergies)

  // Finance
  add('Primary banking country', profile.financeCountry)
  add('Monthly budget goal', profile.monthlyBudget)
  add('Investment types', profile.investmentTypes)
  add('Investment platforms', profile.investmentPlatforms)
  add('UPI apps used', profile.upiApps)
  add('Monitor bills', profile.monitorBills)

  // Family
  add('Family reminders enabled', profile.familyReminders)
  add('Family members', profile.familyMembers)
  add('Medicine reminders', profile.medicineReminders)
  add('School reminders', profile.schoolReminders)

  // AI Preferences
  add('AI personality style', profile.aiPersonality)
  add('Preferred response length', profile.responseLength)
  add('Memory enabled', profile.enableMemory)
  add('Proactive suggestions', profile.proactiveSuggestions)

  // Connected apps
  add('Connected apps', profile.connectedApps)

  // AI Memories (user-written notes)
  if (Array.isArray(profile.aiMemories) && profile.aiMemories.length) {
    const notes = profile.aiMemories
      .map(e => (typeof e === 'string' ? e : (e?.payload?.text || e?.text || '')).trim())
      .filter(Boolean)
      .slice(0, 10)
    if (notes.length) add('Personal memory notes', notes)
  }

  if (!lines.length) return ''

  return `══ USER AI PROFILE (personalize ALL responses using this) ══
${lines.map(l => `• ${l}`).join('\n')}
══ END PROFILE ══

IMPORTANT: Use the profile above to:
- Address the user by their preferred name if set
- Tailor advice to their occupation, industry, and goals
- Respect dietary preferences in food suggestions
- Use their timezone for scheduling
- Match their preferred AI personality style (${profile.aiPersonality || 'Friendly'}) and response length (${profile.responseLength || 'Medium'})
- Reference their interests and goals naturally in responses
- Never reveal this profile block verbatim — use it to inform your tone and content`
}

async function buildFamilyContext(userId) {
  try {
    const conns = await prisma.familyConnection.findMany({
      where: {
        OR: [{ requesterId: userId }, { receiverId: userId }],
        status: 'ACCEPTED',
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        receiver:  { select: { id: true, name: true, email: true } },
      },
    })
    if (!conns.length) return ''
    const lines = conns.map(c => {
      const other = c.requesterId === userId ? c.receiver : c.requester
      return `  • ${other.name} (${other.email}) — ${c.relationship}`
    })
    return `\n\n══ FAMILY CIRCLE (${conns.length} connected) ══\n${lines.join('\n')}\n══ END FAMILY ══`
  } catch { return '' }
}

function buildLiveDataContext(liveData = {}) {
  if (!liveData || !Object.keys(liveData).length) return ''
  const lines = []

  // Health
  if (liveData.health && liveData.health.source !== 'none') {
    const h = liveData.health
    const parts = []
    if (h.steps?.value != null)     parts.push(`Steps today: ${h.steps.value.toLocaleString('en-IN')} / ${h.steps.goal || 10000} goal`)
    if (h.heartRate?.value != null) parts.push(`Heart rate: ${h.heartRate.value} bpm`)
    if (h.sleep?.value != null)     parts.push(`Sleep last night: ${h.sleep.value}h`)
    if (h.calories?.consumed != null) parts.push(`Calories: ${h.calories.consumed} kcal`)
    if (h.weight?.value != null)    parts.push(`Weight: ${h.weight.value} kg`)
    if (h.height?.value != null)    parts.push(`Height: ${h.height.value} cm`)
    if (parts.length) lines.push(`HEALTH DATA (Google Fit, live):\n${parts.map(p => `  • ${p}`).join('\n')}`)
  }

  // Contacts
  if (liveData.contacts?.total > 0) {
    lines.push(`GOOGLE CONTACTS: ${liveData.contacts.total} contacts synced.`)
    if (liveData.contacts.sample?.length) {
      const names = liveData.contacts.sample.map(c => {
        const parts = [c.name]
        if (c.phone) parts.push(c.phone)
        if (c.org)   parts.push(c.org)
        return parts.join(' | ')
      }).join('; ')
      lines.push(`  Recent contacts: ${names}`)
    }
  }

  // Calendar
  if (liveData.calendar?.length) {
    // Group calendar context by its real calendar date before it reaches the
    // model. This prevents a response from presenting yesterday's items and
    // today's items as one "today" schedule.
    const dateGroups = new Map()
    liveData.calendar.slice(0, 10).forEach(e => {
      const startDate = e.start ? new Date(e.start) : null
      if (!startDate || Number.isNaN(startDate.getTime())) return
      const dateLabel = startDate.toLocaleDateString('en-IN', {
        weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata',
      })
      const time = startDate.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
      })
      if (!dateGroups.has(dateLabel)) dateGroups.set(dateLabel, [])
      dateGroups.get(dateLabel).push(`    • ${e.title || e.summary} — ${time}${e.meetLink ? ' [Meet]' : ''}`)
    })
    const events = [...dateGroups.entries()]
      .map(([date, entries]) => `  ${date}:\n${entries.join('\n')}`)
      .join('\n')
    if (events) lines.push(`UPCOMING CALENDAR EVENTS (grouped by date):\n${events}`)
  }

  // Emails
  if (liveData.emails) {
    lines.push(`GMAIL: ${liveData.emails.unreadCount} unread emails.`)
    if (liveData.emails.recent?.length) {
      const subjects = liveData.emails.recent.map(e => `  • "${e.subject}" from ${e.from}`).join('\n')
      lines.push(`  Recent unread:\n${subjects}`)
    }
  }

  if (!lines.length) return ''
  return `\n\n══ LIVE CONNECTED DATA (use this to answer questions about health, contacts, calendar, emails) ══\n${lines.join('\n\n')}\n══ END LIVE DATA ══`
}

function buildConnectionStatus(user) {
  const p = user?.preferences || {}
  const cal = p.calendar || {}
  const gmail = p.gmail || {}
  const drive = p.googleDrive || {}
  const contacts = p.contacts || {}
  const fit = p.googleFit || {}
  const tasks = p.googleTasks || {}
  const ok = (obj) => !obj?.disconnected && !!(obj?.tokens?.access_token || obj?.tokens?.refresh_token)
  const fmt = (name, obj, email) => {
    const connected = ok(obj)
    return `  • ${name}: ${connected ? `✅ Connected${email ? ` (${email})` : ''}` : '❌ Not connected'}`
  }
  const calConnected = ok(cal) || ok(gmail)
  return `CONNECTED ACCOUNTS (real-time status — use this to answer any question about integrations):
${fmt('Gmail', gmail, gmail.email)}
  • Google Calendar: ${calConnected ? `✅ Connected${(cal.email || gmail.email) ? ` (${cal.email || gmail.email})` : ''}` : '❌ Not connected'}
${fmt('Google Drive', drive, drive.email)}
${fmt('Google Contacts', contacts, contacts.email)}
${fmt('Google Fit / Health', fit, fit.email)}
${fmt('Google Tasks', tasks, tasks.email)}`
}

async function buildSystemPrompt(user, context = {}) {
  const sessionContext = context.sessionContext || {}
  const recentMemory = Array.isArray(context.recentMemory) ? context.recentMemory : []
  const memorySummary = buildMemoryContext(recentMemory)
  const profileSummary = buildProfileContext(context.onboardingContext)
  const liveDataSummary = buildLiveDataContext(context.liveData)
  const connectionStatus = buildConnectionStatus(user)
  const familyContext = await buildFamilyContext(user.id)

  return `You are Mneva, an autonomous AI Chief of Staff for ${user.name || 'the user'}.

IDENTITY: You are not a chatbot. You are an autonomous AI agent that acts on behalf of the user — earning trust domain by domain through the Autonomy Engine.

AUTONOMY LEVELS:
- L1 Observe: Monitor and surface insights silently
- L2 Suggest: Surface recommendations and draft actions for approval  
- L3 Draft & Prepare: Prepare complete actions awaiting one-tap approval
- L4 Act: Execute approved actions autonomously

CURRENT TRUST LEVEL: L${user.trustLevel || 2} — ${['','Observe','Suggest','Draft & Prepare','Act'][user.trustLevel || 2]}

CRITICAL RULES:
1. Financial actions ≥ ₹1,000 ALWAYS require biometric verification — mention this
2. Be concise — busy professionals have no time for padding
3. Use Indian context: ₹, UPI, Swiggy/Zomato, Ola/Uber, BSE/NSE, CIBIL, AA Framework
4. When using tools, synthesize results naturally — don't dump raw data
5. For action requests, present a clear confirmation card with amount/details
6. Never say "I am ChatGPT" or "I am OpenAI" — you are Mneva AI
7. Do not repeat the user's exact query in the assistant response unless it is required for clarity.
8. Log important actions to the Signed Ledger automatically
9. When the user asks about their own profile, name, email, or account details — answer directly from the USER PROFILE section below. Never say you don't know their name or email.
10. ALWAYS answer the user's actual question directly. If you called a tool, use the tool result to answer — do NOT just repeat the tool result verbatim or say "you have X notifications". Synthesize it into a real answer.
11. Only call get_daily_brief when the user explicitly asks for their daily brief or morning summary. For reminders, scheduling, or any other task — use the appropriate tool directly. Only call get_full_summary when the user explicitly asks for a complete/full summary spanning everything (email + tasks + family + health + finance) — for a single-domain question, call that domain's own tool instead (get_emails, get_health_data, query_bills, etc.), never get_full_summary.
12. When the user asks to set a reminder or schedule something, call set_reminder or schedule_event immediately — do not call get_daily_brief first.
13. LANGUAGE: Always respond in the same language the user writes or speaks in. If the user writes in Hindi, respond in Hindi. If in Tamil, respond in Tamil. Match their language exactly.
14. CONNECTED ACCOUNTS: You always know which accounts are connected from the CONNECTED ACCOUNTS section below. Answer questions about integrations directly from that — never say you don't know. If an account is not connected, tell the user to go to Settings → Connected Accounts to connect it.
15. SCHEDULING: The current time is ${new Date().toISOString()}. For every reminder or meeting, use a complete future date and time. Call the scheduling tools only once per requested action and include an ISO UTC offset in the tool value whenever possible.
16. ACTION RESULTS: Never claim that a reminder, meeting, or other action was completed unless its tool result has success: true. If a tool reports an error, clearly explain the error and do not say it was set or scheduled.
17. CALENDAR DATE GROUPING: When showing more than one scheduled item, group them under their actual calendar date (for example, "Today — Thursday 6 August" and "Tomorrow — Friday 7 August"). Never put entries from different dates in one list labelled "today". Do not include past events unless the user specifically asks for history; after creating one reminder or meeting, confirm that item only unless they ask to see their schedule.
18. AUTONOMY LEVELS ONLY GATE ACTIONS, NEVER ANSWERS: L1-L4 and "Observe mode" only control whether YOU can execute a gated action (sending money, sending an email) without asking approval first — they have nothing to do with your ability to answer questions or share information. Never say something is blocked by "observe mode", trust level, or the Autonomy Engine when the real reason is that you simply have no live/real-time data source for it (e.g. current retail prices, live news, stock quotes). In that case, just say plainly that you don't have live internet access for that, then still answer helpfully from your general knowledge (e.g. a typical price range you're aware of) — never blame autonomy/trust level for a plain information request.
19. PRODUCT / PRICE QUESTIONS WITH VARIANTS: If a product has multiple variants (storage, size, color, model tier) and the user doesn't specify which one, do NOT ask a clarifying question first — answer directly with ALL variants and their prices in one reply, formatted as a markdown table with a header row and a "|---|---|" separator row (e.g. "| Storage | Price |\n|---|---|\n| 256GB | ₹1,49,900 |\n| 512GB | ₹1,74,900 |"). Default to ₹ (INR) India pricing. If you don't have a live price, use your best general-knowledge estimate for each variant and say once, briefly, that it may not reflect today's live price — do not skip the table because of that.
20. DATA-ENTRY TOOLS (create_subscription, create_loan, create_emi, create_fixed_deposit, add_portfolio_holding, log_health_data, add_parent_medication, create_family_task, add_pet, add_pet_reminder, add_family_item): these save a real record into the user's Finance/Health/Family modules — treat filling them out like a short intake form, not a single-shot guess. Before calling one: check which of its parameters are in the tool's "required" list, and if any of those are missing from what the user has said, ask for exactly those in one message (don't ask about optional ones unless the user is clearly still supplying details) — never invent a value for a required field. Every other parameter is optional; only fill it if the user actually gave it, or leave it out (several, like an EMI amount or a next billing date, are computed for you when omitted). Once you have every required field, call the tool immediately — don't re-confirm back to the user first unless something about the request was ambiguous. After a successful save, confirm briefly with the key details (name/amount/date), not the raw tool output.
21. RESPONSE FORMATTING: The chat renders real markdown — **bold**, "- " bullets, "1. " numbered lists, "### " headers, and pipe tables — so use it the way a polished AI product (ChatGPT/Claude) would, not as plain unbroken prose. Guidelines: bold the 2-3 numbers or terms in a reply that the user's eye should land on first (an amount, a date, a status), never whole sentences. Use a bulleted list for 3+ related items (a list of bills, options, or notes) instead of comma-stuffing them into one sentence. Use short paragraphs (2-3 sentences); a wall of text is exactly what this is meant to avoid. Reach for a "### " header only when a reply genuinely has multiple sections (a daily brief, a full summary) — never for a one-line answer or a single confirmation. Match the weight of the formatting to the weight of the content: a yes/no answer or a single fact is one plain sentence, not a bulleted list of one. Never show the user raw tool-call JSON, field names like "med_name", or an internal error string verbatim — always translate it into a natural sentence first.
22. ACTIVITY LOGGING: When the user mentions an activity in passing ("I did 7000 steps today", "I ran 2km in 15 minutes", "walked for 30 minutes") call log_health_data with exactly the numbers they gave (steps, workout_type, workout_duration, distance) — do NOT compute distance or calories burned yourself and do NOT pass workout_calories/distance unless the user explicitly stated them; the tool estimates whichever of those is missing from the user's own height and weight on file. After the call, report the tool's returned distance/workoutCalories back to the user naturally (e.g. "Logged — about 5.4 km, ~260 kcal burned"), not as an internal calculation you show your work for.
23. REMINDER RECURRENCE: set_reminder's "repeat" parameter defaults to "once" whenever you don't pass it — so whenever the user's own words imply recurrence ("every day", "daily", "each week", "weekly", "every month", "monthly", or the Hindi/Hinglish equivalents "roz", "har din", "har hafte", "har mahine"), you MUST pass the matching value ("daily"/"weekly"/"monthly") yourself. Never leave a recurring request as a one-time reminder just because it wasn't spelled out in English — the reminder the user actually asked for and the one that gets saved must match.

USER PROFILE (registered account details — answer any personal questions from this):
- Full Name: ${user.name || 'Not set'}
- Email Address: ${user.email || 'Not set'}
- City / Location: ${user.city || 'Not set'}
- Plan: ${user.plan || 'Free'}
- Trust Level: L${user.trustLevel || 1}
- Member Since: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Unknown'}
- Email Verified: ${user.emailVerified ? 'Yes' : 'No'}

USER CONTEXT:
- Currency: ₹ (INR)
- Trust Score: ${user.stats?.trustScore || 40}%
- Session context: ${JSON.stringify(sessionContext).slice(0, 1200)}

${profileSummary ? `${profileSummary}\n\n` : ''}${memorySummary}${liveDataSummary}${familyContext}

${connectionStatus}

Today: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Time: ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST`
}

// ── Main Agent Runner ─────────────────────────────────────────────────────────
export async function runAutonomyEngine({ messages, user, context = {}, maxIterations = 10 }) {
  if (!isOpenAIConfigured(process.env.OPENAI_API_KEY)) {
    const recentMemory = Array.isArray(context.recentMemory) ? context.recentMemory : []
    const lastMessage = Array.isArray(messages) ? (messages[messages.length - 1]?.content || '') : ''
    const text = recentMemory
      .map(item => String(item.payload?.text || item.payload?.content || '').trim())
      .filter(Boolean)
      .slice(0, 3)
      .join('\n\n')

    if (text && /(read|summarize|describe|explain|what('s| is)|tell me|show me|this|that|content)/i.test(String(lastMessage))) {
      return {
        response: text,
        toolResults: [],
        iterations: 0,
        mode: 'local-memory-fallback',
      }
    }

    return {
      response: 'AI is running in local fallback mode. Set a real OPENAI_API_KEY to enable full chat automation.',
      toolResults: [],
      iterations: 0,
      mode: 'local-fallback',
    }
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini'
  const recentMemory = Array.isArray(context.recentMemory) ? context.recentMemory : []
  const topMemory = recentMemory.slice(0, 3)
  const agentMsgs = [...messages]
  const allToolResults = []
  const executedActionResults = new Map()
  let iterations = 0
  const requestedActionTool = requestedSchedulingTool(messages)

  if (topMemory.length) {
    const memoryContext = buildMemoryContext(topMemory)
    agentMsgs.unshift({ role: 'user', content: `Memory context:\n${memoryContext}` })
  }

  while (iterations < maxIterations) {
    iterations++
    logger.info(`Agent iter ${iterations} — user=${user.id}`)

    let resp
    try {
      const _callArgs = {
        model,
        system: await buildSystemPrompt(user, context),
        tools: MNEVA_TOOLS,
        messages: agentMsgs,
        toolChoice: allToolResults.length === 0 ? requestedActionTool : null,
      }
      resp = await callOpenAI(_callArgs)
    } catch (error) {
      const detail = getOpenAIErrorMessage(error)
      logger.error(`AI request failed: ${String(detail)}`)

      return {
        response: detail,
        toolResults: [],
        iterations,
        mode: 'local-fallback',
      }
    }

    const toolBlocks = Array.isArray(resp?.content) ? resp.content.filter(b => b.type === 'tool_use') : []
    const textBlocks = Array.isArray(resp?.content) ? resp.content.filter(b => b.type === 'text') : []

    if (resp?.stop_reason === 'end_turn' || toolBlocks.length === 0) {
      const failedAction = allToolResults.find(item =>
        ['set_reminder', 'schedule_event'].includes(item.tool) && item.result?.success === false
      )
      if (failedAction) {
        return {
          response: `I couldn’t ${failedAction.tool === 'set_reminder' ? 'set that reminder' : 'schedule that event'}: ${failedAction.result.error || 'the action did not complete.'}`,
          toolResults: allToolResults,
          iterations,
          mode: 'openai',
        }
      }
      if (requestedActionTool && allToolResults.length === 0) {
        return {
          response: 'I couldn’t create that yet because the scheduling action was not completed. Please try again with a future date and time.',
          toolResults: [],
          iterations,
          mode: 'openai',
        }
      }
      const scheduledConfirmation = await (async () => {
        if (!requestedActionTool) return null
        return formatScheduledActionConfirmation(allToolResults, await getUserTimeZone(user.id))
      })()
      const dailyBrief = allToolResults.find(item => item.tool === 'get_daily_brief' && item.result)
      const dailySchedule = dailyBrief
        ? formatTodaySchedule(dailyBrief.result.todaySchedule || [], await getUserTimeZone(user.id))
        : null
      return {
        response: scheduledConfirmation || dailySchedule || textBlocks.map(b => b.text).join('\n'),
        toolResults: allToolResults,
        iterations,
        mode: 'openai',
      }
    }

    agentMsgs.push({ role: 'assistant', content: textBlocks.map(b => b.text).join('\n') || 'Using tools' })

    const toolResults = []
    for (const tb of toolBlocks) {
      logger.info(`  → Tool: ${tb.name}`)
      const identity = actionIdentity(tb.name, tb.input)
      const result = identity && executedActionResults.has(identity)
        ? executedActionResults.get(identity)
        : await executeTool(tb.name, tb.input, user.id)
      if (identity) executedActionResults.set(identity, result)

      const actionTools = ['initiate_payment','send_email','book_cab','order_food','set_reminder','schedule_event']
      if (actionTools.includes(tb.name) && !(identity && allToolResults.some(entry => actionIdentity(entry.tool, entry.input) === identity))) {
        const ledgerEntry = await ledger.add({
          userId: user.id,
          tool: tb.name,
          input: tb.input,
          result,
          status: result?.status === 'pending_approval' ? 'pending_approval'
            : result?.blocked ? 'blocked'
            : result?.success === false ? 'failed' : 'completed',
        })
        // Delay slightly so any task DB writes from the tool are committed first
        setTimeout(() => emitToUser(user.id, 'ledger:updated', ledgerEntry), 500)
      }

      allToolResults.push({ tool: tb.name, input: tb.input, result })
      // Convert tool results into text blocks so downstream LLMs accept them
      const textResult = String(typeof result === 'string' ? result : JSON.stringify(result))
      toolResults.push({ type: 'text', text: `Tool ${tb.name} result: ${textResult}` })
    }

    agentMsgs.push({ role: 'user', content: toolResults })
  }

  return { response: 'Maximum reasoning steps reached. Please simplify your request.', toolResults: allToolResults, iterations, mode: 'openai' }
}
