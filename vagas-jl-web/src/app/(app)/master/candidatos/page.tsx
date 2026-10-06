'use client';

import { useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Copy, Search, X } from 'lucide-react';
import { adminService, masterService } from '@/lib/api/services';
import type { CandidateStatus } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChangeForm } from '@/components/admin/status-change-form';
import { CANDIDATE_STATUS_LABEL, CandidateStatusBadge } from '@/components/match/status-badges';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useAsync } from '@/lib/use-async';
import { useToast } from '@/components/ui/toast';

function CandidateDirectory({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAsync(
    () => masterService.listCandidates({ page, ...(query ? { q: query } : {}) }),
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
    toast('success', 'ID do candidato copiado.');
  }

  return (
    <Card>
      <CardHeader title="Candidatos cadastrados" description="15 candidatos por página, com pesquisa por nome ou e-mail." />
      <CardBody className="space-y-5">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={search}>
          <Input wrapperClassName="flex-1" label="Pesquisar candidato" value={draft}
            onChange={(event) => setDraft(event.target.value)} placeholder="Nome ou e-mail" />
          <Button type="submit"><Search className="h-4 w-4" />Pesquisar</Button>
          <Button type="button" variant="ghost" onClick={clear}><X className="h-4 w-4" />Limpar</Button>
        </form>

        {loading ? <div className="h-56 animate-pulse rounded-xl bg-surface-2" /> : error ? (
          <Alert tone="danger" title="Não foi possível carregar os candidatos">{error.message}</Alert>
        ) : data?.items.length ? <>
          <p className="text-sm text-muted">{data.total} candidato(s) cadastrado(s) · {data.limit} por página</p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
                <tr><th className="px-4 py-3">Candidato</th><th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Telefone</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">ID do candidato</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((candidate) => (
                  <tr key={candidate._id}>
                    <td className="px-4 py-3 font-medium">{candidate.name}</td>
                    <td className="px-4 py-3 text-muted">{candidate.email}</td>
                    <td className="px-4 py-3 text-muted">{candidate.phone && candidate.phone !== 'UNKNOWN' ? candidate.phone : 'Não informado'}</td>
                    <td className="px-4 py-3"><CandidateStatusBadge value={candidate.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2"><code className="text-xs">{candidate._id}</code>
                        <Button type="button" size="icon" variant="ghost" aria-label="Copiar ID do candidato"
                          onClick={() => copy(candidate._id)}><Copy className="h-4 w-4" /></Button></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Paginação dos candidatos" className="flex items-center justify-center gap-3">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button>
            <span className="text-sm text-muted">Página {data.page} de {Math.max(data.pages, 1)}</span>
            <Button type="button" variant="outline" size="sm" disabled={page >= data.pages}
              onClick={() => setPage((value) => value + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button>
          </nav>
        </> : <p className="py-8 text-center text-sm text-muted">Nenhum candidato encontrado.</p>}
      </CardBody>
    </Card>
  );
}

export default function MasterCandidatesPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <PageHeader eyebrow="Perfil Master" title="Status dos candidatos"
        description="Consulte todos os candidatos e altere seus status com motivo auditado." />
      <div className="space-y-6">
        <CandidateDirectory refreshKey={refreshKey} />
        <StatusChangeForm<CandidateStatus>
          title="Alterar status do candidato"
          description="Somente o perfil Master pode executar esta operação."
          idLabel="ID do candidato"
          statuses={(Object.keys(CANDIDATE_STATUS_LABEL) as CandidateStatus[])
            .map((value) => ({ value, label: CANDIDATE_STATUS_LABEL[value] }))}
          onSubmit={async (id, status, reason) => {
            const result = await adminService.setCandidateStatus(id, status, reason);
            setRefreshKey((value) => value + 1);
            return result;
          }}
        />
      </div>
    </>
  );
}
