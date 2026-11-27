import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth, useAuthHydrated, useUI } from './store'
import { authApi, backendHealthApi } from './services/api'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './components/auth/LoginPage'
import Dashboard from './components/dashboard/Dashboard'
import Finance from './components/finance/Finance'
import BillsPage from './components/finance/BillsPage'
import LoansPage from './components/finance/LoansPage'
import EmisPage from './components/finance/EmisPage'
import ExpensesPage from './components/finance/ExpensesPage'
import FixedDepositsPage from './components/finance/FixedDepositsPage'
import PortfolioHoldingsPage from './components/finance/PortfolioHoldingsPage'
import SubscriptionsPage from './components/finance/SubscriptionsPage'
import WorkspaceHub from './components/workspace/WorkspaceHub'
import DocsPage from './components/workspace/DocsPage'
import SheetsPage from './components/workspace/SheetsPage'
import SlidesPage from './components/workspace/SlidesPage'
import GoogleDrivePage from './components/workspace/GoogleDrivePage'
import GoogleTasksPage from './components/workspace/GoogleTasksPage'
import MicrosoftHub from './components/workspace/MicrosoftHub'
import OutlookMailPage from './components/workspace/OutlookMailPage'
import OutlookCalendarPage from './components/workspace/OutlookCalendarPage'
import OneDrivePage from './components/workspace/OneDrivePage'
import WordPage from './components/workspace/WordPage'
import ExcelPage from './components/workspace/ExcelPage'
import PowerPointPage from './components/workspace/PowerPointPage'
import MicrosoftTodoPage from './components/workspace/MicrosoftTodoPage'
import SlackPage from './components/workspace/SlackPage'
import SubscriptionPage from './components/account/SubscriptionPage'
import SearchPage from './components/account/SearchPage'
import MemoryOverviewPage from './components/account/MemoryOverviewPage'
import PhoneAlertsPage from './components/account/PhoneAlertsPage'
import MorningBriefingPage from './components/account/MorningBriefingPage'
import PrioritiesPage from './components/account/PrioritiesPage'
import VaultPage from './components/account/VaultPage'
import MovieDiscoveryPage from './components/discovery/MovieDiscoveryPage'
import NewsDiscoveryPage from './components/discovery/NewsDiscoveryPage'
import DiscoveryHub from './components/discovery/DiscoveryHub'
import FamilyHub from './components/family/FamilyHub'
import FamilyTasksPage from './components/family/FamilyTasksPage'
import ParentMedicationPage from './components/family/ParentMedicationPage'
import PetCarePage from './components/family/PetCarePage'
import ChildrenActivitiesPage from './components/family/ChildrenActivitiesPage'
import HomeMaintenancePage from './components/family/HomeMaintenancePage'
import CelebrationGiftingPage from './components/family/CelebrationGiftingPage'
import FamilyCalendarPage from './components/family/FamilyCalendarPage'
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
        <Route path="finance/bills" element={<BillsPage />} />
        <Route path="finance/loans" element={<LoansPage />} />
        <Route path="finance/emis" element={<EmisPage />} />
        <Route path="finance/expenses" element={<ExpensesPage />} />
        <Route path="finance/fixed-deposits" element={<FixedDepositsPage />} />
        <Route path="finance/portfolio-holdings" element={<PortfolioHoldingsPage />} />
        <Route path="finance/subscriptions" element={<SubscriptionsPage />} />
        <Route path="workspace" element={<WorkspaceHub />} />
        <Route path="workspace/docs" element={<DocsPage />} />
        <Route path="workspace/sheets" element={<SheetsPage />} />
        <Route path="workspace/slides" element={<SlidesPage />} />
        <Route path="workspace/drive" element={<GoogleDrivePage />} />
        <Route path="workspace/tasks" element={<GoogleTasksPage />} />
        <Route path="microsoft" element={<MicrosoftHub />} />
        <Route path="microsoft/mail" element={<OutlookMailPage />} />
        <Route path="microsoft/calendar" element={<OutlookCalendarPage />} />
        <Route path="microsoft/onedrive" element={<OneDrivePage />} />
        <Route path="microsoft/word" element={<WordPage />} />
        <Route path="microsoft/excel" element={<ExcelPage />} />
        <Route path="microsoft/powerpoint" element={<PowerPointPage />} />
        <Route path="microsoft/todo" element={<MicrosoftTodoPage />} />
        <Route path="slack" element={<SlackPage />} />
        <Route path="subscription" element={<SubscriptionPage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="memory" element={<MemoryOverviewPage />} />
        <Route path="alerts" element={<PhoneAlertsPage />} />
        <Route path="briefing" element={<MorningBriefingPage />} />
        <Route path="priorities" element={<PrioritiesPage />} />
        <Route path="discovery" element={<DiscoveryHub />} />
        <Route path="discovery/movies" element={<MovieDiscoveryPage />} />
        <Route path="discovery/news" element={<NewsDiscoveryPage />} />
        <Route path="family" element={<FamilyHub />} />
        <Route path="family/tasks" element={<FamilyTasksPage />} />
        <Route path="family/medications" element={<ParentMedicationPage />} />
        <Route path="family/pets" element={<PetCarePage />} />
        <Route path="family/children" element={<ChildrenActivitiesPage />} />
        <Route path="family/home" element={<HomeMaintenancePage />} />
        <Route path="family/celebrations" element={<CelebrationGiftingPage />} />
        <Route path="family/calendar" element={<FamilyCalendarPage />} />
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
