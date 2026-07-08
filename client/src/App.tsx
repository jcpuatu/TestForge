import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './features/auth/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AppShell } from './layouts/AppShell';
import { ProjectsListPage } from './features/projects/ProjectsListPage';
import { ProjectShell } from './features/projects/ProjectShell';
import { ProjectCasesTab } from './features/projects/ProjectCasesTab';
import { SuiteDetailPage } from './features/cases/SuiteDetailPage';
import { RunsListPage } from './features/runs/RunsListPage';
import { RunExecutionPage } from './features/runs/RunExecutionPage';
import { MilestonesTab } from './features/milestones/MilestonesTab';
import { PlansListTab } from './features/plans/PlansListTab';
import { PlanDetailPage } from './features/plans/PlanDetailPage';
import { ReportsTab } from './features/reports/ReportsTab';
import { WebhooksTab } from './features/webhooks/WebhooksTab';
import { UsersAdminPage } from './features/admin/UsersAdminPage';
import { ApiKeysPage } from './features/admin/ApiKeysPage';
import { MyTestsPage } from './features/me/MyTestsPage';
import { DefectsTab } from './features/defects/DefectsTab';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <ProjectsListPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <ProjectShell />
                  </AppShell>
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<ReportsTab />} />
              <Route path="cases" element={<ProjectCasesTab />} />
              <Route path="runs" element={<RunsListPage />} />
              <Route path="plans" element={<PlansListTab />} />
              <Route path="milestones" element={<MilestonesTab />} />
              <Route path="defects" element={<DefectsTab />} />
              <Route path="webhooks" element={<WebhooksTab />} />
            </Route>
            <Route
              path="/plans/:planId"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <PlanDetailPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/suites/:suiteId"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <SuiteDetailPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/runs/:runId"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <RunExecutionPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-tests"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <MyTestsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute requireRole={['ADMIN']}>
                  <AppShell>
                    <UsersAdminPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/account/api-keys"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <ApiKeysPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
