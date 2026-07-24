import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './features/auth/AuthContext';
import { ThemeProvider } from './features/theme/ThemeContext';
import { ToastProvider } from './components/Toast';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AppShell } from './layouts/AppShell';

const LoginPage = lazy(() => import('./features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const ProjectsListPage = lazy(() =>
  import('./features/projects/ProjectsListPage').then((m) => ({ default: m.ProjectsListPage })),
);
const ProjectShell = lazy(() =>
  import('./features/projects/ProjectShell').then((m) => ({ default: m.ProjectShell })),
);
const ProjectCasesTab = lazy(() =>
  import('./features/projects/ProjectCasesTab').then((m) => ({ default: m.ProjectCasesTab })),
);
const SuiteDetailPage = lazy(() =>
  import('./features/cases/SuiteDetailPage').then((m) => ({ default: m.SuiteDetailPage })),
);
const RunsListPage = lazy(() => import('./features/runs/RunsListPage').then((m) => ({ default: m.RunsListPage })));
const RunExecutionPage = lazy(() =>
  import('./features/runs/RunExecutionPage').then((m) => ({ default: m.RunExecutionPage })),
);
const MilestonesTab = lazy(() =>
  import('./features/milestones/MilestonesTab').then((m) => ({ default: m.MilestonesTab })),
);
const PlansListTab = lazy(() => import('./features/plans/PlansListTab').then((m) => ({ default: m.PlansListTab })));
const PlanDetailPage = lazy(() =>
  import('./features/plans/PlanDetailPage').then((m) => ({ default: m.PlanDetailPage })),
);
const ReportsTab = lazy(() => import('./features/reports/ReportsTab').then((m) => ({ default: m.ReportsTab })));
const ReportsPage = lazy(() => import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const WebhooksTab = lazy(() => import('./features/webhooks/WebhooksTab').then((m) => ({ default: m.WebhooksTab })));
const UsersAdminPage = lazy(() =>
  import('./features/admin/UsersAdminPage').then((m) => ({ default: m.UsersAdminPage })),
);
const ApiKeysPage = lazy(() => import('./features/admin/ApiKeysPage').then((m) => ({ default: m.ApiKeysPage })));
const MyTestsPage = lazy(() => import('./features/me/MyTestsPage').then((m) => ({ default: m.MyTestsPage })));
const DefectsTab = lazy(() => import('./features/defects/DefectsTab').then((m) => ({ default: m.DefectsTab })));
const ActivityTab = lazy(() => import('./features/activity/ActivityTab').then((m) => ({ default: m.ActivityTab })));
const CrossProjectDashboardPage = lazy(() =>
  import('./features/dashboard/CrossProjectDashboardPage').then((m) => ({ default: m.CrossProjectDashboardPage })),
);

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-slate-500 dark:text-slate-400">Loading…</div>
  );
}

// Route-level code splitting (React.lazy) means each page's chunk downloads on demand rather than
// all being bundled into one entry file. Suspense is scoped around each individual lazy route element
// (not one boundary around the whole <Routes>) so AppShell's header/sidebar — which React reconciles
// in place across route changes since it sits at the same position in the tree — stays mounted and
// visible while only the inner content area shows the loading fallback.
function withSuspense(element: ReactNode) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={withSuspense(<LoginPage />)} />
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <AppShell>{withSuspense(<ProjectsListPage />)}</AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <ProtectedRoute>
                  <AppShell>{withSuspense(<ProjectShell />)}</AppShell>
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={withSuspense(<ReportsTab />)} />
              <Route path="cases" element={withSuspense(<ProjectCasesTab />)} />
              <Route path="runs" element={withSuspense(<RunsListPage />)} />
              <Route path="plans" element={withSuspense(<PlansListTab />)} />
              <Route path="milestones" element={withSuspense(<MilestonesTab />)} />
              <Route path="defects" element={withSuspense(<DefectsTab />)} />
              <Route path="reports" element={withSuspense(<ReportsPage />)} />
              <Route path="activity" element={withSuspense(<ActivityTab />)} />
              <Route path="webhooks" element={withSuspense(<WebhooksTab />)} />
            </Route>
            <Route
              path="/plans/:planId"
              element={
                <ProtectedRoute>
                  <AppShell>{withSuspense(<PlanDetailPage />)}</AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/suites/:suiteId"
              element={
                <ProtectedRoute>
                  <AppShell>{withSuspense(<SuiteDetailPage />)}</AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/runs/:runId"
              element={
                <ProtectedRoute>
                  <AppShell>{withSuspense(<RunExecutionPage />)}</AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AppShell>{withSuspense(<CrossProjectDashboardPage />)}</AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-tests"
              element={
                <ProtectedRoute>
                  <AppShell>{withSuspense(<MyTestsPage />)}</AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute requireRole={['ADMIN']}>
                  <AppShell>{withSuspense(<UsersAdminPage />)}</AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/account/api-keys"
              element={
                <ProtectedRoute>
                  <AppShell>{withSuspense(<ApiKeysPage />)}</AppShell>
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
