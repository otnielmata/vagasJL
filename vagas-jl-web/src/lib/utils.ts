import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`;
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function initials(name?: string) {
  return (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/** Faixa visual do percentual de Match. */
export function matchTone(pct: number | null | undefined): 'success' | 'primary' | 'warning' | 'danger' | 'muted' {
  if (pct === null || pct === undefined) return 'muted';
  if (pct >= 85) return 'success';
  if (pct >= 70) return 'primary';
  if (pct >= 50) return 'warning';
  return 'danger';
}
