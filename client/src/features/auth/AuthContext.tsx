import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as authApi from '../../api/auth';
import type { User } from '../../api/types';
import { setAccessToken, setSessionExpiredHandler } from '../../lib/tokenStore';

interface AuthContextValue {
  user: User | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(clearSession);
    return () => setSessionExpiredHandler(null);
  }, [clearSession]);

  // Silent refresh on app boot — restores the session from the httpOnly refresh cookie
  // since the access token itself is memory-only and doesn't survive a page reload.
  useEffect(() => {
    authApi
      .refresh()
      .then((data) => {
        setAccessToken(data.accessToken);
        setUser(data.user);
        setStatus('authenticated');
      })
      .catch(() => {
        setStatus('unauthenticated');
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    clearSession();
  }, [clearSession]);

  return <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
