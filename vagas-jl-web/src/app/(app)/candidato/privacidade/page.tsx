'use client';

import { useState } from 'react';
import { Eye, Globe, Save } from 'lucide-react';
import { candidateService } from '@/lib/api/services';
import type { ContactDisplayField, FormationDisplayField } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
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

/**
 * A API expoe apenas PATCH para estes controles (sem GET do estado atual — ver docs/API-GAPS.md).
 * Por isso a tela parte de padroes seguros (RN-048: privacidade por padrao) e confirma o estado salvo.
 */
export default function PrivacyPage() {
  const toast = useToast();
  const [available, setAvailable] = useState(false);
  const [savingAvail, setSavingAvail] = useState(false);
  const [contact, setContact] = useState<string[]>([]);
  const [formation, setFormation] = useState<string[]>([]);
  const [savingPerm, setSavingPerm] = useState(false);
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [publicFields, setPublicFields] = useState<string[]>(['name', 'professionalSummary']);
  const [savingPublic, setSavingPublic] = useState(false);
  const [error, setError] = useState<string>();

  const run = async (fn: () => Promise<unknown>, setBusy: (v: boolean) => void, ok: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      toast('success', ok);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Privacidade" title="Você decide o que as empresas veem" description="Informações pessoais não são expostas publicamente por padrão." />
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}

      <div className="space-y-6">
        <Card>
          <CardHeader title="Disponível para oportunidades" description="Mesmo indisponível, você continua pesquisando vagas normalmente." />
          <CardBody>
            <Switch
              label={available ? 'Aparecendo nas buscas das empresas' : 'Oculto das buscas das empresas'}
              description="Somente candidatos ativos e disponíveis entram no ranking de candidatos das vagas."
              checked={available}
              disabled={savingAvail}
              onChange={(v) => {
                setAvailable(v);
                void run(() => candidateService.setAvailability(v), setSavingAvail, v ? 'Você está visível para empresas.' : 'Você ficou oculto para empresas.');
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="O que as empresas podem ver" description="Contato e dados da formação exibidos a recrutadores." action={<Eye className="h-5 w-5 text-muted" />} />
          <CardBody className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium">Contato</p>
              <ChipGroup ariaLabel="Contato visível" options={CONTACT} value={contact} onChange={setContact} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Formação</p>
              <ChipGroup ariaLabel="Formação visível" options={FORMATION} value={formation} onChange={setFormation} />
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                loading={savingPerm}
                onClick={() =>
                  run(
                    () => candidateService.setDisplayPermissions({ contact: contact as ContactDisplayField[], formation: formation as FormationDisplayField[] }),
                    setSavingPerm,
                    'Permissões de exibição atualizadas.',
                  )
                }
              >
                <Save className="h-4 w-4" /> Salvar permissões
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Perfil profissional público" description="Página pública opcional, publicada somente com o seu consentimento." action={<Globe className="h-5 w-5 text-muted" />} />
          <CardBody className="space-y-6">
            <Switch label="Publicar meu perfil" checked={publicEnabled} onChange={setPublicEnabled} />
            {publicEnabled && (
              <div>
                <p className="mb-2 text-sm font-medium">Campos exibidos</p>
                <ChipGroup ariaLabel="Campos públicos" options={PUBLIC_FIELDS} value={publicFields} onChange={setPublicFields} />
              </div>
            )}
            <div className="flex justify-end">
              <Button
                variant="outline"
                loading={savingPublic}
                onClick={() =>
                  run(
                    () => candidateService.setPublicProfile(publicEnabled ? { enabled: true, fields: publicFields } : { enabled: false }),
                    setSavingPublic,
                    publicEnabled ? 'Consentimento registrado.' : 'Perfil público revogado.',
                  )
                }
              >
                <Save className="h-4 w-4" /> {publicEnabled ? 'Registrar consentimento' : 'Salvar'}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
