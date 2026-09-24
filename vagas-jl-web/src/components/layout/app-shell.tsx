'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth, HOME_BY_ROLE } from '@/lib/auth/auth-context';
import { NAVIGATION, ROLE_LABEL } from '@/config/navigation';
import { API_MOCK } from '@/lib/api/client';
import type { Role } from '@/lib/api/types';
import { cn, initials } from '@/lib/utils';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';

/**
 * Casca autenticada: sidebar fixa no desktop, drawer no mobile.
 * Protege a area por papel — um candidato que abre /empresa e redirecionado.
 */
export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (user.role !== role) router.replace(HOME_BY_ROLE[user.role]);
  }, [loading, user, role, router, pathname]);

  // Fecha o drawer ao navegar
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user || user.role !== role) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" aria-label="Carregando" />
      </div>
    );
  }

  const items = NAVIGATION[role];
  const isActive = (href: string) => (href === HOME_BY_ROLE[role] ? pathname === href : pathname.startsWith(href));

  const nav = (
    <nav aria-label="Principal" className="flex flex-1 flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? 'page' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
            isActive(href) ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-foreground',
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );

  const userCard = (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
        {initials(user.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted">{ROLE_LABEL[user.role]}</p>
      </div>
      <button onClick={logout} aria-label="Sair" title="Sair" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-surface p-4 lg:flex">
        <div className="px-2 pt-2">
          <Logo href={HOME_BY_ROLE[role]} />
        </div>
        {nav}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted">Tema</span>
            <ThemeToggle />
          </div>
          {userCard}
        </div>
      </aside>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Fechar menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 bg-surface p-4 shadow-pop">
            <div className="flex items-center justify-between px-2 pt-2">
              <Logo href={HOME_BY_ROLE[role]} />
              <button onClick={() => setOpen(false)} aria-label="Fechar menu" className="rounded-lg p-2 text-muted hover:bg-surface-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-muted">Tema</span>
                <ThemeToggle />
              </div>
              {userCard}
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        {/* Topbar mobile */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface/85 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="rounded-lg p-2 text-muted hover:bg-surface-2">
            <Menu className="h-5 w-5" />
          </button>
          <Logo href={HOME_BY_ROLE[role]} />
          <ThemeToggle compact />
        </header>

        {API_MOCK && (
          <div className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-xs font-medium text-warning">
            Modo demonstração — dados simulados, nenhuma chamada à API real.
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
