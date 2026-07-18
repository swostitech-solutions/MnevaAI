import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth, useAuthHydrated, useUI } from './store'
import { authApi, backendHealthApi } from './services/api'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './components/auth/LoginPage'
import Dashboard from './components/dashboard/Dashboard'
import Finance from './components/finance/Finance'
import Communications from './components/comms/Communications'
import HealthPage from './components/health/HealthPage'
import LifeOps from './components/lifeops/LifeOps'
import ChatPage from './components/chat/ChatPage'
import TwinDiary from './components/twin/TwinDiary'
import Settings from './components/settings/Settings'
import ContactsPage from './components/contacts/ContactsPage'
import AIProfilePage from './components/onboarding/AIProfilePage'

function Guard({ children }) {
  const { isAuth } = useAuth()
  return isAuth ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { isAuth, token, logout } = useAuth()
  const { hydrated } = useAuthHydrated()
  const { setBackendStatus } = useUI()

  useEffect(() => {
    const checkBackend = async () => {
      try {
        await backendHealthApi.ping()
        setBackendStatus(true, null)
      } catch (err) {
        setBackendStatus(false, err.message || 'Backend unavailable')
      }
    }
    checkBackend()
  }, [setBackendStatus])

  useEffect(() => {
    if (!token || !isAuth) return
    // Only logout on explicit 401 from /auth/me, ignore network errors
    authApi.me().catch(err => {
      const status = err.response?.status
      if (status === 401) logout()
      // ignore 5xx, network errors, etc — don't logout on backend hiccups
    })
  }, []) // run once on mount only, not on every token change

  if (!hydrated) return null

  return (
    <Routes>
      <Route path="/login" element={isAuth ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<Guard><AppLayout /></Guard>}>
        <Route index          element={<Dashboard />} />
        <Route path="finance" element={<Finance />} />
        <Route path="comms"   element={<Communications />} />
        <Route path="health"  element={<HealthPage />} />
        <Route path="lifeops" element={<LifeOps />} />
        <Route path="chat"    element={<ChatPage />} />
        <Route path="twin"    element={<TwinDiary />} />
        <Route path="settings"   element={<Settings />} />
        <Route path="ai-profile"  element={<AIProfilePage />} />
        <Route path="contacts"    element={<ContactsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
