import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { queryClient } from '../queryClient'

const WELCOME_MSG = () => ({
  id: 'welcome', role: 'assistant', ts: new Date().toISOString(), toolResults: [],
  content: "Hello, I'm Mneva, your AI Chief of Staff. Once your database and integrations have real records, I'll summarize actions and keep an audit trail here.\n\nWhat would you like me to work on?"
})

// ── Auth hydration flag (separate store so set() triggers re-render) ──────────
export const useAuthHydrated = create((set) => ({
  hydrated: false,
  setHydrated: () => set({ hydrated: true }),
}))

// ── Auth ──────────────────────────────────────────────────────────────────────
export const useAuth = create(
  persist(
    (set) => ({
      user: null, token: null, isAuth: false,
      setAuth: (user, token) => {
        queryClient.clear()
        useChat.getState().clearChat()
        useBrief.getState().clear()
        set({ user, token, isAuth: true })
      },
      logout: () => {
        queryClient.clear()
        useChat.getState().clearChat()
        useBrief.getState().clear()
        set({ user: null, token: null, isAuth: false })
      },
      patchUser: (p) => set(s => ({ user: { ...s.user, ...p } })),
    }),
    {
      name: 'mneva-auth',
      partialize: s => ({ user: s.user, token: s.token, isAuth: s.isAuth }),
      onRehydrateStorage: () => () => { useAuthHydrated.getState().setHydrated() },
    }
  )
)

// ── UI ────────────────────────────────────────────────────────────────────────
export const useUI = create((set) => ({
  sidebarCollapsed: false,
  activeModal: null,
  modalData: null,
  searchOpen: false,
  backendOnline: true,
  backendMessage: null,
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openModal: (name, data = null) => set({ activeModal: name, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),
  setSearch: (v) => set({ searchOpen: v }),
  setBackendStatus: (online, message = null) => set({ backendOnline: online, backendMessage: message }),
}))

// ── Chat / Agent ──────────────────────────────────────────────────────────────
export const useChat = create((set) => ({
  messages: [WELCOME_MSG()],
  thinking: false,
  conversationId: null,
  addMsg: (msg) => set(s => ({
    messages: [...s.messages, {
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      ts: new Date().toISOString(),
      ...msg,
    }],
  })),
  setMessages: (msgs) => set({ messages: msgs }),
  setConversationId: (id) => set({ conversationId: id }),
  setThinking: (v) => set({ thinking: v }),
  clearChat: () => set({ messages: [WELCOME_MSG()], conversationId: null, thinking: false }),
}))

// ── Onboarding ───────────────────────────────────────────────────────────────
export const useOnboarding = create(
  persist(
    (set) => ({
      showWizard: false,
      profile: null,
      completionPct: 0,
      completedSections: [],
      setShowWizard: (v) => set({ showWizard: v }),
      setProfile: (profile) => set({
        profile,
        completionPct: profile?.completionPct || 0,
        completedSections: profile?.completedSections || [],
      }),
      updateSection: (section, pct, sections) => set(s => ({
        completionPct: pct,
        completedSections: sections,
        profile: s.profile ? { ...s.profile, completionPct: pct, completedSections: sections } : null,
      })),
      reset: () => set({ showWizard: false, profile: null, completionPct: 0, completedSections: [] }),
    }),
    { name: 'mneva-onboarding', partialize: s => ({ completionPct: s.completionPct, completedSections: s.completedSections }) }
  )
)

// ── Brief actions ─────────────────────────────────────────────────────────────
export const useBrief = create((set) => ({
  approved: new Set(), denied: new Set(),
  approve: (id) => set(s => { const n = new Set(s.approved); n.add(id); return { approved: n } }),
  deny:    (id) => set(s => { const n = new Set(s.denied);   n.add(id); return { denied: n } }),
  clear:   () => set({ approved: new Set(), denied: new Set() }),
}))
