'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Sparkles, UserRound } from 'lucide-react';
import { candidateService } from '@/lib/api/services';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { Segmented } from '@/components/ui/toggle';
import { Button, buttonClasses } from '@/components/ui/button';
import { VacancyCard } from '@/components/match/vacancy-card';

type View = 3 | 5 | 10 | 20;

export default function VacanciesPage() {
  const [view, setView] = useState<View>(10);
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAsync(
    () => candidateService.vacancyRanking({ limit: view, page: view === 20 ? page : 1 }),
    [view, page],
  );

  const changeView = (v: View) => {
    setView(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        eyebrow="Vagas para mim"
        title="Vagas mais compatíveis"
        description="Ordenadas pelo percentual de Match; em empate, pelos requisitos obrigatórios atendidos e pela atualização da vaga."
        actions={
          <Segmented
            ariaLabel="Quantidade de vagas"
            value={view}
            onChange={changeView}
            options={[
              { value: 3, label: 'Top 3' },
              { value: 5, label: 'Top 5' },
              { value: 10, label: 'Top 10' },
              { value: 20, label: 'Todas' },
            ]}
          />
        }
      />

      {data?.minimumMatchPercentage != null && data.recommendationStatus === 'available' && (
        <p className="mb-4 text-sm text-muted">
          Exibindo vagas com Match a partir de <b className="text-foreground">{data.minimumMatchPercentage}%</b> · {data.total ?? 0} encontradas
        </p>
      )}

      {loading ? (
        <div className="grid gap-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : error?.status === 409 || error?.status === 404 ? (
        <Card>
          <EmptyState
            icon={UserRound}
            title={error.status === 409 ? 'Preencha seu Perfil de Match' : 'Complete seu cadastro de candidato'}
            description={error.message}
            action={
              <Link href={error.status === 409 ? '/candidato/perfil-match' : '/candidato/cadastro'} className={buttonClasses()}>
                Continuar
              </Link>
            }
          />
        </Card>
      ) : error ? (
        <Alert tone="danger" title="Não foi possível carregar as vagas">{error.message}</Alert>
      ) : data?.recommendationStatus === 'insufficient_profile_completeness' ? (
        <Card>
          <EmptyState
            icon={UserRound}
            title="Perfil insuficiente para recomendações"
            description={`Seu perfil está ${Math.round(data.profileCompletion.percentage)}% completo; o mínimo é ${data.minimumProfileCompletionPercentage ?? 0}%.`}
            action={<Link href="/candidato/perfil-match" className={buttonClasses()}>Completar perfil</Link>}
          />
        </Card>
      ) : data?.items?.length ? (
        <>
          <div className="grid gap-4">
            {data.items.map((item, i) => (
              <VacancyCard key={item.vacancy._id} item={item} rank={(page - 1) * view + i + 1} />
            ))}
          </div>
          {view === 20 && (data.pages ?? 0) > 1 && (
            <nav aria-label="Paginação" className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <span className="text-sm text-muted">
                Página {page} de {data.pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= (data.pages ?? 1)} onClick={() => setPage((p) => p + 1)}>
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          )}
        </>
      ) : (
        <Card>
          <EmptyState icon={Sparkles} title="Nenhuma vaga acima do Match mínimo" description="Revise seu Perfil de Match ou volte mais tarde — novas vagas são importadas com frequência." />
        </Card>
      )}
    </>
  );
}
