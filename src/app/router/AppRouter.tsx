import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../shell/AppShell'
import { SessionAnalyticsPage } from '../../domains/observability/components/SessionAnalyticsPage'
import { GlobalSettingsPage } from '../../domains/settings/components/GlobalSettingsPage'
import { ConversationWorkbenchPage } from '../../domains/conversation/components/ConversationWorkbenchPage'

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/"
            element={<Navigate to="/workbench" replace />}
          />
          <Route
            path="/workbench"
            element={<ConversationWorkbenchPage />}
          />
          <Route
            path="/analytics"
            element={<SessionAnalyticsPage />}
          />
          <Route
            path="/settings"
            element={<GlobalSettingsPage />}
          />
        </Route>
      </Routes>
    </HashRouter>
  )
}
