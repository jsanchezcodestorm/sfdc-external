import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './features/auth/components/RequireAuth'
import { RequireAdmin } from './features/auth/components/RequireAdmin'

import { EntityDetailPage } from './features/entities/pages/EntityDetailPage'
import { EntityFormPage } from './features/entities/pages/EntityFormPage'
import { EntityListPage } from './features/entities/pages/EntityListPage'
import { EntityRelatedListPage } from './features/entities/pages/EntityRelatedListPage'
import { EntityRouteFallbackPage } from './features/entities/pages/EntityRouteFallbackPage'
import { EntityAdminConfigPage } from './features/entities-admin/pages/EntityAdminConfigPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />

        <Route element={<RequireAuth />}>
          <Route path="/s/:entityId" element={<EntityListPage />} />
          <Route path="/s/:entityId/new" element={<EntityFormPage />} />
          <Route path="/s/:entityId/:recordId" element={<EntityDetailPage />} />
          <Route path="/s/:entityId/:recordId/edit" element={<EntityFormPage />} />
          <Route
            path="/s/:entityId/:recordId/related/:relatedListId"
            element={<EntityRelatedListPage />}
          />
          <Route path="/s/:entityId/*" element={<EntityRouteFallbackPage />} />
        </Route>

        <Route element={<RequireAdmin />}>
          <Route path="/admin/entity-config" element={<EntityAdminConfigPage />} />
          <Route path="/admin/entity-config/:entityId" element={<EntityAdminConfigPage />} />
          <Route path="/admin/entity-config/:entityId/:section" element={<EntityAdminConfigPage />} />
        </Route>

        <Route
          path="*"
          element={<Navigate replace to="/" />}
        />
      </Route>
    </Routes>
  )
}

export default App
