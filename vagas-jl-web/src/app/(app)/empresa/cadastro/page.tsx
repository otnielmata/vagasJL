'use client';

import { useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { userService } from '@/lib/api/services';
import type { User } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';

function RecruiterForm({ user, refresh }: { user: User; refresh: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: user.name, email: user.email, password: '' });
  const [error, setError] = useState<ApiError>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const input = {
        ...(form.name.trim() !== user.name ? { name: form.name.trim() } : {}),
        ...(form.email.trim().toLowerCase() !== user.email ? { email: form.email.trim() } : {}),
        ...(form.password ? { password: form.password } : {}),
      };
      if (!Object.keys(input).length) {
        toast('success', 'Nada para salvar.');
        return;
      }
      await userService.update(user._id, input);
      await refresh();
      setForm((current) => ({ ...current, password: '' }));
      toast('success', 'Dados do recrutador atualizados.');
    } catch (failure) {
      setError(failure instanceof ApiError ? failure : new ApiError(0, { message: 'Erro inesperado' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Card>
        <CardHeader title="Perfil do recrutador" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome" required value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            error={error?.fieldError('name')} />
          <Input label="E-mail" type="email" required value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            error={error?.fieldError('email')} />
          <Input label="Nova senha" type="password" minLength={8} value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            hint="Deixe em branco para manter a senha atual." error={error?.fieldError('password')} />
        </CardBody>
      </Card>
      {error && <Alert tone="danger">{error.message}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={saving}
          disabled={!form.name.trim() || !form.email.trim() || Boolean(form.password && form.password.length < 8)}>
          <Save className="h-4 w-4" /> Salvar meus dados
        </Button>
      </div>
    </form>
  );
}

export default function RecruiterProfilePage() {
  const { user, loading, refresh } = useAuth();
  return (
    <>
      <PageHeader eyebrow="Recrutador" title="Meus dados"
        description="Dados pessoais da conta do recrutador. O cadastro da empresa é administrado pelo perfil Master." />
      {loading || !user ? <Skeleton className="h-72 rounded-2xl" /> : (
        <RecruiterForm key={`${user._id}:${user.updatedAt ?? ''}`} user={user} refresh={refresh} />
      )}
    </>
  );
}
