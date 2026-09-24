'use client';

import { cn } from '@/lib/utils';

/** Switch acessivel (role=switch). */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4', disabled && 'cursor-not-allowed opacity-60')}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-surface-3 border border-border',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  );
}

/** Chips multi/single-select para opcoes de catalogo (RN-007: catalogo em vez de texto livre). */
export function ChipGroup({
  options,
  value,
  onChange,
  multiple = true,
  ariaLabel,
}: {
  options: { id: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  multiple?: boolean;
  ariaLabel: string;
}) {
  const toggle = (id: string) => {
    if (!multiple) return onChange(value[0] === id ? [] : [id]);
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(o.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              active
                ? 'border-primary bg-primary-soft font-medium text-primary'
                : 'border-border bg-surface text-muted hover:border-border-strong hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Seletor Sim / Não / Não informado — distingue UNKNOWN de FALSE (RN-044). */
export function TriState({
  value,
  onChange,
  ariaLabel,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  ariaLabel: string;
}) {
  const opts: { v: boolean | null; label: string }[] = [
    { v: true, label: 'Sim' },
    { v: false, label: 'Não' },
    { v: null, label: 'Não informado' },
  ];
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-xl border border-border bg-surface-2 p-0.5">
      {opts.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors',
            value === o.v ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Controle segmentado (ex.: Top 3 / 5 / 10). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-xl border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[10px] px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
