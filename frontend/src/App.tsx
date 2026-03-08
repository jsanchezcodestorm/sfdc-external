import { Navigate, Route, RouterProvider, createHashRouter, createRoutesFromElements } from 'react-router-dom'
import { AdminShell } from './components/AdminShell'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './features/auth/components/RequireAuth'
import { RequireAdmin } from './features/auth/components/RequireAdmin'
import { AclAdminLayout } from './features/acl-admin/pages/AclAdminLayout'
import { AclContactPermissionEditorPage } from './features/acl-admin/pages/AclContactPermissionEditorPage'
import { AclContactPermissionsPage } from './features/acl-admin/pages/AclContactPermissionsPage'
import { AclDefaultsPage } from './features/acl-admin/pages/AclDefaultsPage'
import { AclPermissionDetailPage } from './features/acl-admin/pages/AclPermissionDetailPage'
import { AclPermissionEditorPage } from './features/acl-admin/pages/AclPermissionEditorPage'
import { AclPermissionsPage } from './features/acl-admin/pages/AclPermissionsPage'
import { AclResourceDetailPage } from './features/acl-admin/pages/AclResourceDetailPage'
import { AclResourceEditorPage } from './features/acl-admin/pages/AclResourceEditorPage'
import { AclResourcesPage } from './features/acl-admin/pages/AclResourcesPage'
import { AuditAdminDetailPage } from './features/audit-admin/pages/AuditAdminDetailPage'
import { AuditAdminPage } from './features/audit-admin/pages/AuditAdminPage'
import { AppsAdminDetailPage } from './features/apps-admin/pages/AppsAdminDetailPage'
import { AppsAdminEditorPage } from './features/apps-admin/pages/AppsAdminEditorPage'
import { AppsAdminListPage } from './features/apps-admin/pages/AppsAdminListPage'

import { EntityDetailPage } from './features/entities/pages/EntityDetailPage'
import { EntityFormPage } from './features/entities/pages/EntityFormPage'
import { EntityRelatedListPage } from './features/entities/pages/EntityRelatedListPage'
import { EntityRuntimePage } from './features/entities/pages/EntityRuntimePage'
import { EntityRouteFallbackPage } from './features/entities/pages/EntityRouteFallbackPage'
import { EntityAdminConfigPage } from './features/entities-admin/pages/EntityAdminConfigPage'
import { QueryTemplateAdminLayout } from './features/query-template-admin/pages/QueryTemplateAdminLayout'
import { QueryTemplateDetailPage } from './features/query-template-admin/pages/QueryTemplateDetailPage'
import { QueryTemplateEditorPage } from './features/query-template-admin/pages/QueryTemplateEditorPage'
import { QueryTemplateListPage } from './features/query-template-admin/pages/QueryTemplateListPage'
import { VisibilityAdminLayout } from './features/visibility-admin/pages/VisibilityAdminLayout'
import { VisibilityAssignmentDetailPage } from './features/visibility-admin/pages/VisibilityAssignmentDetailPage'
import { VisibilityAssignmentEditorPage } from './features/visibility-admin/pages/VisibilityAssignmentEditorPage'
import { VisibilityAssignmentsPage } from './features/visibility-admin/pages/VisibilityAssignmentsPage'
import { VisibilityConeDetailPage } from './features/visibility-admin/pages/VisibilityConeDetailPage'
import { VisibilityConeEditorPage } from './features/visibility-admin/pages/VisibilityConeEditorPage'
import { VisibilityConesPage } from './features/visibility-admin/pages/VisibilityConesPage'
import { VisibilityDebugPage } from './features/visibility-admin/pages/VisibilityDebugPage'
import { VisibilityRuleDetailPage } from './features/visibility-admin/pages/VisibilityRuleDetailPage'
import { VisibilityRuleEditorPage } from './features/visibility-admin/pages/VisibilityRuleEditorPage'
import { VisibilityRulesPage } from './features/visibility-admin/pages/VisibilityRulesPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'

const router = createHashRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />

        <Route element={<RequireAuth />}>
          <Route path="/s/:entityId" element={<EntityRuntimePage />} />
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
            <Route path="entity-config/__new__/base" element={<EntityAdminConfigPage />} />
            <Route path="entity-config/:entityId" element={<EntityAdminConfigPage />} />
            <Route path="entity-config/:entityId/edit/:section" element={<EntityAdminConfigPage />} />
            <Route path="apps" element={<AppsAdminListPage />} />
            <Route path="apps/__new__" element={<AppsAdminEditorPage mode="create" />} />
            <Route path="apps/:appId" element={<AppsAdminDetailPage />} />
            <Route path="apps/:appId/edit" element={<AppsAdminEditorPage mode="edit" />} />
            <Route path="acl" element={<AclAdminLayout />}>
              <Route index element={<Navigate replace to="permissions" />} />
              <Route path="permissions" element={<AclPermissionsPage />} />
              <Route path="permissions/__new__" element={<AclPermissionEditorPage mode="create" />} />
              <Route path="permissions/:permissionCode" element={<AclPermissionDetailPage />} />
              <Route path="permissions/:permissionCode/edit" element={<AclPermissionEditorPage mode="edit" />} />
              <Route path="defaults" element={<AclDefaultsPage />} />
              <Route path="contact-permissions" element={<AclContactPermissionsPage />} />
              <Route
                path="contact-permissions/__new__"
                element={<AclContactPermissionEditorPage mode="create" />}
              />
              <Route
                path="contact-permissions/:contactId/edit"
                element={<AclContactPermissionEditorPage mode="edit" />}
              />
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
            <Route path="visibility" element={<VisibilityAdminLayout />}>
              <Route index element={<Navigate replace to="cones" />} />
              <Route path="cones" element={<VisibilityConesPage />} />
              <Route path="cones/__new__" element={<VisibilityConeEditorPage mode="create" />} />
              <Route path="cones/:coneId" element={<VisibilityConeDetailPage />} />
              <Route
                path="cones/:coneId/edit"
                element={<VisibilityConeEditorPage mode="edit" />}
              />
              <Route path="rules" element={<VisibilityRulesPage />} />
              <Route path="rules/__new__" element={<VisibilityRuleEditorPage mode="create" />} />
              <Route path="rules/:ruleId" element={<VisibilityRuleDetailPage />} />
              <Route
                path="rules/:ruleId/edit"
                element={<VisibilityRuleEditorPage mode="edit" />}
              />
              <Route path="assignments" element={<VisibilityAssignmentsPage />} />
              <Route
                path="assignments/__new__"
                element={<VisibilityAssignmentEditorPage mode="create" />}
              />
              <Route
                path="assignments/:assignmentId"
                element={<VisibilityAssignmentDetailPage />}
              />
              <Route
                path="assignments/:assignmentId/edit"
                element={<VisibilityAssignmentEditorPage mode="edit" />}
              />
              <Route path="debug" element={<VisibilityDebugPage />} />
            </Route>
            <Route path="audit" element={<AuditAdminPage />} />
            <Route path="audit/:stream/:auditId" element={<AuditAdminDetailPage />} />
          </Route>
        </Route>

        <Route
          path="*"
          element={<Navigate replace to="/" />}
        />
      </Route>
    </>,
  ),
)

function App() {
  return <RouterProvider router={router} />
}

export default App
