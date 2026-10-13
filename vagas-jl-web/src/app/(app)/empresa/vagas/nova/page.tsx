'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { companyService } from '@/lib/api/services';
import type { Importance, MatchFieldKey, MatchValues, Vacancy, VacancyRequirement } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
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

const EMPTY_BASE = { reference: '', title: '', description: '', city: '', state: '', country: 'Brasil',
  channelType: 'https_url', channel: '', expiresAt: '' };

function initialBase(vacancy?: Vacancy) {
  if (!vacancy) return EMPTY_BASE;
  return {
    reference: vacancy.reference ?? '',
    title: vacancy.title ?? '',
    description: vacancy.description ?? '',
    city: vacancy.location?.city ?? '',
    state: vacancy.location?.state ?? '',
    country: vacancy.location?.country ?? '',
    channelType: vacancy.applicationChannel?.type ?? 'https_url',
    channel: vacancy.applicationChannel?.value ?? '',
    expiresAt: vacancy.expiresAt ? vacancy.expiresAt.slice(0, 10) : '',
  };
}

function initialRequirements(vacancy?: Vacancy): Partial<Record<MatchFieldKey, ReqState>> {
  if (!vacancy) return { type: { value: ['remote'], importance: 'required', eliminatory: false } };
  const result: Partial<Record<MatchFieldKey, ReqState>> = {};
  for (const def of MATCH_FIELDS) {
    const raw = vacancy.matchProfile.values?.[def.key];
    if (raw === undefined || raw === null) continue;
    const requirement = vacancy.matchProfile.requirements?.find((item) => item.field === def.key);
    result[def.key] = {
      value: def.kind === 'number' ? Number(raw) : Array.isArray(raw) ? raw.map(String) : [String(raw)],
      importance: requirement?.importance ?? 'required',
      eliminatory: requirement?.eliminatory === true,
    };
  }
  return result;
}

export function VacancyForm({ companyId, admin = false, vacancy }: {
  companyId?: string;
  admin?: boolean;
  vacancy?: Vacancy;
}) {
  const router = useRouter();
  const toast = useToast();
  const [base, setBase] = useState(() => initialBase(vacancy));
  const [reqs, setReqs] = useState<Partial<Record<MatchFieldKey, ReqState>>>(() => initialRequirements(vacancy));
  const [error, setError] = useState<ApiError>();
  const [saving, setSaving] = useState(false);

  const setB = (k: keyof typeof base) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setBase((b) => ({ ...b, [k]: e.target.value }));
  const setReq = (key: MatchFieldKey, patch: Partial<ReqState>) =>
    setReqs((r) => ({ ...r, [key]: { value: null, importance: 'required', eliminatory: false, ...r[key], ...patch } }));
  const setImportance = (key: MatchFieldKey, importance: Importance) =>
    setReq(key, { importance, ...(importance === 'indifferent' ? { eliminatory: false } : {}) });

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
      const input = {
        reference: base.reference.trim(),
        title: base.title.trim(),
        description: base.description.trim(),
        ...(base.channel.trim() ? { applicationChannel: { type: base.channelType as 'https_url' | 'email', value: base.channel.trim() } } : {}),
        ...(base.expiresAt ? { expiresAt: new Date(`${base.expiresAt}T23:59:59`).toISOString() } : {}),
        ...(Object.keys(location).length ? { location } : {}),
        matchProfile: buildMatchProfile(),
      };
      if (vacancy) await companyService.updateVacancy(companyId!, vacancy._id, input);
      else await companyService.createVacancy(companyId!, input);
      toast('success', vacancy
        ? 'Vaga atualizada e enviada novamente para aprovação.'
        : 'Vaga criada e enviada para revisão.');
      router.push(admin ? '/admin/vagas' : '/empresa/vagas');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { message: 'Erro inesperado' }));
    } finally {
      setSaving(false);
    }
  }

  const hasType = Array.isArray(reqs.type?.value) && reqs.type.value.length > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <PageHeader eyebrow={admin ? 'Recrutador' : 'Vaga da empresa'}
        title={vacancy ? 'Editar oportunidade' : 'Cadastrar oportunidade'}
        description="Use o mesmo Perfil de Match dos candidatos: selecione requisitos do catálogo e defina a importância de cada um." />

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
          {MATCH_FIELDS.map((def) => {
            const r = reqs[def.key];
            const selected = r && r.value !== null && !(Array.isArray(r.value) && r.value.length === 0);
            const requirement = r ?? { value: null, importance: 'required' as Importance, eliminatory: false };
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
                    <ChipGroup ariaLabel={def.label} multiple={def.kind === 'multi' && def.key !== 'type'} options={def.options ?? []}
                      value={(r?.value as string[] | null) ?? []} onChange={(v) => setReq(def.key, { value: v })} />
                  )}
                  <div className="flex flex-wrap items-center gap-4">
                    <Segmented ariaLabel={`Importância de ${def.label}`} options={IMPORTANCE}
                      value={requirement.importance} disabled={!selected}
                      onChange={(importance) => setImportance(def.key, importance)} />
                    <div className="w-56">
                      <Switch label="Eliminatório" checked={requirement.eliminatory}
                        disabled={!selected || requirement.importance === 'indifferent'}
                        onChange={(eliminatory) => setReq(def.key, { eliminatory })} />
                    </div>
                    {!selected && <span className="text-xs text-muted">Selecione um requisito para classificar.</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      {error && <Alert tone="danger" title="Não foi possível criar a vaga">{error.message}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={saving} disabled={!base.title || !base.reference || !base.description || !hasType}>
          <Send className="h-4 w-4" /> {vacancy ? 'Salvar e reenviar para aprovação' : 'Enviar vaga para revisão'}
        </Button>
      </div>
    </form>
  );
}

export default function NewVacancyPage() {
  return <CompanyGate>{(id) => <VacancyForm companyId={id} />}</CompanyGate>;
}
