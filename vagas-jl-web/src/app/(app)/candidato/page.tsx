'use client';

import Link from 'next/link';
import { ArrowRight, Gauge, Sparkles, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { candidateService } from '@/lib/api/services';
import { useCandidateId } from '@/lib/use-links';
import { useAsync } from '@/lib/use-async';
import { fieldLabel } from '@/config/match-catalog';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, Progress, Skeleton } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { VacancyCard } from '@/components/match/vacancy-card';

export default function CandidateDashboard() {
  const { user } = useAuth();
  const [candidateId] = useCandidateId();
  const hasCandidate = !!candidateId;
  const profile = useAsync(() => candidateService.getMatchProfile());
  const ranking = useAsync(() => candidateService.vacancyRanking({ limit: 3 }), [], !profile.error);
  const engagement = useAsync(() => candidateService.engagement());

  const noProfile = profile.error?.status === 404;
  const completion = profile.data?.profile.completion.percentage ?? 0;
  const firstName = user?.name.split(' ')[0];

  return (
    <>
      <PageHeader eyebrow="Visão geral" title={`Olá, ${firstName}`} description="Veja as vagas que mais combinam com o seu perfil e o que falta para melhorar seu Match." />

      {!hasCandidate && (
        <Alert
          tone="warning"
          className="mb-6"
          title="Complete seus dados profissionais"
          action={
            <Link href="/candidato/cadastro" className={buttonClasses('outline', 'sm')}>
              Completar
            </Link>
          }
        >
          O cadastro de candidato é necessário para validação como aluno e para aparecer às empresas.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Completude */}
        <Card>
          <CardHeader title="Perfil de Match" description="Campos que afetam o cálculo" />
          <CardBody>
            {profile.loading ? (
              <Skeleton className="h-20" />
            ) : noProfile ? (
              <div>
                <p className="text-sm text-muted">Você ainda não preencheu seu Perfil de Match.</p>
                <Link href="/candidato/perfil-match" className={buttonClasses('primary', 'md', 'mt-4 w-full')}>
                  Preencher agora
                </Link>
              </div>
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <span className="font-display text-4xl font-bold tabular-nums">{Math.round(completion)}%</span>
                  <span className="text-sm text-muted">
                    {profile.data?.profile.completion.answeredFields}/{profile.data?.profile.completion.totalEligibleFields} campos
                  </span>
                </div>
                <Progress value={completion} className="mt-3" tone={completion >= 80 ? 'success' : completion >= 50 ? 'primary' : 'warning'} />
                <Link href="/candidato/perfil-match" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Revisar perfil <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </CardBody>
        </Card>

        {/* Engajamento — separado do Match (RN-038) */}
        <Card>
          <CardHeader title="Engajamento na formação" description="Informativo — não altera o Match técnico" />
          <CardBody>
            {engagement.loading ? (
              <Skeleton className="h-20" />
            ) : engagement.data?.engagement.status === 'available' ? (
              <>
                <span className="font-display text-4xl font-bold">{engagement.data.engagement.indicator.displayValue}</span>
                <p className="mt-1 text-sm text-muted">
                  {engagement.data.engagement.data?.challengesCompleted ?? 0} de {engagement.data.engagement.data?.totalChallenges ?? 0} desafios concluídos
                </p>
                <Link href="/candidato/engajamento" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Ver histórico <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted">Sem dados oficiais de engajamento disponíveis no momento.</p>
            )}
          </CardBody>
        </Card>

        {/* Pendências */}
        <Card>
          <CardHeader title="Aumente seu Match" description="Campos ainda não informados" />
          <CardBody>
            {ranking.data?.profileCompletion?.pendingFields?.length ? (
              <div className="flex flex-wrap gap-2">
                {ranking.data.profileCompletion.pendingFields.slice(0, 8).map((f) => (
                  <Badge key={f} tone="warning">
                    {fieldLabel(f)}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Nada pendente por aqui. 🎯</p>
            )}
          </CardBody>
        </Card>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Suas Top 3 vagas</h2>
            <p className="text-sm text-muted">Ordenadas pelo percentual de Match.</p>
          </div>
          <Link href="/candidato/vagas" className={buttonClasses('ghost', 'sm')}>
            Ver todas <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {noProfile ? (
          <Card>
            <EmptyState icon={Gauge} title="Preencha seu Perfil de Match" description="Sem ele não conseguimos calcular sua compatibilidade com as vagas." action={<Link href="/candidato/perfil-match" className={buttonClasses()}>Começar</Link>} />
          </Card>
        ) : ranking.loading || profile.loading ? (
          <div className="grid gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
        ) : ranking.error ? (
          <Alert tone="danger" title="Não foi possível carregar o ranking">{ranking.error.message}</Alert>
        ) : ranking.data?.recommendationStatus === 'insufficient_profile_completeness' ? (
          <Card>
            <EmptyState
              icon={UserRound}
              title="Perfil ainda incompleto para recomendações"
              description={`Complete pelo menos ${ranking.data.minimumProfileCompletionPercentage ?? 0}% do Perfil de Match para liberar o ranking.`}
              action={<Link href="/candidato/perfil-match" className={buttonClasses()}>Completar perfil</Link>}
            />
          </Card>
        ) : ranking.data?.items?.length ? (
          <div className="grid gap-4">
            {ranking.data.items.map((item, i) => (
              <VacancyCard key={item.vacancy._id} item={item} rank={i + 1} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon={Sparkles} title="Nenhuma vaga acima do Match mínimo" description="Novas vagas chegam com frequência. Enquanto isso, revise seu perfil." />
          </Card>
        )}
      </section>
    </>
  );
}
