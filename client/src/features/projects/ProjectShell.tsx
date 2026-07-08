import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Bug, ChevronLeft, Flag, LayoutDashboard, Layers, ListChecks, PlayCircle, Webhook, type LucideIcon } from 'lucide-react';
import * as projectsApi from '../../api/projects';
import { useAuth } from '../auth/AuthContext';

const TABS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: 'overview', label: 'Overview', icon: LayoutDashboard },
  { to: 'cases', label: 'Test Cases', icon: ListChecks },
  { to: 'runs', label: 'Test Runs & Results', icon: PlayCircle },
  { to: 'plans', label: 'Test Plans', icon: Layers },
  { to: 'milestones', label: 'Milestones', icon: Flag },
  { to: 'defects', label: 'Defects', icon: Bug },
];

const ADMIN_TABS: { to: string; label: string; icon: LucideIcon }[] = [{ to: 'webhooks', label: 'Webhooks', icon: Webhook }];

export function ProjectShell() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'LEAD';

  const { data, isLoading } = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => projectsApi.getProject(projectId!),
    enabled: !!projectId,
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!data) return null;

  const tabs = canManage ? [...TABS, ...ADMIN_TABS] : TABS;

  return (
    <div className="flex gap-6">
      <aside className="w-56 shrink-0">
        <Link
          to="/projects"
          className="mb-2 flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-800 hover:border-slate-300"
        >
          <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{data.project.name}</span>
        </Link>

        <nav className="space-y-0.5">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={`/projects/${projectId}/${tab.to}`}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm',
                  isActive ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              <tab.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <Outlet context={{ project: data.project }} />
      </div>
    </div>
  );
}
