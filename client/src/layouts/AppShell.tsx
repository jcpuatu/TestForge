import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckSquare, KeyRound, Users } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { Logo } from '../components/Logo';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center gap-6 bg-[#1F2D35] px-4 py-2.5 text-white">
        <Link to="/projects" className="flex items-center">
          <Logo inverted iconClassName="h-7 w-7" className="text-[17px]" />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-300">
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
