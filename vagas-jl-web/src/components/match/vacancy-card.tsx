import Link from 'next/link';
import { ArrowUpRight, MapPin, Trophy } from 'lucide-react';
import type { VacancyRankingItem } from '@/lib/api/types';
import { optionLabel } from '@/config/match-catalog';
import { Badge } from '@/components/ui/badge';
import { MatchRing } from './match-ring';
import { OriginBadge } from './status-badges';

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return [v];
  return [];
}

export function VacancyCard({ item, rank }: { item: VacancyRankingItem; rank: number }) {
  const { vacancy } = item;
  const values = vacancy.matchProfile?.values ?? {};
  const modality = asArray(values.type).map((id) => optionLabel('type', id));
  const level = asArray(values.level).map((id) => optionLabel('level', id));
  const tools = asArray(values.testAutomationTechnologies).slice(0, 4).map((id) => optionLabel('testAutomationTechnologies', id));
  const location = [vacancy.location?.city, vacancy.location?.state].filter(Boolean).join(', ');

  return (
    <Link
      href={`/candidato/vagas/${vacancy._id}`}
      className="group flex gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop sm:p-5"
    >
      <MatchRing value={item.percentage} size={64} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted">
              {rank <= 3 && <Trophy className="h-3.5 w-3.5 text-warning" aria-hidden />}
              <span>#{rank}</span>
              <OriginBadge value={vacancy.origin} />
            </div>
            <h3 className="truncate font-display text-base font-semibold group-hover:text-primary">{vacancy.title}</h3>
          </div>
          <ArrowUpRight className="h-5 w-5 shrink-0 text-subtle transition-colors group-hover:text-primary" aria-hidden />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {location}
            </span>
          )}
          {[...modality, ...level].map((l) => (
            <span key={l}>· {l}</span>
          ))}
        </div>
        {tools.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tools.map((t) => (
              <Badge key={t} tone="muted">
                {t}
              </Badge>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted">{item.matchedRequiredCount} requisitos obrigatórios atendidos</p>
      </div>
    </Link>
  );
}
