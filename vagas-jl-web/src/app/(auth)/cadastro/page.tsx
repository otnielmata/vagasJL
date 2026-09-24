'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, GraduationCap } from 'lucide-react';
import { authService } from '@/lib/api/services';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';

type RoleOpt = 'candidate' | 'company';

export default function CadastroPage() {
  const router = useRouter();
  const [role, setRole] = useState<RoleOpt>('candidate');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      await authService.register({ ...form, email: form.email.trim(), role });
      router.replace('/login?cadastro=ok');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { message: 'Erro inesperado' }));
      setLoading(false);
    }
  }

  const roles: { value: RoleOpt; title: string; text: string; icon: typeof Briefcase }[] = [
    { value: 'candidate', title: 'Sou profissional de QA', text: 'Quero vagas compatíveis', icon: GraduationCap },
    { value: 'company', title: 'Sou empresa', text: 'Quero encontrar talentos', icon: Briefcase },
  ];

  return (
    <>
      <h1 className="font-display text-2xl font-bold tracking-tight">Criar conta</h1>
      <p className="mt-1.5 text-sm text-muted">Leva menos de um minuto.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <div role="radiogroup" aria-label="Tipo de conta" className="grid grid-cols-2 gap-3">
          {roles.map(({ value, title, text, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={role === value}
              onClick={() => setRole(value)}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors',
                role === value ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              <Icon className={cn('mb-2 h-5 w-5', role === value ? 'text-primary' : 'text-muted')} aria-hidden />
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted">{text}</p>
            </button>
          ))}
        </div>
        <Input label="Nome" autoComplete="name" required value={form.name} onChange={set('name')} error={error?.fieldError('name')} />
        <Input label="E-mail" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={error?.fieldError('email')}
          hint={role === 'candidate' ? 'Use o e-mail da sua matrícula na formação — ele valida sua elegibilidade.' : undefined} />
        <Input label="Senha" type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={set('password')}
          hint="Mínimo de 8 caracteres." error={error?.fieldError('password')} />
        {role === 'company' && (
          <Alert tone="info">Após criar a conta, a administração vincula você à empresa e libera o acesso aos candidatos.</Alert>
        )}
        {error && !error.errors?.length && <Alert tone="danger">{error.message}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!form.name || !form.email || form.password.length < 8}>
          Criar conta
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Já tem conta?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
