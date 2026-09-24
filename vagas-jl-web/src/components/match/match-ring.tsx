import { cn, formatPercent, matchTone } from '@/lib/utils';

const strokeByTone = {
  success: 'stroke-success',
  primary: 'stroke-primary',
  warning: 'stroke-warning',
  danger: 'stroke-danger',
  muted: 'stroke-subtle',
};
const textByTone = {
  success: 'text-success',
  primary: 'text-primary',
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-muted',
};

/** Indicador circular do Match tecnico. */
export function MatchRing({ value, size = 72, label = 'Match', className }: { value: number | null; size?: number; label?: string; className?: string }) {
  const tone = matchTone(value);
  const stroke = size >= 100 ? 8 : 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={cn('relative inline-grid shrink-0 place-items-center', className)} style={{ width: size, height: size }} role="img" aria-label={`${label}: ${formatPercent(value)}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-surface-3" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          className={cn('fill-none transition-[stroke-dashoffset] duration-700', strokeByTone[tone])}
        />
      </svg>
      <span className={cn('absolute font-display font-bold tabular-nums', textByTone[tone], size >= 100 ? 'text-2xl' : size >= 64 ? 'text-base' : 'text-xs')}>
        {value === null ? '—' : `${Math.round(value)}%`}
      </span>
    </div>
  );
}
