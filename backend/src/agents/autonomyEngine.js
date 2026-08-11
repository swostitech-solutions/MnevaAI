import { logger } from '../config/logger.js'
import { ledger } from '../services/ledgerService.js'
import { prisma } from '../config/prisma.js'
import { emitToUser } from '../services/realtime.js'

const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'

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
function normalizeScheduledTime(value, timeZone) {
  const raw = String(value || '').trim()
  if (!raw) return null

  // Offset/Z timestamps already identify an exact instant.
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const instant = new Date(raw)
    return Number.isNaN(instant.getTime()) ? null : instant
  }

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null
  const [, year, month, day, hour, minute, second = '0'] = match
  const utcGuess = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second))
  let instant = new Date(utcGuess.getTime() - timeZoneOffsetAt(utcGuess, timeZone))
  // Recalculate once to handle daylight-saving transitions in non-Indian zones.
  instant = new Date(utcGuess.getTime() - timeZoneOffsetAt(instant, timeZone))
  return Number.isNaN(instant.getTime()) ? null : instant
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
function requestedSchedulingTool(messages = []) {
  const userMessages = messages
    .filter(message => message?.role === 'user')
    .slice(-4)
    .map(message => String(message.content || ''))
  const text = userMessages.join('\n').toLowerCase()

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

export function isDeepSeekConfigured(apiKey = process.env.DEEPSEEK_API_KEY) {
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

async function callDeepSeek({ model, system, messages, tools, toolChoice = null }) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!isDeepSeekConfigured(apiKey)) return null
  const base = process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com'
  const payload = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(p => p.type === 'text' ? { type: 'text', text: p.text || '' } : p) : '') })),
    ],
    temperature: 0.2,
  }
  if (Array.isArray(tools) && tools.length) {
    payload.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema || { type: 'object', properties: {}, required: [] } } }))
  }
  if (toolChoice) payload.tool_choice = { type: 'function', function: { name: toolChoice } }
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error?.message || `DeepSeek API error ${response.status}`)
  const choice = data.choices?.[0]
  const msg = choice?.message ?? {}
  const content = []
  if (typeof msg.content === 'string' && msg.content.trim()) content.push({ type: 'text', text: msg.content })
  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
    for (const tc of msg.tool_calls) {
      let inp = {}
      try { inp = JSON.parse(tc.function?.arguments || '{}') } catch { inp = { raw: tc.function?.arguments || '' } }
      content.push({ type: 'tool_use', id: tc.id || `tool_${Date.now()}`, name: tc.function?.name, input: inp })
    }
  }
  return { content, stop_reason: Array.isArray(msg.tool_calls) && msg.tool_calls.length ? 'tool_use' : (choice?.finish_reason || 'end_turn'), raw: data }
}

async function callOpenAI({ model, system, messages, tools, toolChoice = null }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!isOpenAIConfigured(apiKey)) return null

  const payload = {
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
    temperature: 0.2,
  }

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

// ── 13 Domain Tools (matching pitch deck capabilities) ──────────────────────
export const MNEVA_TOOLS = [
  {
    name: 'get_daily_brief',
    description: 'Generate the morning brief ONLY when the user explicitly asks for their daily brief, morning summary, what is pending today, or what needs attention. Do NOT call this for reminders, scheduling, or any other request.',
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
    case 'query_bills':          return []
    case 'initiate_payment':     return { actionId: `pay_${Date.now()}`, status: 'pending_approval', requiresBiometric: (input.amount || 0) >= 1000, ...input }
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
      try {
        const { sendEmail: _sendEmail } = await import('../services/gmail.service.js')
        const { userStore: _userStore } = await import('../models/userStore.js')
        const _user = await _userStore.getById(userId)
        const result = await _sendEmail(_user, input.recipient, input.email_id, input.draft)
        return { success: true, result }
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

      let job = null
      let queueError = null
      try {
        const { enqueueReminder } = await import('../queues/reminder.queue.js')
        job = await enqueueReminder({
          userId,
          message: input.message,
          time: scheduled,
          domain: input.domain || 'general',
          repeat: input.repeat || 'once',
        })
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
            extendedProperties: { private: { mnevaSource: 'reminder' } },
          })
        }
      } catch { /* calendar push is best-effort */ }
      return {
        success: true,
        reminderId: job?.id || reminderTask.id,
        taskId: reminderTask.id,
        scheduled,
        message: input.message,
        repeat: input.repeat || 'once',
        queued: Boolean(job),
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
        return { success: true, taskId: meetingTask.id, scheduled: startDt.toISOString(), calendarSaved: !calendarError, calendarError, ...meeting }
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
      const [notifications, ledgers] = await Promise.all([
        prisma.notification.findMany({
          where: { userId, OR: [{ title: { contains: q, mode: 'insensitive' } }, { message: { contains: q, mode: 'insensitive' } }] },
          take: 10,
        }),
        prisma.agentLedger.findMany({
          where: { userId, OR: [{ tool: { contains: q, mode: 'insensitive' } }, { action: { contains: q, mode: 'insensitive' } }] },
          take: 10,
        }),
      ])
      return { query: q, results: [...notifications, ...ledgers], total: notifications.length + ledgers.length }
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

function buildSystemPrompt(user, context = {}) {
  const sessionContext = context.sessionContext || {}
  const recentMemory = Array.isArray(context.recentMemory) ? context.recentMemory : []
  const memorySummary = buildMemoryContext(recentMemory)
  const profileSummary = buildProfileContext(context.onboardingContext)
  const liveDataSummary = buildLiveDataContext(context.liveData)
  const connectionStatus = buildConnectionStatus(user)

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
11. Only call get_daily_brief when the user explicitly asks for their daily brief or morning summary. For reminders, scheduling, or any other task — use the appropriate tool directly.
12. When the user asks to set a reminder or schedule something, call set_reminder or schedule_event immediately — do not call get_daily_brief first.
13. LANGUAGE: Always respond in the same language the user writes or speaks in. If the user writes in Hindi, respond in Hindi. If in Tamil, respond in Tamil. Match their language exactly.
14. CONNECTED ACCOUNTS: You always know which accounts are connected from the CONNECTED ACCOUNTS section below. Answer questions about integrations directly from that — never say you don't know. If an account is not connected, tell the user to go to Settings → Connected Accounts to connect it.
15. SCHEDULING: The current time is ${new Date().toISOString()}. For every reminder or meeting, use a complete future date and time. Call the scheduling tools only once per requested action and include an ISO UTC offset in the tool value whenever possible.
16. ACTION RESULTS: Never claim that a reminder, meeting, or other action was completed unless its tool result has success: true. If a tool reports an error, clearly explain the error and do not say it was set or scheduled.
17. CALENDAR DATE GROUPING: When showing more than one scheduled item, group them under their actual calendar date (for example, "Today — Thursday 6 August" and "Tomorrow — Friday 7 August"). Never put entries from different dates in one list labelled "today". Do not include past events unless the user specifically asks for history; after creating one reminder or meeting, confirm that item only unless they ask to see their schedule.

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

${profileSummary ? `${profileSummary}\n\n` : ''}${memorySummary}${liveDataSummary}

${connectionStatus}

Today: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Time: ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST`
}

// ── Main Agent Runner ─────────────────────────────────────────────────────────
export async function runAutonomyEngine({ messages, user, context = {}, maxIterations = 10 }) {
  const useDeepSeek = isDeepSeekConfigured(process.env.DEEPSEEK_API_KEY)
  if (!useDeepSeek && !isOpenAIConfigured(process.env.OPENAI_API_KEY)) {
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

  const model = useDeepSeek ? (process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL) : (process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini')
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
        system: buildSystemPrompt(user, context),
        tools: MNEVA_TOOLS,
        messages: agentMsgs,
        toolChoice: allToolResults.length === 0 ? requestedActionTool : null,
      }
      resp = useDeepSeek ? await callDeepSeek(_callArgs) : await callOpenAI(_callArgs)
    } catch (error) {
      const detail = useDeepSeek ? (error?.message || String(error)) : getOpenAIErrorMessage(error)
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
          status: result?.success === false ? 'failed' : 'completed',
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
