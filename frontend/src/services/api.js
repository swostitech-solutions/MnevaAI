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
}
export const commsApi = {
  emails:  (f = 'all', limit = 20) => api.get(`/comms/emails?filter=${f}&limit=${limit}`).then(r => r.data),
  getEmail:(id)                    => api.get(`/comms/emails/${id}`).then(r => r.data),
  draft:   (id)                    => api.get(`/comms/emails/${id}/draft`).then(r => r.data),
  send:    (id, body)              => api.post(`/comms/emails/${id}/send`, body).then(r => r.data),
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
  events: (timeMin, timeMax) => api.get(`/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`).then(r => r.data),
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
export const trustApi = {
  status: () => api.get('/trust/status').then(r => r.data),
  settings: () => api.get('/trust/settings').then(r => r.data),
  updateLevel: (level) => api.patch('/trust/level', { level }).then(r => r.data),
  upgrade: () => api.post('/trust/upgrade').then(r => r.data),
}
export const onboardingApi = {
  profile:  ()             => api.get('/onboarding/profile').then(r => r.data),
  section:  (section, data) => api.post('/onboarding/section', { section, data }).then(r => r.data),
  memory:   (memories)     => api.post('/onboarding/memory', { memories }).then(r => r.data),
  complete: ()             => api.post('/onboarding/complete').then(r => r.data),
  context:  ()             => api.get('/onboarding/context').then(r => r.data),
}
export default api
