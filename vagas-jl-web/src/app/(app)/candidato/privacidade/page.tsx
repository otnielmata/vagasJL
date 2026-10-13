'use client';

import { useState } from 'react';
import { Eye, Globe, Save } from 'lucide-react';
import { candidateService } from '@/lib/api/services';
import type { CandidatePrivacyState, ContactDisplayField, FormationDisplayField } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { ChipGroup, Switch } from '@/components/ui/toggle';
import { useToast } from '@/components/ui/toast';

const CONTACT: { id: ContactDisplayField; label: string }[] = [
  { id: 'email', label: 'E-mail' }, { id: 'phone', label: 'Telefone' }, { id: 'linkedinUrl', label: 'LinkedIn' },
  { id: 'githubUrl', label: 'GitHub' }, { id: 'portfolioUrl', label: 'Portfólio' },
];
const FORMATION: { id: FormationDisplayField; label: string }[] = [
  { id: 'engagementLevel', label: 'Nível de engajamento' }, { id: 'cohort', label: 'Turma' },
  { id: 'challengesCompleted', label: 'Desafios concluídos' }, { id: 'totalChallenges', label: 'Total de desafios' },
  { id: 'score', label: 'Pontuação' }, { id: 'participation', label: 'Participação' },
  { id: 'history', label: 'Histórico' }, { id: 'projects', label: 'Projetos' },
];
const PUBLIC_FIELDS = [
  { id: 'name', label: 'Nome' }, { id: 'photoUrl', label: 'Foto' }, { id: 'city', label: 'Cidade' },
  { id: 'professionalSummary', label: 'Apresentação' }, { id: 'linkedinUrl', label: 'LinkedIn' },
  { id: 'githubUrl', label: 'GitHub' }, { id: 'portfolioUrl', label: 'Portfólio' },
  { id: 'matchProfile.level', label: 'Senioridade' }, { id: 'matchProfile.testAutomationTechnologies', label: 'Ferramentas de automação' },
  { id: 'matchProfile.programmingLanguages', label: 'Linguagens' }, { id: 'formation.projects', label: 'Projetos da formação' },
];

function PrivacyForm({ initial }: { initial: CandidatePrivacyState }) {
  const toast = useToast();
  const [available, setAvailable] = useState(initial.availability.availableForOpportunities);
  const [savingAvail, setSavingAvail] = useState(false);
  const [contact, setContact] = useState<string[]>(initial.permissions.contact);
  const [formation, setFormation] = useState<string[]>(initial.permissions.formation);
  const [savingPerm, setSavingPerm] = useState(false);
  const [publicEnabled, setPublicEnabled] = useState(initial.publicProfile.enabled);
  const [publicFields, setPublicFields] = useState<string[]>(initial.publicProfile.fields.length
    ? initial.publicProfile.fields : ['name', 'professionalSummary']);
  const [savingPublic, setSavingPublic] = useState(false);
  const [error, setError] = useState<string>();

  async function saveAvailability(value: boolean) {
    setSavingAvail(true);
    setError(undefined);
    try {
      const response = await candidateService.setAvailability(value);
      setAvailable(response.availability.availableForOpportunities);
      toast('success', response.availability.availableForOpportunities
        ? 'Você está visível para empresas.' : 'Você ficou oculto para empresas.');
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : 'Não foi possível salvar.');
    } finally {
      setSavingAvail(false);
    }
  }

  async function savePermissions() {
    setSavingPerm(true);
    setError(undefined);
    try {
      const response = await candidateService.setDisplayPermissions({
        contact: contact as ContactDisplayField[], formation: formation as FormationDisplayField[],
      });
      setContact(response.permissions.contact);
      setFormation(response.permissions.formation);
      toast('success', 'Permissões de exibição atualizadas.');
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : 'Não foi possível salvar.');
    } finally {
      setSavingPerm(false);
    }
  }

  async function savePublicProfile() {
    setSavingPublic(true);
    setError(undefined);
    try {
      const response = await candidateService.setPublicProfile(publicEnabled
        ? { enabled: true, fields: publicFields } : { enabled: false });
      setPublicEnabled(response.publicProfile.enabled);
      if (response.publicProfile.enabled) setPublicFields(response.publicProfile.fields);
      toast('success', response.publicProfile.enabled ? 'Consentimento registrado.' : 'Perfil público revogado.');
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : 'Não foi possível salvar.');
    } finally {
      setSavingPublic(false);
    }
  }

  return <>
    {error && <Alert tone="danger" className="mb-6">{error}</Alert>}
    <div className="space-y-6">
      <Card>
        <CardHeader title="Disponível para oportunidades" description="Mesmo indisponível, você continua pesquisando vagas normalmente." />
        <CardBody>
          <Switch label={available ? 'Aparecendo nas buscas das empresas' : 'Oculto das buscas das empresas'}
            description="Somente candidatos ativos e disponíveis entram no ranking de candidatos das vagas."
            checked={available} disabled={savingAvail} onChange={(value) => void saveAvailability(value)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="O que as empresas podem ver" description="Contato e dados da formação exibidos a recrutadores."
          action={<Eye className="h-5 w-5 text-muted" />} />
        <CardBody className="space-y-6">
          <div><p className="mb-2 text-sm font-medium">Contato</p>
            <ChipGroup ariaLabel="Contato visível" options={CONTACT} value={contact} onChange={setContact} /></div>
          <div><p className="mb-2 text-sm font-medium">Formação</p>
            <ChipGroup ariaLabel="Formação visível" options={FORMATION} value={formation} onChange={setFormation} /></div>
          <div className="flex justify-end"><Button variant="outline" loading={savingPerm}
            onClick={() => void savePermissions()}><Save className="h-4 w-4" /> Salvar permissões</Button></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Perfil profissional público" description="Página pública opcional, publicada somente com o seu consentimento."
          action={<Globe className="h-5 w-5 text-muted" />} />
        <CardBody className="space-y-6">
          <Switch label="Publicar meu perfil" checked={publicEnabled} onChange={setPublicEnabled} />
          {publicEnabled && <div><p className="mb-2 text-sm font-medium">Campos exibidos</p>
            <ChipGroup ariaLabel="Campos públicos" options={PUBLIC_FIELDS} value={publicFields}
              onChange={setPublicFields} /></div>}
          <div className="flex justify-end"><Button variant="outline" loading={savingPublic}
            onClick={() => void savePublicProfile()}><Save className="h-4 w-4" />
            {publicEnabled ? 'Registrar consentimento' : 'Salvar'}</Button></div>
        </CardBody>
      </Card>
    </div>
  </>;
}

export default function PrivacyPage() {
  const privacy = useAsync(candidateService.getPrivacy, []);
  return (
    <>
      <PageHeader eyebrow="Privacidade" title="Você decide o que as empresas veem"
        description="Informações pessoais não são expostas publicamente por padrão." />
      {privacy.loading ? <Skeleton className="h-48" /> : privacy.error ? (
        <Alert tone="danger">{privacy.error.message}</Alert>
      ) : privacy.data ? <PrivacyForm initial={privacy.data} /> : null}
    </>
  );
}
