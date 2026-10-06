'use client';

import { useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Copy, Search, UserRound, X } from 'lucide-react';
import { masterService } from '@/lib/api/services';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';

export default function MasterRecruitersPage() {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAsync(
    () => masterService.listRecruiters({ page, ...(query ? { q: query } : {}) }),
    [page, query],
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
    toast('success', 'ID do recrutador copiado.');
  }

  return (
    <>
      <PageHeader eyebrow="Perfil Master" title="Recrutadores"
        description="Consulte somente usuários com perfil Administrador e copie o ID necessário para vinculá-los a uma empresa." />
      <div className="space-y-5">
        <Card>
          <CardBody>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={search}>
              <Input wrapperClassName="flex-1" label="Nome completo ou e-mail" value={draft}
                onChange={(event) => setDraft(event.target.value)} placeholder="Pesquisar recrutador" />
              <Button type="submit"><Search className="h-4 w-4" />Pesquisar</Button>
              <Button type="button" variant="ghost" onClick={clear}><X className="h-4 w-4" />Limpar</Button>
            </form>
          </CardBody>
        </Card>

        {loading ? <Skeleton className="h-64 rounded-2xl" /> : error ? (
          <Alert tone="danger" title="Não foi possível carregar os recrutadores">{error.message}</Alert>
        ) : data?.items.length ? <>
          <p className="text-sm text-muted">{data.total} recrutador(es) encontrado(s)</p>
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((recruiter) => (
              <Card key={recruiter._id}>
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-lg font-semibold">{recruiter.name}</h2>
                      <p className="truncate text-sm text-muted">{recruiter.email}</p>
                    </div>
                    <Badge tone={recruiter.status === 'active' ? 'success' : 'muted'}>
                      {recruiter.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
                    <code className="min-w-0 truncate text-xs">{recruiter._id}</code>
                    <Button size="sm" variant="outline" onClick={() => copy(recruiter._id)}>
                      <Copy className="h-4 w-4" />Copiar ID
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
          <nav aria-label="Paginação dos recrutadores" className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
              <ChevronLeft className="h-4 w-4" />Anterior
            </Button>
            <span className="text-sm text-muted">Página {data.page} de {Math.max(data.pages, 1)}</span>
            <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>
              Próxima<ChevronRight className="h-4 w-4" />
            </Button>
          </nav>
        </> : (
          <Card><EmptyState icon={UserRound} title="Nenhum recrutador encontrado"
            description="Somente usuários com perfil Administrador aparecem neste diretório." /></Card>
        )}
      </div>
    </>
  );
}
