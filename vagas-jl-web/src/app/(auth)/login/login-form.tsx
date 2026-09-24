'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, HOME_BY_ROLE } from '@/lib/auth/auth-context';
import { ApiError, API_MOCK } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : HOME_BY_ROLE[user.role]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold tracking-tight">Bem-vindo de volta</h1>
      <p className="mt-1.5 text-sm text-muted">Entre para ver as vagas e candidatos que mais combinam com você.</p>

      {params.get('cadastro') === 'ok' && (
        <Alert tone="success" className="mt-6" title="Conta criada">
          Agora é só entrar com seu e-mail e senha.
        </Alert>
      )}
      {API_MOCK && (
        <Alert tone="info" className="mt-6" title="Modo demonstração">
          Use qualquer senha. E-mails começando com <b>empresa@</b> ou <b>admin@</b> entram com esses perfis.
        </Alert>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <Input label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
        <Input label="Senha" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!email || !password}>
          Entrar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Ainda não tem conta?{' '}
        <Link href="/cadastro" className="font-medium text-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </>
  );
}
