'use client';

import { useState } from 'react';
import { Trophy, Users } from 'lucide-react';
import { vacancyService } from '@/lib/api/services';
import { useAsync } from '@/lib/use-async';
import { initials } from '@/lib/utils';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, Progress, Skeleton } from '@/components/ui/feedback';
import { Segmented } from '@/components/ui/toggle';
import { MatchRing } from './match-ring';

/** Top candidatos para uma vaga (VJ-50/63). Mesmo motor do ranking do candidato. */
export function CandidateRanking({ vacancyId }: { vacancyId: string }) {
  const [limit, setLimit] = useState<3 | 5 | 10>(10);
  const { data, error, loading } = useAsync(() => vacancyService.candidateRanking(vacancyId, { limit }), [vacancyId, limit]);

  return (
    <Card>
      <CardHeader
        title="Top candidatos"
        description={data?.minimumMatchPercentage != null ? `Match mínimo: ${data.minimumMatchPercentage}% · ${data.total} candidatos` : 'Somente candidatos ativos e disponíveis.'}
        action={
          <Segmented ariaLabel="Quantidade" value={limit} onChange={setLimit}
            options={[{ value: 3, label: 'Top 3' }, { value: 5, label: 'Top 5' }, { value: 10, label: 'Top 10' }]} />
        }
        className="flex-col sm:flex-row"
      />
      <CardBody>
        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : error ? (
          <Alert tone={error.status === 403 ? 'warning' : 'danger'}>
            {error.status === 403 ? 'Sua empresa precisa estar ativa e a vaga deve pertencer a ela.' : error.status === 404 ? 'Vaga inexistente ou ainda não ativa.' : error.message}
          </Alert>
        ) : !data?.items.length ? (
          <EmptyState icon={Users} title="Nenhum candidato acima do Match mínimo" description="Revise a importância dos requisitos ou aguarde novos candidatos." />
        ) : (
          <ol className="divide-y divide-border">
            {data.items.map((item, i) => (
              <li key={item.candidate._id} className="flex items-center gap-4 py-3">
                <span className="w-6 text-center text-sm font-semibold text-muted">
                  {i < 3 ? <Trophy className="mx-auto h-4 w-4 text-warning" aria-label={`#${i + 1}`} /> : i + 1}
                </span>
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                  {initials(item.candidate.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.candidate.name}</p>
                  <p className="text-xs text-muted">{item.matchedRequiredCount} obrigatórios atendidos</p>
                  <Progress value={item.percentage} className="mt-1.5 h-1.5 max-w-xs sm:hidden" />
                </div>
                <MatchRing value={item.percentage} size={52} className="hidden sm:inline-grid" />
                <span className="font-display font-bold tabular-nums sm:hidden">{Math.round(item.percentage)}%</span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
