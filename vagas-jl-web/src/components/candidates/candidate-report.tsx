'use client';

import Link from 'next/link';
import { ArrowLeft, BriefcaseBusiness, ExternalLink, Mail, MapPin, Phone, UserRound } from 'lucide-react';
import { vacancyService } from '@/lib/api/services';
import { useAsync } from '@/lib/use-async';
import { initials, formatDate } from '@/lib/utils';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { MatchRing } from '@/components/match/match-ring';
import { CriteriaList } from '@/components/match/criteria-list';

function ExternalField({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
    {children}<ExternalLink className="h-3.5 w-3.5" />
  </a>;
}

function Formation({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined && value !== null &&
    !Array.isArray(value) && typeof value !== 'object');
  const history = Array.isArray(data.history) ? data.history as Record<string, unknown>[] : [];
  const projects = Array.isArray(data.projects) ? data.projects as Record<string, unknown>[] : [];
  if (!entries.length && !history.length && !projects.length) {
    return <p className="text-sm text-muted">Nenhum dado da formação foi autorizado.</p>;
  }
  const labels: Record<string, string> = { engagementLevel: 'Engajamento', cohort: 'Turma',
    challengesCompleted: 'Desafios concluídos', totalChallenges: 'Total de desafios', score: 'Pontuação',
    participation: 'Participação' };
  return <div className="space-y-6">
    <dl className="grid gap-4 sm:grid-cols-2">{entries.map(([key, value]) => <div key={key}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{labels[key] ?? key}</dt>
      <dd className="mt-1 text-sm font-medium">{String(value)}</dd>
    </div>)}</dl>
    {history.length > 0 && <div><h3 className="text-sm font-semibold">Histórico</h3>
      <ul className="mt-2 divide-y divide-border">{history.map((item, index) => <li key={index} className="py-2 text-sm">
        <p className="font-medium">{String(item.title || item.type || 'Atividade')}</p>
        <p className="text-xs text-muted">{[item.status, item.occurredAt && formatDate(String(item.occurredAt)),
          item.score !== undefined && `${item.score} pontos`].filter(Boolean).join(' · ')}</p>
      </li>)}</ul></div>}
    {projects.length > 0 && <div><h3 className="text-sm font-semibold">Projetos</h3>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2">{projects.map((item, index) => <li key={index} className="rounded-xl border border-border p-3 text-sm">
        <p className="font-medium">{String(item.name || 'Projeto')}</p>
        {Boolean(item.description) && <p className="mt-1 text-xs text-muted">{String(item.description)}</p>}
        {Boolean(item.url) && <div className="mt-2"><ExternalField href={String(item.url)}>Abrir projeto</ExternalField></div>}
      </li>)}</ul></div>}
  </div>;
}

export function CandidateReport({ vacancyId, candidateId, backHref }: {
  vacancyId: string; candidateId: string; backHref: string;
}) {
  const { data, error, loading } = useAsync(
    () => vacancyService.candidateReport(vacancyId, candidateId), [vacancyId, candidateId],
  );

  return <>
    <Link href={`${backHref}?vaga=${vacancyId}`}
      className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Voltar para o ranking
    </Link>
    {loading ? <div className="space-y-6"><Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" /></div> : error ?
      <Alert tone="danger" title="Não foi possível abrir o relatório">{error.message}</Alert> : data ?
      <div className="space-y-6">
        <Card><CardBody className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft bg-cover bg-center text-xl font-bold text-accent"
            role={data.candidate.photoUrl ? 'img' : undefined}
            aria-label={data.candidate.photoUrl ? `Foto de ${data.candidate.name}` : undefined}
            style={data.candidate.photoUrl ? { backgroundImage: `url(${JSON.stringify(data.candidate.photoUrl)})` } : undefined}>
            {!data.candidate.photoUrl && initials(data.candidate.name)}
          </div>
          <div className="min-w-0 flex-1">
            <Badge tone="success">Disponível para oportunidades</Badge>
            <h1 className="mt-2 font-display text-2xl font-bold">{data.candidate.name}</h1>
            <p className="mt-1 text-sm text-muted">Relatório para {data.vacancy.title} · Perfil {data.profile.completionPercentage}% completo</p>
            {(data.candidate.city || data.candidate.state || data.candidate.country) &&
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted"><MapPin className="h-4 w-4" />
                {[data.candidate.city, data.candidate.state, data.candidate.country].filter(Boolean).join(' · ')}</p>}
          </div>
          <MatchRing value={data.match.percentage} size={104} label="Match técnico" />
        </CardBody></Card>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <Card><CardHeader title="Resumo profissional" description="Informações liberadas pelo candidato" />
            <CardBody className="space-y-5">
              <p className="whitespace-pre-line text-sm leading-6 text-muted">
                {data.candidate.professionalSummary || 'O candidato não informou uma apresentação profissional.'}
              </p>
              <div className="flex flex-wrap gap-3">
                {data.candidate.email && <a href={`mailto:${data.candidate.email}`} className={buttonClasses('outline', 'sm')}>
                  <Mail className="h-4 w-4" />{data.candidate.email}</a>}
                {data.candidate.phone && <a href={`tel:${data.candidate.phone}`} className={buttonClasses('outline', 'sm')}>
                  <Phone className="h-4 w-4" />{data.candidate.phone}</a>}
                {data.candidate.linkedinUrl && <ExternalField href={data.candidate.linkedinUrl}>LinkedIn</ExternalField>}
                {data.candidate.githubUrl && <ExternalField href={data.candidate.githubUrl}>GitHub</ExternalField>}
                {data.candidate.portfolioUrl && <ExternalField href={data.candidate.portfolioUrl}>Portfólio</ExternalField>}
              </div>
            </CardBody>
          </Card>
          <Card><CardHeader title="Resumo do Match" description={`${data.match.earnedPoints} de ${data.match.possiblePoints} pontos possíveis`} />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="flex items-center gap-3"><BriefcaseBusiness className="h-5 w-5 text-primary" />
                <div><p className="text-xs text-muted">Obrigatórios atendidos</p><p className="font-semibold">{data.match.matchedRequiredCount}</p></div></div>
              <div className="flex items-center gap-3"><UserRound className="h-5 w-5 text-primary" />
                <div><p className="text-xs text-muted">Última atualização</p><p className="font-semibold">{formatDate(data.profile.updatedAt)}</p></div></div>
            </CardBody>
          </Card>
        </div>

        <Card><CardHeader title="Perfil técnico" description="Competências estruturadas informadas pelo candidato" />
          <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.profile.fields.map((field) => <div key={field.field}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{field.label}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {field.value !== null ? <Badge tone="accent">{field.value} ano(s)</Badge> :
                  field.options.map((option) => <Badge key={option.id} tone="neutral">{option.label}</Badge>)}
              </div>
            </div>)}
          </CardBody>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader title={`Compatibilidades (${data.match.metCriteria.length})`} description="Critérios da vaga atendidos" />
            <CardBody className="pt-2 sm:pt-2"><CriteriaList items={data.match.metCriteria} empty="Nenhum critério atendido." /></CardBody></Card>
          <Card><CardHeader title={`Gaps (${data.match.gaps.length})`} description="Pontos de atenção para esta vaga" />
            <CardBody className="pt-2 sm:pt-2"><CriteriaList items={data.match.gaps} empty="Nenhum gap identificado." /></CardBody></Card>
        </div>

        {data.match.unknownCriteria.length > 0 && <Card>
          <CardHeader title={`Dados não informados (${data.match.unknownCriteria.length})`}
            description="Critérios aplicáveis à vaga que ainda não foram respondidos no perfil" />
          <CardBody className="pt-2 sm:pt-2"><CriteriaList items={data.match.unknownCriteria}
            empty="Todos os critérios aplicáveis foram informados." /></CardBody>
        </Card>}

        {data.candidate.formation && <Card><CardHeader title="Dados da formação" description="Dados oficiais autorizados pelo candidato" />
          <CardBody><Formation data={data.candidate.formation as Record<string, unknown>} /></CardBody></Card>}
        <p className="text-xs text-subtle">Este relatório respeita as permissões de contato e formação definidas pelo candidato.</p>
      </div> : null}
  </>;
}
