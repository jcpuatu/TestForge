import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import type { Role } from '../api/types';

export function ProtectedRoute({ children, requireRole }: { children: ReactNode; requireRole?: Role[] }) {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500 dark:text-slate-400">
        Loading…
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (requireRole && user && !requireRole.includes(user.role)) {
    return <Navigate to="/projects" replace />;
  }

  return <>{children}</>;
}
