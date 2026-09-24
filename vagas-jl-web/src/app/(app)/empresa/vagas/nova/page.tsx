'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { companyService } from '@/lib/api/services';
import type { Importance, MatchFieldKey, MatchValues, VacancyRequirement } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { useCompanyVacancies } from '@/lib/use-links';
import { MATCH_FIELDS } from '@/config/match-catalog';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/field';
import { ChipGroup, Segmented, Switch } from '@/components/ui/toggle';
import { useToast } from '@/components/ui/toast';
import { CompanyGate } from '@/components/company/company-gate';

interface ReqState {
  value: string[] | number | boolean | null;
  importance: Importance;
  eliminatory: boolean;
}

const IMPORTANCE: { value: Importance; label: string }[] = [
  { value: 'required', label: 'Obrigatório' },
  { value: 'desirable', label: 'Desejável' },
  { value: 'indifferent', label: 'Indiferente' },
];

function NewVacancyForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [, addVacancy] = useCompanyVacancies();
  const [base, setBase] = useState({ reference: '', title: '', description: '', city: '', state: '', country: 'Brasil', channelType: 'https_url', channel: '', expiresAt: '' });
  const [reqs, setReqs] = useState<Partial<Record<MatchFieldKey, ReqState>>>({
    type: { value: ['remote'], importance: 'required', eliminatory: false },
  });
  const [error, setError] = useState<ApiError>();
  const [saving, setSaving] = useState(false);

  const setB = (k: keyof typeof base) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setBase((b) => ({ ...b, [k]: e.target.value }));
  const setReq = (key: MatchFieldKey, patch: Partial<ReqState>) =>
    setReqs((r) => ({ ...r, [key]: { value: null, importance: 'required', eliminatory: false, ...r[key], ...patch } }));

  function buildMatchProfile() {
    const values: MatchValues = {};
    const requirements: VacancyRequirement[] = [];
    for (const def of MATCH_FIELDS) {
      const r = reqs[def.key];
      if (!r || r.value === null || (Array.isArray(r.value) && r.value.length === 0)) continue;
      values[def.key] = r.value as MatchValues[MatchFieldKey];
      if (def.kind === 'number') {
        requirements.push({ field: def.key, value: r.value as number, importance: r.importance, eliminatory: r.eliminatory });
      } else if (Array.isArray(r.value)) {
        r.value.forEach((id) => requirements.push({ field: def.key, id, importance: r.importance, eliminatory: r.eliminatory }));
      }
    }
    return { values, requirements };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const location = Object.fromEntries(
        (['city', 'state', 'country'] as const).filter((k) => base[k].trim()).map((k) => [k, base[k].trim()]),
      );
      const { vacancy } = await companyService.createVacancy(companyId, {
        reference: base.reference.trim(),
        title: base.title.trim(),
        description: base.description.trim(),
        ...(base.channel.trim() ? { applicationChannel: { type: base.channelType as 'https_url' | 'email', value: base.channel.trim() } } : {}),
        ...(base.expiresAt ? { expiresAt: new Date(`${base.expiresAt}T23:59:59`).toISOString() } : {}),
        ...(Object.keys(location).length ? { location } : {}),
        matchProfile: buildMatchProfile(),
      });
      addVacancy({ _id: vacancy._id, title: vacancy.title, reference: vacancy.reference, createdAt: vacancy.createdAt ?? new Date().toISOString() });
      toast('success', 'Vaga criada e enviada para revisão.');
      router.push('/empresa');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { message: 'Erro inesperado' }));
    } finally {
      setSaving(false);
    }
  }

  const hasType = Array.isArray(reqs.type?.value) && reqs.type.value.length > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <PageHeader eyebrow="Nova vaga" title="Cadastrar oportunidade" description="Use o mesmo Perfil de Match dos candidatos: selecione requisitos do catálogo e defina a importância de cada um." />

      <Card>
        <CardHeader title="Dados da vaga" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Input label="Título" required maxLength={200} value={base.title} onChange={setB('title')} error={error?.fieldError('title')} />
          <Input label="Código de referência" required maxLength={100} placeholder="QA-2026-001" value={base.reference} onChange={setB('reference')}
            hint="Letras, números, ponto, hífen ou underline." error={error?.fieldError('reference')} />
          <Textarea wrapperClassName="sm:col-span-2" label="Descrição" required value={base.description} onChange={setB('description')} error={error?.fieldError('description')} />
          <Input label="Cidade" value={base.city} onChange={setB('city')} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Estado" value={base.state} onChange={setB('state')} />
            <Input label="País" value={base.country} onChange={setB('country')} />
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <Select label="Canal" value={base.channelType} onChange={setB('channelType')}>
              <option value="https_url">URL</option>
              <option value="email">E-mail</option>
            </Select>
            <Input label="Candidatura em" placeholder={base.channelType === 'email' ? 'vagas@empresa.com' : 'https://...'} value={base.channel} onChange={setB('channel')} />
          </div>
          <Input label="Prazo (opcional)" type="date" value={base.expiresAt} onChange={setB('expiresAt')} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Perfil de Match da vaga" description="Obrigatório participa integralmente; desejável com impacto reduzido; indiferente não pontua. Eliminatório torna o candidato inelegível se não atender." />
        <CardBody className="divide-y divide-border">
          {MATCH_FIELDS.filter((d) => d.kind !== 'boolean').map((def) => {
            const r = reqs[def.key];
            const selected = r && r.value !== null && !(Array.isArray(r.value) && r.value.length === 0);
            return (
              <div key={def.key} className="grid gap-3 py-5 first:pt-0 last:pb-0 lg:grid-cols-[200px_1fr]">
                <div>
                  <p className="text-sm font-medium">
                    {def.label} {def.key === 'type' && <span className="text-danger">*</span>}
                  </p>
                  <p className="text-xs text-muted">Peso base {def.weight}</p>
                </div>
                <div className="space-y-3">
                  {def.kind === 'number' ? (
                    <Input aria-label={def.label} type="number" min={0} max={100} step={0.5} wrapperClassName="w-40" placeholder="Mínimo"
                      value={typeof r?.value === 'number' ? r.value : ''} onChange={(e) => setReq(def.key, { value: e.target.value === '' ? null : Number(e.target.value) })} />
                  ) : (
                    <ChipGroup ariaLabel={def.label} multiple={def.kind === 'multi'} options={def.options ?? []}
                      value={(r?.value as string[] | null) ?? []} onChange={(v) => setReq(def.key, { value: v })} />
                  )}
                  {selected && (
                    <div className="flex flex-wrap items-center gap-4">
                      <Segmented ariaLabel={`Importância de ${def.label}`} options={IMPORTANCE} value={r!.importance} onChange={(v) => setReq(def.key, { importance: v })} />
                      {r!.importance === 'required' && (
                        <div className="w-56">
                          <Switch label="Eliminatório" checked={r!.eliminatory} onChange={(v) => setReq(def.key, { eliminatory: v })} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Práticas exigidas" description="Marque apenas o que a vaga realmente pede — ausência significa “não aplicável”, não “compatível”." />
        <CardBody>
          <ChipGroup
            ariaLabel="Práticas exigidas"
            options={MATCH_FIELDS.filter((d) => d.kind === 'boolean').map((d) => ({ id: d.key, label: d.label }))}
            value={MATCH_FIELDS.filter((d) => d.kind === 'boolean' && reqs[d.key]?.value === true).map((d) => d.key)}
            onChange={(ids) =>
              MATCH_FIELDS.filter((d) => d.kind === 'boolean').forEach((d) => setReq(d.key, { value: ids.includes(d.key) ? true : null }))
            }
          />
        </CardBody>
      </Card>

      {error && <Alert tone="danger" title="Não foi possível criar a vaga">{error.message}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={saving} disabled={!base.title || !base.reference || !base.description || !hasType}>
          <Send className="h-4 w-4" /> Enviar vaga para revisão
        </Button>
      </div>
    </form>
  );
}

export default function NewVacancyPage() {
  return <CompanyGate>{(id) => <NewVacancyForm companyId={id} />}</CompanyGate>;
}
