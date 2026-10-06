'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Copy, Plus, Search, UserCheck, UserX, X } from 'lucide-react';
import { adminService, companyService, masterService } from '@/lib/api/services';
import type { CompanyInput, CompanyStatus } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { StatusChangeForm } from '@/components/admin/status-change-form';
import { COMPANY_STATUS_LABEL, CompanyStatusBadge } from '@/components/match/status-badges';
import { useAuth } from '@/lib/auth/auth-context';
import { useAsync } from '@/lib/use-async';

const EMPTY = { legalName: '', tradeName: '', responsibleName: '', email: '', city: '', state: '', country: 'Brasil', website: '', segment: '' };

function CompanyDirectory({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAsync(
    () => masterService.listCompanies({ page, ...(query ? { q: query } : {}) }),
    [page, query, refreshKey],
  );

  function search(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(draft.trim());
  }

  function clear() {
    setDraft('');
    setQuery('');
    setPage(1);
  }

  async function copy(id: string) {
    await navigator.clipboard?.writeText(id);
    toast('success', 'ID da empresa copiado.');
  }

  return (
    <Card>
      <CardHeader title="Empresas cadastradas" description="Todas as empresas atuais, com seus identificadores para vínculo." />
      <CardBody className="space-y-5">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={search}>
          <Input wrapperClassName="flex-1" label="Pesquisar empresa" value={draft}
            onChange={(event) => setDraft(event.target.value)} placeholder="Razão social, nome comercial ou e-mail" />
          <Button type="submit"><Search className="h-4 w-4" />Pesquisar</Button>
          <Button type="button" variant="ghost" onClick={clear}><X className="h-4 w-4" />Limpar</Button>
        </form>

        {loading ? <div className="h-48 animate-pulse rounded-xl bg-surface-2" /> : error ? (
          <Alert tone="danger" title="Não foi possível carregar as empresas">{error.message}</Alert>
        ) : data?.items.length ? <>
          <p className="text-sm text-muted">{data.total} empresa(s) cadastrada(s)</p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {data.items.map((company) => (
              <div key={company._id} className="grid gap-3 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium">{company.tradeName || company.legalName}</p>
                  <p className="truncate text-sm text-muted">{company.legalName} · {company.email}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted">ID da empresa</p>
                  <code className="block truncate text-xs">{company._id}</code>
                  <p className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${company.hasRecruiter ? 'text-success' : 'text-muted'}`}>
                    {company.hasRecruiter ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                    {company.hasRecruiter ? 'Com recrutador vinculado' : 'Sem recrutador vinculado'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CompanyStatusBadge value={company.status} />
                  <Button type="button" size="sm" variant="outline" onClick={() => copy(company._id)}>
                    <Copy className="h-4 w-4" />Copiar ID
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <nav aria-label="Paginação das empresas" className="flex items-center justify-center gap-3">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button>
            <span className="text-sm text-muted">Página {data.page} de {Math.max(data.pages, 1)}</span>
            <Button type="button" variant="outline" size="sm" disabled={page >= data.pages}
              onClick={() => setPage((value) => value + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button>
          </nav>
        </> : <p className="py-8 text-center text-sm text-muted">Nenhuma empresa encontrada.</p>}
      </CardBody>
    </Card>
  );
}

export default function MasterCompaniesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [created, setCreated] = useState<string>();
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState({ companyId: '', userId: '' });
  const [linkBusy, setLinkBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!loading && user?.role !== 'master') router.replace('/admin');
  }, [loading, user, router]);

  if (loading || user?.role !== 'master') return null;

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
      setRefreshKey((value) => value + 1);
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
      setRefreshKey((value) => value + 1);
    } catch (err) {
      toast('danger', err instanceof ApiError ? err.message : 'Falha ao vincular.');
    } finally {
      setLinkBusy(false);
    }
  }

  const isId = (v: string) => /^[a-fA-F0-9]{24}$/.test(v.trim());

  return (
    <>
      <PageHeader eyebrow="Perfil Master" title="Empresas" description="Cadastre empresas, vincule recrutadores e controle seus status." />
      <div className="space-y-6">
        <CompanyDirectory refreshKey={refreshKey} />

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
                  ID: <code className="font-mono">{created}</code> — use este identificador para vincular o recrutador.
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
          <CardHeader title="Vincular recrutador" description="Associe um recrutador Ativo a uma empresa Ativa (MVP: um recrutador)." />
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
          description="Defina Pendente, Ativa, Inativa ou Bloqueada independentemente de vínculo com recrutador."
          idLabel="ID da empresa"
          statuses={(Object.keys(COMPANY_STATUS_LABEL) as CompanyStatus[]).map((v) => ({ value: v, label: COMPANY_STATUS_LABEL[v] }))}
          onSubmit={async (id, status, reason) => {
            await adminService.setCompanyStatus(id, status, reason);
            setRefreshKey((value) => value + 1);
          }}
        />
      </div>
    </>
  );
}
