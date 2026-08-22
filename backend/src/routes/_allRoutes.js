// // agent.js
// import express from 'express'
// import { runLangGraphOrchestrator } from '../agents/langGraphOrchestrator.js'
// import { getAgentRegistrySnapshot, plannerAgent, researcherAgent } from '../agents/registry.js'
// import { memoryService } from '../services/memory.service.js'
// import { ledger } from '../services/ledgerService.js'
// import { userStore } from '../models/userStore.js'
// import { prisma } from '../config/prisma.js'
// import { transcribeAudio } from '../services/transcription.service.js'
// import { listEmails, getEmailBody, sendEmail } from '../services/gmail.service.js'
// import { createEventIfConnected } from '../services/calendar.service.js'
// import multer from 'multer'
// import { createDeviceToken, hashToken } from './deviceNotifications.js'

// const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// export const agentRouter = express.Router()
// agentRouter.post('/chat', async (req, res) => {
//   try {
//     const { messages } = req.body
//     if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages[] required' })
//     const user = await userStore.getById(req.user.id) || req.user

//     const sessionContext = await memoryService.getSessionSnapshot(req.user.id)
//     const recentMemory = await memoryService.recall(messages[messages.length - 1]?.content || '', req.user.id, 5)
//     const onboardingProfile = await prisma.userProfile.findUnique({ where: { userId: req.user.id } })

//     // ── Fetch live connected data so AI knows real user data ──────────────
//     const liveData = {}
//     await Promise.allSettled([
//       // Google Fit / Health
//       (async () => {
//         try {
//           const { getHealthData } = await import('../services/googleFit.service.js')
//           liveData.health = await getHealthData(user)
//         } catch {}
//       })(),
//       // Google Contacts summary
//       (async () => {
//         try {
//           const { listContacts } = await import('../services/googleContacts.service.js')
//           const result = await listContacts(user, { pageSize: 20 })
//           liveData.contacts = { total: result.total, sample: result.contacts.slice(0, 10).map(c => ({ name: c.displayName, phone: c.phone, email: c.email, org: c.organization })) }
//         } catch {}
//       })(),
//       // Calendar upcoming events
//       (async () => {
//         try {
//           const { listEvents } = await import('../services/calendar.service.js')
//           const now = new Date()
//           const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
//           const events = await listEvents(user, now.toISOString(), weekLater.toISOString(), 10)
//           liveData.calendar = (events || []).slice(0, 10).map(e => ({ title: e.summary || e.title, start: e.start?.dateTime || e.start?.date, meetLink: e.hangoutLink || e.meetLink || null }))
//         } catch {}
//       })(),
//       // Gmail unread count + recent subjects
//       (async () => {
//         try {
//           const { listEmails } = await import('../services/gmail.service.js')
//           const result = await listEmails(user, 'unread', 5)
//           liveData.emails = { unreadCount: result.unreadCount || 0, recent: (result.emails || []).slice(0, 5).map(e => ({ subject: e.subject, from: e.from, preview: e.preview })) }
//         } catch {}
//       })(),
//     ])

//     const result = await runLangGraphOrchestrator({
//       messages: messages.slice(-20),
//       user,
//       context: {
//         sessionContext,
//         recentMemory,
//         onboardingContext: onboardingProfile || null,
//         liveData,
//       },
//     })

//     res.json({
//       ...result,
//       sessionContext,
//       memories: recentMemory,
//       ts: new Date().toISOString(),
//     })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// agentRouter.post('/orchestrate', async (req, res) => {
//   try {
//     const { messages = [] } = req.body
//     if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages[] required' })

//     const user = await userStore.getById(req.user.id) || req.user
//     const sessionContext = await memoryService.getSessionSnapshot(req.user.id)
//     const recentMemory = await memoryService.recall(messages[messages.length - 1]?.content || '', req.user.id, 5)
//     const onboardingProfile = await prisma.userProfile.findUnique({ where: { userId: req.user.id } })

//     const result = await runLangGraphOrchestrator({
//       messages: messages.slice(-20),
//       user,
//       context: { sessionContext, recentMemory, onboardingContext: onboardingProfile || null },
//     })

//     res.json({
//       ...result,
//       sessionContext,
//       memories: recentMemory,
//       ts: new Date().toISOString(),
//     })
//   } catch (err) {
//     res.status(500).json({ error: err.message })
//   }
// })

// agentRouter.post('/planner', async (req, res) => {
//   try {
//     const output = await plannerAgent.run(req.body)
//     res.json(output)
//   } catch (err) {
//     res.status(500).json({ error: err.message })
//   }
// })

// agentRouter.post('/researcher', async (req, res) => {
//   try {
//     const output = await researcherAgent.run(req.body)
//     res.json(output)
//   } catch (err) {
//     res.status(500).json({ error: err.message })
//   }
// })

// agentRouter.post('/transcribe', upload.single('audio'), async (req, res) => {
//   try {
//     let file = req.file

//     // React Native sends base64 JSON instead of multipart FormData
//     if (!file && req.body?.audioBase64) {
//       const base64 = String(req.body.audioBase64).replace(/^data:[^;]+;base64,/, '')
//       const buffer = Buffer.from(base64, 'base64')
//       if (!buffer.length) return res.status(400).json({ error: 'Empty audio data received' })
//       file = {
//         buffer,
//         originalname: req.body.fileName || 'voice.m4a',
//         mimetype: req.body.mimeType || 'audio/m4a',
//         size: buffer.length,
//       }
//     }

//     if (!file) return res.status(400).json({ error: 'audio file is required' })
//     const result = await transcribeAudio(file)
//     res.json(result)
//   } catch (err) {
//     res.status(500).json({ error: err.message })
//   }
// })

// agentRouter.post('/draft', async (req, res) => {
//   try {
//     const { subject, from, preview, body } = req.body
//     const apiKey = process.env.OPENAI_API_KEY?.trim()
//     if (!apiKey) return res.status(503).json({ error: 'AI not configured' })
//     const content = `From: ${from || ''}\nSubject: ${subject || ''}\n\n${body || preview || ''}`
//     const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

//     // Build schedule context — check tasks and reminders for conflicts
//     let scheduleContext = ''
//     try {
//       const userId = req.user.id
//       const [tasks, notifications] = await Promise.all([
//         prisma.task.findMany({ where: { userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 10 }),
//         prisma.notification.findMany({
//           where: { userId, OR: [{ message: { contains: '"source":"reminder"' } }, { message: { contains: '"source":"calendar"' } }] },
//           orderBy: { createdAt: 'desc' }, take: 10,
//         }),
//       ])
//       const scheduled = notifications.map(n => {
//         try {
//           const meta = JSON.parse(n.message)
//           if (!meta.start) return null
//           const t = new Date(meta.start).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
//           return `\u2022 ${n.title.replace(/^[^a-zA-Z]+/, '')} \u2014 ${t}`
//         } catch { return null }
//       }).filter(Boolean)
//       const pendingTasks = tasks.map(t => `\u2022 ${t.title}`)
//       const all = [...scheduled, ...pendingTasks]
//       if (all.length) scheduleContext = `\n\nUSER'S CURRENT SCHEDULE & PENDING TASKS:\n${all.join('\n')}\n\nIMPORTANT: If this email requests a meeting or asks for availability, check the schedule above for conflicts and mention them in the draft reply. Suggest an alternative time if there is a conflict.`
//     } catch { /* best-effort */ }

//     const r = await fetch('https://api.openai.com/v1/chat/completions', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
//       body: JSON.stringify({
//         model,
//         messages: [
//           { role: 'system', content: `You are ${req.user?.name || 'the user'}'s AI Chief of Staff. Write a concise professional reply to the email below. Return ONLY the reply body \u2014 no subject, no greeting, no sign-off. Under 120 words.${scheduleContext}` },
//           { role: 'user', content },
//         ],
//         temperature: 0.4,
//       }),
//     })
//     const data = await r.json().catch(() => ({}))
//     const draft = data.choices?.[0]?.message?.content?.trim() || ''
//     res.json({ draft })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// agentRouter.get('/ledger', async (req, res) => {
//   const entries = await ledger.getByUser(req.user.id)
//   res.json({ entries, total: entries.length })
// })
// agentRouter.get('/registry', (_req, res) => {
//   res.json(getAgentRegistrySnapshot())
// })
// agentRouter.post('/approve', async (req, res) => {
//   await prisma.trustScore.upsert({
//     where: { userId: req.user.id },
//     update: { approvedActions: { increment: 1 }, score: { increment: 1 } },
//     create: { userId: req.user.id, approvedActions: 1, score: 1 },
//   })
//   res.json({ actionId: req.body.actionId, status: 'approved', ts: new Date().toISOString() })
// })
// agentRouter.post('/deny', async (req, res) => {
//   await prisma.trustScore.upsert({
//     where: { userId: req.user.id },
//     update: { rejectedActions: { increment: 1 }, score: { decrement: 1 } },
//     create: { userId: req.user.id, rejectedActions: 1, score: -1 },
//   })
//   res.json({ actionId: req.body.actionId, status: 'denied', ts: new Date().toISOString() })
// })

// // dashboard.js
// export const dashboardRouter = express.Router()

// function formatDashboardTime(value) {
//   return new Intl.DateTimeFormat('en-IN', {
//     hour: '2-digit',
//     minute: '2-digit',
//     hour12: true,
//     timeZone: 'Asia/Kolkata',
//   }).format(new Date(value))
// }

// function formatDashboardDateTime(value) {
//   return new Intl.DateTimeFormat('en-IN', {
//     month: 'short',
//     day: 'numeric',
//     hour: '2-digit',
//     minute: '2-digit',
//     hour12: true,
//     timeZone: 'Asia/Kolkata',
//   }).format(new Date(value))
// }

// dashboardRouter.get('/brief', async (req, res) => {
//   try {
//     const todayStart = new Date();
//     todayStart.setHours(0, 0, 0, 0);

//     const importantNotificationWhere = {
//       userId: req.user.id,
//       read: false,
//       priority: { gte: 60 },
//     }
//     const [externalNotifs, completedRaw, pendingTasks, importantNotificationCount, urgentNotificationCount] = await Promise.all([
//       prisma.notification.findMany({
//         where: {
//           userId: req.user.id,
//           read: false,
//           OR: [
//             { title: { startsWith: '\u{1F4E7}' } },
//             { title: { startsWith: '\u{1F4F1}' } },
//             { message: { contains: '"source":"email"' } },
//             { message: { contains: '"source":"sms"' } },
//             { message: { contains: '"source":"calendar"' } },
//             { message: { contains: '"source":"reminder"' } },
//             // Android phone alerts that passed the relevance agent belong in
//             // the morning briefing even when they are not urgent enough to
//             // become a Priority task.
//             { priority: { gte: 60 } },
//           ],
//         },
//         orderBy: { createdAt: 'desc' },
//         take: 5,
//       }),
//       prisma.agentLedger.findMany({
//         where: {
//           userId: req.user.id,
//           status: 'completed',
//           createdAt: { gte: todayStart },
//         },
//         orderBy: { createdAt: 'desc' },
//         take: 10,
//       }),
//       prisma.task.findMany({
//         where: { userId: req.user.id, status: 'PENDING' },
//         orderBy: { createdAt: 'desc' },
//         take: 20,
//       }),
//       prisma.notification.count({ where: importantNotificationWhere }),
//       prisma.notification.count({ where: { ...importantNotificationWhere, priority: { gte: 85 } } }),
//     ]);

//     // Retries from an AI turn can leave identical ledger rows. Keep one action
//     // in the briefing rather than presenting the same reminder/meeting twice.
//     const completedActionKeys = new Set()
//     const completed = completedRaw.filter(entry => {
//       let input = {}
//       try { input = JSON.parse(entry.action).input || {} } catch {}
//       const key = entry.tool === 'set_reminder'
//         ? `reminder:${String(input.message || '').trim().toLowerCase()}:${input.time || ''}`
//         : entry.tool === 'schedule_event'
//           ? `meeting:${String(input.title || '').trim().toLowerCase()}:${input.start || ''}`
//           : entry.id
//       if (completedActionKeys.has(key)) return false
//       completedActionKeys.add(key)
//       return true
//     })

//     // Fetch urgent emails in parallel — fail silently if Gmail not connected
//     let urgentEmails = [];
//     let suggestedMeetings = [];
//     try {
//       const { getUrgentEmails: _getUrgent, detectMeetingRequest } = await import('../services/gmail.service.js');
//       const { userStore: _us } = await import('../models/userStore.js');
//       const _user = await _us.getById(req.user.id);
//       urgentEmails = await _getUrgent(_user, 20);
//       // Scan urgent emails for meeting requests
//       suggestedMeetings = urgentEmails
//         .map(e => {
//           const info = detectMeetingRequest(e.subject, e.snippet, e.from);
//           if (!info) return null;
//           return {
//             emailId: e.id,
//             subject: e.subject,
//             senderName: info.senderName,
//             senderEmail: info.senderEmail,
//             snippet: e.snippet,
//             time: e.time,
//             urgencyScore: e.urgencyScore,
//           };
//         })
//         .filter(Boolean)
//         .slice(0, 3);
//     } catch { urgentEmails = []; suggestedMeetings = []; }

//     const filteredTasks = pendingTasks.filter(t => {
//       // The dashboard's priority card is intentionally reset every calendar
//       // day. Older open tasks remain stored, but are not today's priorities.
//       if (t.createdAt < todayStart) return false;
//       const title = (t.title || '').trim();
//       if (!title || title.length < 3) return false;
//       if (/^[a-z_]+:[a-z0-9]+$/i.test(title)) return false;
//       if (/^meeting_done:/i.test(title)) return false;
//       // Older app versions created a task from a phone alert. Keep those
//       // records for audit history, but never surface them as a Priority.
//       if (/^Important .+ alert · .+ · priority:\d+$/i.test(t.description || '')) return false;
//       return true;
//     });
//     const makeLabel = (entry, input) => {
//       const map = {
//         schedule_event:       'Scheduled: ' + (input.title || 'Meeting'),
//         set_reminder:         'Reminder set: ' + (input.message || input.title || 'Done'),
//         initiate_payment:     'Payment \u20b9' + (input.amount || '') + ' to ' + (input.payee || ''),
//         send_email:           'Email sent to ' + (input.recipient || ''),
//         draft_reply:          'Draft reply prepared',
//         book_cab:             'Cab: ' + (input.pickup || '') + ' \u2192 ' + (input.destination || ''),
//         order_food:           'Food ordered from ' + (input.restaurant || ''),
//         get_daily_brief:      'Daily brief generated',
//         get_portfolio:        'Portfolio snapshot fetched',
//         get_spending_summary: 'Spending summary checked',
//         get_health_data:      'Health data synced',
//         query_bills:          'Bills checked',
//         personal_search:      'Search: "' + (input.query || '') + '"',
//       };
//       return map[entry.tool] || entry.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
//     };

//     res.json({
//       generatedAt: new Date().toISOString(),
//       greeting: 'Hello, ' + (req.user.name || 'there'),
//       summary: completed.length
//         ? completed.length + ' action' + (completed.length > 1 ? 's' : '') + ' completed by your AI twin today.'
//         : filteredTasks.length
//           ? filteredTasks.length + ' task' + (filteredTasks.length > 1 ? 's' : '') + ' pending.'
//           : 'All clear \u2014 your AI twin is standing by.',
//       weather: null,
//       pendingActions: externalNotifs.map(n => {
//         let meta = {};
//         try { meta = JSON.parse(n.message); } catch {}
//         return {
//           id: n.id,
//           type: 'notification',
//           urgency: 'medium',
//           title: n.title,
//           detail: meta.preview || meta.body || '',
//           domain: meta.source === 'calendar' ? 'calendar' : meta.source === 'reminder' ? 'reminder' : 'notifications',
//         };
//       }),
//       autoCompleted: completed.map(entry => {
//         let input = {}, result = {};
//         try { const p = JSON.parse(entry.action); input = p.input || {}; result = p.result || {}; } catch {}
//         const label = makeLabel(entry, input);
//         let detail = '';
//         let logDetail = '';
//         if (entry.tool === 'schedule_event') {
//           const w = input.attendees && input.attendees.length ? 'With ' + input.attendees[0] : '';
//           const t = input.start ? ' \u00b7 ' + formatDashboardDateTime(input.start) : '';
//           detail = (w + t).trim();
//         } else if (entry.tool === 'initiate_payment') {
//           detail = 'Status: ' + (result.status || 'done');
//         } else if (entry.tool === 'book_cab') {
//           detail = 'Est. fare: ' + (result.fare || 'N/A');
//         } else if (entry.tool === 'set_reminder') {
//           // The dashboard priority card should show when the reminder will
//           // happen, matching the Priorities screen — not when AI created it.
//           const scheduledTime = result.scheduled || input.time;
//           detail = scheduledTime
//             ? `Scheduled · ${formatDashboardTime(scheduledTime)}`
//             : 'Scheduled';
//           logDetail = 'Saved';
//         }
//         return {
//           title: label,
//           detail,
//           logDetail: logDetail || detail,
//           tool: entry.tool,
//           scheduledAt: entry.tool === 'set_reminder' ? (result.scheduled || input.time || null) : null,
//           timestamp: entry.createdAt.toISOString(),
//           time: formatDashboardTime(entry.createdAt),
//         };
//       }),
//       commitments: [],
//       followUpRadar: [],
//       insights: [],
//       pendingTasks: filteredTasks.map(t => ({ id: t.id, title: t.title, description: t.description, createdAt: t.createdAt })),
//       stats: { actionsAuto: completed.length, trustScore: 0 },
//       // These counts drive the opening AI greeting. Only alerts that the
//       // phone-notification agent marked important are included, so the app
//       // never describes ordinary unread mail or promotions as urgent work.
//       importantNotifications: {
//         count: importantNotificationCount,
//         urgentCount: urgentNotificationCount,
//       },
//       urgentEmails: urgentEmails.map(e => ({
//         id: e.id,
//         subject: e.subject,
//         from: e.from,
//         snippet: e.snippet,
//         time: e.time,
//         urgencyScore: e.urgencyScore,
//       })),
//       suggestedMeetings,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// })
// dashboardRouter.get('/sidebar-counts', async (req, res) => {
//   try {
//     const userId = req.user.id
//     const user = await userStore.getById(userId)

//     // Daily Brief: unread notifications count
//     const briefCount = await prisma.notification.count({ where: { userId, read: false } })

//     // Finance: due bills count (from DB ledger pending payments)
//     const financeCount = await prisma.agentLedger.count({
//       where: { userId, tool: 'initiate_payment', status: 'pending_approval' },
//     })

//     // Communications: unread emails via Gmail
//     let commsCount = 0
//     try {
//       const { listEmails } = await import('../services/gmail.service.js')
//       const result = await listEmails(user, 'unread', 1)
//       commsCount = result?.unreadCount || 0
//     } catch { commsCount = 0 }

//     // Health: upcoming appointments (from preferences or tasks)
//     const healthCount = await prisma.task.count({
//       where: { userId, status: 'PENDING', title: { contains: 'appointment', mode: 'insensitive' } },
//     }).catch(() => 0)

//     res.json({ brief: briefCount, finance: financeCount, comms: commsCount, health: healthCount })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// dashboardRouter.get('/stats', async (req, res) => {
//   const [actionsTotal, actionsAuto, trustScore] = await Promise.all([
//     prisma.agentLedger.count({ where: { userId: req.user.id } }),
//     prisma.agentLedger.count({ where: { userId: req.user.id, status: 'completed' } }),
//     prisma.trustScore.findUnique({ where: { userId: req.user.id } }),
//   ])
//   res.json({ hoursSaved: 0, actionsTotal, actionsAuto, trustScore: trustScore?.score || 0 })
// })

// // finance.js
// export const financeRouter = express.Router()
// financeRouter.get('/bills',     (_req, res) => res.json([]))
// financeRouter.get('/portfolio', (_req, res) => res.json({ totalInvested: 0, totalCurrent: 0, returnPct: 0, cibilScore: null, cibilGrade: null, netWorth: 0, holdings: [], accounts: [] }))
// financeRouter.get('/spending',  (req, res) => res.json({ period: req.query.period || 'month', total: 0, budget: 0, savingsRate: 0, categories: [], insights: [] }))
// financeRouter.post('/pay',      async (req, res) => {
//   const entry = await ledger.add({ userId: req.user.id, tool: 'initiate_payment', input: req.body, result: { status: 'pending_approval' }, status: 'pending_approval' })
//   res.json({ actionId: entry.id, status: 'pending_approval', ...req.body })
// })

// // comms.js
// function gmailErrorResponse(err, res) {
//   const msg = err?.message || ''
//   if (msg.includes('Gmail is not connected')) return res.status(409).json({ error: 'gmail_not_connected', message: 'Gmail is not connected. Go to Settings → Integrations to connect.' })
//   if (msg.includes('Gmail API has not been used') || msg.includes('is disabled')) return res.status(503).json({ error: 'gmail_api_disabled', message: 'Gmail API is disabled in Google Cloud Console. Visit https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=769657045922 and click Enable.' })
//   if (msg.includes('invalid_grant') || msg.includes('Token has been expired')) return res.status(401).json({ error: 'gmail_token_expired', message: 'Gmail token expired. Please reconnect Gmail in Settings → Integrations.' })
//   return res.status(500).json({ error: 'gmail_error', message: msg })
// }

// export const commsRouter = express.Router()
// commsRouter.get('/emails', async (req, res) => {
//   try {
//     const user = await userStore.getById(req.user.id)
//     const { filter = 'all', limit = 20 } = req.query
//     const result = await listEmails(user, filter, Number(limit))
//     res.json(result)
//   } catch (err) { gmailErrorResponse(err, res) }
// })
// commsRouter.get('/emails/:id', async (req, res) => {
//   try {
//     const user = await userStore.getById(req.user.id)
//     const email = await getEmailBody(user, req.params.id)
//     res.json(email)
//   } catch (err) { gmailErrorResponse(err, res) }
// })
// commsRouter.get('/emails/:id/draft', async (req, res) => {
//   try {
//     const user = await userStore.getById(req.user.id)
//     const email = await getEmailBody(user, req.params.id)
//     res.json({ email, draft: '' })
//   } catch (err) { gmailErrorResponse(err, res) }
// })
// commsRouter.post('/emails/:id/send', async (req, res) => {
//   try {
//     const { recipient, subject, draft } = req.body
//     if (!recipient || !subject || !draft) return res.status(400).json({ error: 'recipient, subject, and draft are required' })
//     const user = await userStore.getById(req.user.id)
//     const result = await sendEmail(user, recipient, subject, draft)
//     res.json({ success: true, result })
//   } catch (err) { gmailErrorResponse(err, res) }
// })

// // health.js
// export const healthRouter = express.Router()
// healthRouter.get('/metrics', async (req, res) => {
//   try {
//     const { getHealthData } = await import('../services/googleFit.service.js')
//     const user = await userStore.getById(req.user.id)
//     const data = await getHealthData(user)
//     // auto-log today's Google Fit data to the calendar log
//     if (data.source === 'google_fit') {
//       const today = new Date().toISOString().slice(0, 10)
//       const prefs = user?.preferences || {}
//       if (!prefs.healthLog) prefs.healthLog = {}
//       prefs.healthLog[today] = {
//         source: 'google_fit',
//         lastSynced: data.lastUpdated,
//         steps:     data.steps?.value     ?? null,
//         heartRate: data.heartRate?.value ?? null,
//         sleep:     data.sleep?.value     ?? null,
//         calories:  data.calories?.consumed ?? null,
//         weight:    data.weight?.value    ?? null,
//         height:    data.height?.value    ?? null,
//       }
//       await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } }).catch(() => {})
//     }
//     res.json(data)
//   } catch (err) {
//     if (err.message?.includes('not connected')) {
//       return res.json({ period: req.query.period || 'today', lastUpdated: new Date().toISOString(), source: 'none', weeklySteps: [] })
//     }
//     res.status(500).json({ error: err.message })
//   }
// })
// healthRouter.get('/appointments', (_req, res) => res.json({ appointments: [] }))
// healthRouter.get('/medications',  (_req, res) => res.json({ medications: [] }))

// // POST /api/health-data/sync — accepts data from iOS Shortcut / Apple Health / manual
// healthRouter.post('/sync', async (req, res) => {
//   try {
//     const {
//       source = 'manual',
//       // vitals
//       steps, heartRate, bloodPressureSystolic, bloodPressureDiastolic, bloodOxygen, bodyTemp,
//       // body
//       weight, height, bmi, bodyFat, muscleMass, waist,
//       // sleep
//       sleep, sleepBedtime, sleepWakeup, sleepDeep, sleepRem, sleepLight,
//       // nutrition
//       calories, protein, carbs, fat, fiber, water,
//       // activity
//       activeMinutes, workoutType, workoutDuration, workoutCalories, distance,
//       // cycle
//       cyclePhase, cycleDay, periodFlow, symptoms,
//     } = req.body
//     const user = await userStore.getById(req.user.id)
//     const prefs = user?.preferences || {}
//     const today = new Date().toISOString().slice(0, 10)
//     const existing = prefs.healthSync || {}
//     const merge = (obj, key, val) => { if (val != null) obj[key] = typeof val === 'string' ? val : Number(val) }
//     const synced = { ...existing, source, lastSynced: new Date().toISOString(), date: today }
//     // vitals
//     merge(synced, 'steps', steps); merge(synced, 'heartRate', heartRate)
//     merge(synced, 'bloodPressureSystolic', bloodPressureSystolic); merge(synced, 'bloodPressureDiastolic', bloodPressureDiastolic)
//     merge(synced, 'bloodOxygen', bloodOxygen); merge(synced, 'bodyTemp', bodyTemp)
//     // body
//     merge(synced, 'weight', weight); merge(synced, 'height', height)
//     merge(synced, 'bmi', bmi); merge(synced, 'bodyFat', bodyFat)
//     merge(synced, 'muscleMass', muscleMass); merge(synced, 'waist', waist)
//     // sleep
//     merge(synced, 'sleep', sleep); merge(synced, 'sleepBedtime', sleepBedtime)
//     merge(synced, 'sleepWakeup', sleepWakeup); merge(synced, 'sleepDeep', sleepDeep)
//     merge(synced, 'sleepRem', sleepRem); merge(synced, 'sleepLight', sleepLight)
//     // nutrition
//     merge(synced, 'calories', calories); merge(synced, 'protein', protein)
//     merge(synced, 'carbs', carbs); merge(synced, 'fat', fat)
//     merge(synced, 'fiber', fiber); merge(synced, 'water', water)
//     // activity
//     merge(synced, 'activeMinutes', activeMinutes); merge(synced, 'workoutType', workoutType)
//     merge(synced, 'workoutDuration', workoutDuration); merge(synced, 'workoutCalories', workoutCalories)
//     merge(synced, 'distance', distance)
//     // cycle
//     merge(synced, 'cyclePhase', cyclePhase); merge(synced, 'cycleDay', cycleDay)
//     merge(synced, 'periodFlow', periodFlow); merge(synced, 'symptoms', symptoms)

//     prefs.healthSync = synced
//     if (!prefs.healthLog) prefs.healthLog = {}
//     prefs.healthLog[today] = { ...synced }
//     await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } })
//     res.json({ success: true, synced })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// // GET /api/health-data/log — full per-date history for calendar
// healthRouter.get('/log', async (req, res) => {
//   try {
//     const user = await userStore.getById(req.user.id)
//     const log = user?.preferences?.healthLog || {}
//     res.json({ log })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// // PUT /api/health-data/log/:date — edit a specific date entry
// healthRouter.put('/log/:date', async (req, res) => {
//   try {
//     const { date } = req.params
//     if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid_date' })
//     const { steps, heartRate, sleep, calories, weight, height, source } = req.body
//     const user = await userStore.getById(req.user.id)
//     const prefs = user?.preferences || {}
//     if (!prefs.healthLog) prefs.healthLog = {}
//     const existing = prefs.healthLog[date] || {}
//     prefs.healthLog[date] = {
//       ...existing,
//       lastSynced: new Date().toISOString(),
//       ...(source     != null && { source }),
//       ...(steps      != null && { steps:     Number(steps) }),
//       ...(heartRate  != null && { heartRate: Number(heartRate) }),
//       ...(sleep      != null && { sleep:     Number(sleep) }),
//       ...(calories   != null && { calories:  Number(calories) }),
//       ...(weight     != null && { weight:    Number(weight) }),
//       ...(height     != null && { height:    Number(height) }),
//     }
//     await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } })
//     res.json({ success: true, entry: prefs.healthLog[date] })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// // DELETE /api/health-data/log/:date — delete a specific date entry
// healthRouter.delete('/log/:date', async (req, res) => {
//   try {
//     const { date } = req.params
//     const user = await userStore.getById(req.user.id)
//     const prefs = user?.preferences || {}
//     if (prefs.healthLog?.[date]) delete prefs.healthLog[date]
//     await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } })
//     res.json({ success: true })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })
// // lifeops.js
// import { getDistanceMatrix, buildCabOptions, getFoodSuggestions } from '../services/lifeops.service.js'
// export const lifeopsRouter = express.Router()

// lifeopsRouter.get('/rides', async (req, res) => {
//   try {
//     const entries = await ledger.getByUser(req.user.id)
//     const rides = entries.filter(e => e.tool === 'book_cab').slice(0, 10).map(e => {
//       let input = {}, result = {}
//       try { const p = JSON.parse(e.action); input = p.input || {}; result = p.result || {} } catch {}
//       return { id: e.id, pickup: input.pickup, destination: input.destination, status: e.status, fare: result.fare, cabType: input.cab_type, createdAt: e.createdAt }
//     })
//     res.json({ rides })
//   } catch { res.json({ rides: [] }) }
// })

// lifeopsRouter.get('/wishlist', (_req, res) => res.json({ items: [] }))

// lifeopsRouter.get('/cab/estimate', async (req, res) => {
//   try {
//     const { pickup, destination } = req.query
//     if (!pickup || !destination) return res.status(400).json({ error: 'pickup and destination required' })
//     const matrix = await getDistanceMatrix(pickup, destination)
//     const options = buildCabOptions(matrix)
//     res.json({ pickup, destination, distanceText: matrix?.distanceText || null, durationText: matrix?.durationText || null, realDistance: !!matrix, options })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// lifeopsRouter.post('/cab', async (req, res) => {
//   try {
//     const { pickup, destination, cab_type = 'mini', fare, driver, rating, carModel, etaMin } = req.body
//     const result = { status: 'confirmed', bookingId: 'OLA' + Date.now().toString(36).toUpperCase(), pickup, destination, cab_type, fare, driver, rating, carModel, etaMin, confirmedAt: new Date().toISOString() }
//     const entry = await ledger.add({ userId: req.user.id, tool: 'book_cab', input: req.body, result, status: 'completed' })
//     try {
//       const pickupTime = new Date(Date.now() + (etaMin || 10) * 60 * 1000)
//       await prisma.notification.create({ data: { userId: req.user.id, title: '🚗 Cab arriving in ' + (etaMin || 10) + ' mins', message: JSON.stringify({ source: 'reminder', preview: driver + ' · ' + carModel + ' · ₹' + fare, start: pickupTime.toISOString() }) } })
//     } catch {}
//     res.json({ ...result, ledgerId: entry.id })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// lifeopsRouter.get('/orders', async (req, res) => {
//   try {
//     const entries = await ledger.getByUser(req.user.id)
//     const orders = entries.filter(e => e.tool === 'order_food').slice(0, 10).map(e => {
//       let input = {}, result = {}
//       try { const p = JSON.parse(e.action); input = p.input || {}; result = p.result || {} } catch {}
//       return { id: e.id, restaurant: input.restaurant, items: input.items, platform: input.platform, totalAmount: result.totalAmount, deliveryTime: result.deliveryTime, status: e.status, createdAt: e.createdAt }
//     })
//     res.json({ orders })
//   } catch { res.json({ orders: [] }) }
// })

// lifeopsRouter.get('/food/suggest', async (req, res) => {
//   try {
//     const result = await getFoodSuggestions(req.user.id, req.query.query || '')
//     res.json(result)
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// lifeopsRouter.post('/food', async (req, res) => {
//   try {
//     const { restaurant, items, platform = 'swiggy', totalAmount, deliveryTime } = req.body
//     const result = { status: 'confirmed', orderId: 'SWG' + Date.now().toString(36).toUpperCase(), restaurant, items, platform, totalAmount, deliveryTime, confirmedAt: new Date().toISOString() }
//     const entry = await ledger.add({ userId: req.user.id, tool: 'order_food', input: req.body, result, status: 'completed' })
//     try {
//       const mins = parseInt(String(deliveryTime || '35').match(/d+/)?.[0] || '35')
//       const deliveryAt = new Date(Date.now() + mins * 60 * 1000)
//       await prisma.notification.create({ data: { userId: req.user.id, title: '🍔 Food arriving in ~' + mins + ' mins', message: JSON.stringify({ source: 'reminder', preview: restaurant + ' · ₹' + (totalAmount || ''), start: deliveryAt.toISOString() }) } })
//     } catch {}
//     res.json({ ...result, ledgerId: entry.id })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// // Hotel search — GET /api/lifeops/hotel/search?city=Goa&checkIn=2025-08-01&checkOut=2025-08-03
// lifeopsRouter.get('/hotel/search', async (req, res) => {
//   try {
//     const { city, checkIn, checkOut, adults = 1 } = req.query
//     if (!city || !checkIn || !checkOut) return res.status(400).json({ error: 'city, checkIn and checkOut are required' })
//     const { searchHotels } = await import('../services/hotel.service.js')
//     const hotels = await searchHotels({ cityName: city, checkIn, checkOut, adults: parseInt(adults) })
//     res.json({ hotels })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// // Flight search — GET /api/lifeops/flight/search?from=BLR&to=BOM&date=2026-08-20
// lifeopsRouter.get('/flight/search', async (req, res) => {
//   try {
//     const { from, to, date } = req.query
//     if (!from || !to || !date) return res.status(400).json({ error: 'from, to and date are required' })
//     const { searchFlights } = await import('../services/flight.service.js')
//     const flights = await searchFlights({ from, to, date })
//     res.json({ flights })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// // Flight book — POST /api/lifeops/flight/book
// lifeopsRouter.post('/flight/book', async (req, res) => {
//   try {
//     const { flightId, airline, flightCode, from, to, depart, arrive, date, cabinClass, seat, price } = req.body
//     if (!from || !to) return res.status(400).json({ error: 'from and to are required' })
//     const { bookFlight } = await import('../services/flight.service.js')
//     const result = bookFlight({ flightId, airline, flightCode, from, to, depart, arrive, date, cabinClass, seat, price })
//     const entry = await ledger.add({ userId: req.user.id, tool: 'book_flight', input: req.body, result, status: 'completed' })
//     try {
//       await prisma.notification.create({ data: { userId: req.user.id, title: `✈️ Flight booked — ${airline} ${from}→${to}`, message: JSON.stringify({ source: 'reminder', preview: `${depart} → ${arrive} · ₹${price}`, start: date }) } })
//     } catch {}
//     res.json({ ...result, ledgerId: entry.id })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// // Hotel book — POST /api/lifeops/hotel/book
// lifeopsRouter.post('/hotel/book', async (req, res) => {
//   try {
//     const { offerId, hotelName, roomType, price, checkIn, checkOut, city } = req.body
//     if (!offerId) return res.status(400).json({ error: 'offerId is required' })
//     const { bookHotel } = await import('../services/hotel.service.js')
//     const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, email: true } })
//     const result = await bookHotel({
//       hotelId:   offerId,
//       hotelName, roomType, price, checkIn, checkOut, city,
//       guestName: user?.name || 'Guest User',
//     })
//     const entry = await ledger.add({ userId: req.user.id, tool: 'book_hotel', input: req.body, result, status: 'completed' })
//     try {
//       await prisma.notification.create({ data: { userId: req.user.id, title: '🏨 Hotel booked — ' + hotelName, message: JSON.stringify({ source: 'reminder', preview: roomType + ' · ' + checkIn + ' → ' + checkOut + ' · ₹' + price }) } })
//     } catch {}
//     res.json({ ...result, hotelName, roomType, price, checkIn, checkOut, city, ledgerId: entry.id })
//   } catch (err) { res.status(500).json({ error: err.message }) }
// })

// // meetings.js
// export const meetingsRouter = express.Router()

// // POST /api/meetings/suggest-approve
// // Called when user approves a suggested meeting from an urgent email
// meetingsRouter.post('/suggest-approve', async (req, res) => {
//   try {
//     const { emailId, senderName, senderEmail, subject, start, end, title } = req.body
//     if (!senderEmail || !start) return res.status(400).json({ error: 'senderEmail and start are required' })

//     const { createMeetingWithGoogleMeet } = await import('../services/calendar.service.js')
//     const startDt = new Date(start)
//     if (isNaN(startDt.getTime())) return res.status(400).json({ error: 'Invalid start datetime' })
//     const endDt = end ? new Date(end) : new Date(startDt.getTime() + 60 * 60 * 1000)

//     const meetingTitle = title || `Meeting with ${senderName || senderEmail}`
//     const meeting = await createMeetingWithGoogleMeet(req.user.id, {
//       title: meetingTitle,
//       start: startDt.toISOString(),
//       end: endDt.toISOString(),
//       description: `Meeting requested via email: "${subject || ''}"`,
//       attendees: [senderEmail],
//     })

//     // Add to ledger
//     const ledgerEntry = await ledger.add({
//       userId: req.user.id,
//       tool: 'schedule_event',
//       input: { title: meetingTitle, start: startDt.toISOString(), end: endDt.toISOString(), attendees: [senderEmail] },
//       result: meeting,
//       status: 'completed',
//     })

//     // Notify
//     await prisma.notification.create({
//       data: {
//         userId: req.user.id,
//         title: `📅 Meeting scheduled: ${meetingTitle}`,
//         message: JSON.stringify({ source: 'calendar', eventId: meeting.eventId, meetLink: meeting.meetLink, preview: `With ${senderName || senderEmail}`, start: startDt.toISOString() }),
//       },
//     })

//     // A suggested meeting is also a pending priority, just like meetings made
//     // directly in Ask AI. Without this record it only exists in Calendar.
//     const meetingTask = await prisma.task.create({
//       data: {
//         userId: req.user.id,
//         title: meetingTitle,
//         description: `Meeting · ${startDt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
//         status: 'PENDING',
//       },
//     })

//     const io = req.app.get('io')
//     if (io) {
//       io.to(`u:${req.user.id}`).emit('task:created', meetingTask)
//       io.to(`u:${req.user.id}`).emit('ledger:updated', ledgerEntry)
//       io.to(`u:${req.user.id}`).emit('meeting:created', { ...meeting, title: meetingTitle, start: startDt.toISOString(), end: endDt.toISOString() })
//     }

//     res.json({ success: true, meeting: { ...meeting, title: meetingTitle } })
//   } catch (err) {
//     res.status(500).json({ error: err.message })
//   }
// })

// // twin.js
// export const twinRouter = express.Router()
// twinRouter.get('/diary', async (req, res) => res.json({ entries: await ledger.getByUser(req.user.id) }))
// twinRouter.get('/ledger',async (req, res) => res.json({ entries: await ledger.getByUser(req.user.id) }))

// // notifications.js
// export const notifRouter = express.Router()

// function phoneAlertAnalysis(meta = {}, title = '', body = '') {
//   const text = `${title} ${body}`.toLowerCase()
//   const priority = Number(meta.priority || 0)
//   const category = meta.category || (/(payment|upi|bank|debit|credit|bill)/i.test(text) ? 'payments' : '')
//   const reason = meta.reason || (priority >= 85 ? 'time_sensitive' : 'action_needed')
//   if (reason === 'security_or_payment' || /(fraud|suspicious|unauthori[sz]ed|blocked|declined|failed)/i.test(text)) {
//     return { label: 'Security or payment check', summary: 'This may need your attention to protect your account or resolve a payment issue.', nextStep: 'Open the original app and verify the activity before sharing any details or taking action.', urgency: 'urgent' }
//   }
//   if (category === 'payments' || /(due|bill|payment|upi|bank)/i.test(text)) {
//     return { label: 'Money-related alert', summary: 'Mneva detected a finance-related notification that may need a quick review.', nextStep: 'Check the amount, due date, and recipient in the original app. Pay or dispute it only after verifying the details.', urgency: priority >= 85 ? 'urgent' : 'important' }
//   }
//   if (reason === 'time_sensitive' || /(appointment|meeting|flight|delivery today|medicine|deadline)/i.test(text)) {
//     return { label: 'Time-sensitive update', summary: 'This alert appears to have a time-sensitive detail worth reviewing soon.', nextStep: 'Review the time and location in the original app, then add or update a reminder if you need one.', urgency: priority >= 85 ? 'urgent' : 'important' }
//   }
//   return { label: 'Action may be needed', summary: 'Mneva marked this notification as useful because it may need a response, follow-up, or review.', nextStep: 'Read the full notification and decide whether to respond, complete the request, or dismiss it.', urgency: priority >= 85 ? 'urgent' : 'normal' }
// }
// notifRouter.post('/device-token', async (req, res) => {
//   const plainToken = createDeviceToken()
//   await prisma.deviceNotificationToken.create({ data: { userId: req.user.id, tokenHash: hashToken(plainToken) } })
//   res.status(201).json({ deviceToken: plainToken })
// })
// notifRouter.delete('/device-token', async (req, res) => {
//   const token = req.body?.deviceToken
//   await prisma.deviceNotificationToken.deleteMany({
//     where: token
//       ? { userId: req.user.id, tokenHash: hashToken(token) }
//       : { userId: req.user.id },
//   })
//   res.json({ success: true })
// })
// notifRouter.get('/', async (req, res) => {
//   const notifications = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } })
//   res.json({
//     notifications: notifications.map(n => {
//       const isEmail = n.title?.startsWith('\ud83d\udce7')
//       const isSms = n.title?.startsWith('\ud83d\udcf1')
//       let meta = {}
//       if (isEmail || isSms) {
//         try { meta = JSON.parse(n.message) } catch { meta = { preview: n.message } }
//       }
//       if (!isEmail && !isSms) {
//         try { meta = JSON.parse(n.message) } catch { meta = { preview: n.message } }
//       }
//       return {
//         id: n.id,
//         title: n.title,
//         body: isEmail || isSms ? `From: ${meta.from || ''} \u2014 ${meta.preview || ''}` : meta?.preview || meta?.body || n.message,
//         type: isEmail ? 'email' : isSms ? 'sms' : (meta?.category === 'payments' || meta?.source === 'payment' ? 'payment' : meta?.category === 'time_sensitive' || meta?.source === 'reminder' ? 'reminder' : meta?.source === 'calendar' ? 'calendar' : meta?.source === 'whatsapp' ? 'whatsapp' : meta?.source === 'instagram' ? 'instagram' : meta?.source === 'shopping' ? 'shopping' : meta?.source === 'food' ? 'food' : meta?.source === 'booking' ? 'booking' : 'info'),
//         emailId: isEmail ? meta.emailId || null : null,
//         smsId: isSms ? meta.smsId || null : null,
//         from: meta.from || null,
//         source: meta.source || null,
//         appName: meta.appName || null,
//         priority: Number.isFinite(n.priority) ? n.priority : (meta.priority || 0),
//         meetLink: meta.meetLink || null,
//         eventStart: meta.start || null,
//         relevant: typeof meta.relevant === 'boolean' ? meta.relevant : true,
//         analysis: meta.source === 'android' ? phoneAlertAnalysis(meta, n.title, meta?.body || meta?.preview || '') : null,
//         read: n.read,
//         ts: n.createdAt.toISOString(),
//       }
//     }),
//     unreadCount: notifications.filter(n => !n.read).length,
//   })
// })
// notifRouter.patch('/read-all', async (req, res) => {
//   await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } })
//   res.json({ success: true })
// })
// notifRouter.patch('/:id/read', async (req, res) => {
//   const notification = await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } })
//   res.json({ id: notification.id, read: notification.read })
// })

// function normalizeText(value) {
//   return String(value || '').trim().toLowerCase()
// }

// function classifyRelevance(title, body, source) {
//   const text = normalizeText(`${title} ${body}`)
//   const important = /(remind|due|urgent|follow up|action required|meeting|appointment|deadline|task|todo|schedule|bill|payment|verify|renew|deliver|respond|reply)/i
//   const unimportant = /(promo|sale|offer|unsubscribe|newsletter|spam|advertisement|ads|promotion|deal)/i
//   if (unimportant.test(text)) return false
//   if (important.test(text)) return true
//   if (source === 'reminder' || source === 'task' || source === 'calendar') return true
//   return true
// }

// function classifyType(source, title, body) {
//   const normalizedSource = normalizeText(source)
//   if (normalizedSource === 'sms') return 'sms'
//   if (normalizedSource === 'reminder') return 'reminder'
//   if (normalizedSource === 'email') return 'email'
//   const text = normalizeText(`${title} ${body}`)
//   if (text.includes('reminder') || text.includes('due') || text.includes('appointment')) return 'reminder'
//   return 'info'
// }

// export const smsRouter = express.Router()
// smsRouter.post('/webhook', async (req, res) => {
//   try {
//     const secret = process.env.SMS_WEBHOOK_SECRET?.trim()
//     const incomingSecret = req.headers['x-sms-webhook-secret'] || req.body.secret || req.query.secret
//     if (secret && incomingSecret !== secret) {
//       return res.status(401).json({ error: 'Invalid webhook secret' })
//     }

//     const { userId, from, body, preview, smsId, threadId } = req.body
//     if (!userId) return res.status(400).json({ error: 'userId is required' })

//     const user = await prisma.user.findUnique({ where: { id: userId } })
//     if (!user) return res.status(404).json({ error: 'User not found' })

//     const previewText = preview || String(body || '').slice(0, 150)
//     const notification = await prisma.notification.create({
//       data: {
//         userId,
//         title: `📱 SMS from ${from || 'Unknown'}`,
//         message: JSON.stringify({ source: 'sms', from, preview: previewText, smsBody: body || '', smsId: smsId || null, threadId: threadId || null, relevant: true }),
//       },
//     })

//     const io = req.app.get('io')
//     const payload = {
//       id: notification.id,
//       title: notification.title,
//       body: previewText,
//       type: 'sms',
//       from,
//       smsBody: body || '',
//       smsId: smsId || null,
//       threadId: threadId || null,
//       ts: notification.createdAt.toISOString(),
//       source: 'sms',
//       relevant: true,
//     }
//     if (io) {
//       io.to(`u:${userId}`).emit('sms:notification', payload)
//       io.to(`u:${userId}`).emit('notification:created', payload)
//     }

//     res.json({ success: true, notification: payload })
//   } catch (err) {
//     res.status(500).json({ error: err.message })
//   }
// })

// smsRouter.post('/ingest', async (req, res) => {
//   try {
//     const secret = process.env.NOTIFICATION_WEBHOOK_SECRET?.trim()
//     const incomingSecret = req.headers['x-notification-webhook-secret'] || req.body.secret || req.query.secret
//     if (secret && incomingSecret !== secret) {
//       return res.status(401).json({ error: 'Invalid webhook secret' })
//     }

//     const { userId, title, message, source = 'generic', sourceId, relevant } = req.body
//     if (!userId || !title || !message) {
//       return res.status(400).json({ error: 'userId, title, and message are required' })
//     }

//     const user = await prisma.user.findUnique({ where: { id: userId } })
//     if (!user) return res.status(404).json({ error: 'User not found' })

//     const bodyText = typeof message === 'string' ? message : JSON.stringify(message)
//     const shouldStore = relevant === false ? false : classifyRelevance(title, bodyText, source)
//     if (!shouldStore) {
//       return res.json({ success: true, skipped: true, reason: 'Notification classified as not relevant' })
//     }

//     const previewText = String(bodyText).slice(0, 150)
//     const notification = await prisma.notification.create({
//       data: {
//         userId,
//         title,
//         message: JSON.stringify({ source, sourceId: sourceId || null, preview: previewText, body: bodyText, relevant: shouldStore }),
//       },
//     })

//     const type = classifyType(source, title, bodyText)
//     const payload = {
//       id: notification.id,
//       title: notification.title,
//       body: previewText,
//       type,
//       source,
//       sourceId: sourceId || null,
//       relevant: shouldStore,
//       ts: notification.createdAt.toISOString(),
//     }
//     const io = req.app.get('io')
//     if (io) {
//       io.to(`u:${userId}`).emit('notification:created', payload)
//     }

//     // If the incoming payload includes a start time and the user has calendar connected, create an event
//     const start = req.body.start || (typeof message === 'object' && message.start) || null
//     const end = req.body.end || (typeof message === 'object' && message.end) || null
//     if (start) {
//       try {
//         const event = {
//           summary: title,
//           description: bodyText,
//           start: start.includes('T') ? { dateTime: start } : { date: start },
//           end: end ? (end.includes('T') ? { dateTime: end } : { date: end }) : (start.includes('T') ? { dateTime: new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString() } : { date: start }),
//         }
//         await createEventIfConnected(userId, event)
//       } catch (err) {
//         // fail silently — calendar integration is best-effort
//       }
//     }

//     res.json({ success: true, notification: payload })
//   } catch (err) {
//     res.status(500).json({ error: err.message })
//   }
// })

// // trust.js
// export const trustRouter = express.Router()
// trustRouter.get('/status', async (req, res) => {
//   const [user, trustScore] = await Promise.all([
//     userStore.getById(req.user.id),
//     prisma.trustScore.findUnique({ where: { userId: req.user.id } }),
//   ])
//   res.json({ currentLevel: user?.trustLevel || 1, trustScore: trustScore?.score || 0, plan: user?.plan || 'Free' })
// })
// trustRouter.post('/upgrade', async (req, res) => {
//   const user = await prisma.user.update({
//     where: { id: req.user.id },
//     data: { trustLevel: { increment: 1 } },
//   })
//   res.json({ success: true, newLevel: user.trustLevel })
// })

// trustRouter.patch('/level', async (req, res) => {
//   const { level } = req.body
//   if (!level || level < 1 || level > 4) return res.status(400).json({ error: 'level must be 1–4' })
//   const user = await prisma.user.update({
//     where: { id: req.user.id },
//     data: { trustLevel: Number(level) },
//   })
//   res.json({ success: true, newLevel: user.trustLevel })
// })

// trustRouter.get('/settings', async (req, res) => {
//   const [user, trustScore] = await Promise.all([
//     userStore.getById(req.user.id),
//     prisma.trustScore.findUnique({ where: { userId: req.user.id } }),
//   ])
//   res.json({
//     currentLevel: user?.trustLevel || 1,
//     trustScore: trustScore?.score || 0,
//     approvedActions: trustScore?.approvedActions || 0,
//     rejectedActions: trustScore?.rejectedActions || 0,
//     plan: user?.plan || 'Free',
//     preferences: user?.preferences || {},
//   })
// })

// trustRouter.patch('/settings', async (req, res) => {
//   const { autonomy, privacy, notifications: notifPrefs } = req.body
//   const user = await userStore.getById(req.user.id)
//   const prefs = user?.preferences || {}
//   if (autonomy)      prefs.autonomy      = { ...(prefs.autonomy || {}),      ...autonomy }
//   if (privacy)       prefs.privacy       = { ...(prefs.privacy || {}),       ...privacy }
//   if (notifPrefs)    prefs.notifications = { ...(prefs.notifications || {}), ...notifPrefs }
//   await prisma.user.update({ where: { id: req.user.id }, data: { preferences: prefs } })
//   res.json({ success: true, preferences: prefs })
// })

// // search.js
// export const searchRouter = express.Router()
// searchRouter.get('/', async (req, res) => {
//   const q = String(req.query.q || '')
//   if (q.length < 2) return res.json({ query: q, results: [], total: 0 })

//   const [notifications, ledgers, memories] = await Promise.all([
//     prisma.notification.findMany({
//       where: { userId: req.user.id, OR: [{ title: { contains: q, mode: 'insensitive' } }, { message: { contains: q, mode: 'insensitive' } }] },
//       take: 10,
//     }),
//     prisma.agentLedger.findMany({
//       where: { userId: req.user.id, OR: [{ tool: { contains: q, mode: 'insensitive' } }, { action: { contains: q, mode: 'insensitive' } }] },
//       take: 10,
//     }),
//     memoryService.recall(q, req.user.id, 5),
//   ])

//   const results = [
//     ...notifications.map(n => ({ type: 'notification', title: n.title, snippet: n.message, date: n.createdAt.toISOString() })),
//     ...ledgers.map(l => ({ type: 'ledger', title: l.tool, snippet: l.action, date: l.createdAt.toISOString() })),
//     ...memories.map(item => ({
//       type: 'memory',
//       title: item.payload?.type || 'memory',
//       snippet: item.payload?.text || '',
//       date: item.payload?.createdAt || new Date().toISOString(),
//       score: item.score,
//     })),
//   ]

//   res.json({ query: q, results, total: results.length })
// })

































































///////////////////////// new ///////////////////////////



import { logger } from "../config/logger.js";
// agent.js
import express from "express";
import { runLangGraphOrchestrator } from "../agents/langGraphOrchestrator.js";
import {
  getAgentRegistrySnapshot,
  plannerAgent,
  researcherAgent,
} from "../agents/registry.js";
import { memoryService } from "../services/memory.service.js";
import { ledger } from "../services/ledgerService.js";
import { userStore } from "../models/userStore.js";
import { prisma } from "../config/prisma.js";
import { transcribeAudio } from "../services/transcription.service.js";
import {
  listEmails,
  getEmailBody,
  sendEmail,
} from "../services/gmail.service.js";
import { createEventIfConnected } from "../services/calendar.service.js";
import multer from "multer";
import { createDeviceToken, hashToken } from "./deviceNotifications.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const agentRouter = express.Router();
agentRouter.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages))
      return res.status(400).json({ error: "messages[] required" });
    const user = (await userStore.getById(req.user.id)) || req.user;

    const sessionContext = await memoryService.getSessionSnapshot(req.user.id);
    const recentMemory = await memoryService.recall(
      messages[messages.length - 1]?.content || "",
      req.user.id,
      5,
    );
    const onboardingProfile = await prisma.userProfile.findUnique({
      where: { userId: req.user.id },
    });

    // ── Fetch live connected data so AI knows real user data ──────────────
    const liveData = {};
    await Promise.allSettled([
      // Google Fit / Health
      (async () => {
        try {
          const { getHealthData } =
            await import("../services/googleFit.service.js");
          liveData.health = await getHealthData(user);
        } catch {}
      })(),
      // Google Contacts summary
      (async () => {
        try {
          const { listContacts } =
            await import("../services/googleContacts.service.js");
          const result = await listContacts(user, { pageSize: 20 });
          liveData.contacts = {
            total: result.total,
            sample: result.contacts
              .slice(0, 10)
              .map((c) => ({
                name: c.displayName,
                phone: c.phone,
                email: c.email,
                org: c.organization,
              })),
          };
        } catch {}
      })(),
      // Calendar upcoming events
      (async () => {
        try {
          const { listEvents } =
            await import("../services/calendar.service.js");
          const now = new Date();
          const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          const events = await listEvents(
            user,
            now.toISOString(),
            weekLater.toISOString(),
            10,
          );
          liveData.calendar = (events || [])
            .slice(0, 10)
            .map((e) => ({
              title: e.summary || e.title,
              start: e.start?.dateTime || e.start?.date,
              meetLink: e.hangoutLink || e.meetLink || null,
            }));
        } catch {}
      })(),
      // Gmail unread count + recent subjects
      (async () => {
        try {
          const { listEmails } = await import("../services/gmail.service.js");
          const result = await listEmails(user, "unread", 5);
          liveData.emails = {
            unreadCount: result.unreadCount || 0,
            recent: (result.emails || [])
              .slice(0, 5)
              .map((e) => ({
                subject: e.subject,
                from: e.from,
                preview: e.preview,
              })),
          };
        } catch {}
      })(),
    ]);

    const result = await runLangGraphOrchestrator({
      messages: messages.slice(-20),
      user,
      context: {
        sessionContext,
        recentMemory,
        onboardingContext: onboardingProfile || null,
        liveData,
      },
    });

    res.json({
      ...result,
      sessionContext,
      memories: recentMemory,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

agentRouter.post("/orchestrate", async (req, res) => {
  try {
    const { messages = [] } = req.body;
    if (!Array.isArray(messages))
      return res.status(400).json({ error: "messages[] required" });

    const user = (await userStore.getById(req.user.id)) || req.user;
    const sessionContext = await memoryService.getSessionSnapshot(req.user.id);
    const recentMemory = await memoryService.recall(
      messages[messages.length - 1]?.content || "",
      req.user.id,
      5,
    );
    const onboardingProfile = await prisma.userProfile.findUnique({
      where: { userId: req.user.id },
    });

    const result = await runLangGraphOrchestrator({
      messages: messages.slice(-20),
      user,
      context: {
        sessionContext,
        recentMemory,
        onboardingContext: onboardingProfile || null,
      },
    });

    res.json({
      ...result,
      sessionContext,
      memories: recentMemory,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

agentRouter.post("/planner", async (req, res) => {
  try {
    const output = await plannerAgent.run(req.body);
    res.json(output);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

agentRouter.post("/researcher", async (req, res) => {
  try {
    const output = await researcherAgent.run(req.body);
    res.json(output);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

agentRouter.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    let file = req.file;

    // React Native sends base64 JSON instead of multipart FormData
    if (!file && req.body?.audioBase64) {
      const base64 = String(req.body.audioBase64).replace(
        /^data:[^;]+;base64,/,
        "",
      );
      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length)
        return res.status(400).json({ error: "Empty audio data received" });
      file = {
        buffer,
        originalname: req.body.fileName || "voice.m4a",
        mimetype: req.body.mimeType || "audio/m4a",
        size: buffer.length,
      };
    }

    if (!file) return res.status(400).json({ error: "audio file is required" });
    const result = await transcribeAudio(file);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

agentRouter.post("/draft", async (req, res) => {
  try {
    const { subject, from, preview, body } = req.body;
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return res.status(503).json({ error: "AI not configured" });
    const content = `From: ${from || ""}\nSubject: ${subject || ""}\n\n${body || preview || ""}`;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Build schedule context — check tasks and reminders for conflicts
    let scheduleContext = "";
    try {
      const userId = req.user.id;
      const [tasks, notifications] = await Promise.all([
        prisma.task.findMany({
          where: { userId, status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.notification.findMany({
          where: {
            userId,
            OR: [
              { message: { contains: '"source":"reminder"' } },
              { message: { contains: '"source":"calendar"' } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);
      const scheduled = notifications
        .map((n) => {
          try {
            const meta = JSON.parse(n.message);
            if (!meta.start) return null;
            const t = new Date(meta.start).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            });
            return `\u2022 ${n.title.replace(/^[^a-zA-Z]+/, "")} \u2014 ${t}`;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const pendingTasks = tasks.map((t) => `\u2022 ${t.title}`);
      const all = [...scheduled, ...pendingTasks];
      if (all.length)
        scheduleContext = `\n\nUSER'S CURRENT SCHEDULE & PENDING TASKS:\n${all.join("\n")}\n\nIMPORTANT: If this email requests a meeting or asks for availability, check the schedule above for conflicts and mention them in the draft reply. Suggest an alternative time if there is a conflict.`;
    } catch {
      /* best-effort */
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are ${req.user?.name || "the user"}'s AI Chief of Staff. Write a concise professional reply to the email below. Return ONLY the reply body \u2014 no subject, no greeting, no sign-off. Under 120 words.${scheduleContext}`,
          },
          { role: "user", content },
        ],
        temperature: 0.4,
      }),
    });
    const data = await r.json().catch(() => ({}));
    const draft = data.choices?.[0]?.message?.content?.trim() || "";
    res.json({ draft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

agentRouter.get("/ledger", async (req, res) => {
  const entries = await ledger.getByUser(req.user.id);
  res.json({ entries, total: entries.length });
});
agentRouter.get("/registry", (_req, res) => {
  res.json(getAgentRegistrySnapshot());
});
agentRouter.post("/approve", async (req, res) => {
  await prisma.trustScore.upsert({
    where: { userId: req.user.id },
    update: { approvedActions: { increment: 1 }, score: { increment: 1 } },
    create: { userId: req.user.id, approvedActions: 1, score: 1 },
  });
  res.json({
    actionId: req.body.actionId,
    status: "approved",
    ts: new Date().toISOString(),
  });
});
agentRouter.post("/deny", async (req, res) => {
  await prisma.trustScore.upsert({
    where: { userId: req.user.id },
    update: { rejectedActions: { increment: 1 }, score: { decrement: 1 } },
    create: { userId: req.user.id, rejectedActions: 1, score: -1 },
  });
  res.json({
    actionId: req.body.actionId,
    status: "denied",
    ts: new Date().toISOString(),
  });
});

// dashboard.js
export const dashboardRouter = express.Router();

function formatDashboardTime(value) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function formatDashboardDateTime(value) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

dashboardRouter.get("/brief", async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const importantNotificationWhere = {
      userId: req.user.id,
      read: false,
      priority: { gte: 60 },
    };
    const [
      externalNotifs,
      completedRaw,
      pendingTasks,
      importantNotificationCount,
      urgentNotificationCount,
    ] = await Promise.all([
      prisma.notification.findMany({
        where: {
          userId: req.user.id,
          read: false,
          OR: [
            { title: { startsWith: "\u{1F4E7}" } },
            { title: { startsWith: "\u{1F4F1}" } },
            { message: { contains: '"source":"email"' } },
            { message: { contains: '"source":"sms"' } },
            { message: { contains: '"source":"calendar"' } },
            { message: { contains: '"source":"reminder"' } },
            // Android phone alerts that passed the relevance agent belong in
            // the morning briefing even when they are not urgent enough to
            // become a Priority task.
            { priority: { gte: 60 } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.agentLedger.findMany({
        where: {
          userId: req.user.id,
          status: "completed",
          createdAt: { gte: todayStart },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.task.findMany({
        where: { userId: req.user.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.notification.count({ where: importantNotificationWhere }),
      prisma.notification.count({
        where: { ...importantNotificationWhere, priority: { gte: 85 } },
      }),
    ]);

    // Retries from an AI turn can leave identical ledger rows. Keep one action
    // in the briefing rather than presenting the same reminder/meeting twice.
    const completedActionKeys = new Set();
    const completed = completedRaw.filter((entry) => {
      let input = {};
      try {
        input = JSON.parse(entry.action).input || {};
      } catch {}
      const key =
        entry.tool === "set_reminder"
          ? `reminder:${String(input.message || "")
              .trim()
              .toLowerCase()}:${input.time || ""}`
          : entry.tool === "schedule_event"
            ? `meeting:${String(input.title || "")
                .trim()
                .toLowerCase()}:${input.start || ""}`
            : entry.id;
      if (completedActionKeys.has(key)) return false;
      completedActionKeys.add(key);
      return true;
    });

    // Fetch urgent emails in parallel — fail silently if Gmail not connected
    let urgentEmails = [];
    let suggestedMeetings = [];
    try {
      const { getUrgentEmails: _getUrgent, detectMeetingRequest } =
        await import("../services/gmail.service.js");
      const { userStore: _us } = await import("../models/userStore.js");
      const _user = await _us.getById(req.user.id);
      urgentEmails = await _getUrgent(_user, 20);
      // Scan urgent emails for meeting requests
      suggestedMeetings = urgentEmails
        .map((e) => {
          const info = detectMeetingRequest(e.subject, e.snippet, e.from);
          if (!info) return null;
          return {
            emailId: e.id,
            subject: e.subject,
            senderName: info.senderName,
            senderEmail: info.senderEmail,
            snippet: e.snippet,
            time: e.time,
            urgencyScore: e.urgencyScore,
          };
        })
        .filter(Boolean)
        .slice(0, 3);
    } catch {
      urgentEmails = [];
      suggestedMeetings = [];
    }

    const filteredTasks = pendingTasks.filter((t) => {
      // The dashboard's priority card is intentionally reset every calendar
      // day. Older open tasks remain stored, but are not today's priorities.
      if (t.createdAt < todayStart) return false;
      const title = (t.title || "").trim();
      if (!title || title.length < 3) return false;
      if (/^[a-z_]+:[a-z0-9]+$/i.test(title)) return false;
      if (/^meeting_done:/i.test(title)) return false;
      // Older app versions created a task from a phone alert. Keep those
      // records for audit history, but never surface them as a Priority.
      if (/^Important .+ alert · .+ · priority:\d+$/i.test(t.description || ""))
        return false;
      return true;
    });
    const makeLabel = (entry, input) => {
      const map = {
        schedule_event: "Scheduled: " + (input.title || "Meeting"),
        set_reminder:
          "Reminder set: " + (input.message || input.title || "Done"),
        initiate_payment:
          "Payment \u20b9" +
          (input.amount || "") +
          " to " +
          (input.payee || ""),
        send_email: "Email sent to " + (input.recipient || ""),
        draft_reply: "Draft reply prepared",
        book_cab:
          "Cab: " +
          (input.pickup || "") +
          " \u2192 " +
          (input.destination || ""),
        order_food: "Food ordered from " + (input.restaurant || ""),
        get_daily_brief: "Daily brief generated",
        get_portfolio: "Portfolio snapshot fetched",
        get_spending_summary: "Spending summary checked",
        get_health_data: "Health data synced",
        query_bills: "Bills checked",
        personal_search: 'Search: "' + (input.query || "") + '"',
      };
      return (
        map[entry.tool] ||
        entry.tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      );
    };

    res.json({
      generatedAt: new Date().toISOString(),
      greeting: "Hello, " + (req.user.name || "there"),
      summary: completed.length
        ? completed.length +
          " action" +
          (completed.length > 1 ? "s" : "") +
          " completed by your AI twin today."
        : filteredTasks.length
          ? filteredTasks.length +
            " task" +
            (filteredTasks.length > 1 ? "s" : "") +
            " pending."
          : "All clear \u2014 your AI twin is standing by.",
      weather: null,
      pendingActions: externalNotifs.map((n) => {
        let meta = {};
        try {
          meta = JSON.parse(n.message);
        } catch {}
        return {
          id: n.id,
          type: "notification",
          urgency: "medium",
          title: n.title,
          detail: meta.preview || meta.body || "",
          domain:
            meta.source === "calendar"
              ? "calendar"
              : meta.source === "reminder"
                ? "reminder"
                : "notifications",
        };
      }),
      autoCompleted: completed.map((entry) => {
        let input = {},
          result = {};
        try {
          const p = JSON.parse(entry.action);
          input = p.input || {};
          result = p.result || {};
        } catch {}
        const label = makeLabel(entry, input);
        let detail = "";
        let logDetail = "";
        if (entry.tool === "schedule_event") {
          const w =
            input.attendees && input.attendees.length
              ? "With " + input.attendees[0]
              : "";
          const t = input.start
            ? " \u00b7 " + formatDashboardDateTime(input.start)
            : "";
          detail = (w + t).trim();
        } else if (entry.tool === "initiate_payment") {
          detail = "Status: " + (result.status || "done");
        } else if (entry.tool === "book_cab") {
          detail = "Est. fare: " + (result.fare || "N/A");
        } else if (entry.tool === "set_reminder") {
          // The dashboard priority card should show when the reminder will
          // happen, matching the Priorities screen — not when AI created it.
          const scheduledTime = result.scheduled || input.time;
          detail = scheduledTime
            ? `Scheduled · ${formatDashboardTime(scheduledTime)}`
            : "Scheduled";
          logDetail = "Saved";
        }
        return {
          title: label,
          detail,
          logDetail: logDetail || detail,
          tool: entry.tool,
          scheduledAt:
            entry.tool === "set_reminder"
              ? result.scheduled || input.time || null
              : null,
          timestamp: entry.createdAt.toISOString(),
          time: formatDashboardTime(entry.createdAt),
        };
      }),
      commitments: [],
      followUpRadar: [],
      insights: [],
      pendingTasks: filteredTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        createdAt: t.createdAt,
      })),
      stats: { actionsAuto: completed.length, trustScore: 0 },
      // These counts drive the opening AI greeting. Only alerts that the
      // phone-notification agent marked important are included, so the app
      // never describes ordinary unread mail or promotions as urgent work.
      importantNotifications: {
        count: importantNotificationCount,
        urgentCount: urgentNotificationCount,
      },
      urgentEmails: urgentEmails.map((e) => ({
        id: e.id,
        subject: e.subject,
        from: e.from,
        snippet: e.snippet,
        time: e.time,
        urgencyScore: e.urgencyScore,
      })),
      suggestedMeetings,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
dashboardRouter.get("/sidebar-counts", async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await userStore.getById(userId);

    // Daily Brief: unread notifications count
    const briefCount = await prisma.notification.count({
      where: { userId, read: false },
    });

    // Finance: due bills count (from DB ledger pending payments)
    const financeCount = await prisma.agentLedger.count({
      where: { userId, tool: "initiate_payment", status: "pending_approval" },
    });

    // Communications: unread emails via Gmail
    let commsCount = 0;
    try {
      const { listEmails } = await import("../services/gmail.service.js");
      const result = await listEmails(user, "unread", 1);
      commsCount = result?.unreadCount || 0;
    } catch {
      commsCount = 0;
    }

    // Health: upcoming appointments (from preferences or tasks)
    const healthCount = await prisma.task
      .count({
        where: {
          userId,
          status: "PENDING",
          title: { contains: "appointment", mode: "insensitive" },
        },
      })
      .catch(() => 0);

    res.json({
      brief: briefCount,
      finance: financeCount,
      comms: commsCount,
      health: healthCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

dashboardRouter.get("/stats", async (req, res) => {
  const [actionsTotal, actionsAuto, trustScore] = await Promise.all([
    prisma.agentLedger.count({ where: { userId: req.user.id } }),
    prisma.agentLedger.count({
      where: { userId: req.user.id, status: "completed" },
    }),
    prisma.trustScore.findUnique({ where: { userId: req.user.id } }),
  ]);
  res.json({
    hoursSaved: 0,
    actionsTotal,
    actionsAuto,
    trustScore: trustScore?.score || 0,
  });
});

// finance.js
export const financeRouter = express.Router();
financeRouter.get("/bills", (_req, res) => res.json([]));
financeRouter.get("/portfolio", (_req, res) =>
  res.json({
    totalInvested: 0,
    totalCurrent: 0,
    returnPct: 0,
    cibilScore: null,
    cibilGrade: null,
    netWorth: 0,
    holdings: [],
    accounts: [],
  }),
);
financeRouter.get("/spending", (req, res) =>
  res.json({
    period: req.query.period || "month",
    total: 0,
    budget: 0,
    savingsRate: 0,
    categories: [],
    insights: [],
  }),
);
financeRouter.post("/pay", async (req, res) => {
  const entry = await ledger.add({
    userId: req.user.id,
    tool: "initiate_payment",
    input: req.body,
    result: { status: "pending_approval" },
    status: "pending_approval",
  });
  res.json({ actionId: entry.id, status: "pending_approval", ...req.body });
});

// comms.js
function gmailErrorResponse(err, res) {
  const msg = err?.message || "";
  if (msg.includes("Gmail is not connected"))
    return res
      .status(409)
      .json({
        error: "gmail_not_connected",
        message:
          "Gmail is not connected. Go to Settings → Integrations to connect.",
      });
  if (
    msg.includes("Gmail API has not been used") ||
    msg.includes("is disabled")
  )
    return res
      .status(503)
      .json({
        error: "gmail_api_disabled",
        message:
          "Gmail API is disabled in Google Cloud Console. Visit https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=769657045922 and click Enable.",
      });
  if (msg.includes("invalid_grant") || msg.includes("Token has been expired"))
    return res
      .status(401)
      .json({
        error: "gmail_token_expired",
        message:
          "Gmail token expired. Please reconnect Gmail in Settings → Integrations.",
      });
  return res.status(500).json({ error: "gmail_error", message: msg });
}

export const commsRouter = express.Router();
commsRouter.get("/emails", async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id);
    const { filter = "all", limit = 20 } = req.query;
    const result = await listEmails(user, filter, Number(limit));
    res.json(result);
  } catch (err) {
    gmailErrorResponse(err, res);
  }
});
commsRouter.get("/emails/:id", async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id);
    const email = await getEmailBody(user, req.params.id);
    res.json(email);
  } catch (err) {
    gmailErrorResponse(err, res);
  }
});
commsRouter.get("/emails/:id/draft", async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id);
    const email = await getEmailBody(user, req.params.id);
    res.json({ email, draft: "" });
  } catch (err) {
    gmailErrorResponse(err, res);
  }
});
commsRouter.post("/emails/:id/send", async (req, res) => {
  try {
    const { recipient, subject, draft } = req.body;
    if (!recipient || !subject || !draft)
      return res
        .status(400)
        .json({ error: "recipient, subject, and draft are required" });
    const user = await userStore.getById(req.user.id);
    const result = await sendEmail(user, recipient, subject, draft);
    res.json({ success: true, result });
  } catch (err) {
    gmailErrorResponse(err, res);
  }
});

// health.js
export const healthRouter = express.Router();
healthRouter.get("/metrics", async (req, res) => {
  try {
    const { getHealthData } = await import("../services/googleFit.service.js");
    const user = await userStore.getById(req.user.id);
    const data = await getHealthData(user);
    // auto-log today's Google Fit data to the calendar log
    if (data.source === "google_fit") {
      const today = new Date().toISOString().slice(0, 10);
      const prefs = user?.preferences || {};
      if (!prefs.healthLog) prefs.healthLog = {};
      prefs.healthLog[today] = {
        source: "google_fit",
        lastSynced: data.lastUpdated,
        steps: data.steps?.value ?? null,
        heartRate: data.heartRate?.value ?? null,
        sleep: data.sleep?.value ?? null,
        calories: data.calories?.consumed ?? null,
        weight: data.weight?.value ?? null,
        height: data.height?.value ?? null,
      };
      await prisma.user
        .update({ where: { id: req.user.id }, data: { preferences: prefs } })
        .catch(() => {});
    }
    res.json(data);
  } catch (err) {
    // No health source is a normal state for a new/unconnected user.
    // It must not turn into a 500 because the rest of the application is healthy.
    if (
      err?.message === "no_health_data" ||
      err?.message?.includes("not connected") ||
      err?.message?.includes("No health data")
    ) {
      return res.json({
        period: req.query.period || "today",
        lastUpdated: new Date().toISOString(),
        source: "none",
        heartRate: null,
        steps: { value: 0, goal: 10000, pct: 0 },
        sleep: null,
        calories: null,
        weight: null,
        height: null,
        weeklySteps: [],
      });
    }

    logger?.warn?.(`Health metrics request failed: ${err?.message || err}`);
    res
      .status(500)
      .json({
        error: "health_metrics_unavailable",
        message: err?.message || "Unable to load health metrics",
      });
  }
});
healthRouter.get("/appointments", (_req, res) =>
  res.json({ appointments: [] }),
);
healthRouter.get("/medications", (_req, res) => res.json({ medications: [] }));

// POST /api/health-data/sync — accepts data from iOS Shortcut / Apple Health / manual
healthRouter.post("/sync", async (req, res) => {
  try {
    const {
      source = "manual",
      // vitals
      steps,
      heartRate,
      bloodPressureSystolic,
      bloodPressureDiastolic,
      bloodOxygen,
      bodyTemp,
      // body
      weight,
      height,
      bmi,
      bodyFat,
      muscleMass,
      waist,
      // sleep
      sleep,
      sleepBedtime,
      sleepWakeup,
      sleepDeep,
      sleepRem,
      sleepLight,
      // nutrition
      calories,
      protein,
      carbs,
      fat,
      fiber,
      water,
      // activity
      activeMinutes,
      workoutType,
      workoutDuration,
      workoutCalories,
      distance,
      // cycle
      cyclePhase,
      cycleDay,
      periodFlow,
      symptoms,
    } = req.body;
    const user = await userStore.getById(req.user.id);
    const prefs = user?.preferences || {};
    const today = new Date().toISOString().slice(0, 10);
    const existing = prefs.healthSync || {};
    const merge = (obj, key, val) => {
      if (val != null) obj[key] = typeof val === "string" ? val : Number(val);
    };
    const synced = {
      ...existing,
      source,
      lastSynced: new Date().toISOString(),
      date: today,
    };
    // vitals
    merge(synced, "steps", steps);
    merge(synced, "heartRate", heartRate);
    merge(synced, "bloodPressureSystolic", bloodPressureSystolic);
    merge(synced, "bloodPressureDiastolic", bloodPressureDiastolic);
    merge(synced, "bloodOxygen", bloodOxygen);
    merge(synced, "bodyTemp", bodyTemp);
    // body
    merge(synced, "weight", weight);
    merge(synced, "height", height);
    merge(synced, "bmi", bmi);
    merge(synced, "bodyFat", bodyFat);
    merge(synced, "muscleMass", muscleMass);
    merge(synced, "waist", waist);
    // sleep
    merge(synced, "sleep", sleep);
    merge(synced, "sleepBedtime", sleepBedtime);
    merge(synced, "sleepWakeup", sleepWakeup);
    merge(synced, "sleepDeep", sleepDeep);
    merge(synced, "sleepRem", sleepRem);
    merge(synced, "sleepLight", sleepLight);
    // nutrition
    merge(synced, "calories", calories);
    merge(synced, "protein", protein);
    merge(synced, "carbs", carbs);
    merge(synced, "fat", fat);
    merge(synced, "fiber", fiber);
    merge(synced, "water", water);
    // activity
    merge(synced, "activeMinutes", activeMinutes);
    merge(synced, "workoutType", workoutType);
    merge(synced, "workoutDuration", workoutDuration);
    merge(synced, "workoutCalories", workoutCalories);
    merge(synced, "distance", distance);
    // cycle
    merge(synced, "cyclePhase", cyclePhase);
    merge(synced, "cycleDay", cycleDay);
    merge(synced, "periodFlow", periodFlow);
    merge(synced, "symptoms", symptoms);

    prefs.healthSync = synced;
    if (!prefs.healthLog) prefs.healthLog = {};
    prefs.healthLog[today] = { ...synced };
    await prisma.user.update({
      where: { id: req.user.id },
      data: { preferences: prefs },
    });
    res.json({ success: true, synced });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health-data/log — full per-date history for calendar
healthRouter.get("/log", async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id);
    const log = user?.preferences?.healthLog || {};
    res.json({ log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/health-data/log/:date — edit a specific date entry
healthRouter.put("/log/:date", async (req, res) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: "invalid_date" });
    const { steps, heartRate, sleep, calories, weight, height, source } =
      req.body;
    const user = await userStore.getById(req.user.id);
    const prefs = user?.preferences || {};
    if (!prefs.healthLog) prefs.healthLog = {};
    const existing = prefs.healthLog[date] || {};
    prefs.healthLog[date] = {
      ...existing,
      lastSynced: new Date().toISOString(),
      ...(source != null && { source }),
      ...(steps != null && { steps: Number(steps) }),
      ...(heartRate != null && { heartRate: Number(heartRate) }),
      ...(sleep != null && { sleep: Number(sleep) }),
      ...(calories != null && { calories: Number(calories) }),
      ...(weight != null && { weight: Number(weight) }),
      ...(height != null && { height: Number(height) }),
    };
    await prisma.user.update({
      where: { id: req.user.id },
      data: { preferences: prefs },
    });
    res.json({ success: true, entry: prefs.healthLog[date] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/health-data/log/:date — delete a specific date entry
healthRouter.delete("/log/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const user = await userStore.getById(req.user.id);
    const prefs = user?.preferences || {};
    if (prefs.healthLog?.[date]) delete prefs.healthLog[date];
    await prisma.user.update({
      where: { id: req.user.id },
      data: { preferences: prefs },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// lifeops.js
import {
  getDistanceMatrix,
  buildCabOptions,
  getFoodSuggestions,
} from "../services/lifeops.service.js";
export const lifeopsRouter = express.Router();

lifeopsRouter.get("/rides", async (req, res) => {
  try {
    const entries = await ledger.getByUser(req.user.id);
    const rides = entries
      .filter((e) => e.tool === "book_cab")
      .slice(0, 10)
      .map((e) => {
        let input = {},
          result = {};
        try {
          const p = JSON.parse(e.action);
          input = p.input || {};
          result = p.result || {};
        } catch {}
        return {
          id: e.id,
          pickup: input.pickup,
          destination: input.destination,
          status: e.status,
          fare: result.fare,
          cabType: input.cab_type,
          createdAt: e.createdAt,
        };
      });
    res.json({ rides });
  } catch {
    res.json({ rides: [] });
  }
});

lifeopsRouter.get("/wishlist", (_req, res) => res.json({ items: [] }));

lifeopsRouter.get("/cab/estimate", async (req, res) => {
  try {
    const { pickup, destination } = req.query;
    if (!pickup || !destination)
      return res.status(400).json({ error: "pickup and destination required" });
    const matrix = await getDistanceMatrix(pickup, destination);
    const options = buildCabOptions(matrix);
    res.json({
      pickup,
      destination,
      distanceText: matrix?.distanceText || null,
      durationText: matrix?.durationText || null,
      realDistance: !!matrix,
      options,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

lifeopsRouter.post("/cab", async (req, res) => {
  try {
    const {
      pickup,
      destination,
      cab_type = "mini",
      fare,
      driver,
      rating,
      carModel,
      etaMin,
    } = req.body;
    const result = {
      status: "confirmed",
      bookingId: "OLA" + Date.now().toString(36).toUpperCase(),
      pickup,
      destination,
      cab_type,
      fare,
      driver,
      rating,
      carModel,
      etaMin,
      confirmedAt: new Date().toISOString(),
    };
    const entry = await ledger.add({
      userId: req.user.id,
      tool: "book_cab",
      input: req.body,
      result,
      status: "completed",
    });
    try {
      const pickupTime = new Date(Date.now() + (etaMin || 10) * 60 * 1000);
      await prisma.notification.create({
        data: {
          userId: req.user.id,
          title: "🚗 Cab arriving in " + (etaMin || 10) + " mins",
          message: JSON.stringify({
            source: "reminder",
            preview: driver + " · " + carModel + " · ₹" + fare,
            start: pickupTime.toISOString(),
          }),
        },
      });
    } catch {}
    res.json({ ...result, ledgerId: entry.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

lifeopsRouter.get("/orders", async (req, res) => {
  try {
    const entries = await ledger.getByUser(req.user.id);
    const orders = entries
      .filter((e) => e.tool === "order_food")
      .slice(0, 10)
      .map((e) => {
        let input = {},
          result = {};
        try {
          const p = JSON.parse(e.action);
          input = p.input || {};
          result = p.result || {};
        } catch {}
        return {
          id: e.id,
          restaurant: input.restaurant,
          items: input.items,
          platform: input.platform,
          totalAmount: result.totalAmount,
          deliveryTime: result.deliveryTime,
          status: e.status,
          createdAt: e.createdAt,
        };
      });
    res.json({ orders });
  } catch {
    res.json({ orders: [] });
  }
});

lifeopsRouter.get("/food/suggest", async (req, res) => {
  try {
    const result = await getFoodSuggestions(req.user.id, req.query.query || "");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

lifeopsRouter.post("/food", async (req, res) => {
  try {
    const {
      restaurant,
      items,
      platform = "swiggy",
      totalAmount,
      deliveryTime,
    } = req.body;
    const result = {
      status: "confirmed",
      orderId: "SWG" + Date.now().toString(36).toUpperCase(),
      restaurant,
      items,
      platform,
      totalAmount,
      deliveryTime,
      confirmedAt: new Date().toISOString(),
    };
    const entry = await ledger.add({
      userId: req.user.id,
      tool: "order_food",
      input: req.body,
      result,
      status: "completed",
    });
    try {
      const mins = parseInt(
        String(deliveryTime || "35").match(/d+/)?.[0] || "35",
      );
      const deliveryAt = new Date(Date.now() + mins * 60 * 1000);
      await prisma.notification.create({
        data: {
          userId: req.user.id,
          title: "🍔 Food arriving in ~" + mins + " mins",
          message: JSON.stringify({
            source: "reminder",
            preview: restaurant + " · ₹" + (totalAmount || ""),
            start: deliveryAt.toISOString(),
          }),
        },
      });
    } catch {}
    res.json({ ...result, ledgerId: entry.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hotel search — GET /api/lifeops/hotel/search?city=Goa&checkIn=2025-08-01&checkOut=2025-08-03
lifeopsRouter.get("/hotel/search", async (req, res) => {
  try {
    const { city, checkIn, checkOut, adults = 1 } = req.query;
    if (!city || !checkIn || !checkOut)
      return res
        .status(400)
        .json({ error: "city, checkIn and checkOut are required" });
    const { searchHotels } = await import("../services/hotel.service.js");
    const hotels = await searchHotels({
      cityName: city,
      checkIn,
      checkOut,
      adults: parseInt(adults),
    });
    res.json({ hotels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Flight search — GET /api/lifeops/flight/search?from=BLR&to=BOM&date=2026-08-20
lifeopsRouter.get("/flight/search", async (req, res) => {
  try {
    const { from, to, date } = req.query;
    if (!from || !to || !date)
      return res.status(400).json({ error: "from, to and date are required" });
    const { searchFlights } = await import("../services/flight.service.js");
    const flights = await searchFlights({ from, to, date });
    res.json({ flights });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Flight book — POST /api/lifeops/flight/book
lifeopsRouter.post("/flight/book", async (req, res) => {
  try {
    const {
      flightId,
      airline,
      flightCode,
      from,
      to,
      depart,
      arrive,
      date,
      cabinClass,
      seat,
      price,
    } = req.body;
    if (!from || !to)
      return res.status(400).json({ error: "from and to are required" });
    const { bookFlight } = await import("../services/flight.service.js");
    const result = bookFlight({
      flightId,
      airline,
      flightCode,
      from,
      to,
      depart,
      arrive,
      date,
      cabinClass,
      seat,
      price,
    });
    const entry = await ledger.add({
      userId: req.user.id,
      tool: "book_flight",
      input: req.body,
      result,
      status: "completed",
    });
    try {
      await prisma.notification.create({
        data: {
          userId: req.user.id,
          title: `✈️ Flight booked — ${airline} ${from}→${to}`,
          message: JSON.stringify({
            source: "reminder",
            preview: `${depart} → ${arrive} · ₹${price}`,
            start: date,
          }),
        },
      });
    } catch {}
    res.json({ ...result, ledgerId: entry.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hotel book — POST /api/lifeops/hotel/book
lifeopsRouter.post("/hotel/book", async (req, res) => {
  try {
    const { offerId, hotelName, roomType, price, checkIn, checkOut, city } =
      req.body;
    if (!offerId) return res.status(400).json({ error: "offerId is required" });
    const { bookHotel } = await import("../services/hotel.service.js");
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true, email: true },
    });
    const result = await bookHotel({
      hotelId: offerId,
      hotelName,
      roomType,
      price,
      checkIn,
      checkOut,
      city,
      guestName: user?.name || "Guest User",
    });
    const entry = await ledger.add({
      userId: req.user.id,
      tool: "book_hotel",
      input: req.body,
      result,
      status: "completed",
    });
    try {
      await prisma.notification.create({
        data: {
          userId: req.user.id,
          title: "🏨 Hotel booked — " + hotelName,
          message: JSON.stringify({
            source: "reminder",
            preview:
              roomType + " · " + checkIn + " → " + checkOut + " · ₹" + price,
          }),
        },
      });
    } catch {}
    res.json({
      ...result,
      hotelName,
      roomType,
      price,
      checkIn,
      checkOut,
      city,
      ledgerId: entry.id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// meetings.js
export const meetingsRouter = express.Router();

// POST /api/meetings/suggest-approve
// Called when user approves a suggested meeting from an urgent email
meetingsRouter.post("/suggest-approve", async (req, res) => {
  try {
    const { emailId, senderName, senderEmail, subject, start, end, title } =
      req.body;
    if (!senderEmail || !start)
      return res
        .status(400)
        .json({ error: "senderEmail and start are required" });

    const { createMeetingWithGoogleMeet } =
      await import("../services/calendar.service.js");
    const startDt = new Date(start);
    if (isNaN(startDt.getTime()))
      return res.status(400).json({ error: "Invalid start datetime" });
    const endDt = end
      ? new Date(end)
      : new Date(startDt.getTime() + 60 * 60 * 1000);

    const meetingTitle = title || `Meeting with ${senderName || senderEmail}`;
    const meeting = await createMeetingWithGoogleMeet(req.user.id, {
      title: meetingTitle,
      start: startDt.toISOString(),
      end: endDt.toISOString(),
      description: `Meeting requested via email: "${subject || ""}"`,
      attendees: [senderEmail],
    });

    // Add to ledger
    const ledgerEntry = await ledger.add({
      userId: req.user.id,
      tool: "schedule_event",
      input: {
        title: meetingTitle,
        start: startDt.toISOString(),
        end: endDt.toISOString(),
        attendees: [senderEmail],
      },
      result: meeting,
      status: "completed",
    });

    // Notify
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: `📅 Meeting scheduled: ${meetingTitle}`,
        message: JSON.stringify({
          source: "calendar",
          eventId: meeting.eventId,
          meetLink: meeting.meetLink,
          preview: `With ${senderName || senderEmail}`,
          start: startDt.toISOString(),
        }),
      },
    });

    // A suggested meeting is also a pending priority, just like meetings made
    // directly in Ask AI. Without this record it only exists in Calendar.
    const meetingTask = await prisma.task.create({
      data: {
        userId: req.user.id,
        title: meetingTitle,
        description: `Meeting · ${startDt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`,
        status: "PENDING",
      },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`u:${req.user.id}`).emit("task:created", meetingTask);
      io.to(`u:${req.user.id}`).emit("ledger:updated", ledgerEntry);
      io.to(`u:${req.user.id}`).emit("meeting:created", {
        ...meeting,
        title: meetingTitle,
        start: startDt.toISOString(),
        end: endDt.toISOString(),
      });
    }

    res.json({ success: true, meeting: { ...meeting, title: meetingTitle } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// twin.js
export const twinRouter = express.Router();
twinRouter.get("/diary", async (req, res) =>
  res.json({ entries: await ledger.getByUser(req.user.id) }),
);
twinRouter.get("/ledger", async (req, res) =>
  res.json({ entries: await ledger.getByUser(req.user.id) }),
);

// notifications.js
export const notifRouter = express.Router();

function phoneAlertAnalysis(meta = {}, title = "", body = "") {
  const text = `${title} ${body}`.toLowerCase();
  const priority = Number(meta.priority || 0);
  const category =
    meta.category ||
    (/(payment|upi|bank|debit|credit|bill)/i.test(text) ? "payments" : "");
  const reason =
    meta.reason || (priority >= 85 ? "time_sensitive" : "action_needed");
  if (
    reason === "security_or_payment" ||
    /(fraud|suspicious|unauthori[sz]ed|blocked|declined|failed)/i.test(text)
  ) {
    return {
      label: "Security or payment check",
      summary:
        "This may need your attention to protect your account or resolve a payment issue.",
      nextStep:
        "Open the original app and verify the activity before sharing any details or taking action.",
      urgency: "urgent",
    };
  }
  if (category === "payments" || /(due|bill|payment|upi|bank)/i.test(text)) {
    return {
      label: "Money-related alert",
      summary:
        "Mneva detected a finance-related notification that may need a quick review.",
      nextStep:
        "Check the amount, due date, and recipient in the original app. Pay or dispute it only after verifying the details.",
      urgency: priority >= 85 ? "urgent" : "important",
    };
  }
  if (
    reason === "time_sensitive" ||
    /(appointment|meeting|flight|delivery today|medicine|deadline)/i.test(text)
  ) {
    return {
      label: "Time-sensitive update",
      summary:
        "This alert appears to have a time-sensitive detail worth reviewing soon.",
      nextStep:
        "Review the time and location in the original app, then add or update a reminder if you need one.",
      urgency: priority >= 85 ? "urgent" : "important",
    };
  }
  return {
    label: "Action may be needed",
    summary:
      "Mneva marked this notification as useful because it may need a response, follow-up, or review.",
    nextStep:
      "Read the full notification and decide whether to respond, complete the request, or dismiss it.",
    urgency: priority >= 85 ? "urgent" : "normal",
  };
}
notifRouter.post("/device-token", async (req, res) => {
  const plainToken = createDeviceToken();
  await prisma.deviceNotificationToken.create({
    data: { userId: req.user.id, tokenHash: hashToken(plainToken) },
  });
  res.status(201).json({ deviceToken: plainToken });
});
notifRouter.delete("/device-token", async (req, res) => {
  const token = req.body?.deviceToken;
  await prisma.deviceNotificationToken.deleteMany({
    where: token
      ? { userId: req.user.id, tokenHash: hashToken(token) }
      : { userId: req.user.id },
  });
  res.json({ success: true });
});
notifRouter.get("/", async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    notifications: notifications.map((n) => {
      const isEmail = n.title?.startsWith("\ud83d\udce7");
      const isSms = n.title?.startsWith("\ud83d\udcf1");
      let meta = {};
      if (isEmail || isSms) {
        try {
          meta = JSON.parse(n.message);
        } catch {
          meta = { preview: n.message };
        }
      }
      if (!isEmail && !isSms) {
        try {
          meta = JSON.parse(n.message);
        } catch {
          meta = { preview: n.message };
        }
      }
      return {
        id: n.id,
        title: n.title,
        body:
          isEmail || isSms
            ? `From: ${meta.from || ""} \u2014 ${meta.preview || ""}`
            : meta?.preview || meta?.body || n.message,
        type: isEmail
          ? "email"
          : isSms
            ? "sms"
            : meta?.category === "payments" || meta?.source === "payment"
              ? "payment"
              : meta?.category === "time_sensitive" ||
                  meta?.source === "reminder"
                ? "reminder"
                : meta?.source === "calendar"
                  ? "calendar"
                  : meta?.source === "whatsapp"
                    ? "whatsapp"
                    : meta?.source === "instagram"
                      ? "instagram"
                      : meta?.source === "shopping"
                        ? "shopping"
                        : meta?.source === "food"
                          ? "food"
                          : meta?.source === "booking"
                            ? "booking"
                            : "info",
        emailId: isEmail ? meta.emailId || null : null,
        smsId: isSms ? meta.smsId || null : null,
        from: meta.from || null,
        source: meta.source || null,
        appName: meta.appName || null,
        priority: Number.isFinite(n.priority) ? n.priority : meta.priority || 0,
        meetLink: meta.meetLink || null,
        eventStart: meta.start || null,
        relevant: typeof meta.relevant === "boolean" ? meta.relevant : true,
        analysis:
          meta.source === "android"
            ? phoneAlertAnalysis(
                meta,
                n.title,
                meta?.body || meta?.preview || "",
              )
            : null,
        read: n.read,
        ts: n.createdAt.toISOString(),
      };
    }),
    unreadCount: notifications.filter((n) => !n.read).length,
  });
});
notifRouter.patch("/read-all", async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, read: false },
    data: { read: true },
  });
  res.json({ success: true });
});
notifRouter.patch("/:id/read", async (req, res) => {
  const notification = await prisma.notification.update({
    where: { id: req.params.id },
    data: { read: true },
  });
  res.json({ id: notification.id, read: notification.read });
});

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function classifyRelevance(title, body, source) {
  const text = normalizeText(`${title} ${body}`);
  const important =
    /(remind|due|urgent|follow up|action required|meeting|appointment|deadline|task|todo|schedule|bill|payment|verify|renew|deliver|respond|reply)/i;
  const unimportant =
    /(promo|sale|offer|unsubscribe|newsletter|spam|advertisement|ads|promotion|deal)/i;
  if (unimportant.test(text)) return false;
  if (important.test(text)) return true;
  if (source === "reminder" || source === "task" || source === "calendar")
    return true;
  return true;
}

function classifyType(source, title, body) {
  const normalizedSource = normalizeText(source);
  if (normalizedSource === "sms") return "sms";
  if (normalizedSource === "reminder") return "reminder";
  if (normalizedSource === "email") return "email";
  const text = normalizeText(`${title} ${body}`);
  if (
    text.includes("reminder") ||
    text.includes("due") ||
    text.includes("appointment")
  )
    return "reminder";
  return "info";
}

export const smsRouter = express.Router();
smsRouter.post("/webhook", async (req, res) => {
  try {
    const secret = process.env.SMS_WEBHOOK_SECRET?.trim();
    const incomingSecret =
      req.headers["x-sms-webhook-secret"] ||
      req.body.secret ||
      req.query.secret;
    if (secret && incomingSecret !== secret) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }

    const { userId, from, body, preview, smsId, threadId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const previewText = preview || String(body || "").slice(0, 150);
    const notification = await prisma.notification.create({
      data: {
        userId,
        title: `📱 SMS from ${from || "Unknown"}`,
        message: JSON.stringify({
          source: "sms",
          from,
          preview: previewText,
          smsBody: body || "",
          smsId: smsId || null,
          threadId: threadId || null,
          relevant: true,
        }),
      },
    });

    const io = req.app.get("io");
    const payload = {
      id: notification.id,
      title: notification.title,
      body: previewText,
      type: "sms",
      from,
      smsBody: body || "",
      smsId: smsId || null,
      threadId: threadId || null,
      ts: notification.createdAt.toISOString(),
      source: "sms",
      relevant: true,
    };
    if (io) {
      io.to(`u:${userId}`).emit("sms:notification", payload);
      io.to(`u:${userId}`).emit("notification:created", payload);
    }

    res.json({ success: true, notification: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

smsRouter.post("/ingest", async (req, res) => {
  try {
    const secret = process.env.NOTIFICATION_WEBHOOK_SECRET?.trim();
    const incomingSecret =
      req.headers["x-notification-webhook-secret"] ||
      req.body.secret ||
      req.query.secret;
    if (secret && incomingSecret !== secret) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }

    const {
      userId,
      title,
      message,
      source = "generic",
      sourceId,
      relevant,
    } = req.body;
    if (!userId || !title || !message) {
      return res
        .status(400)
        .json({ error: "userId, title, and message are required" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const bodyText =
      typeof message === "string" ? message : JSON.stringify(message);
    const shouldStore =
      relevant === false ? false : classifyRelevance(title, bodyText, source);
    if (!shouldStore) {
      return res.json({
        success: true,
        skipped: true,
        reason: "Notification classified as not relevant",
      });
    }

    const previewText = String(bodyText).slice(0, 150);
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message: JSON.stringify({
          source,
          sourceId: sourceId || null,
          preview: previewText,
          body: bodyText,
          relevant: shouldStore,
        }),
      },
    });

    const type = classifyType(source, title, bodyText);
    const payload = {
      id: notification.id,
      title: notification.title,
      body: previewText,
      type,
      source,
      sourceId: sourceId || null,
      relevant: shouldStore,
      ts: notification.createdAt.toISOString(),
    };
    const io = req.app.get("io");
    if (io) {
      io.to(`u:${userId}`).emit("notification:created", payload);
    }

    // If the incoming payload includes a start time and the user has calendar connected, create an event
    const start =
      req.body.start || (typeof message === "object" && message.start) || null;
    const end =
      req.body.end || (typeof message === "object" && message.end) || null;
    if (start) {
      try {
        const event = {
          summary: title,
          description: bodyText,
          start: start.includes("T") ? { dateTime: start } : { date: start },
          end: end
            ? end.includes("T")
              ? { dateTime: end }
              : { date: end }
            : start.includes("T")
              ? {
                  dateTime: new Date(
                    new Date(start).getTime() + 30 * 60 * 1000,
                  ).toISOString(),
                }
              : { date: start },
        };
        await createEventIfConnected(userId, event);
      } catch (err) {
        // fail silently — calendar integration is best-effort
      }
    }

    res.json({ success: true, notification: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// trust.js
export const trustRouter = express.Router();
trustRouter.get("/status", async (req, res) => {
  const [user, trustScore] = await Promise.all([
    userStore.getById(req.user.id),
    prisma.trustScore.findUnique({ where: { userId: req.user.id } }),
  ]);
  res.json({
    currentLevel: user?.trustLevel || 1,
    trustScore: trustScore?.score || 0,
    plan: user?.plan || "Free",
  });
});
trustRouter.post("/upgrade", async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { trustLevel: { increment: 1 } },
  });
  res.json({ success: true, newLevel: user.trustLevel });
});

trustRouter.patch("/level", async (req, res) => {
  const { level } = req.body;
  if (!level || level < 1 || level > 4)
    return res.status(400).json({ error: "level must be 1–4" });
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { trustLevel: Number(level) },
  });
  res.json({ success: true, newLevel: user.trustLevel });
});

trustRouter.get("/settings", async (req, res) => {
  const [user, trustScore] = await Promise.all([
    userStore.getById(req.user.id),
    prisma.trustScore.findUnique({ where: { userId: req.user.id } }),
  ]);
  res.json({
    currentLevel: user?.trustLevel || 1,
    trustScore: trustScore?.score || 0,
    approvedActions: trustScore?.approvedActions || 0,
    rejectedActions: trustScore?.rejectedActions || 0,
    plan: user?.plan || "Free",
    preferences: user?.preferences || {},
  });
});

trustRouter.patch("/settings", async (req, res) => {
  const { autonomy, privacy, notifications: notifPrefs } = req.body;
  const user = await userStore.getById(req.user.id);
  const prefs = user?.preferences || {};
  if (autonomy) prefs.autonomy = { ...(prefs.autonomy || {}), ...autonomy };
  if (privacy) prefs.privacy = { ...(prefs.privacy || {}), ...privacy };
  if (notifPrefs)
    prefs.notifications = { ...(prefs.notifications || {}), ...notifPrefs };
  await prisma.user.update({
    where: { id: req.user.id },
    data: { preferences: prefs },
  });
  res.json({ success: true, preferences: prefs });
});

// search.js
export const searchRouter = express.Router();
searchRouter.get("/", async (req, res) => {
  const q = String(req.query.q || "");
  if (q.length < 2) return res.json({ query: q, results: [], total: 0 });

  const [notifications, ledgers, memories] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId: req.user.id,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { message: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 10,
    }),
    prisma.agentLedger.findMany({
      where: {
        userId: req.user.id,
        OR: [
          { tool: { contains: q, mode: "insensitive" } },
          { action: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 10,
    }),
    memoryService.recall(q, req.user.id, 5),
  ]);

  const results = [
    ...notifications.map((n) => ({
      type: "notification",
      title: n.title,
      snippet: n.message,
      date: n.createdAt.toISOString(),
    })),
    ...ledgers.map((l) => ({
      type: "ledger",
      title: l.tool,
      snippet: l.action,
      date: l.createdAt.toISOString(),
    })),
    ...memories.map((item) => ({
      type: "memory",
      title: item.payload?.type || "memory",
      snippet: item.payload?.text || "",
      date: item.payload?.createdAt || new Date().toISOString(),
      score: item.score,
    })),
  ];

  res.json({ query: q, results, total: results.length });
});
