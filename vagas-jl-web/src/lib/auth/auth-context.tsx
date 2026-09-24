'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/api/services';
import { setUnauthorizedHandler } from '@/lib/api/client';
import { linkStorage, tokenStorage, userStorage } from '@/lib/storage';
import type { Role, User } from '@/lib/api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const HOME_BY_ROLE: Record<Role, string> = {
  candidate: '/candidato',
  company: '/empresa',
  admin: '/admin',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    tokenStorage.set(null);
    userStorage.set(null);
    setUser(null);
    router.replace('/login');
  }, [router]);

  const refresh = useCallback(async () => {
    if (!tokenStorage.get()) {
      setUser(null);
      return;
    }
    const { user: fresh } = await authService.me();
    userStorage.set(fresh);
    setUser(fresh);
  }, []);

  // Hidrata a sessao: usa o cache local imediatamente e revalida com /api/users/me.
  useEffect(() => {
    const cached = userStorage.get<User>();
    // Hidratacao a partir do storage do navegador (sistema externo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached && tokenStorage.get()) setUser(cached);
    refresh()
      .catch(() => {
        tokenStorage.set(null);
        userStorage.set(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authService.login(email, password);
    const previous = userStorage.get<User>();
    // Vinculos locais (candidato/empresa) pertencem ao usuario anterior.
    if (previous && previous._id !== res.user._id) linkStorage.clear();
    tokenStorage.set(res.token);
    userStorage.set(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
