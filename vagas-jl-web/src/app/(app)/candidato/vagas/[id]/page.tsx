'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Info, Mail } from 'lucide-react';
import { candidateService } from '@/lib/api/services';
import type { ApplicationReferral } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { useAsync } from '@/lib/use-async';
import { formatDate } from '@/lib/utils';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { MatchRing } from '@/components/match/match-ring';
import { MatchResultBadge } from '@/components/match/status-badges';
import { CriteriaList } from '@/components/match/criteria-list';

export default function VacancyMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading } = useAsync(() => candidateService.matchDetail(id), [id]);
  const [applying, setApplying] = useState(false);
  const [referral, setReferral] = useState<ApplicationReferral>();
  const [applyError, setApplyError] = useState<string>();

  async function apply() {
    setApplying(true);
    setApplyError(undefined);
    try {
      const { application } = await candidateService.apply(id);
      setReferral(application);
      const href = application.channel.type === 'https_url' ? application.channel.url : application.channel.uri;
      window.open(href, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setApplyError(e instanceof ApiError ? e.message : 'Não foi possível abrir o canal da vaga.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <Link href="/candidato/vagas" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para vagas
      </Link>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : error ? (
        <Alert tone="danger" title="Não foi possível carregar o Match">{error.message}</Alert>
      ) : data ? (
        <div className="space-y-6">
          <Card>
            <CardBody className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <MatchRing value={data.percentage} size={112} label="Match técnico" />
              <div className="min-w-0 flex-1">
                <MatchResultBadge value={data.resultState} />
                <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">{data.vacancy.title}</h1>
                <p className="mt-1 text-sm text-muted">
                  {data.earnedPoints ?? 0} de {data.possiblePoints ?? 0} pontos possíveis
                  {data.minimumMatchPercentage != null && ` · mínimo para ranking: ${data.minimumMatchPercentage}%`}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <Button size="lg" onClick={apply} loading={applying}>
                  Candidatar-se <ExternalLink className="h-4 w-4" />
                </Button>
                <p className="text-xs text-subtle">Você será levado ao canal oficial da vaga.</p>
              </div>
            </CardBody>
          </Card>

          {data.resultState === 'ineligible' && (
            <Alert tone="danger" title="Não atende a um critério eliminatório">
              A vaga possui um requisito obrigatório eliminatório que não consta no seu perfil. Isso é diferente de uma compatibilidade baixa.
            </Alert>
          )}
          {data.resultState === 'not_calculable' && (
            <Alert tone="info" title="Compatibilidade não calculável">
              Não há critérios suficientes na vaga ou no seu perfil para calcular o Match.
            </Alert>
          )}
          {applyError && <Alert tone="danger">{applyError}</Alert>}
          {referral && (
            <Alert tone="success" title="Canal oficial aberto em nova aba">
              Conclua a candidatura no site da empresa — o encaminhamento não confirma a candidatura.{' '}
              {referral.channel.type === 'email' ? (
                <a className="inline-flex items-center gap-1 font-medium underline" href={referral.channel.uri}>
                  <Mail className="h-3.5 w-3.5" /> {referral.channel.address}
                </a>
              ) : (
                <a className="font-medium underline" href={referral.channel.url} target="_blank" rel="noopener noreferrer">
                  Abrir novamente
                </a>
              )}
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title={`Critérios atendidos (${data.metCriteria.length})`} description="O que você já tem e a vaga pede" />
              <CardBody className="pt-2 sm:pt-2">
                <CriteriaList items={data.metCriteria} empty="Nenhum critério atendido ainda." />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={`Pontos de atenção (${data.gaps.length})`} description="Gaps ordenados pelo impacto no Match" />
              <CardBody className="pt-2 sm:pt-2">
                <CriteriaList items={data.gaps} empty="Nenhum gap — você atende a todos os critérios avaliados." />
              </CardBody>
            </Card>
          </div>

          <p className="flex items-center gap-2 text-xs text-subtle">
            <Info className="h-3.5 w-3.5" /> Calculado em {formatDate(data.audit.calculatedAt)} · algoritmo {data.audit.algorithmVersion} · catálogo v
            {data.configurationVersion}. Competências extras não reduzem o Match.
          </p>
        </div>
      ) : null}
    </>
  );
}
