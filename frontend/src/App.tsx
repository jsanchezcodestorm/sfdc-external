import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminShell } from './components/AdminShell'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './features/auth/components/RequireAuth'
import { RequireAdmin } from './features/auth/components/RequireAdmin'
import { AclAdminLayout } from './features/acl-admin/pages/AclAdminLayout'
import { AclDefaultsPage } from './features/acl-admin/pages/AclDefaultsPage'
import { AclPermissionDetailPage } from './features/acl-admin/pages/AclPermissionDetailPage'
import { AclPermissionEditorPage } from './features/acl-admin/pages/AclPermissionEditorPage'
import { AclPermissionsPage } from './features/acl-admin/pages/AclPermissionsPage'
import { AclResourceDetailPage } from './features/acl-admin/pages/AclResourceDetailPage'
import { AclResourceEditorPage } from './features/acl-admin/pages/AclResourceEditorPage'
import { AclResourcesPage } from './features/acl-admin/pages/AclResourcesPage'

import { EntityDetailPage } from './features/entities/pages/EntityDetailPage'
import { EntityFormPage } from './features/entities/pages/EntityFormPage'
import { EntityListPage } from './features/entities/pages/EntityListPage'
import { EntityRelatedListPage } from './features/entities/pages/EntityRelatedListPage'
import { EntityRouteFallbackPage } from './features/entities/pages/EntityRouteFallbackPage'
import { EntityAdminConfigPage } from './features/entities-admin/pages/EntityAdminConfigPage'
import { QueryTemplateAdminLayout } from './features/query-template-admin/pages/QueryTemplateAdminLayout'
import { QueryTemplateDetailPage } from './features/query-template-admin/pages/QueryTemplateDetailPage'
import { QueryTemplateEditorPage } from './features/query-template-admin/pages/QueryTemplateEditorPage'
import { QueryTemplateListPage } from './features/query-template-admin/pages/QueryTemplateListPage'
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
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Navigate replace to="entity-config" />} />
            <Route path="entity-config" element={<EntityAdminConfigPage />} />
            <Route path="entity-config/:entityId" element={<EntityAdminConfigPage />} />
            <Route path="entity-config/:entityId/edit" element={<EntityAdminConfigPage />} />
            <Route path="acl" element={<AclAdminLayout />}>
              <Route index element={<Navigate replace to="permissions" />} />
              <Route path="permissions" element={<AclPermissionsPage />} />
              <Route path="permissions/__new__" element={<AclPermissionEditorPage mode="create" />} />
              <Route path="permissions/:permissionCode" element={<AclPermissionDetailPage />} />
              <Route path="permissions/:permissionCode/edit" element={<AclPermissionEditorPage mode="edit" />} />
              <Route path="defaults" element={<AclDefaultsPage />} />
              <Route path="resources" element={<AclResourcesPage />} />
              <Route path="resources/__new__" element={<AclResourceEditorPage mode="create" />} />
              <Route path="resources/:resourceId" element={<AclResourceDetailPage />} />
              <Route path="resources/:resourceId/edit" element={<AclResourceEditorPage mode="edit" />} />
            </Route>
            <Route path="query-templates" element={<QueryTemplateAdminLayout />}>
              <Route index element={<QueryTemplateListPage />} />
              <Route path="__new__" element={<QueryTemplateEditorPage mode="create" />} />
              <Route path=":templateId" element={<QueryTemplateDetailPage />} />
              <Route
                path=":templateId/edit"
                element={<QueryTemplateEditorPage mode="edit" />}
              />
            </Route>
          </Route>
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
