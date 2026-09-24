'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { companyService } from '@/lib/api/services';
import type { CompanyInput } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { CompanyGate } from '@/components/company/company-gate';
import { CompanyStatusBadge } from '@/components/match/status-badges';

const FIELDS: { key: keyof CompanyInput; label: string; type?: string; required?: boolean }[] = [
  { key: 'legalName', label: 'Razão social', required: true },
  { key: 'tradeName', label: 'Nome comercial' },
  { key: 'website', label: 'Site', type: 'url' },
  { key: 'segment', label: 'Segmento' },
  { key: 'responsibleName', label: 'Responsável', required: true },
  { key: 'email', label: 'E-mail', type: 'email', required: true },
  { key: 'phone', label: 'Telefone', type: 'tel' },
  { key: 'linkedinUrl', label: 'LinkedIn', type: 'url' },
  { key: 'city', label: 'Cidade', required: true },
  { key: 'state', label: 'Estado', required: true },
  { key: 'country', label: 'País', required: true },
];

function CompanyForm({ companyId }: { companyId: string }) {
  const toast = useToast();
  const { data, error, loading, setData } = useAsync(() => companyService.get(companyId), [companyId]);
  const [form, setForm] = useState<Partial<Record<keyof CompanyInput, string>>>({});
  const [saveError, setSaveError] = useState<ApiError>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const c = data.company;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, (c[f.key] as string | null | undefined) ?? ''])));
  }, [data]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      // Envia somente o que mudou; vazio em campo opcional vira null.
      const empresa = Object.fromEntries(
        FIELDS.filter((f) => (form[f.key] ?? '') !== ((data.company[f.key] as string | null) ?? ''))
          .map((f) => [f.key, form[f.key]?.trim() || (f.required ? form[f.key] : null)]),
      );
      if (Object.keys(empresa).length === 0) return toast('success', 'Nada para salvar.');
      const res = await companyService.update(companyId, { empresa });
      setData({ ...data, company: res.company ?? data.company });
      toast('success', 'Cadastro atualizado.');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err : new ApiError(0, { message: 'Erro inesperado' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Empresa" title="Dados da empresa" description="Informações exibidas aos administradores e usadas na validação da conta." actions={data && <CompanyStatusBadge value={data.company.status} />} />
      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : error ? (
        <Alert tone="danger">{error.message}</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <Card>
            <CardHeader title="Cadastro" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <Input key={f.key} label={f.label} type={f.type} required={f.required} value={form[f.key] ?? ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} error={saveError?.fieldError(`empresa.${f.key}`) ?? saveError?.fieldError(f.key)} />
              ))}
            </CardBody>
          </Card>
          {data?.usuarios?.length ? (
            <Card>
              <CardHeader title="Recrutadores" />
              <CardBody>
                <ul className="divide-y divide-border text-sm">
                  {data.usuarios.map((u) => (
                    <li key={u._id} className="flex justify-between gap-4 py-2.5">
                      <span className="font-medium">{u.name}</span>
                      <span className="truncate text-muted">{u.email}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
          {saveError && <Alert tone="danger">{saveError.message}</Alert>}
          <div className="flex justify-end">
            <Button type="submit" size="lg" loading={saving}>
              <Save className="h-4 w-4" /> Salvar
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

export default function CompanyRegistrationPage() {
  return <CompanyGate>{(id) => <CompanyForm companyId={id} />}</CompanyGate>;
}
