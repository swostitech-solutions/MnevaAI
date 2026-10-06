import { logger } from '../config/logger.js'
import { ledger } from '../services/ledgerService.js'
import { prisma } from '../config/prisma.js'
import { emitToUser } from '../services/realtime.js'
import { sendPushToUser } from '../services/pushService.js'
import { applyModelCompat } from '../services/openaiCompat.js'
import { memoryService } from '../services/memory.service.js'
import { GATED_DOMAINS, domainForCall, getDomainTrust, decideGate, blockedMessage, executeSendEmailSideEffect, executePaymentSideEffect, createPendingAction, recordDomainAction } from '../services/pendingActions.service.js'
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

// Edit / delete / "show me the details of" a saved record: the model must
// first look the record up (list_records) to get its id. Left to itself it
// tends to answer "I'll update that" in prose without calling anything, so
// the first step is required.
// A price/rate/booking-type question about something OUTSIDE the app (a
// hotel, a phone, gold rate, a flight...) that the model could otherwise
// answer confidently from stale training data instead of actually checking
// the tool description alone did not reliably make it search first before
// asking clarifying questions, so — like scheduling/record edits above —
// the first call is forced.
export function requestedWebSearchTool(messages = []) {
  const userMessages = messages.filter(message => message?.role === 'user')
  const text = String(userMessages[userMessages.length - 1]?.content || '').toLowerCase()
  if (!text) return null
  const externalNoun = /\b(hotel|hotels|resort|resorts|flight|flights|ticket|tickets|movie|showtime|gold rate|silver rate|petrol|diesel|share price|stock price|stocks?|exchange rate|currency|iphone|smartphone|mobile phone|laptop|car price|bike price|match score|cricket score|score of|repo rate)\b/
  const priceIntent = /\b(price|rate|cost|kimat|keemat|kitna|charge|fare|fees?|book(?:ing)?|available|availability|options?)\b/
  return externalNoun.test(text) && priceIntent.test(text) ? 'web_search' : null
}

export function requestedRecordTool(messages = []) {
  const userMessages = messages.filter(message => message?.role === 'user')
  const last = userMessages[userMessages.length - 1]
  const text = (typeof last?.content === 'string' ? last.content : '').toLowerCase()
  if (!text) return null
  const verb = /\b(edit|update|change|modify|rename|correct|badal\w*|hata\w*|remove|delete|mita\w*|details?|detail|set|make|kar\s*do|kardo|karo|kar\s*dena|update\s*kar\w*)\b/.test(text)
  const noun = /\b(medications?|medicines?|dawa|dawai|dosage|doses?|pets?|tasks?|reminders?|subscriptions?|loans?|emis?|fd|fds|fixed deposits?|bills?|holdings?|portfolio|child|children|kids?|activity|activities|warranty|warranties|gifts?|celebrations?|steps?|heart\s*rate|sleep|calories?|weight|height|bmi|vitals?|workout|distance|health\s*log|blood\s*pressure|spo2|oxygen|body\s*fat|muscle\s*mass|waist|water|protein|carbs?|cycle)\b/.test(text)
  return verb && noun ? 'list_records' : null
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
    description: 'Send an approved email draft.',
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
        name: { type: 'string', description: 'On screen: "Subscription Name", e.g. "Netflix"' },
        category: { type: 'string', enum: ['Streaming', 'Software', 'Cloud', 'Gaming', 'News', 'Fitness', 'Education', 'Other'], description: 'On screen: "Category"' },
        amount: { type: 'number', description: 'On screen: "Amount" — charged per billing cycle' },
        billing_cycle: { type: 'string', enum: ['Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'], description: 'On screen: "Billing Cycle". Defaults to Monthly' },
        provider: { type: 'string', description: 'On screen: "Provider"' },
        start_date: { type: 'string', description: 'On screen: "Subscription Start Date". ISO date. Defaults to today.' },
        payment_method: { type: 'string', enum: ['Card', 'Bank', 'UPI', 'Wallet', 'Other'], description: 'On screen: "Payment Method"' },
        auto_renewal: { type: 'boolean', description: 'On screen: "Auto Renewal". Defaults to true' },
        notes: { type: 'string', description: 'On screen: "Notes"' },
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
        loan_type: { type: 'string', enum: ['Personal Loan', 'Home Loan', 'Car Loan', 'Education Loan', 'Business Loan', 'Gold Loan', 'Other'], description: 'On screen: "Loan Type"' },
        lender_name: { type: 'string', description: 'On screen: "Lender / Bank Name"' },
        principal_amount: { type: 'number', description: 'On screen: "Original Loan Amount (₹)"' },
        interest_rate: { type: 'number', description: 'On screen: "Interest Rate (%)" — annual' },
        number_of_emis: { type: 'number', description: 'On screen: "Number of EMIs" — total loan tenure in months' },
        name: { type: 'string', description: 'On screen: "Loan Name". Defaults to "<loan_type> from <lender_name>".' },
        outstanding_amount: { type: 'number', description: 'On screen: "Current Outstanding Amount (₹)". Defaults to the full principal (nothing paid yet).' },
        interest_type: { type: 'string', enum: ['Fixed', 'Floating'], description: 'On screen: "Interest Type". Defaults to Fixed' },
        interest_calculation: { type: 'string', enum: ['Reducing Balance', 'Flat Rate'], description: 'On screen: "Interest Calculation". Defaults to Reducing Balance' },
        emi_frequency: { type: 'string', enum: ['Monthly', 'Bi-weekly', 'Quarterly'], description: 'On screen: "EMI Frequency". Defaults to Monthly' },
        emi_amount: { type: 'number', description: 'On screen: "EMI Amount (₹)". Computed automatically from principal/rate/tenure if omitted.' },
        loan_start_date: { type: 'string', description: 'On screen: "Loan Start Date". ISO date. Defaults to today.' },
        account_number: { type: 'string', description: 'On screen: "Loan Account Number"' },
        auto_debit: { type: 'boolean', description: 'On screen: "Auto Debit?"' },
        notes: { type: 'string', description: 'On screen: "Notes"' },
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
        emi_type: { type: 'string', enum: ['Loan EMI', 'Credit Card EMI', 'Product EMI', 'Other'], description: 'On screen: "EMI Type"' },
        provider: { type: 'string', description: 'On screen: "Provider / Bank / Merchant"' },
        total_amount: { type: 'number', description: 'On screen: "Total Amount (₹)" — total price being paid off' },
        number_of_installments: { type: 'number', description: 'On screen: "No. of Installments"' },
        name: { type: 'string', description: 'On screen: "EMI Name". Defaults to "<emi_type> - <product_name or provider>".' },
        product_name: { type: 'string', description: 'On screen: "Product / Purchase Name"' },
        down_payment: { type: 'number', description: 'On screen: "Down Payment (₹)". Defaults to 0' },
        interest_rate: { type: 'number', description: 'On screen: "Interest Rate (%)" — annual, defaults to 0 (no-cost EMI)' },
        emi_amount: { type: 'number', description: 'On screen: "EMI Amount (₹)". Computed automatically from the financed amount/rate/installments if omitted.' },
        frequency: { type: 'string', enum: ['Monthly', 'Bi-weekly', 'Quarterly'], description: 'On screen: "Frequency". Defaults to Monthly' },
        payment_method: { type: 'string', enum: ['Card', 'Bank', 'UPI', 'Wallet', 'Other'], description: 'On screen: "Payment Method"' },
        start_date: { type: 'string', description: 'On screen: "Start Date". Defaults to today' },
        auto_debit: { type: 'boolean', description: 'On screen: "Auto Debit"' },
        notes: { type: 'string', description: 'On screen: "Notes"' },
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
        bank_name: { type: 'string', description: 'On screen: "Bank / Institution"' },
        principal_amount: { type: 'number', description: 'On screen: "Principal Amount (₹)"' },
        interest_rate: { type: 'number', description: 'On screen: "Interest Rate (%)" — annual' },
        maturity_date: { type: 'string', description: 'On screen: "Maturity Date". ISO date. Provide this OR tenure_months.' },
        tenure_months: { type: 'number', description: 'On screen: "Tenure (months)". Used to compute maturity_date if that is not given.' },
        name: { type: 'string', description: 'On screen: "FD Name". Defaults to "FD - <bank_name>".' },
        start_date: { type: 'string', description: 'On screen: "Start Date". Defaults to today' },
        compounding_frequency: { type: 'string', enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'Cumulative'], description: 'On screen: "Compounding Frequency". Defaults to Quarterly' },
        interest_payout: { type: 'string', enum: ['On Maturity', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'], description: 'On screen: "Interest Payout". Defaults to On Maturity' },
        account_number: { type: 'string', description: 'On screen: "FD Account / Certificate Number"' },
        nominee: { type: 'string', description: 'On screen: "Nominee"' },
        auto_renewal: { type: 'boolean', description: 'On screen: "Auto Renewal"' },
        notes: { type: 'string', description: 'On screen: "Notes"' },
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
        name: { type: 'string', description: 'On screen: "Holding Name", e.g. "Reliance Industries", "HDFC Flexi Cap Fund"' },
        type: { type: 'string', enum: ['Stock', 'Mutual Fund', 'SIP', 'ETF', 'Bonds', 'Gold', 'Crypto', 'Fixed Income', 'Other'], description: 'On screen: "Type"' },
        invested_amount: { type: 'number', description: 'On screen: "Invested Amount (₹)"' },
        current_value: { type: 'number', description: 'On screen: "Current Value (₹)". Defaults to invested_amount if not stated (assumes no gain/loss yet).' },
        platform: { type: 'string', enum: ['Groww', 'Zerodha', 'Angel One', 'Upstox', 'Kite', 'Other'], description: 'On screen: "Platform"' },
        quantity: { type: 'number', description: 'On screen: "Units / Shares"' },
        avg_buy_price: { type: 'number', description: 'On screen: "Avg Buy Price (₹)" — per unit' },
        current_price: { type: 'number', description: 'On screen: "Current Price (₹)" — per unit' },
        purchase_date: { type: 'string', description: 'On screen: "Purchase Date"' },
        notes: { type: 'string', description: 'On screen: "Notes"' },
      },
      required: ['name', 'type', 'invested_amount'],
    },
  },
  {
    name: 'add_expense',
    description: 'Log an everyday/ad-hoc expense (groceries, auto, chai, shopping, etc.) to Finance. Different from create_subscription/create_loan/create_emi — those are recurring commitments, this is a one-off spend with how it was paid.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'On screen: "Amount (₹)"' },
        payment_method: { type: 'string', enum: ['Cash', 'Online', 'Card', 'UPI'], description: 'On screen: "Paid via"' },
        category: { type: 'string', description: 'On screen: "Category", e.g. Food, Transport, Shopping, Bills, Entertainment, Other' },
        note: { type: 'string', description: 'On screen: "Note" — what it was for' },
        date: { type: 'string', description: 'Combines the screen\'s separate "Date" and "Time" fields into one ISO datetime. Defaults to now if not stated' },
      },
      required: ['amount', 'payment_method'],
    },
  },
  {
    name: 'log_health_data',
    description: 'Log manual health metrics (Activity, Body, Vitals, or Nutrition) for today into the Health module. Accepts any combination of metrics — provide at least one.',
    input_schema: {
      type: 'object',
      properties: {
        steps: { type: 'number', description: 'On screen: "Steps"' },
        heart_rate: { type: 'number', description: 'On screen: "Heart Rate", bpm' },
        blood_pressure_systolic: { type: 'number', description: 'On screen: "BP Systolic", mmHg' },
        blood_pressure_diastolic: { type: 'number', description: 'On screen: "BP Diastolic", mmHg' },
        blood_oxygen: { type: 'number', description: 'On screen: "SpO₂", %' },
        weight: { type: 'number', description: 'On screen: "Weight", kg' },
        height: { type: 'number', description: 'On screen: "Height", cm' },
        bmi: { type: 'number', description: 'On screen: "BMI"' },
        body_fat: { type: 'number', description: 'On screen: "Body Fat", %' },
        muscle_mass: { type: 'number', description: 'On screen: "Muscle Mass", kg' },
        waist: { type: 'number', description: 'On screen: "Waist", cm' },
        body_temp: { type: 'number', description: 'On screen: "Temperature", °C — NOT °F, the screen stores and displays Celsius' },
        sleep: { type: 'number', description: 'On screen: "Total Sleep", hours' },
        calories: { type: 'number', description: 'On screen: "Calories", kcal' },
        protein: { type: 'number', description: 'On screen: "Protein", grams' },
        carbs: { type: 'number', description: 'On screen: "Carbs", grams' },
        fat: { type: 'number', description: 'On screen: "Fat", grams' },
        fiber: { type: 'number', description: 'On screen: "Fiber", grams' },
        water: { type: 'number', description: 'On screen: "Water", ml — NOT liters, the screen stores and displays milliliters' },
        active_minutes: { type: 'number', description: 'On screen: "Active Minutes"' },
        workout_type: { type: 'string', description: 'On screen: "Workout Type", e.g. walking, running, cycling, swimming, yoga, gym/strength' },
        workout_duration: { type: 'number', description: 'On screen: "Duration", minutes' },
        workout_calories: { type: 'number', description: 'On screen: "Calories Burned", kcal. If omitted, this is estimated automatically from steps/distance/duration and the user\'s own weight — do not calculate it yourself, just pass whatever the user actually gave (steps, workout_type, workout_duration, distance) and leave this out.' },
        distance: { type: 'number', description: 'On screen: "Distance", km. If omitted but steps are given, this is estimated automatically from the user\'s own height — do not calculate it yourself.' },
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
        parent: { type: 'string', enum: ['Dad', 'Mom', 'Both'], description: 'On screen: "For"' },
        med_name: { type: 'string', description: 'On screen: "Medicine Name"' },
        dosage: { type: 'string', description: 'On screen: "Dosage", e.g. "500mg", "1 tablet"' },
        frequency: { type: 'string', enum: ['Once daily', 'Twice daily', 'Thrice daily', 'Every 8 hrs', 'Weekly', 'As needed'], description: 'On screen: "Frequency"' },
        dose_times: { type: 'array', items: { type: 'string' }, description: 'On screen: "Reminder times". 24h "HH:mm" times, e.g. ["08:00","20:00"]' },
        meal_time: { type: 'string', enum: ['Before meal', 'After meal', 'With meal', 'Empty stomach'], description: 'On screen: "When to take"' },
        doctor: { type: 'string', description: 'On screen: "Doctor Name"' },
        duration: { type: 'string', description: 'On screen: "Duration", e.g. "7 days", "Ongoing"' },
        refill_date: { type: 'string', description: 'When the current supply runs out — shown as a "Refills" tag on the medicine, once set' },
        notes: { type: 'string', description: 'On screen: "Notes"' },
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
        title: { type: 'string', description: 'On screen: "Task Title"' },
        assignee_name: { type: 'string', description: 'On screen: "Assign To" — name/email of the connected family member this is for, or "myself". Defaults to myself.' },
        description: { type: 'string', description: 'On screen: "Description"' },
        priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Urgent'], description: 'On screen: "Priority"' },
        category: { type: 'string', description: 'On screen: "Category"' },
        due_date: { type: 'string', description: 'On screen: "Due Date"' },
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
        name: { type: 'string', description: 'On screen: "Pet Name"' },
        species: { type: 'string', enum: ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish', 'Other'], description: 'On screen: "Species"' },
        breed: { type: 'string', description: 'On screen: "Breed"' },
        sex: { type: 'string', enum: ['Male', 'Female'], description: 'On screen: "Sex"' },
        dob: { type: 'string', description: 'On screen: "Date of Birth"' },
        weight: { type: 'string', description: 'On screen: "Weight"' },
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
        pet_name: { type: 'string', description: 'Name of the existing pet this reminder is for (matched against Pet Care\'s saved pets)' },
        type: { type: 'string', enum: ['Vaccination', 'Medication', 'Grooming', 'Vet Appointment', 'Feeding'], description: 'On screen: "Reminder Type"' },
        title: { type: 'string', description: 'On screen: "Title", e.g. "Rabies booster"' },
        remind_at: { type: 'string', description: 'Combines the screen\'s separate "Date" and "Time (HH:MM)" fields into one future ISO datetime with offset, e.g. 2026-09-25T09:00:00+05:30' },
        notes: { type: 'string', description: 'On screen: "Notes"' },
      },
      required: ['pet_name', 'type', 'title', 'remind_at'],
    },
  },
  {
    name: 'add_family_item',
    description: `Add an item to a family module — pick domain + type, then fill "fields" with exactly the keys listed below (all as strings). Wherever a real option list is shown, use one of those EXACT values (matching the app's own dropdowns) — never invent a similar-sounding one. Each field's on-screen label is given in quotes — when asking the user for a missing required field, ask for it by that exact on-screen name, not the fields.key. Required fields per domain+type:
- domain=children, type=child (screen: Children & Activities): REQUIRED fields.name ("Name"). optional fields.age ("Age"), fields.school ("School"), fields.grade ("Grade").
- domain=children, type=activity (screen: Children & Activities): REQUIRED fields.name ("Activity Name"), fields.day ("Day" — day of the WEEK this recurs on, one of: Mon/Tue/Wed/Thu/Fri/Sat/Sun — not a calendar date). optional fields.child ("For Child"), fields.type ("Activity Type", one of: School/Sports/Music/Dance/Art/Tuition/Other), fields.time ("Time"), fields.venue ("Venue").
- domain=children, type=event (screen: Children & Activities): REQUIRED fields.title ("Event Title"), fields.date ("Date"). optional fields.child ("Child"), fields.time ("Time — for reminder"), fields.notes ("Notes").
- domain=home, type=task (screen: Home Maintenance): REQUIRED fields.title ("Task Title"). optional fields.type ("Task Type", one of: Plumbing/Electrical/Cleaning/Painting/Carpentry/AC Service/Pest Control/Other), fields.priority ("Priority", one of: High/Medium/Low), fields.dueDate ("Due Date"), fields.time ("Time (HH:MM)"), fields.notes ("Notes").
- domain=home, type=contact (screen: Home Maintenance): REQUIRED fields.name ("Name"). optional fields.role ("Role"), fields.phone ("Phone"), fields.notes ("Notes").
- domain=home, type=warranty (screen: Home Maintenance): REQUIRED fields.item ("Item Name"). optional fields.brand ("Brand"), fields.purchaseDate ("Purchase Date"), fields.expiryDate ("Expiry Date"), fields.notes ("Notes").
- domain=celebration, type=occasion (screen: Celebration & Gifting): REQUIRED fields.person ("Person / Name"), fields.date ("Date"). optional fields.type ("Occasion Type", one of: Birthday/Anniversary/Festival/Wedding/Graduation/Baby Shower/Other), fields.time ("Time (HH:MM)"), fields.notes ("Notes").
- domain=celebration, type=gift (screen: Celebration & Gifting): REQUIRED fields.person ("For"), fields.item ("Gift Item"). optional fields.occasion ("Occasion"), fields.budget ("Budget (₹)"), fields.status ("Status", one of: Idea/Ordered/Delivered/Given), fields.notes ("Notes").
- domain=calendar, type=event (screen: Family Calendar): REQUIRED fields.title ("Title"), fields.date ("Date"). optional fields.type ("Event Type", one of: Birthday/Anniversary/School/Medical/Travel/Festival/Meeting/Other), fields.member ("For Member", one of: Dad/Mom/Self/Spouse/Child/All), fields.time ("Time (HH:MM)"), fields.notes ("Notes").
If a required field for the chosen domain+type is missing from the conversation, ask the user for it using its exact on-screen name before calling this tool.`,
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
  {
    name: 'web_search',
    description: 'Search the live internet for current information — news, prices, scores, facts, or anything that may have changed after your training or that you are not confident about. Use this instead of guessing whenever the user asks about something current, real-time, or outside your own knowledge. Not for the user\'s own saved data (use personal_search for that).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A focused web search query, e.g. "RBI repo rate September 2026".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_records',
    description: 'List the user\'s saved records for one module, WITH their ids. ALWAYS call this first before update_record or delete_record (you need the id), and also whenever the user asks for the details of a saved item. Modules: health_log (id is the entry DATE, e.g. "2026-09-27"), parent_medication, family_task, pet, pet_reminder (needs pet_id — get it from module "pet"), family_item (needs family_domain: children/home/celebration/calendar), subscription, loan, emi, fixed_deposit, bill, portfolio_holding, expense.',
    input_schema: {
      type: 'object',
      properties: {
        module: { type: 'string', enum: ['parent_medication', 'family_task', 'pet', 'pet_reminder', 'family_item', 'subscription', 'loan', 'emi', 'fixed_deposit', 'bill', 'portfolio_holding', 'expense', 'health_log'] },
        pet_id: { type: 'string', description: 'Only for module pet_reminder.' },
        family_domain: { type: 'string', enum: ['children', 'home', 'celebration', 'calendar'], description: 'Only for module family_item.' },
      },
      required: ['module'],
    },
  },
  {
    name: 'update_record',
    description: 'EDIT / UPDATE / CHANGE an existing saved record (the user says edit, update, change, rename, reschedule, mark as done, etc.). Get the id from list_records first. Pass ONLY the fields being changed, using the exact field names shown in list_records output (e.g. for a parent medication: medName, dosage, frequency, mealTime, parent, startDate, duration, doctor, notes, refillDate, doseTimes, active). health_log: id is the DATE (YYYY-MM-DD) from list_records, and fields are any of steps/activeMinutes/workoutType/workoutDuration/workoutCalories/distance/weight/height/bmi/bodyFat/muscleMass/waist/heartRate/bloodPressureSystolic/bloodPressureDiastolic/bloodOxygen/bodyTemp/sleep/sleepBedtime/sleepWakeup/sleepDeep/sleepRem/sleepLight/calories/protein/carbs/fat/fiber/water/cyclePhase/cycleDay/periodFlow/symptoms — pass null to clear a field. family_task: pass "status" (ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED, REJECTED) to change status, and/or title/description/priority/category/dueDate/recurrence to edit the task itself (editing is creator-only; dueDate cannot be in the past). family_item: pass the data fields to change (and optionally done / remind_at). Works for the same modules as list_records.',
    input_schema: {
      type: 'object',
      properties: {
        module: { type: 'string', enum: ['parent_medication', 'family_task', 'pet', 'pet_reminder', 'family_item', 'subscription', 'loan', 'emi', 'fixed_deposit', 'bill', 'portfolio_holding', 'expense', 'health_log'] },
        id: { type: 'string', description: 'Record id from list_records.' },
        fields: { type: 'object', description: 'Only the fields to change, as key/value pairs.' },
        pet_id: { type: 'string', description: 'Only for module pet_reminder.' },
        family_domain: { type: 'string', enum: ['children', 'home', 'celebration', 'calendar'], description: 'Only for module family_item.' },
      },
      required: ['module', 'id', 'fields'],
    },
  },
  {
    name: 'delete_record',
    description: 'DELETE / REMOVE a saved record permanently (the user says delete, remove, cancel it, get rid of it). Get the id from list_records first. If more than one record could match, ask the user which one before deleting.',
    input_schema: {
      type: 'object',
      properties: {
        module: { type: 'string', enum: ['parent_medication', 'family_task', 'pet', 'pet_reminder', 'family_item', 'subscription', 'loan', 'emi', 'fixed_deposit', 'bill', 'portfolio_holding', 'expense', 'health_log'] },
        id: { type: 'string', description: 'Record id from list_records.' },
        pet_id: { type: 'string', description: 'Only for module pet_reminder.' },
        family_domain: { type: 'string', enum: ['children', 'home', 'celebration', 'calendar'], description: 'Only for module family_item.' },
      },
      required: ['module', 'id'],
    },
  },
]

// Human-readable label for a blocked gated action's message, and a short
// summary for the PendingAction card shown while it awaits approval.
const ACTION_LABELS = {
  initiate_payment: 'make this payment',
  create_subscription: 'add this subscription',
  create_loan: 'add this loan',
  create_emi: 'add this EMI',
  create_fixed_deposit: 'add this fixed deposit',
  add_portfolio_holding: 'add this to your portfolio',
  add_expense: 'log this expense',
  send_email: 'send this email',
  schedule_event: 'schedule this meeting',
  log_health_data: 'log this health data',
  add_parent_medication: 'add this medication',
  create_family_task: 'create this family task',
  add_pet: 'add this pet',
  add_pet_reminder: 'set this pet reminder',
  add_family_item: 'add this item',
  update_record: 'make this change',
  delete_record: 'delete this',
}
function describeAction(name) {
  return ACTION_LABELS[name] || 'do this automatically'
}

function buildActionSummary(name, input) {
  switch (name) {
    case 'initiate_payment': return `Pay ₹${(Number(input.amount) || 0).toLocaleString('en-IN')} to ${input.payee || 'payee'}`
    case 'create_subscription': return `Add subscription: ${input.name || 'Untitled'}`
    case 'create_loan': return `Add loan: ${input.name || `${input.loan_type || 'Loan'} from ${input.lender_name || 'lender'}`}`
    case 'create_emi': return `Add EMI: ${input.name || input.emi_type || 'Untitled'}`
    case 'create_fixed_deposit': return `Add fixed deposit: ${input.name || `FD - ${input.bank_name || ''}`}`
    case 'add_portfolio_holding': return `Add to portfolio: ${input.name || 'Untitled'}`
    case 'add_expense': return `Log expense: ₹${(Number(input.amount) || 0).toLocaleString('en-IN')}${input.category ? ` (${input.category})` : ''}`
    case 'send_email': return `Send email to ${input.recipient || 'recipient'}`
    case 'schedule_event': return `Schedule meeting: ${input.title || 'Untitled'}`
    case 'log_health_data': return 'Log health data'
    case 'add_parent_medication': return `Add medication: ${input.med_name || 'Untitled'} for ${input.parent || ''}`
    case 'create_family_task': return `Add family task: ${input.title || 'Untitled'}`
    case 'add_pet': return `Add pet: ${input.name || 'Untitled'}`
    case 'add_pet_reminder': return `Reminder for ${input.pet_name || 'pet'}: ${input.title || 'Untitled'}`
    case 'add_family_item': return `Add ${input.type || 'item'} to ${input.domain || 'Family'}`
    case 'update_record': return `Update ${recordLabel(input.module)}${input.fields ? `: ${Object.entries(input.fields).map(([k, v]) => `${k} → ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}` : ''}`
    case 'delete_record': return `Delete ${recordLabel(input.module)}`
    default: return 'Pending action'
  }
}

function recordLabel(module) {
  return String(module || 'record').replace(/_/g, ' ')
}

// ── Tool Executor ────────────────────────────────────────────────────────────
// The gate check below runs ONCE, generically, for every domain-gated tool
// (see GATED_DOMAINS and decideGate in pendingActions.service.js). Every
// current caller is a direct user command (see executeTool's two real
// callers), so this only actually defers/blocks anything for send_email
// (still staged L1-L4) and initiate_payment above the threshold (always
// needs a tap) — every other gated tool (Finance/Health/Family data entry,
// update_record, delete_record) falls straight through to the switch below.
// `opts.skipGate` is used only by resolvePendingAction's internal
// re-invocation on approval, so a just-approved action doesn't get deferred
// to pending all over again. `opts.autonomous` is for a future caller that
// decided to act on its own initiative, with no preceding user request —
// see the comment on decideGate; nothing passes this yet.
export async function executeTool(name, input, userId, opts = {}) {
  const domain = domainForCall(name, input)
  if (domain && !opts.skipGate) {
    const domainTrust = await getDomainTrust(userId, domain)
    const amount = name === 'initiate_payment' ? Number(input.amount) || 0 : 0
    const gate = decideGate(name, domainTrust, amount, domain, { autonomous: !!opts.autonomous })
    if (gate.mode === 'blocked') {
      const reasonMessage = blockedMessage(gate.reason, describeAction(name))
      // `error` mirrors every other failure path in this switch (the chat
      // response builder below only ever reads `.error`, not `.message`) —
      // without it, a blocked gate silently fell back to a generic
      // "the action did not complete" instead of this specific explanation.
      return { success: false, blocked: true, domain: gate.domain, reason: gate.reason, error: reasonMessage, message: reasonMessage }
    }
    if (gate.mode === 'pending') {
      await recordDomainAction(userId, domain, 'observed')
      let summary = buildActionSummary(name, input)
      if (name === 'update_record' || name === 'delete_record') {
        const { describeRecord } = await import('../services/recordOps.js')
        const title = await describeRecord(userId, input)
        if (title) summary = summary.replace(/^(Update|Delete) ([^:]+)/, `$1 $2 "${title}"`)
      }
      const pending = await createPendingAction(userId, name, domain, input, summary)
      return { success: true, status: 'pending_approval', pendingActionId: pending.id, requiresBiometric: name === 'initiate_payment' && amount >= 1000, message: "I've prepared this — approve it in the app to send it." }
    }
    // gate.mode === 'execute' — falls through to the real work below.
    await recordDomainAction(userId, domain, 'observed')
  }
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
    // Gating (blocked/pending) already handled generically above — this
    // case only ever runs once the gate says 'execute'.
    case 'initiate_payment': {
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
    // Gating (blocked/pending) already handled generically above.
    case 'send_email': {
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
        return { success: false, error: 'That date and time is in the past (or could not be understood). Tell the user it is a past date and ask for a future date and time.' }
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
        const timeZone = 'Asia/Kolkata' // meetings are always scheduled and shown in IST
        const startDt = normalizeScheduledTime(input.start, timeZone)
        if (!startDt || startDt.getTime() <= Date.now()) return { success: false, error: 'That date and time is in the past (or could not be understood). Tell the user it is a past date and ask for a future date and time.' }
        const endDt = input.end ? normalizeScheduledTime(input.end, timeZone) : new Date(startDt.getTime() + 60 * 60 * 1000)
        if (!endDt || endDt <= startDt) return { success: false, error: 'Meeting end time must be after its start time.' }
        const { findScheduleConflict } = await import('../services/calendar.service.js')
        const conflict = await findScheduleConflict(userId, startDt.toISOString(), endDt.toISOString())
        if (conflict) {
          const conflictTime = new Date(conflict.start).toLocaleTimeString('en-IN', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true })
          return { success: false, error: `The user already has "${conflict.title}" at ${conflictTime}. Tell them this clashes and ask them to pick another time — do not create the meeting.` }
        }
        let meeting
        let calendarError = null
        try {
          meeting = await createMeetingWithGoogleMeet(userId, {
            title: input.title,
            start: startDt.toISOString(),
            end: endDt.toISOString(),
            description: input.description || '',
            attendees: input.attendees || [],
            timeZone,
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
              message: JSON.stringify({ source: 'calendar', eventId: meeting.eventId, meetLink: meeting.meetLink, conferenceId: meeting.conferenceId || null, preview: input.description || input.title, start: startDt.toISOString(), end: endDt.toISOString(), description: input.description || null, attendees: input.attendees || [] }),
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
      const loanData = {
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
      }
      // Same checks POST/PATCH /loans run — this tool creates a Loan via
      // Prisma directly, bypassing that route entirely, so it needs its own
      // call into the shared validator (see finance.js).
      const { validateLoanData } = await import('../routes/finance.js')
      const validationError = validateLoanData(loanData)
      if (validationError) return { success: false, error: `${validationError}. Ask the user to correct this before trying again.` }
      const loan = await prisma.loan.create({ data: loanData })
      // Mirrors the Loan's own EMI fields into a real Emi row (see
      // emiDataFromLoan in routes/finance.js) so it shows up in the EMI
      // tracker too, not just the Loan screen — same as the manual
      // POST /loans route does.
      const { emiDataFromLoan } = await import('../routes/finance.js')
      await prisma.emi.create({ data: emiDataFromLoan(loan) })
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
      return { success: true, holdingId: holding.id, name: holding.name, type: holding.type, investedAmount: holding.investedAmount, currentValue: holding.currentValue }
    }
    case 'add_expense': {
      const missing = missingRequired(input, [['amount', 'amount'], ['payment_method', 'payment_method']])
      if (missing.length) return { success: false, error: `Missing required field(s): ${missing.join(', ')}. Ask the user for these before calling this tool again.` }

      const amount = Number(input.amount)
      if (!(amount > 0)) return { success: false, error: 'amount must be greater than 0.' }

      let date = new Date()
      if (input.date) {
        const d = new Date(input.date)
        if (!isNaN(d.getTime())) date = d
      }

      const expense = await prisma.expense.create({
        data: {
          userId,
          amount,
          paymentMethod: input.payment_method,
          category: input.category || null,
          note: input.note || null,
          date,
        },
      })
      return { success: true, expenseId: expense.id, amount: expense.amount, paymentMethod: expense.paymentMethod, category: expense.category }
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
      // Same "notify whoever this is actually for" as the manual route —
      // see notifyConnectedParent in routes/family.js for why this needs its
      // own call (this tool bypasses that route's POST handler entirely).
      emitToUser(userId, 'parent_med:created', med)
      sendPushToUser(userId, {
        title: 'Medicine added',
        body: `${med.medName} (${med.dosage}) added for ${med.parent}`,
        data: { type: 'parent_medication', medicationId: med.id },
      })
      const { notifyConnectedParent } = await import('../routes/family.js')
      notifyConnectedParent(userId, med).catch(() => {})
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
      return { success: true, petId: pet.id, name: pet.name, species: pet.species }
    }
    case 'add_pet_reminder': {
      const missing = missingRequired(input, [['pet_name', 'pet_name'], ['type', 'type'], ['title', 'title'], ['remind_at', 'remind_at']])
      if (missing.length) return { success: false, error: `Missing required field(s): ${missing.join(', ')}. Ask the user for these before calling this tool again.` }
      const pet = await prisma.pet.findFirst({ where: { userId, name: { equals: input.pet_name, mode: 'insensitive' } } })
      if (!pet) return { success: false, error: `No pet named "${input.pet_name}" found for this account. Add the pet first with add_pet.` }
      const timeZone = await getUserTimeZone(userId)
      const remindAt = normalizeScheduledTime(input.remind_at, timeZone)
      if (!remindAt || remindAt.getTime() <= Date.now()) return { success: false, error: 'That date and time is in the past (or could not be understood). Tell the user it is a past date and ask for a future date and time.' }
      const reminder = await prisma.petReminder.create({
        data: { petId: pet.id, userId, type: input.type, title: input.title, remindAt, notes: input.notes || null },
      })
      return { success: true, reminderId: reminder.id, pet: pet.name, title: reminder.title, remindAt: reminder.remindAt }
    }
    case 'web_search': {
      if (!String(input.query || '').trim()) return { success: false, error: 'query is required' }
      try {
        const { tavilySearch } = await import('../services/webSearch.js')
        const result = await tavilySearch(input.query)
        if (!result.answer && !result.results.length) return { success: true, query: input.query, answer: null, results: [], note: 'No results found.' }
        return {
          success: true, query: input.query, ...result,
          // Web pages disagree on live numbers (rates, prices, scores) partly
          // because some are stale/evergreen pages that don't get updated the
          // day something changes — "answer" is Tavily's own synthesis across
          // all sources and should be trusted over any one result's text.
          note: result.answer ? 'The "answer" field is the most reliable synthesized value. Individual "results" entries can disagree with it or with each other because some pages are outdated — do not average or mix numbers across them; report what "answer" says.' : undefined,
        }
      } catch (err) {
        // Never let a down/misconfigured search API break the whole reply —
        // the model still has its own knowledge to fall back on.
        return { success: false, error: err.message }
      }
    }
    case 'list_records': {
      const { listRecords } = await import('../services/recordOps.js')
      return await listRecords(userId, input)
    }
    case 'update_record': {
      const { updateRecord } = await import('../services/recordOps.js')
      return await updateRecord(userId, input)
    }
    case 'delete_record': {
      const { deleteRecord } = await import('../services/recordOps.js')
      return await deleteRecord(userId, input)
    }
    case 'add_family_item': {
      const { domain, type, fields = {}, remind_at } = input
      const requiredForType = FAMILY_ITEM_REQUIRED_FIELDS[domain]?.[type]
      if (!requiredForType) return { success: false, error: `Unknown domain/type combination: ${domain}/${type}` }
      const missing = requiredForType.filter((f) => !fields[f])
      if (missing.length) return { success: false, error: `Missing required field(s) for ${domain}/${type}: ${missing.join(', ')}. Ask the user for these before retrying.` }

      // Same checks POST/PATCH /family-items run — this tool creates a
      // FamilyItem via Prisma directly, bypassing that route entirely.
      const { validateFamilyItemData } = await import('../routes/familyItems.js')
      const validationError = validateFamilyItemData(domain, type, fields)
      if (validationError) return { success: false, error: `${validationError}. Ask the user to correct this before trying again.` }

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
        requester: { select: { id: true, name: true, email: true, userProfile: { select: { gender: true } } } },
        receiver:  { select: { id: true, name: true, email: true } },
      },
    })
    if (!conns.length) return ''
    const { inverseRelationship } = await import('../routes/family.js')
    const lines = conns.map(c => {
      const iAmRequester = c.requesterId === userId
      const other = iAmRequester ? c.receiver : c.requester
      // relationship is stored as "what the receiver is to the requester" —
      // correct as-is when the AI's own user was the requester, but needs
      // inverting (Father → Son/Daughter, etc.) when they were the receiver.
      // See inverseRelationship in routes/family.js.
      const relationship = iAmRequester ? c.relationship : inverseRelationship(c.relationship, c.requester.userProfile?.gender)
      return `  • ${other.name} (${other.email}) — ${relationship}`
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

IDENTITY: You are not a chatbot. You are an autonomous AI agent that acts on behalf of the user.

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
20. DATA-ENTRY TOOLS (create_subscription, create_loan, create_emi, create_fixed_deposit, add_portfolio_holding, add_expense, log_health_data, add_parent_medication, create_family_task, add_pet, add_pet_reminder, add_family_item): these save a real record into the user's Finance/Health/Family modules — treat filling them out like a short intake form, not a single-shot guess. Before calling one: check which of its parameters are in the tool's "required" list, and if any of those are missing from what the user has said, ask for exactly those in one message (don't ask about optional ones unless the user is clearly still supplying details) — never invent a value for a required field. Every other parameter is optional; only fill it if the user actually gave it, or leave it out (several, like an EMI amount or a next billing date, are computed for you when omitted). Once you have every required field, call the tool immediately — don't re-confirm back to the user first unless something about the request was ambiguous. After a successful save, confirm briefly with the key details (name/amount/date), not the raw tool output. WHEN ASKING FOR A MISSING FIELD: use the exact on-screen name the field's own description gives in quotes (e.g. "On screen: \"Medicine Name\"" → ask for "the medicine name", referencing "Medicine Name" the way the actual form does), never the raw snake_case parameter (med_name, loan_type, etc.) — the user fills these out by hand elsewhere too, so the name Ask AI uses must match what they see on that screen, not an internal field key they've never seen.
21. RESPONSE FORMATTING: The chat renders real markdown — **bold**, "- " bullets, "1. " numbered lists, "### " headers, and pipe tables — so use it the way a polished AI product (ChatGPT/Claude) would, not as plain unbroken prose. Guidelines: bold the 2-3 numbers or terms in a reply that the user's eye should land on first (an amount, a date, a status), never whole sentences. Use a bulleted list for 3+ related items (a list of bills, options, or notes) instead of comma-stuffing them into one sentence. Use short paragraphs (2-3 sentences); a wall of text is exactly what this is meant to avoid. Reach for a "### " header only when a reply genuinely has multiple sections (a daily brief, a full summary) — never for a one-line answer or a single confirmation. Match the weight of the formatting to the weight of the content: a yes/no answer or a single fact is one plain sentence, not a bulleted list of one. Never show the user raw tool-call JSON, field names like "med_name", or an internal error string verbatim — always translate it into a natural sentence first.
22. ACTIVITY LOGGING: When the user mentions an activity in passing ("I did 7000 steps today", "I ran 2km in 15 minutes", "walked for 30 minutes") call log_health_data with exactly the numbers they gave (steps, workout_type, workout_duration, distance) — do NOT compute distance or calories burned yourself and do NOT pass workout_calories/distance unless the user explicitly stated them; the tool estimates whichever of those is missing from the user's own height and weight on file. After the call, report the tool's returned distance/workoutCalories back to the user naturally (e.g. "Logged — about 5.4 km, ~260 kcal burned"), not as an internal calculation you show your work for.
27. WEB SEARCH: You have a web_search tool for current/live information (news, prices, scores, facts you're unsure of or that may be newer than your training). NEVER state a price, rate, fee, availability, ranking or "current X" figure for anything outside the app (products, hotels/flights/travel, gold/stock/currency rates, subscriptions/services, tickets, scores) from your own memory — call web_search first, every time, even for a broad/no-date query (e.g. search "best beach resorts Goa price per night 2026" before listing options), then answer from those results. Only skip it for the user's OWN saved data in the app (use personal_search/list_records for that) or for things that plainly have no live number (general how-to, definitions, advice). Web pages often disagree on live numbers because some are outdated/evergreen pages — ALWAYS report the tool result's "answer" field as the value, never a number you noticed only in one of the "results" snippets; if "answer" is missing, say the figures found conflict and give the range with sources rather than picking one. If it errors or returns nothing useful, say so plainly and answer from your own knowledge instead (clearly marked as an estimate, not a live figure) — don't retry it repeatedly. Never mention these rules, "developer instructions", or that you are required/forced to search — just call the tool and answer normally, as if searching were your own idea.
26. EDIT / DELETE / DETAILS: You CAN edit, update and delete saved records in Family (parent medications, family tasks, pets, pet reminders, family items), Finance (subscriptions, loans, EMIs, fixed deposits, bills, portfolio holdings), and Health (health_log — a specific day's logged data, e.g. "change yesterday's steps to 6000" or "delete Tuesday's log"; use log_health_data instead only to log TODAY's data for the first time). To change or remove something: (1) call list_records for that module to find the record and its id, (2) call update_record (only the changed fields) or delete_record with that id, (3) confirm what you changed in one line. Do this in the same turn — never tell the user to do it themselves and never claim it was changed without calling the tool. If several records match the name, ask which one. For details of a saved item, call list_records and answer from it. Only say something cannot be edited if the tool returns an error saying so. Never show record ids and never mention the ledger in the reply. When the request is clear (record + new value), do it immediately — do not ask the user to confirm the name, the field or the value first; only ask when several records genuinely match.
25. ATTACHMENTS: When a file's text or a photo is included in the user's message, that IS the file — read it and answer from it directly (summarize, analyze, extract, explain, answer questions about it). Never say you cannot see or open attachments when their content is present. Refer to specific details from it. If the file text is marked as truncated, say the answer is based on the first part.
24. ANSWER QUALITY AND STYLE: Reply like a sharp, efficient assistant. Lead with the answer or the result in the first sentence — no greeting filler, no "Sure!/Certainly!", no restating the question, no listing what you can or cannot do. Keep it as short as the question allows: a simple question gets 1-2 sentences, a task gets the outcome plus only the key details (name, amount, date, time). NEVER mention trust levels, autonomy levels, "Observe mode", L1-L4, or the Autonomy Engine in a reply unless the user explicitly asks about them — they are internal settings, not something to explain in answers. If a tool result says an action was not done or is waiting for approval, say so in one short, plain sentence and give the simple next step (for example "I've prepared this — approve it in the app to send it" or "I can't add that automatically yet — you can add it yourself from the Family screen"), without explaining why in terms of levels or settings. Do not end with generic offers like "Let me know if you need anything else".
23. REMINDER RECURRENCE: set_reminder's "repeat" parameter defaults to "once" whenever you don't pass it — so whenever the user's own words imply recurrence ("every day", "daily", "each week", "weekly", "every month", "monthly", or the Hindi/Hinglish equivalents "roz", "har din", "har hafte", "har mahine"), you MUST pass the matching value ("daily"/"weekly"/"monthly") yourself. Never leave a recurring request as a one-time reminder just because it wasn't spelled out in English — the reminder the user actually asked for and the one that gets saved must match.

USER PROFILE (registered account details — answer any personal questions from this):
- Full Name: ${user.name || 'Not set'}
- Email Address: ${user.email || 'Not set'}
- City / Location: ${user.city || 'Not set'}
- Plan: ${user.plan || 'Free'}
- Member Since: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Unknown'}
- Email Verified: ${user.emailVerified ? 'Yes' : 'No'}

USER CONTEXT:
- Currency: ₹ (INR)
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
  // A file/photo attached to the latest question is given to the model
  // directly: a photo as an actual image, anything else as its full text.
  const attachment = context.attachment
  if (attachment) {
    const lastIdx = agentMsgs.length - 1
    const last = agentMsgs[lastIdx]
    const question = typeof last?.content === 'string' ? last.content : ''
    if (last && last.role === 'user') {
      if (attachment.type === 'image' && attachment.dataUrl) {
        agentMsgs[lastIdx] = {
          ...last,
          content: [
            { type: 'text', text: `${question}\n\n(The user attached the photo "${attachment.name}" — it is included below. Look at it and answer from what you see.)` },
            { type: 'image_url', image_url: { url: attachment.dataUrl } },
          ],
        }
      } else if (attachment.type === 'image') {
        agentMsgs[lastIdx] = { ...last, content: `${question}\n\n(The user attached the photo "${attachment.name}", but it was too large to read. Tell them to send a smaller version.)` }
      } else if (attachment.type === 'document') {
        const note = attachment.truncated ? ` (showing the first ${attachment.text.length} of ${attachment.totalChars} characters)` : ''
        agentMsgs[lastIdx] = {
          ...last,
          content: `${question}\n\n--- Attached file: ${attachment.name}${note} ---\n${attachment.text || '(the file has no readable text)'}\n--- end of attached file ---`,
        }
      }
    }
  }
  const allToolResults = []
  const executedActionResults = new Map()
  let iterations = 0
  const requestedActionTool = requestedSchedulingTool(messages)
  const requestedLookupTool = requestedActionTool ? null : requestedRecordTool(messages)
  const requestedSearchTool = (requestedActionTool || requestedLookupTool) ? null : requestedWebSearchTool(messages)
  const latestUserText = String([...messages].reverse().find(m => m?.role === 'user')?.content || '').toLowerCase()
  const wantsChange = !!requestedLookupTool && !/\bdetails?\b/.test(latestUserText)
  let nudgedToAct = false

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
        toolChoice: allToolResults.length === 0 ? (requestedActionTool || requestedLookupTool || requestedSearchTool) : null,
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
      // Looked the record up but then only described what it would do —
      // push once for the actual update/delete call.
      if (wantsChange && !nudgedToAct && allToolResults.some(r => r.tool === 'list_records')
        && !allToolResults.some(r => r.tool === 'update_record' || r.tool === 'delete_record')) {
        nudgedToAct = true
        agentMsgs.push({ role: 'assistant', content: textBlocks.map(b => b.text).join('\n') || 'Looking that up' })
        agentMsgs.push({ role: 'user', content: 'Now do it: call update_record or delete_record with the id from list_records. If several records could match, ask me which one instead.' })
        continue
      }
      const failedAction = allToolResults.find(item =>
        ['set_reminder', 'schedule_event'].includes(item.tool) && item.result?.success === false
      )
      if (failedAction) {
        // A gate-blocked result's `error` is already a complete, user-facing
        // sentence (see blockedMessage) — prefixing "I couldn't X: " onto it
        // reads as a redundant double sentence, so it's used as-is instead.
        const response = failedAction.result.blocked
          ? failedAction.result.error
          : `I couldn’t ${failedAction.tool === 'set_reminder' ? 'set that reminder' : 'schedule that event'}: ${failedAction.result.error || 'the action did not complete.'}`
        return {
          response,
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

      // book_cab/order_food/set_reminder aren't domain-gated (not one of the
      // 4 PDF trust domains) but still get logged here like every other
      // action tool. log_health_data/create_family_task/add_family_item are
      // deliberately excluded — they self-log under an aliased tool name
      // inside their own case body (see LEDGER_TOOL_ALIAS in
      // pendingActions.service.js) to match the label the equivalent manual
      // creation routes use; logging them again here would double the entry.
      const actionTools = [
        'initiate_payment', 'send_email', 'book_cab', 'order_food', 'set_reminder', 'schedule_event',
        'create_subscription', 'create_loan', 'create_emi', 'create_fixed_deposit', 'add_portfolio_holding', 'add_expense',
        'add_parent_medication', 'add_pet', 'add_pet_reminder',
      ]
      // BUG FIX: a gated tool landing on `pending_approval` used to ALSO get
      // logged here, eagerly, the moment the AI proposed it — and then
      // resolvePendingAction() (pendingActions.service.js) wrote a SECOND,
      // separate ledger row once the user actually approved/denied it. Since
      // neither row ever referenced the other, both stayed in Twin Diary
      // forever: the exact same action (e.g. "Add pet: Bruno") showed up
      // twice — once frozen at "pending_approval", once at its real final
      // outcome. resolvePendingAction is the only place that should log a
      // pending-gated action, exactly once, when it's actually resolved —
      // matching how create_family_task/add_family_item/log_health_data
      // already correctly behave.
      const isPending = result?.status === 'pending_approval'
      if (actionTools.includes(tb.name) && !isPending && !(identity && allToolResults.some(entry => actionIdentity(entry.tool, entry.input) === identity))) {
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
