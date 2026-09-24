import { Check, CircleHelp, X } from 'lucide-react';
import type { MatchCriterionDetail } from '@/lib/api/types';
import { fieldLabel } from '@/config/match-catalog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const icon = {
  met: { Icon: Check, cls: 'bg-success-soft text-success' },
  gap: { Icon: X, cls: 'bg-danger-soft text-danger' },
  unknown: { Icon: CircleHelp, cls: 'bg-surface-3 text-muted' },
};

/** Lista explicavel de criterios (RN-034): o que atende e quais os gaps. */
export function CriteriaList({ items, empty }: { items: MatchCriterionDetail[]; empty: string }) {
  if (items.length === 0) return <p className="py-4 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((c) => {
        const { Icon, cls } = icon[c.status];
        const field = fieldLabel(c.field);
        return (
          <li key={`${c.field}-${c.id}`} className="flex items-center gap-3 py-3">
            <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', cls)}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.label}</p>
              {field !== c.label && <p className="truncate text-xs text-muted">{field}</p>}
            </div>
            <Badge tone={c.importance === 'required' ? 'accent' : 'muted'}>
              {c.importance === 'required' ? 'Obrigatório' : 'Desejável'}
            </Badge>
            <span className="w-14 text-right text-xs tabular-nums text-muted">
              {c.status === 'met' ? `+${c.earnedPoints ?? 0}` : c.status === 'gap' ? `−${c.lostPoints ?? 0}` : '—'} pts
            </span>
          </li>
        );
      })}
    </ul>
  );
}
