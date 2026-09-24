'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { candidateService } from '@/lib/api/services';
import type { CandidateMatchProfile, MatchFieldKey, MatchValues } from '@/lib/api/types';
import { useAsync } from '@/lib/use-async';
import { MATCH_FIELDS, MATCH_GROUPS, type MatchFieldDef } from '@/config/match-catalog';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Progress, Skeleton } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { ChipGroup, TriState } from '@/components/ui/toggle';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/client';

/** Estado do formulario: undefined/null = nao informado (UNKNOWN), distinto de false (RN-044). */
type FormState = Partial<Record<MatchFieldKey, boolean | number | string[] | null>>;

function fromProfile(profile: CandidateMatchProfile | undefined): FormState {
  const out: FormState = {};
  if (!profile) return out;
  for (const def of MATCH_FIELDS) {
    const answer = profile.answers?.[def.key];
    const raw = profile.values?.[def.key];
    if (answer?.state === 'UNKNOWN' || (answer === undefined && (raw === undefined || raw === null))) continue;
    const value = answer?.value ?? raw;
    if (def.kind === 'boolean') out[def.key] = Array.isArray(value) ? value.length > 0 : Boolean(value);
    else if (def.kind === 'number') out[def.key] = typeof value === 'number' ? value : null;
    else out[def.key] = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? [value] : [];
  }
  return out;
}

function toPayload(form: FormState, initial: FormState, isUpdate: boolean): MatchValues {
  const values: MatchValues = {};
  for (const def of MATCH_FIELDS) {
    const v = form[def.key];
    const answered = v !== undefined && v !== null;
    if (isUpdate && JSON.stringify(v ?? null) === JSON.stringify(initial[def.key] ?? null)) continue;
    if (!answered) {
      if (isUpdate) values[def.key] = null; // remove resposta -> volta a UNKNOWN
      continue;
    }
    values[def.key] = def.kind === 'single' ? ((v as string[])[0] ?? null) : (v as MatchValues[MatchFieldKey]);
  }
  return values;
}

export default function MatchProfilePage() {
  const toast = useToast();
  const { data, error, loading, setData } = useAsync(() => candidateService.getMatchProfile());
  const exists = !!data?.profile;
  const initial = useMemo(() => fromProfile(data?.profile), [data]);
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setForm(initial), [initial]);

  const answered = MATCH_FIELDS.filter((f) => form[f.key] !== undefined && form[f.key] !== null).length;
  const pct = Math.round((answered / MATCH_FIELDS.length) * 100);
  const set = (key: MatchFieldKey, v: FormState[MatchFieldKey]) => setForm((f) => ({ ...f, [key]: v }));

  async function save() {
    setSaving(true);
    setSaveError(undefined);
    try {
      const values = toPayload(form, initial, exists);
      if (Object.keys(values).length === 0) {
        toast('success', 'Nada para salvar — o perfil já está atualizado.');
        return;
      }
      const res = exists ? await candidateService.updateMatchProfile(values) : await candidateService.createMatchProfile(values);
      setData(res);
      toast('success', 'Perfil de Match salvo. Seus Matches serão recalculados.');
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const renderControl = (def: MatchFieldDef) => {
    const v = form[def.key];
    switch (def.kind) {
      case 'boolean':
        return <TriState ariaLabel={def.label} value={(v as boolean | null | undefined) ?? null} onChange={(x) => set(def.key, x)} />;
      case 'number':
        return (
          <Input
            aria-label={def.label}
            type="number"
            min={0}
            max={100}
            step={0.5}
            inputMode="decimal"
            placeholder="Não informado"
            value={typeof v === 'number' ? v : ''}
            onChange={(e) => set(def.key, e.target.value === '' ? null : Number(e.target.value))}
            wrapperClassName="w-40"
          />
        );
      default:
        return (
          <ChipGroup
            ariaLabel={def.label}
            multiple={def.kind === 'multi'}
            options={def.options ?? []}
            value={(v as string[] | null | undefined) ?? []}
            onChange={(x) => set(def.key, x.length ? x : null)}
          />
        );
    }
  };

  const groups = Object.entries(MATCH_GROUPS) as [MatchFieldDef['group'], (typeof MATCH_GROUPS)[MatchFieldDef['group']]][];

  return (
    <>
      <PageHeader
        eyebrow="Perfil de Match"
        title="Suas competências"
        description="Selecione a partir do catálogo padronizado — é isso que o motor compara com os requisitos das vagas. “Não informado” é diferente de “Não”."
        actions={
          <Button onClick={save} loading={saving} disabled={loading && !error}>
            <Save className="h-4 w-4" /> Salvar perfil
          </Button>
        }
      />

      {error && error.status !== 404 && <Alert tone="danger" className="mb-6" title="Erro ao carregar">{error.message}</Alert>}
      {error?.status === 404 && (
        <Alert tone="info" className="mb-6" title="Primeiro preenchimento">
          Responda o que souber — você pode completar depois. Quanto mais completo, mais preciso o Match.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          {loading && !error ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)
          ) : (
            groups.map(([group, meta]) => (
              <Card key={group}>
                <CardHeader title={meta.title} description={meta.description} />
                <CardBody className="divide-y divide-border">
                  {MATCH_FIELDS.filter((f) => f.group === group).map((def) => (
                    <div key={def.key} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 sm:max-w-[40%]">
                        <p className="text-sm font-medium">{def.label}</p>
                        {def.hint && <p className="text-xs text-muted">{def.hint}</p>}
                      </div>
                      <div className="sm:flex sm:justify-end">{renderControl(def)}</div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            ))
          )}
          {saveError && <Alert tone="danger">{saveError}</Alert>}
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Card>
            <CardBody>
              <p className="text-sm font-medium">Completude</p>
              <p className="mt-2 font-display text-4xl font-bold tabular-nums">{pct}%</p>
              <Progress value={pct} className="mt-3" tone={pct >= 80 ? 'success' : pct >= 50 ? 'primary' : 'warning'} />
              <p className="mt-3 text-xs text-muted">
                {answered} de {MATCH_FIELDS.length} campos respondidos. A plataforma pode exigir uma completude mínima para gerar recomendações.
              </p>
              {data?.profile && (
                <p className="mt-4 border-t border-border pt-4 text-xs text-subtle">
                  Revisão {data.profile.revision} · catálogo v{data.profile.configurationVersion}
                </p>
              )}
              <Button onClick={save} loading={saving} className="mt-4 w-full lg:hidden">
                Salvar perfil
              </Button>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
