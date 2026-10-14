'use client';

import { useMemo, useState } from 'react';
import { masterService } from '@/lib/api/services';
import { ApiError } from '@/lib/api/client';
import { MATCH_FIELDS } from '@/config/match-catalog';
import type { MatchEngineConfiguration, MatchFieldKey } from '@/lib/api/types';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';

const INITIAL_WEIGHTS = Object.fromEntries(
  MATCH_FIELDS.map((field) => [field.key, field.weight]),
) as Record<MatchFieldKey, number>;

function MatchSettingsForm({ configuration, onPublished }: {
  configuration: MatchEngineConfiguration | null;
  onPublished: () => Promise<void>;
}) {
  const toast = useToast();
  const [minimumMatch, setMinimumMatch] = useState(configuration?.minimumMatchPercentage ?? 60);
  const [minimumCompletion, setMinimumCompletion] = useState(
    configuration?.minimumProfileCompletionPercentage ?? 50,
  );
  const [desirable, setDesirable] = useState(configuration?.multipliers.desirable ?? 0.5);
  const [weights, setWeights] = useState(configuration?.weights ?? INITIAL_WEIGHTS);
  const [busy, setBusy] = useState(false);

  const valid = useMemo(() => [minimumMatch, minimumCompletion].every((value) =>
    Number.isFinite(value) && value >= 0 && value <= 100) && desirable > 0 && desirable < 1 &&
    Object.values(weights).every((value) => Number.isFinite(value) && value >= 0 && value <= 1000),
  [minimumMatch, minimumCompletion, desirable, weights]);

  async function publish() {
    setBusy(true);
    try {
      const revision = (configuration?.revision ?? 0) + 1;
      await masterService.publishMatchConfiguration(`MATCH_V${revision}`, {
        state: 'published', effectiveAt: new Date().toISOString(), weights,
        multipliers: { required: 1, desirable, indifferent: 0 },
        defaultImportImportance: configuration?.defaultImportImportance ?? 'desirable',
        minimumMatchPercentage: minimumMatch,
        minimumProfileCompletionPercentage: minimumCompletion,
        eliminatoryPolicyEnabled: configuration?.eliminatoryPolicyEnabled ?? true,
        recalculationPolicy: 'affected_matches',
      });
      toast('success', `MATCH_V${revision} publicada com sucesso.`);
      await onPublished();
    } catch (error) {
      toast('danger', error instanceof ApiError ? error.message : 'Falha ao publicar os parâmetros.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Alert tone="info" className="mb-6">
      {configuration ? `Versão vigente: ${configuration.version}. A publicação cria uma nova versão auditável.`
        : 'Nenhuma configuração consolidada encontrada. A primeira publicação criará a MATCH_V1.'}
    </Alert>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card><CardHeader title="Match mínimo global" description="Valor padrão dos rankings." />
              <CardBody><Input label="Percentual (%)" type="number" min={0} max={100} value={minimumMatch}
                onChange={(event) => setMinimumMatch(Number(event.target.value))} /></CardBody></Card>
            <Card><CardHeader title="Completude mínima global" description="Valor padrão de elegibilidade do perfil." />
              <CardBody><Input label="Percentual (%)" type="number" min={0} max={100} value={minimumCompletion}
                onChange={(event) => setMinimumCompletion(Number(event.target.value))} /></CardBody></Card>
            <Card><CardHeader title="Multiplicador desejável" description="Obrigatório = 1; indiferente = 0." />
              <CardBody><Input label="Fator" type="number" min={0.01} max={0.99} step={0.05} value={desirable}
                onChange={(event) => setDesirable(Number(event.target.value))} /></CardBody></Card>
          </div>
          <Card className="mt-6">
            <CardHeader title="Pesos por critério" description="Altere os pesos técnicos aplicados nos dois sentidos do Match." />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MATCH_FIELDS.map((field) => (
                <Input key={field.key} label={field.label} type="number" min={0} max={1000} step={0.01}
                  value={weights[field.key]} onChange={(event) => setWeights((state) => ({
                    ...state, [field.key]: Number(event.target.value),
                  }))} />
              ))}
            </CardBody>
          </Card>
          <div className="mt-6 flex justify-end">
            <Button onClick={publish} loading={busy} disabled={!valid}>Publicar nova versão</Button>
          </div>
  </>;
}

export default function MasterMatchSettingsPage() {
  const current = useAsync(masterService.getMatchConfiguration, []);
  const configuration = current.data?.configuration ?? null;
  return (
    <>
      <PageHeader eyebrow="Master" title="Parâmetros do Match"
        description="Edite os limites, o multiplicador e os pesos globais usados pelo Motor de Match." />
      {current.loading ? <Skeleton className="h-24" /> : current.error ? (
        <Alert tone="danger">{current.error.message}</Alert>
      ) : (
        <MatchSettingsForm key={configuration?.version ?? 'initial'} configuration={configuration}
          onPublished={current.reload} />
      )}
    </>
  );
}
