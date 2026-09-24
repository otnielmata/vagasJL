'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { BadgeCheck, Save } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { candidateService } from '@/lib/api/services';
import type { Candidate, CandidateInput } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { useAsync } from '@/lib/use-async';
import { useCandidateId } from '@/lib/use-links';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { CandidateStatusBadge } from '@/components/match/status-badges';

const EMPTY: CandidateInput = {
  name: '', email: '', phone: '', city: '', state: '', country: 'Brasil',
  linkedinUrl: '', githubUrl: '', portfolioUrl: '', photoUrl: '', professionalSummary: '', availability: 'UNKNOWN',
};

const TEXT_FIELDS = ['phone', 'city', 'state', 'country', 'linkedinUrl', 'githubUrl', 'portfolioUrl', 'photoUrl', 'professionalSummary'] as const;

/** Campos vazios viram null (a API distingue ausente/UNKNOWN de valor informado). */
function clean(form: CandidateInput): CandidateInput {
  const out: CandidateInput = { ...form };
  for (const k of TEXT_FIELDS) {
    const v = out[k]?.trim();
    (out as Record<string, unknown>)[k] = v ? v : null;
  }
  return out;
}

function toForm(c: Candidate): CandidateInput {
  const unk = (v?: string) => (v && v !== 'UNKNOWN' ? v : '');
  return {
    name: c.name, email: c.email, phone: unk(c.phone), city: unk(c.city), state: unk(c.state), country: unk(c.country),
    linkedinUrl: unk(c.linkedinUrl), githubUrl: unk(c.githubUrl), portfolioUrl: unk(c.portfolioUrl), photoUrl: unk(c.photoUrl),
    professionalSummary: unk(c.professionalSummary), availability: c.availability ?? 'UNKNOWN',
  };
}

export default function CandidateRegistrationPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [candidateId, setCandidateId] = useCandidateId();
  const current = useAsync(() => candidateService.get(candidateId!), [candidateId], !!candidateId);
  const [form, setForm] = useState<CandidateInput>(EMPTY);
  const [purchaseCode, setPurchaseCode] = useState('');
  const [error, setError] = useState<ApiError>();
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (current.data) setForm(toForm(current.data.candidate));
    else if (user && !candidateId) setForm((f) => ({ ...f, name: f.name || user.name, email: f.email || user.email }));
  }, [current.data, user, candidateId]);

  const set = (k: keyof CandidateInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const payload = clean(form);
      if (candidateId) {
        const res = await candidateService.update(candidateId, payload);
        current.setData(res);
      } else {
        const res = await candidateService.create({
          ...payload,
          name: form.name!,
          email: form.email!,
          ...(purchaseCode ? { purchaseCode } : {}),
        });
        setCandidateId(res.candidate._id);
      }
      toast('success', 'Dados profissionais salvos.');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { message: 'Erro inesperado' }));
    } finally {
      setSaving(false);
    }
  }

  async function validate() {
    if (!candidateId) return;
    setValidating(true);
    try {
      const res = await candidateService.validate(candidateId, purchaseCode ? { purchaseCode } : {});
      current.setData(res);
      toast(res.candidate.eligibility.status === 'approved' ? 'success' : 'danger',
        res.candidate.eligibility.status === 'approved' ? 'Elegibilidade confirmada!' : 'Não foi possível confirmar a elegibilidade.');
    } catch (err) {
      toast('danger', err instanceof ApiError ? err.message : 'Falha na validação');
    } finally {
      setValidating(false);
    }
  }

  const candidate = current.data?.candidate;

  return (
    <>
      <PageHeader
        eyebrow="Dados profissionais"
        title={candidateId ? 'Seu cadastro' : 'Criar cadastro de candidato'}
        description="Dados de contato e apresentação. Eles não entram no cálculo do Match — você controla o que as empresas veem em Privacidade."
      />

      {candidateId && current.loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <Card>
              <CardHeader title="Identificação" />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Input label="Nome completo" required value={form.name ?? ''} onChange={set('name')} error={error?.fieldError('name')} />
                <Input label="E-mail" type="email" required value={form.email ?? ''} onChange={set('email')} error={error?.fieldError('email')} />
                <Input label="Telefone" type="tel" value={form.phone ?? ''} onChange={set('phone')} error={error?.fieldError('phone')} />
                <Select label="Disponibilidade" value={form.availability ?? 'UNKNOWN'} onChange={set('availability')}>
                  <option value="UNKNOWN">Não informado</option>
                  <option value="available">Disponível</option>
                  <option value="unavailable">Indisponível</option>
                </Select>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Localização" description="Usada para vagas híbridas/presenciais com restrição geográfica." />
              <CardBody className="grid gap-4 sm:grid-cols-3">
                <Input label="Cidade" value={form.city ?? ''} onChange={set('city')} />
                <Input label="Estado" value={form.state ?? ''} onChange={set('state')} />
                <Input label="País" value={form.country ?? ''} onChange={set('country')} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Presença profissional" />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Input label="LinkedIn" type="url" placeholder="https://linkedin.com/in/..." value={form.linkedinUrl ?? ''} onChange={set('linkedinUrl')} error={error?.fieldError('linkedinUrl')} />
                <Input label="GitHub" type="url" placeholder="https://github.com/..." value={form.githubUrl ?? ''} onChange={set('githubUrl')} error={error?.fieldError('githubUrl')} />
                <Input label="Portfólio" type="url" value={form.portfolioUrl ?? ''} onChange={set('portfolioUrl')} error={error?.fieldError('portfolioUrl')} />
                <Input label="URL da foto" type="url" value={form.photoUrl ?? ''} onChange={set('photoUrl')} error={error?.fieldError('photoUrl')} />
                <Textarea wrapperClassName="sm:col-span-2" label="Apresentação profissional" maxLength={5000} value={form.professionalSummary ?? ''} onChange={set('professionalSummary')} hint="Até 5.000 caracteres." />
              </CardBody>
            </Card>

            {error && !error.errors?.length && <Alert tone="danger">{error.message}</Alert>}
            <div className="flex justify-end">
              <Button type="submit" size="lg" loading={saving} disabled={!form.name || !form.email}>
                <Save className="h-4 w-4" /> {candidateId ? 'Salvar alterações' : 'Criar cadastro'}
              </Button>
            </div>
          </form>

          <aside className="space-y-6">
            <Card>
              <CardHeader title="Validação como aluno" description="Apenas alunos autorizados da formação podem ser ativados." />
              <CardBody className="space-y-4">
                {candidate && (
                  <div className="flex flex-wrap items-center gap-2">
                    <CandidateStatusBadge value={candidate.status} />
                    {candidate.eligibility.status === 'approved' && (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <BadgeCheck className="h-4 w-4" /> Elegível
                      </span>
                    )}
                  </div>
                )}
                <Input label="Código da compra (opcional)" value={purchaseCode} onChange={(e) => setPurchaseCode(e.target.value)}
                  hint="Se o seu e-mail não for reconhecido, informe o código/hash da compra." />
                {candidateId && candidate?.eligibility.status !== 'approved' && (
                  <Button variant="outline" className="w-full" onClick={validate} loading={validating}>
                    Validar elegibilidade
                  </Button>
                )}
              </CardBody>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
