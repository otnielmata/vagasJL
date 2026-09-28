'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BriefcaseBusiness, ChevronLeft, ChevronRight, MapPin, Search, X } from 'lucide-react';
import { vacancyService } from '@/lib/api/services';
import type { Vacancy, VacancyListFilters, VacancyStatus } from '@/lib/api/types';
import { MATCH_FIELDS, optionLabel } from '@/config/match-catalog';
import { useAsync } from '@/lib/use-async';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { OriginBadge, VACANCY_STATUS_LABEL, VacancyStatusBadge } from '@/components/match/status-badges';

const EMPTY: VacancyListFilters = {};

function options(field: 'type' | 'level' | 'role' | 'specialization') {
  return MATCH_FIELDS.find((item) => item.key === field)?.options ?? [];
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)];
}

function VacancyListCard({ vacancy, admin }: { vacancy: Vacancy; admin: boolean }) {
  const values = vacancy.matchProfile?.values ?? {};
  const location = [vacancy.location?.city, vacancy.location?.state, vacancy.location?.country]
    .filter(Boolean).join(', ');
  const tags = [
    ...asArray(values.type).map((value) => optionLabel('type', value)),
    ...asArray(values.level).map((value) => optionLabel('level', value)),
    ...asArray(values.role).map((value) => optionLabel('role', value)),
    ...asArray(values.testAutomationTechnologies).slice(0, 4)
      .map((value) => optionLabel('testAutomationTechnologies', value)),
  ];

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <OriginBadge value={vacancy.origin} />
              {admin && <VacancyStatusBadge value={vacancy.status} />}
            </div>
            <h2 className="font-display text-lg font-semibold">{vacancy.title}</h2>
            {location && <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted"><MapPin className="h-4 w-4" />{location}</p>}
          </div>
          {!admin && (
            <Link className={buttonClasses('outline', 'sm')} href={`/candidato/vagas/${vacancy._id}`}>
              Ver detalhes <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </div>
        {vacancy.description && <p className="line-clamp-3 text-sm text-muted">{vacancy.description}</p>}
        {tags.length > 0 && <div className="flex flex-wrap gap-1.5">{tags.map((tag) => <Badge key={tag} tone="muted">{tag}</Badge>)}</div>}
        {admin && <p className="break-all text-xs text-subtle">ID: {vacancy._id}</p>}
      </CardBody>
    </Card>
  );
}

export function VacancyBrowser({ admin = false }: { admin?: boolean }) {
  const [draft, setDraft] = useState<VacancyListFilters>(EMPTY);
  const [filters, setFilters] = useState<VacancyListFilters>(EMPTY);
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAsync(() => vacancyService.list({ ...filters, page }), [filters, page]);

  const set = (key: keyof VacancyListFilters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value || undefined }));
  const apply = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setFilters(draft);
  };
  const clear = () => {
    setDraft(EMPTY);
    setFilters(EMPTY);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardBody>
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={apply}>
            <Input wrapperClassName="md:col-span-2" label="Pesquisar" placeholder="Título, descrição, referência ou localização" value={draft.q ?? ''} onChange={(event) => set('q', event.target.value)} />
            <Select label="Origem" value={draft.origin ?? ''} onChange={(event) => set('origin', event.target.value)}>
              <option value="">Todas</option>
              <option value="IMPORTED">Importada</option><option value="COMPANY">Empresa</option><option value="ADMIN">Administração</option>
            </Select>
            {admin && (
              <Select label="Status" value={draft.status ?? ''} onChange={(event) => set('status', event.target.value)}>
                <option value="">Todos</option>
                {(['pending', 'active', 'paused', 'expired', 'removed', 'rejected'] as VacancyStatus[])
                  .map((value) => <option key={value} value={value}>{VACANCY_STATUS_LABEL[value]}</option>)}
              </Select>
            )}
            <Input label="Cidade" value={draft.city ?? ''} onChange={(event) => set('city', event.target.value)} />
            <Input label="Estado" value={draft.state ?? ''} onChange={(event) => set('state', event.target.value)} />
            <Input label="País" value={draft.country ?? ''} onChange={(event) => set('country', event.target.value)} />
            <Select label="Modalidade" value={draft.type ?? ''} onChange={(event) => set('type', event.target.value)}>
              <option value="">Todas</option>{options('type').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
            <Select label="Senioridade" value={draft.level ?? ''} onChange={(event) => set('level', event.target.value)}>
              <option value="">Todas</option>{options('level').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
            <Select label="Função" value={draft.role ?? ''} onChange={(event) => set('role', event.target.value)}>
              <option value="">Todas</option>{options('role').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
            <Select label="Especialização" value={draft.specialization ?? ''} onChange={(event) => set('specialization', event.target.value)}>
              <option value="">Todas</option>{options('specialization').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
            <Input label="Competência" placeholder="Ex.: playwright" value={draft.skill ?? ''} onChange={(event) => set('skill', event.target.value)} />
            <div className="flex items-end gap-2 md:col-span-2 xl:col-span-4">
              <Button type="submit"><Search className="h-4 w-4" />Pesquisar</Button>
              <Button type="button" variant="ghost" onClick={clear}><X className="h-4 w-4" />Limpar filtros</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {loading ? (
        <div className="grid gap-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-44 rounded-2xl" />)}</div>
      ) : error ? (
        <Alert tone="danger" title="Não foi possível carregar as vagas">{error.message}</Alert>
      ) : data?.items.length ? (
        <>
          <p className="text-sm text-muted">{data.total} vaga(s) encontrada(s) · 10 por página</p>
          <div className="grid gap-4">{data.items.map((vacancy) => <VacancyListCard key={vacancy._id} vacancy={vacancy} admin={admin} />)}</div>
          <nav aria-label="Paginação das vagas" className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button>
            <span className="text-sm text-muted">Página {data.page} de {Math.max(data.pages, 1)}</span>
            <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button>
          </nav>
        </>
      ) : (
        <Card><EmptyState icon={BriefcaseBusiness} title="Nenhuma vaga encontrada" description="Altere ou limpe os filtros para ampliar a pesquisa." /></Card>
      )}
    </div>
  );
}
