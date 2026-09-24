'use client';

import { useState, type FormEvent } from 'react';
import { Copy, Plus } from 'lucide-react';
import { adminService, companyService } from '@/lib/api/services';
import type { CompanyInput, CompanyStatus } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { StatusChangeForm } from '@/components/admin/status-change-form';
import { COMPANY_STATUS_LABEL } from '@/components/match/status-badges';

const EMPTY = { legalName: '', tradeName: '', responsibleName: '', email: '', city: '', state: '', country: 'Brasil', website: '', segment: '' };

export default function AdminCompaniesPage() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [created, setCreated] = useState<string>();
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState({ companyId: '', userId: '' });
  const [linkBusy, setLinkBusy] = useState(false);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function register(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]).filter(([, v]) => v !== null)) as unknown as CompanyInput;
      const { company } = await companyService.register(payload);
      setCreated(company._id);
      setForm(EMPTY);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { message: 'Erro inesperado' }));
    } finally {
      setBusy(false);
    }
  }

  async function linkUser(e: FormEvent) {
    e.preventDefault();
    setLinkBusy(true);
    try {
      await companyService.addUser(link.companyId.trim(), link.userId.trim());
      toast('success', 'Recrutador vinculado à empresa.');
      setLink({ companyId: '', userId: '' });
    } catch (err) {
      toast('danger', err instanceof ApiError ? err.message : 'Falha ao vincular.');
    } finally {
      setLinkBusy(false);
    }
  }

  const isId = (v: string) => /^[a-fA-F0-9]{24}$/.test(v.trim());

  return (
    <>
      <PageHeader eyebrow="Administração" title="Empresas" description="Somente empresas ativas consultam a base de candidatos." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Registrar empresa" description="A empresa é criada como Pendente." />
          <CardBody>
            <form onSubmit={register} className="grid gap-4 sm:grid-cols-2" noValidate>
              <Input label="Razão social *" value={form.legalName} onChange={set('legalName')} error={error?.fieldError('legalName')} />
              <Input label="Nome comercial" value={form.tradeName} onChange={set('tradeName')} />
              <Input label="Responsável *" value={form.responsibleName} onChange={set('responsibleName')} error={error?.fieldError('responsibleName')} />
              <Input label="E-mail *" type="email" value={form.email} onChange={set('email')} error={error?.fieldError('email')} />
              <Input label="Cidade *" value={form.city} onChange={set('city')} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Estado *" value={form.state} onChange={set('state')} />
                <Input label="País *" value={form.country} onChange={set('country')} />
              </div>
              <Input label="Site" type="url" value={form.website} onChange={set('website')} error={error?.fieldError('website')} />
              <Input label="Segmento" value={form.segment} onChange={set('segment')} />
              {error && !error.errors?.length && <Alert tone="danger" className="sm:col-span-2">{error.message}</Alert>}
              {created && (
                <Alert tone="success" className="sm:col-span-2" title="Empresa registrada"
                  action={<Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(created)}><Copy className="h-4 w-4" /> Copiar ID</Button>}>
                  ID: <code className="font-mono">{created}</code> — envie ao recrutador para ele vincular a conta.
                </Alert>
              )}
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" loading={busy} disabled={!form.legalName || !form.responsibleName || !form.email || !form.city || !form.state || !form.country}>
                  <Plus className="h-4 w-4" /> Registrar
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Vincular recrutador" description="Associa um usuário com papel Empresa à empresa (MVP: um recrutador)." />
          <CardBody>
            <form onSubmit={linkUser} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Input label="ID da empresa" value={link.companyId} onChange={(e) => setLink((l) => ({ ...l, companyId: e.target.value }))} />
              <Input label="ID do usuário" value={link.userId} onChange={(e) => setLink((l) => ({ ...l, userId: e.target.value }))} />
              <Button type="submit" loading={linkBusy} disabled={!isId(link.companyId) || !isId(link.userId)}>Vincular</Button>
            </form>
          </CardBody>
        </Card>

        <StatusChangeForm<CompanyStatus>
          title="Alterar status da empresa"
          description="Ativar, inativar ou bloquear com motivo auditado."
          idLabel="ID da empresa"
          statuses={(Object.keys(COMPANY_STATUS_LABEL) as CompanyStatus[]).map((v) => ({ value: v, label: COMPANY_STATUS_LABEL[v] }))}
          onSubmit={(id, status, reason) => adminService.setCompanyStatus(id, status, reason)}
        />
      </div>
    </>
  );
}
