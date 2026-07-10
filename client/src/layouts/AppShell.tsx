import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckSquare, ClipboardList, KeyRound, LayoutDashboard, Moon, Sun, Users } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { useTheme } from '../features/theme/ThemeContext';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="flex items-center gap-6 bg-[#1F2D35] px-4 py-2.5 text-white">
        <Link to="/projects" className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight">
          <ClipboardList className="h-5 w-5 text-emerald-400" strokeWidth={2.5} />
          TestForge
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-300">
          <Link to="/dashboard" className="flex items-center gap-1.5 hover:text-white">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link to="/my-tests" className="flex items-center gap-1.5 hover:text-white">
            <CheckSquare className="h-4 w-4" />
            My Tests
          </Link>
          {isAdmin && (
            <Link to="/admin/users" className="flex items-center gap-1.5 hover:text-white">
              <Users className="h-4 w-4" />
              Users
            </Link>
          )}
          <Link to="/account/api-keys" className="flex items-center gap-1.5 hover:text-white">
            <KeyRound className="h-4 w-4" />
            API Keys
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded border border-slate-600 p-1.5 text-slate-200 hover:bg-slate-700"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <span className="text-slate-300">
            {user?.name} <span className="text-slate-500">· {user?.role}</span>
          </span>
          <button
            onClick={handleLogout}
            className="rounded border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
    </div>
  );
}
