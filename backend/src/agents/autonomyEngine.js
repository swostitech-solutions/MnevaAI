import { logger } from '../config/logger.js'
import { ledger } from '../services/ledgerService.js'
import { prisma } from '../config/prisma.js'

const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'

export function isDeepSeekConfigured(apiKey = process.env.DEEPSEEK_API_KEY) {
  const value = String(apiKey || '').trim()
  if (!value) return false

  const placeholderPatterns = [
    /replace/i,
    /your-key/i,
    /example/i,
    /placeholder/i,
    /dummy/i,
  ]

  if (placeholderPatterns.some(pattern => pattern.test(value))) return false
  return value.startsWith('sk-')
}

function getDeepSeekBaseUrl() {
  return process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com'
}

function getDeepSeekErrorMessage(error) {
  const detail = error?.message || error?.error?.message || ''
  const lower = String(detail).toLowerCase()

  if (lower.includes('insufficient balance')) {
    return 'DeepSeek rejected the request because the account has insufficient balance. Add credits to the DeepSeek account or use a different API key.'
  }

  if (lower.includes('invalid api key') || lower.includes('authentication_error') || lower.includes('unauthorized')) {
    return 'DeepSeek rejected the request because the API key is invalid or expired.'
  }

  return detail || 'Unknown DeepSeek error'
}

async function callDeepSeek({ model, system, messages, tools }) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!isDeepSeekConfigured(apiKey)) return null

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
    stream: false,
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

  const response = await fetch(`${getDeepSeekBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data?.error?.message || `DeepSeek API error ${response.status}`
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
    description: 'Set a reminder or commitment tracker entry.',
    input_schema: { type: 'object', properties: { message: { type: 'string' }, time: { type: 'string', description: 'ISO datetime string e.g. 2026-07-08T10:00:00' }, repeat: { type: 'string', enum: ['once','daily','weekly','monthly'] }, domain: { type: 'string' } }, required: ['message', 'time'] }
  },
  {
    name: 'schedule_event',
    description: 'Schedule a meeting, event, or appointment on Google Calendar. Use this when the user wants to create a calendar event, schedule a meeting, or block time.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title / meeting name' },
        start: { type: 'string', description: 'Start datetime in ISO format e.g. 2026-07-08T10:00:00' },
        end: { type: 'string', description: 'End datetime in ISO format. If not provided, defaults to 1 hour after start.' },
        description: { type: 'string', description: 'Optional event description or agenda' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Optional list of attendee email addresses' },
      },
      required: ['title', 'start']
    }
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
      const [notifications, completed] = await Promise.all([
        prisma.notification.findMany({ where: { userId, read: false }, orderBy: { createdAt: 'desc' }, take: 10 }),
        prisma.agentLedger.findMany({ where: { userId, status: 'completed' }, orderBy: { createdAt: 'desc' }, take: 10 }),
      ])
      const notifSummary = notifications.slice(0, 5).map(n => `• ${n.title}`).join('\n') || 'None'
      const completedSummary = completed.slice(0, 5).map(l => `• ${l.tool}: ${l.action}`).join('\n') || 'None'
      return {
        generatedAt: new Date().toISOString(),
        pendingCount: notifications.length,
        pendingSummary: notifSummary,
        completedCount: completed.length,
        completedSummary,
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
      const { enqueueReminder } = await import('../queues/reminder.queue.js')
      const job = await enqueueReminder({
        userId,
        message: input.message,
        time: input.time,
        domain: input.domain || 'general',
        repeat: input.repeat || 'once',
      })
      await prisma.notification.create({
        data: { userId, title: '🔔 Reminder set', message: `"${input.message}" scheduled for ${input.time}` },
      })
      // Also create a Task so it shows on Home + Priorities
      const reminderTimeStr = input.time
        ? new Date(input.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : ''
      await prisma.task.create({
        data: {
          userId,
          title: input.message,
          description: reminderTimeStr ? `Reminder · ${reminderTimeStr}` : 'Reminder',
          status: 'PENDING',
        },
      })
      try {
        const { createEventIfConnected } = await import('../services/calendar.service.js')
        const startDt = new Date(input.time)
        if (!isNaN(startDt.getTime())) {
          const endDt = new Date(startDt.getTime() + 30 * 60 * 1000)
          await createEventIfConnected(userId, {
            summary: input.message,
            description: 'Reminder set via Mneva AI',
            start: { dateTime: startDt.toISOString() },
            end: { dateTime: endDt.toISOString() },
          })
        }
      } catch { /* calendar push is best-effort */ }
      return {
        reminderId: job?.id || `rem_${Date.now()}`,
        scheduled: input.time,
        message: input.message,
        repeat: input.repeat || 'once',
        queued: true,
      }
    }
    case 'schedule_event': {
      try {
        const { createMeetingWithGoogleMeet } = await import('../services/calendar.service.js')
        const startDt = new Date(input.start)
        if (isNaN(startDt.getTime())) return { success: false, error: 'Invalid start datetime' }
        const endDt = input.end ? new Date(input.end) : new Date(startDt.getTime() + 60 * 60 * 1000)
        const meeting = await createMeetingWithGoogleMeet(userId, {
          title: input.title,
          start: startDt.toISOString(),
          end: endDt.toISOString(),
          description: input.description || '',
          attendees: input.attendees || [],
        })
        await prisma.notification.create({
          data: {
            userId,
            title: `📅 Meeting scheduled: ${input.title}`,
            message: JSON.stringify({ source: 'calendar', eventId: meeting.eventId, meetLink: meeting.meetLink, preview: input.description || input.title, start: startDt.toISOString() }),
          },
        })
        return { success: true, ...meeting }
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
    const events = liveData.calendar.slice(0, 5).map(e => {
      const start = e.start ? new Date(e.start).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
      return `  • ${e.title || e.summary} — ${start}${e.meetLink ? ' [Meet]' : ''}`
    }).join('\n')
    lines.push(`UPCOMING CALENDAR EVENTS:\n${events}`)
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

function buildSystemPrompt(user, context = {}) {
  const sessionContext = context.sessionContext || {}
  const recentMemory = Array.isArray(context.recentMemory) ? context.recentMemory : []
  const memorySummary = buildMemoryContext(recentMemory)
  const profileSummary = buildProfileContext(context.onboardingContext)
  const liveDataSummary = buildLiveDataContext(context.liveData)

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
6. Never say "I am DeepSeek" — you are Mneva AI
7. Do not repeat the user's exact query in the assistant response unless it is required for clarity.
8. Log important actions to the Signed Ledger automatically
9. When the user asks about their own profile, name, email, or account details — answer directly from the USER PROFILE section below. Never say you don't know their name or email.
10. ALWAYS answer the user's actual question directly. If you called a tool, use the tool result to answer — do NOT just repeat the tool result verbatim or say "you have X notifications". Synthesize it into a real answer.
11. Only call get_daily_brief when the user explicitly asks for their daily brief or morning summary. For reminders, scheduling, or any other task — use the appropriate tool directly.
12. When the user asks to set a reminder or schedule something, call set_reminder or schedule_event immediately — do not call get_daily_brief first.

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

Today: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Time: ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST`
}

// ── Main Agent Runner ─────────────────────────────────────────────────────────
export async function runAutonomyEngine({ messages, user, context = {}, maxIterations = 10 }) {
  if (!isDeepSeekConfigured(process.env.DEEPSEEK_API_KEY)) {
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
      response: 'AI is running in local fallback mode. Set a real DEEPSEEK_API_KEY to enable full chat automation.',
      toolResults: [],
      iterations: 0,
      mode: 'local-fallback',
    }
  }

  const model = process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL
  const recentMemory = Array.isArray(context.recentMemory) ? context.recentMemory : []
  const topMemory = recentMemory.slice(0, 3)
  const agentMsgs = [...messages]
  const allToolResults = []
  let iterations = 0

  if (topMemory.length) {
    const memoryContext = buildMemoryContext(topMemory)
    agentMsgs.unshift({ role: 'user', content: `Memory context:\n${memoryContext}` })
  }

  while (iterations < maxIterations) {
    iterations++
    logger.info(`Agent iter ${iterations} — user=${user.id}`)

    let resp
    try {
      resp = await callDeepSeek({
        model,
        system: buildSystemPrompt(user, context),
        tools: MNEVA_TOOLS,
        messages: agentMsgs,
      })
    } catch (error) {
      const detail = getDeepSeekErrorMessage(error)
      logger.error(`DeepSeek request failed: ${String(detail)}`)

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
      return {
        response: textBlocks.map(b => b.text).join('\n'),
        toolResults: allToolResults,
        iterations,
        mode: 'deepseek',
      }
    }

    agentMsgs.push({ role: 'assistant', content: textBlocks.map(b => b.text).join('\n') || 'Using tools' })

    const toolResults = []
    for (const tb of toolBlocks) {
      logger.info(`  → Tool: ${tb.name}`)
      const result = await executeTool(tb.name, tb.input, user.id)

      const actionTools = ['initiate_payment','send_email','book_cab','order_food','set_reminder','schedule_event']
      if (actionTools.includes(tb.name)) {
        await ledger.add({ userId: user.id, tool: tb.name, input: tb.input, result })
      }

      allToolResults.push({ tool: tb.name, input: tb.input, result })
      // Convert tool results into text blocks so downstream LLMs (and DeepSeek) accept them
      const textResult = String(typeof result === 'string' ? result : JSON.stringify(result))
      toolResults.push({ type: 'text', text: `Tool ${tb.name} result: ${textResult}` })
    }

    agentMsgs.push({ role: 'user', content: toolResults })
  }

  return { response: 'Maximum reasoning steps reached. Please simplify your request.', toolResults: allToolResults, iterations, mode: 'deepseek' }
}
