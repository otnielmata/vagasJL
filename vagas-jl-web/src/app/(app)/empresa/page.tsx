'use client';

import Link from 'next/link';
import { Briefcase, Plus, Users } from 'lucide-react';
import { companyService } from '@/lib/api/services';
import { useAsync } from '@/lib/use-async';
import { useCompanyVacancies } from '@/lib/use-links';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { buttonClasses } from '@/components/ui/button';
import { CompanyGate } from '@/components/company/company-gate';
import { CompanyStatusBadge } from '@/components/match/status-badges';

function Dashboard({ companyId }: { companyId: string }) {
  const { data, error, loading } = useAsync(() => companyService.get(companyId), [companyId]);
  const [vacancies] = useCompanyVacancies();
  const company = data?.company;

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title={company?.tradeName || company?.legalName || 'Sua empresa'}
        description="Cadastre vagas com requisitos estruturados e veja os candidatos mais compatíveis."
        actions={
          <Link href="/empresa/vagas/nova" className={buttonClasses()}>
            <Plus className="h-4 w-4" /> Nova vaga
          </Link>
        }
      />

      {loading ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : error ? (
        <Alert tone="danger" title="Não foi possível carregar a empresa">{error.message}</Alert>
      ) : company?.status !== 'active' ? (
        <Alert tone="warning" title="Empresa ainda não ativa">
          Somente empresas ativas podem consultar a base de candidatos. A administração revisará seu cadastro.
        </Alert>
      ) : null}

      {company && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardBody>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Status</p>
              <div className="mt-3">
                <CompanyStatusBadge value={company.status} />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Vagas cadastradas aqui</p>
              <p className="mt-2 font-display text-3xl font-bold">{vacancies.length}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Local</p>
              <p className="mt-2 truncate font-display text-lg font-semibold">{company.city}, {company.state}</p>
            </CardBody>
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title="Suas vagas" description="Novas vagas entram como Pendentes até a revisão." />
        <CardBody>
          {vacancies.length === 0 ? (
            <EmptyState icon={Briefcase} title="Nenhuma vaga ainda" description="Crie a primeira vaga para ver os candidatos mais compatíveis." action={<Link href="/empresa/vagas/nova" className={buttonClasses()}>Criar vaga</Link>} />
          ) : (
            <ul className="divide-y divide-border">
              {vacancies.map((v) => (
                <li key={v._id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{v.title}</p>
                    <p className="text-xs text-muted">{v.reference} · criada em {formatDate(v.createdAt)}</p>
                  </div>
                  <Link href={`/empresa/ranking?vaga=${v._id}`} className={buttonClasses('outline', 'sm')}>
                    <Users className="h-4 w-4" /> Top candidatos
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}

export default function CompanyHome() {
  return <CompanyGate>{(id) => <Dashboard companyId={id} />}</CompanyGate>;
}
