import { prisma } from '../config/prisma.js'
import { emitToUser } from './realtime.js'

// Lets the AI list, edit and delete records in every module whose screen in
// the app offers those actions. It runs the SAME route handlers the app's own
// edit/delete buttons call, so validation, ownership checks, memory sync,
// ledger entries and realtime updates behave identically whether a change
// comes from a tap or from Ask AI. Modules without an edit/delete screen
// (Health logs, Communication) are deliberately absent — see MODULES.
//
// `update.fields` is what may be changed; a module with no `update` can only
// be listed/deleted, and one with no `delete` can only be listed/updated.
export const MODULES = {
  parent_medication: {
    domain: 'family', label: 'parent medication', from: 'family',
    list: { path: '/parent-medications', key: 'medications' },
    update: { path: '/parent-medications/:id' },
    delete: { path: '/parent-medications/:id' },
  },
  family_task: {
    domain: 'family', label: 'family task', from: 'family',
    list: { path: '/tasks', key: 'tasks', omit: ['comments', 'checklist'] },
    // Two different update endpoints: status (accept/start/complete/cancel —
    // creator or assignee) is handled separately from editing the task's own
    // content (title/description/priority/category/dueDate/recurrence —
    // creator only). See updateRecord()'s special case below.
    update: { path: '/tasks/:id', editableFields: ['title', 'description', 'priority', 'category', 'dueDate', 'recurrence'], statusPath: '/tasks/:id/status' },
    delete: { path: '/tasks/:id' },
  },
  pet: {
    domain: 'family', label: 'pet', from: 'pet',
    list: { path: '/', key: 'pets' },
    update: { path: '/:id' },
    delete: { path: '/:id' },
  },
  pet_reminder: {
    domain: 'family', label: 'pet reminder', from: 'pet', needsParent: 'pet_id',
    list: { path: '/:petId/reminders', key: 'reminders' },
    update: { path: '/:petId/reminders/:id' },
    delete: { path: '/:petId/reminders/:id' },
  },
  family_item: {
    domain: 'family', label: 'family item', from: 'familyItems', needsParent: 'family_domain', mergeData: true,
    list: { path: '/:domain', key: 'items' },
    update: { path: '/:domain/:id' },
    delete: { path: '/:domain/:id' },
  },
  subscription: {
    domain: 'finance', label: 'subscription', from: 'finance',
    list: { path: '/subscriptions', key: 'subscriptions' },
    update: { path: '/subscriptions/:id' }, delete: { path: '/subscriptions/:id' },
  },
  loan: {
    domain: 'finance', label: 'loan', from: 'finance',
    list: { path: '/loans', key: 'loans' },
    update: { path: '/loans/:id' }, delete: { path: '/loans/:id' },
  },
  emi: {
    domain: 'finance', label: 'EMI', from: 'finance',
    list: { path: '/emis', key: 'emis' },
    update: { path: '/emis/:id' }, delete: { path: '/emis/:id' },
  },
  fixed_deposit: {
    domain: 'finance', label: 'fixed deposit', from: 'finance',
    list: { path: '/fixed-deposits', key: 'fixedDeposits' },
    update: { path: '/fixed-deposits/:id' }, delete: { path: '/fixed-deposits/:id' },
  },
  bill: {
    domain: 'finance', label: 'bill', from: 'finance',
    list: { path: '/bills', key: null },
    update: { path: '/bills/:id' }, delete: { path: '/bills/:id' },
  },
  portfolio_holding: {
    domain: 'finance', label: 'portfolio holding', from: 'finance',
    list: { path: '/portfolio/holdings', key: 'holdings' },
    update: { path: '/portfolio/holdings/:id' }, delete: { path: '/portfolio/holdings/:id' },
  },
}

export const MODULE_NAMES = Object.keys(MODULES)

// Trust domain that gates an update/delete on this module.
export function domainForModule(module) {
  return MODULES[module]?.domain || null
}

async function getRouter(from) {
  switch (from) {
    case 'family': return (await import('../routes/family.js')).familyRouter
    case 'pet': return (await import('../routes/pet.js')).petRouter
    case 'familyItems': return (await import('../routes/familyItems.js')).familyItemsRouter
    case 'finance': return (await import('../routes/finance.js')).financeRouter
    default: throw new Error(`Unknown router ${from}`)
  }
}

// Bridges the routes' `req.app.get('io')` emits to the app's realtime layer,
// so the open screen updates instantly after an AI edit.
const ioShim = {
  to: (room) => ({ emit: (event, payload) => emitToUser(String(room).replace(/^u:/, ''), event, payload) }),
}

async function callRoute(router, method, path, { userId, params = {}, body = {} }) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method])
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} route`)
  const handlers = layer.route.stack.map((s) => s.handle)
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } })
  const req = { user: user || { id: userId }, params, body, query: {}, headers: {}, app: { get: (k) => (k === 'io' ? ioShim : undefined) } }
  let status = 200
  let payload
  const res = {
    status(c) { status = c; return this },
    json(x) { payload = x; return this },
    send(x) { payload = x; return this },
  }
  await handlers[handlers.length - 1](req, res)
  return { status, payload }
}

const fillPath = (path, params) => path.replace(/:(\w+)/g, (_, k) => encodeURIComponent(params[k]))

function paramsFor(spec, input) {
  const params = {}
  if (input.id) params.id = String(input.id)
  if (spec.needsParent === 'pet_id') params.petId = String(input.pet_id || '')
  if (spec.needsParent === 'family_domain') params.domain = String(input.family_domain || '')
  return params
}

function missingParent(spec, input) {
  if (spec.needsParent === 'pet_id' && !input.pet_id) return 'pet_id is required for pet reminders — call list_records with module "pet" to get it.'
  if (spec.needsParent === 'family_domain' && !input.family_domain) return 'family_domain is required (children, home, celebration or calendar).'
  return null
}

function errorFrom(status, payload) {
  const msg = payload?.error || `Request failed (${status})`
  if (status === 404) return `Could not find that record (${msg}). Call list_records to get the correct id.`
  return msg
}

const stripOmitted = (rec, omit = []) => {
  if (!rec || typeof rec !== 'object' || !omit.length) return rec
  const copy = { ...rec }
  omit.forEach((k) => delete copy[k])
  return copy
}

export async function listRecords(userId, input) {
  const spec = MODULES[input.module]
  if (!spec) return { success: false, error: `Unknown module "${input.module}". Use one of: ${MODULE_NAMES.join(', ')}.` }
  const bad = missingParent(spec, input)
  if (bad) return { success: false, error: bad }
  const router = await getRouter(spec.from)
  const { status, payload } = await callRoute(router, 'get', spec.list.path, { userId, params: paramsFor(spec, input) })
  if (status >= 400) return { success: false, error: errorFrom(status, payload) }
  const rows = spec.list.key ? payload?.[spec.list.key] : payload
  const records = (Array.isArray(rows) ? rows : []).slice(0, 50).map((r) => stripOmitted(r, spec.list.omit))
  return { success: true, module: input.module, count: records.length, records }
}

export async function updateRecord(userId, input) {
  const spec = MODULES[input.module]
  if (!spec?.update) return { success: false, error: `Editing ${spec?.label || input.module} is not available. Tell the user it can't be edited by voice/chat.` }
  if (!input.id) return { success: false, error: 'id is required — call list_records first to find the record and its id.' }
  const bad = missingParent(spec, input)
  if (bad) return { success: false, error: bad }
  let fields = input.fields && typeof input.fields === 'object' ? { ...input.fields } : {}
  if (spec.update.only) fields = Object.fromEntries(Object.entries(fields).filter(([k]) => spec.update.only.includes(k)))
  if (!Object.keys(fields).length) {
    return { success: false, error: spec.update.only
      ? `Only these fields can be changed for a ${spec.label}: ${spec.update.only.join(', ')}.`
      : 'fields is empty — pass the field names and new values to change.' }
  }
  const router = await getRouter(spec.from)
  const params = paramsFor(spec, input)

  // family_task has two separate update endpoints — split the requested
  // fields between them and apply both if the caller mixed status with an
  // actual field edit in one call.
  if (input.module === 'family_task') {
    const { status, ...rest } = fields
    const editable = Object.fromEntries(Object.entries(rest).filter(([k]) => spec.update.editableFields.includes(k)))
    const unknown = Object.keys(rest).filter((k) => !spec.update.editableFields.includes(k))
    if (unknown.length) return { success: false, error: `These fields can't be changed on a family task: ${unknown.join(', ')}.` }
    let record = null
    if (status !== undefined) {
      const r = await callRoute(router, 'patch', spec.update.statusPath, { userId, params, body: { status } })
      if (r.status >= 400) return { success: false, error: errorFrom(r.status, r.payload) }
      record = r.payload?.task
    }
    if (Object.keys(editable).length) {
      const r = await callRoute(router, 'patch', spec.update.path, { userId, params, body: editable })
      if (r.status >= 400) return { success: false, error: errorFrom(r.status, r.payload) }
      record = r.payload?.task
    }
    if (!record) return { success: false, error: 'fields is empty — pass status and/or the fields to change.' }
    return { success: true, module: input.module, id: input.id, updated: Object.keys(fields), record }
  }

  // Family items store their details in one JSON object that the route
  // replaces wholesale — merge so changing one field doesn't erase the rest.
  let body = fields
  if (spec.mergeData) {
    const existing = await prisma.familyItem.findFirst({ where: { id: params.id, userId } })
    if (!existing) return { success: false, error: 'Could not find that record. Call list_records to get the correct id.' }
    const { done, remind_at, remindAt, ...rest } = fields
    body = { data: { ...(existing.data || {}), ...(rest.data && typeof rest.data === 'object' ? rest.data : rest) } }
    if (done !== undefined) body.done = done
    if (remind_at !== undefined || remindAt !== undefined) body.remindAt = remind_at ?? remindAt
  }

  const { status, payload } = await callRoute(router, 'patch', spec.update.path, { userId, params, body })
  if (status >= 400) return { success: false, error: errorFrom(status, payload) }
  const record = payload && (payload.medication || payload.task || payload.pet || payload.reminder || payload.item
    || payload.subscription || payload.loan || payload.emi || payload.fixedDeposit || payload.bill || payload.holding || payload)
  return { success: true, module: input.module, id: input.id, updated: Object.keys(fields), record }
}

export async function deleteRecord(userId, input) {
  const spec = MODULES[input.module]
  if (!spec?.delete) return { success: false, error: `Deleting ${spec?.label || input.module} is not available.` }
  if (!input.id) return { success: false, error: 'id is required — call list_records first to find the record and its id.' }
  const bad = missingParent(spec, input)
  if (bad) return { success: false, error: bad }
  const router = await getRouter(spec.from)
  const { status, payload } = await callRoute(router, 'delete', spec.delete.path, { userId, params: paramsFor(spec, input) })
  if (status >= 400) return { success: false, error: errorFrom(status, payload) }
  return { success: true, module: input.module, id: input.id, deleted: true }
}

// Short name of a record (e.g. the medicine or loan name) so an approval card
// says WHAT will change instead of just the module.
export async function describeRecord(userId, input) {
  try {
    const found = await listRecords(userId, { ...input, module: input.module })
    const rec = found.records?.find((r) => r.id === input.id)
    if (!rec) return ''
    const d = rec.data || {}
    return String(rec.medName || rec.name || rec.title || d.name || d.title || d.item || d.person || rec.lenderName || rec.provider || '').trim()
  } catch { return '' }
}
