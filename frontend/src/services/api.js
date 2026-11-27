import axios from 'axios'
import { useAuth } from '../store'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
})
api.interceptors.request.use(c => {
  const t = useAuth.getState().token
  if (t) c.headers.Authorization = `Bearer ${t}`
  return c
})
api.interceptors.response.use(
  r => r,
  err => {
    if (!err.response) {
      const base = api.defaults.baseURL || 'backend'
      err.message = `Unable to connect to the backend at ${base}. Please start the API server and try again.`
    } else if (err.response.status === 401) {
      // Only logout if it's an auth endpoint 401, not a Gmail/integration 401
      const url = err.config?.url || ''
      const isAuthEndpoint = url.includes('/auth/') || url.includes('/agent/') || url.includes('/conversations') || url.includes('/messages')
      if (isAuthEndpoint) useAuth.getState().logout()
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  login:        d => api.post('/auth/login', d).then(r => r.data),
  register:     d => api.post('/auth/register', d).then(r => r.data),
  verifyEmail:  d => api.post('/auth/verify-email', d).then(r => r.data),
  resendOtp:    d => api.post('/auth/resend-otp', d).then(r => r.data),
  forgotPassword: d => api.post('/auth/forgot-password', d).then(r => r.data),
  resetPassword:  d => api.post('/auth/reset-password', d).then(r => r.data),
  me:           () => api.get('/auth/me').then(r => r.data),
  updateAvatar: (avatar) => api.patch('/auth/avatar', { avatar }).then(r => r.data),
}
export const backendHealthApi = {
  ping: () => api.get('/health').then(r => r.data),
}
export const conversationApi = {
  list:   () => api.get('/conversations').then(r => r.data),
  create: (title) => api.post('/conversations', { title }).then(r => r.data),
}
export const messageApi = {
  list:   (conversationId) => api.get(`/messages/${conversationId}`).then(r => r.data),
  create: (payload) => api.post('/messages', payload).then(r => r.data),
}
export const preferenceApi = {
  get:    () => api.get('/preferences').then(r => r.data),
  update: (preferences) => api.put('/preferences', preferences).then(r => r.data),
}
export const agentApi = {
  chat:    (messages) => api.post('/agent/chat', { messages }).then(r => r.data),
  draft:   (email)    => api.post('/agent/draft', email).then(r => r.data),
  ledger:  ()         => api.get('/agent/ledger').then(r => r.data),
  approve: (id)       => api.post('/agent/approve', { actionId: id }).then(r => r.data),
  deny:    (id)       => api.post('/agent/deny', { actionId: id }).then(r => r.data),
  transcribe: (file) => {
    const data = new FormData()
    data.append('audio', file)
    return api.post('/agent/transcribe', data).then(r => r.data)
  },
}
export const dashApi = {
  brief: () => api.get('/dashboard/brief').then(r => r.data),
  stats: () => api.get('/dashboard/stats').then(r => r.data),
  sidebarCounts: () => api.get('/dashboard/sidebar-counts').then(r => r.data),
}
export const finApi = {
  bills:     (f = 'all') => api.get(`/finance/bills?filter=${f}`).then(r => r.data),
  portfolio: ()          => api.get('/finance/portfolio').then(r => r.data),
  spending:  (p = 'month') => api.get(`/finance/spending?period=${p}`).then(r => r.data),
  pay:       d           => api.post('/finance/pay', d).then(r => r.data),
  createBill: d => api.post('/finance/bills', d).then(r => r.data),
  updateBill: (id, d) => api.patch(`/finance/bills/${id}`, d).then(r => r.data),
  deleteBill: id => api.delete(`/finance/bills/${id}`).then(r => r.data),

  loans:       () => api.get('/finance/loans').then(r => r.data.loans),
  createLoan:  d => api.post('/finance/loans', d).then(r => r.data),
  updateLoan:  (id, d) => api.patch(`/finance/loans/${id}`, d).then(r => r.data),
  deleteLoan:  id => api.delete(`/finance/loans/${id}`).then(r => r.data),

  emis:        () => api.get('/finance/emis').then(r => r.data.emis),
  createEmi:   d => api.post('/finance/emis', d).then(r => r.data),
  updateEmi:   (id, d) => api.patch(`/finance/emis/${id}`, d).then(r => r.data),
  deleteEmi:   id => api.delete(`/finance/emis/${id}`).then(r => r.data),

  expenses:       () => api.get('/finance/expenses').then(r => r.data.expenses),
  createExpense:  d => api.post('/finance/expenses', d).then(r => r.data),
  updateExpense:  (id, d) => api.patch(`/finance/expenses/${id}`, d).then(r => r.data),
  deleteExpense:  id => api.delete(`/finance/expenses/${id}`).then(r => r.data),

  fixedDeposits:       () => api.get('/finance/fixed-deposits').then(r => r.data.fixedDeposits),
  createFixedDeposit:  d => api.post('/finance/fixed-deposits', d).then(r => r.data),
  updateFixedDeposit:  (id, d) => api.patch(`/finance/fixed-deposits/${id}`, d).then(r => r.data),
  deleteFixedDeposit:  id => api.delete(`/finance/fixed-deposits/${id}`).then(r => r.data),

  holdings:       () => api.get('/finance/portfolio/holdings').then(r => r.data.holdings),
  createHolding:  d => api.post('/finance/portfolio/holdings', d).then(r => r.data),
  updateHolding:  (id, d) => api.patch(`/finance/portfolio/holdings/${id}`, d).then(r => r.data),
  deleteHolding:  id => api.delete(`/finance/portfolio/holdings/${id}`).then(r => r.data),

  subscriptions:       () => api.get('/finance/subscriptions').then(r => r.data.subscriptions),
  createSubscription:  d => api.post('/finance/subscriptions', d).then(r => r.data),
  updateSubscription:  (id, d) => api.patch(`/finance/subscriptions/${id}`, d).then(r => r.data),
  deleteSubscription:  id => api.delete(`/finance/subscriptions/${id}`).then(r => r.data),
}
export const commsApi = {
  emails:  (f = 'all', limit = 20) => api.get(`/comms/emails?filter=${f}&limit=${limit}`).then(r => r.data),
  getEmail:(id)                    => api.get(`/comms/emails/${id}`).then(r => r.data),
  draft:   (id)                    => api.get(`/comms/emails/${id}/draft`).then(r => r.data),
  send:    (id, body)              => api.post(`/comms/emails/${id}/send`, body).then(r => r.data),
  insights: () => api.get('/comms/insights').then(r => r.data),
  dismissInsight: (id) => api.post(`/comms/insights/${id}/dismiss`).then(r => r.data),
  confirmInsight: (id) => api.post(`/comms/insights/${id}/confirm`).then(r => r.data),
}
export const tasksApi = {
  list: () => api.get('/tasks').then(r => r.data),
  create: (d) => api.post('/tasks', d).then(r => r.data),
  updateStatus: (id, status) => api.patch(`/tasks/${id}`, { status }).then(r => r.data),
}
export const priorityApi = {
  confirmations: () => api.get('/priorities/confirmations').then(r => r.data.confirmations),
  setConfirmation: (itemKey, action) => api.post('/priorities/confirmations', { itemKey, action }).then(r => r.data),
}
export const memoryApi = {
  overview: () => api.get('/dashboard/memory-overview').then(r => r.data),
  records: (module, params = {}) => api.get(`/dashboard/memory-overview/records?${new URLSearchParams({ module, ...params })}`).then(r => r.data),
}
export const newsApi = {
  stories: (type = 'foryou', filter) => api.post('/news/stories', { type, filter }).then(r => r.data),
}

export const familyApi = {
  connections: () => api.get('/family/connections').then(r => r.data.connections),
  createConnection: (d) => api.post('/family/connections', d).then(r => r.data),
  respondConnection: (id, status) => api.patch(`/family/connections/${id}`, { status }).then(r => r.data),
  deleteConnection: (id) => api.delete(`/family/connections/${id}`).then(r => r.data),
  tasks: () => api.get('/family/tasks').then(r => r.data.tasks),
  createTask: (d) => api.post('/family/tasks', d).then(r => r.data),
  updateTask: (id, d) => api.patch(`/family/tasks/${id}`, d).then(r => r.data),
  updateTaskStatus: (id, status) => api.patch(`/family/tasks/${id}/status`, { status }).then(r => r.data),
  toggleChecklist: (id, itemId) => api.patch(`/family/tasks/${id}/checklist`, { itemId }).then(r => r.data),
  addComment: (id, text) => api.post(`/family/tasks/${id}/comments`, { text }).then(r => r.data),
  deleteTask: (id) => api.delete(`/family/tasks/${id}`).then(r => r.data),
  medications: () => api.get('/family/parent-medications').then(r => r.data.medications),
  createMedication: (d) => api.post('/family/parent-medications', d).then(r => r.data),
  updateMedication: (id, d) => api.patch(`/family/parent-medications/${id}`, d).then(r => r.data),
  deleteMedication: (id) => api.delete(`/family/parent-medications/${id}`).then(r => r.data),
}
export const familyItemsApi = {
  list: (domain) => api.get(`/family-items/${domain}`).then(r => r.data.items),
  create: (domain, d) => api.post(`/family-items/${domain}`, d).then(r => r.data),
  update: (domain, id, d) => api.patch(`/family-items/${domain}/${id}`, d).then(r => r.data),
  remove: (domain, id) => api.delete(`/family-items/${domain}/${id}`).then(r => r.data),
}
export const vaultApi = {
  list: () => api.get('/vault').then(r => r.data.files),
  upload: (d) => api.post('/vault/upload', d).then(r => r.data),
  download: (id) => api.get(`/vault/${id}/download`).then(r => r.data),
  remove: (id) => api.delete(`/vault/${id}`).then(r => r.data),
}
export const petApi = {
  list: () => api.get('/pet').then(r => r.data.pets),
  create: (d) => api.post('/pet', d).then(r => r.data),
  update: (id, d) => api.patch(`/pet/${id}`, d).then(r => r.data),
  remove: (id) => api.delete(`/pet/${id}`).then(r => r.data),
  reminders: (petId) => api.get(`/pet/${petId}/reminders`).then(r => r.data.reminders),
  createReminder: (petId, d) => api.post(`/pet/${petId}/reminders`, d).then(r => r.data),
  updateReminder: (petId, id, d) => api.patch(`/pet/${petId}/reminders/${id}`, d).then(r => r.data),
  deleteReminder: (petId, id) => api.delete(`/pet/${petId}/reminders/${id}`).then(r => r.data),
}
export const gmailApi = {
  configStatus: () => api.get('/gmail/config-status').then(r => r.data),
  connect: () => api.get('/gmail/connect').then(r => r.data),
  status: () => api.get('/gmail/status').then(r => r.data),
  disconnect: () => api.post('/gmail/disconnect').then(r => r.data),
}

export const googleFitApi = {
  connect:    () => api.get('/googlefit/connect').then(r => r.data),
  status:     () => api.get('/googlefit/status').then(r => r.data),
  disconnect: () => api.post('/googlefit/disconnect').then(r => r.data),
  data:       () => api.get('/googlefit/data').then(r => r.data),
  sync:       (d) => api.post('/health-data/sync', d).then(r => r.data),
}

export const calendarApi = {
  configStatus: () => api.get('/calendar/config-status').then(r => r.data),
  connect: () => api.get('/calendar/connect').then(r => r.data),
  status: () => api.get('/calendar/status').then(r => r.data),
  disconnect: () => api.post('/calendar/disconnect').then(r => r.data),
  events: (timeMin, timeMax) => api.get(`/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`).then(r => r.data.events),
  createMeeting: (d) => api.post('/calendar/meetings', d).then(r => r.data),
}
export const healthApi = {
  metrics:    (p = 'today') => api.get(`/health-data/metrics?period=${p}`).then(r => r.data),
  appts:      ()            => api.get('/health-data/appointments').then(r => r.data),
  meds:       ()            => api.get('/health-data/medications').then(r => r.data),
  log:        ()            => api.get('/health-data/log').then(r => r.data),
  updateLog:  (date, data)  => api.put(`/health-data/log/${date}`, data).then(r => r.data),
  deleteLog:  (date)        => api.delete(`/health-data/log/${date}`).then(r => r.data),
}
export const lifeApi = {
  rides:    ()   => api.get('/lifeops/rides').then(r => r.data),
  orders:   ()   => api.get('/lifeops/orders').then(r => r.data),
  wishlist: ()   => api.get('/lifeops/wishlist').then(r => r.data),
  cab:      d    => api.post('/lifeops/cab', d).then(r => r.data),
  food:     d    => api.post('/lifeops/food', d).then(r => r.data),
}
export const twinApi = {
  diary:  () => api.get('/twin/diary').then(r => r.data),
  ledger: () => api.get('/twin/ledger').then(r => r.data),
}
export const notifApi = {
  all:     () => api.get('/notifications').then(r => r.data),
  markRead:(id) => api.patch(`/notifications/${id}/read`).then(r => r.data),
  readAll: ()  => api.patch('/notifications/read-all').then(r => r.data),
}
export const searchApi = {
  query: (q) => api.get(`/search?q=${encodeURIComponent(q)}`).then(r => r.data),
}

export const documentsApi = {
  list: () => api.get('/documents').then(r => r.data),
  upload: (file, title) => {
    const data = new FormData()
    data.append('file', file)
    if (title) data.append('title', title)
    return api.post('/documents/upload', data).then(r => r.data)
  },
  delete: (id) => api.delete(`/documents/${id}`).then(r => r.data),
}


export const contactsApi = {
  status:     ()    => api.get('/contacts/status').then(r => r.data),
  connect:    ()    => api.get('/contacts/connect').then(r => r.data),
  disconnect: ()    => api.post('/contacts/disconnect').then(r => r.data),
  list:       (p)   => api.get(`/contacts?${new URLSearchParams({ pageSize: p?.pageSize || 50, ...(p?.query && { query: p.query }), ...(p?.pageToken && { pageToken: p.pageToken }) })}`).then(r => r.data),
}
export const gdriveApi = {
  connect:    () => api.get('/gdrive/connect').then(r => r.data),
  status:     () => api.get('/gdrive/status').then(r => r.data),
  disconnect: () => api.post('/gdrive/disconnect').then(r => r.data),
  files:      (type = 'drive') => api.get(`/gdrive/files?type=${type}`).then(r => r.data.files),
}
export const gtasksApi = {
  connect:    () => api.get('/gtasks/connect').then(r => r.data),
  status:     () => api.get('/gtasks/status').then(r => r.data),
  disconnect: () => api.post('/gtasks/disconnect').then(r => r.data),
  list:       () => api.get('/gtasks/list').then(r => r.data.tasks),
  complete:   (listId, taskId) => api.patch(`/gtasks/${listId}/${taskId}/complete`).then(r => r.data),
}
export const trustApi = {
  status: () => api.get('/trust/status').then(r => r.data),
  settings: () => api.get('/trust/settings').then(r => r.data),
  updateSettings: (patch) => api.patch('/trust/settings', patch).then(r => r.data),
  setDomainLevel: (domain, level) => api.patch('/trust/domain-level', { domain, level }).then(r => r.data),
  confirmLevel: (domain, level) => api.post('/trust/confirm-level', { domain, level }).then(r => r.data),
  declineLevel: (domain) => api.post('/trust/decline-level', { domain }).then(r => r.data),
  leaveInnerCircle: (domain) => api.post('/trust/leave-inner-circle', { domain }).then(r => r.data),
}
export const slackApi = {
  configStatus: () => api.get('/slack/config-status').then(r => r.data),
  connect: () => api.get('/slack/connect').then(r => r.data),
  status: () => api.get('/slack/status').then(r => r.data),
  disconnect: () => api.post('/slack/disconnect').then(r => r.data),
  channels: () => api.get('/slack/channels').then(r => r.data.channels),
  channelMessages: (id, limit = 30) => api.get(`/slack/channels/${id}/messages?limit=${limit}`).then(r => r.data.messages),
  sendTest: (text) => api.post('/slack/send-test', { text }).then(r => r.data),
}
export const outlookApi = {
  configStatus: () => api.get('/outlook/config-status').then(r => r.data),
  connect: () => api.get('/outlook/connect').then(r => r.data),
  status: () => api.get('/outlook/status').then(r => r.data),
  disconnect: () => api.post('/outlook/disconnect').then(r => r.data),
  emails: (filter = 'all', limit = 20) => api.get(`/outlook/emails?filter=${filter}&limit=${limit}`).then(r => r.data),
  getEmail: (id) => api.get(`/outlook/emails/${id}`).then(r => r.data),
  sendEmail: (recipient, subject, body) => api.post('/outlook/emails/send', { recipient, subject, body }).then(r => r.data),
  events: (limit = 20) => api.get(`/outlook/events?limit=${limit}`).then(r => r.data),
  createEvent: (d) => api.post('/outlook/events', d).then(r => r.data),
  files: (type = 'all', limit = 50) => api.get(`/outlook/files?type=${type}&limit=${limit}`).then(r => r.data.files),
  tasks: () => api.get('/outlook/tasks').then(r => r.data.tasks),
  completeTask: (listId, taskId) => api.patch(`/outlook/tasks/${listId}/${taskId}/complete`).then(r => r.data),
}
export const onboardingApi = {
  profile:  ()             => api.get('/onboarding/profile').then(r => r.data),
  section:  (section, data) => api.post('/onboarding/section', { section, data }).then(r => r.data),
  memory:   (memories)     => api.post('/onboarding/memory', { memories }).then(r => r.data),
  complete: ()             => api.post('/onboarding/complete').then(r => r.data),
  context:  ()             => api.get('/onboarding/context').then(r => r.data),
}
export default api
