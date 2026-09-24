'use client';

import { Activity, ExternalLink, FolderGit2, Lock } from 'lucide-react';
import { candidateService } from '@/lib/api/services';
import { useAsync } from '@/lib/use-async';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, Progress, Skeleton } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';

const REASONS: Record<string, string> = {
  student_link_missing: 'Sua conta ainda não está vinculada ao cadastro de aluno.',
  integration_not_configured: 'A integração com o sistema de engajamento ainda não foi configurada.',
  student_not_found: 'Não encontramos seu cadastro no sistema de engajamento.',
  authorized_data_absent: 'Não há dados autorizados para exibição.',
  origin_unavailable: 'O sistema de engajamento está indisponível no momento. Tente mais tarde.',
};

export default function EngagementPage() {
  const { data, error, loading } = useAsync(() => candidateService.engagement());
  const e = data?.engagement;
  const d = e?.data;
  const progress = d?.totalChallenges ? ((d.challengesCompleted ?? 0) / d.totalChallenges) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow="Engajamento"
        title="Sua jornada na formação"
        description="Dados oficiais, somente leitura. Apresentados separadamente e sem influenciar o Match técnico."
      />

      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : error ? (
        <Alert tone={error.status === 403 ? 'warning' : 'danger'} title="Engajamento indisponível">
          {error.status === 403 ? 'Disponível apenas para candidatos ativos e validados.' : error.message}
        </Alert>
      ) : e?.status !== 'available' ? (
        <Card>
          <EmptyState icon={Activity} title="Sem dados de engajamento" description={REASONS[e?.reason ?? ''] ?? 'Nenhum dado oficial disponível.'} />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Engajamento', e.indicator.displayValue],
              ['Turma', d?.cohort ?? '—'],
              ['Pontuação', d?.score?.toLocaleString('pt-BR') ?? '—'],
              ['Participação', d?.participation ?? '—'],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardBody>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
                  <p className="mt-2 truncate font-display text-2xl font-bold">{value}</p>
                </CardBody>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title="Desafios" action={<Badge tone="muted"><Lock className="h-3 w-3" /> Somente leitura</Badge>} />
            <CardBody>
              <div className="flex items-end justify-between text-sm">
                <span className="text-muted">Concluídos</span>
                <span className="font-semibold tabular-nums">{d?.challengesCompleted ?? 0} / {d?.totalChallenges ?? 0}</span>
              </div>
              <Progress value={progress} className="mt-2" tone="success" />
              {d?.history?.length ? (
                <ul className="mt-6 divide-y divide-border">
                  {d.history.map((h, i) => (
                    <li key={i} className="flex items-center justify-between gap-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{h.title}</p>
                        <p className="text-xs text-muted">{formatDate(h.occurredAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {h.status && <Badge tone="success">{h.status}</Badge>}
                        {h.score != null && <span className="w-14 text-right tabular-nums text-muted">{h.score} pts</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>

          {d?.projects?.length ? (
            <Card>
              <CardHeader title="Projetos" />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                {d.projects.map((p, i) => (
                  <div key={i} className="rounded-xl border border-border p-4">
                    <div className="flex items-start gap-3">
                      <FolderGit2 className="mt-0.5 h-5 w-5 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{p.name}</p>
                        {p.description && <p className="mt-0.5 text-sm text-muted">{p.description}</p>}
                        {p.url && (
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                            Ver projeto <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
          <p className="text-xs text-subtle">Atualizado em {formatDate(e.retrievedAt)}.</p>
        </div>
      )}
    </>
  );
}
