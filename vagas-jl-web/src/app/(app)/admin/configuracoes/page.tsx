'use client';

import { useState } from 'react';
import { adminService } from '@/lib/api/services';
import { ApiError } from '@/lib/api/client';
import { MATCH_FIELDS } from '@/config/match-catalog';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';

function ParamCard({
  title, description, label, suffix, min, max, step, initial, onSave,
}: {
  title: string; description: string; label: string; suffix: string; min: number; max: number; step: number; initial: number;
  onSave: (v: number) => Promise<unknown>;
}) {
  const toast = useToast();
  const [value, setValue] = useState(String(initial));
  const [busy, setBusy] = useState(false);
  const n = Number(value);
  const valid = value !== '' && n >= min && n <= max;

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        <form
          className="flex items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await onSave(n);
              toast('success', `${title}: nova versão publicada.`);
            } catch (err) {
              toast('danger', err instanceof ApiError ? err.message : 'Falha ao publicar.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input label={`${label} (${suffix})`} type="number" min={min} max={max} step={step} value={value} onChange={(e) => setValue(e.target.value)} wrapperClassName="flex-1" />
          <Button type="submit" loading={busy} disabled={!valid}>Publicar</Button>
        </form>
      </CardBody>
    </Card>
  );
}

export default function MatchSettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Administração" title="Parâmetros do Match" description="Cada publicação gera uma nova versão auditável; Matches afetados são recalculados. Nenhum peso fica fixo no código." />
      <Alert tone="info" className="mb-6">
        A API ainda não oferece leitura dos valores vigentes — os campos partem das propostas iniciais do documento de regras.
      </Alert>
      <div className="grid gap-6 lg:grid-cols-3">
        <ParamCard title="Match mínimo no ranking" description="Vagas/candidatos abaixo não aparecem." label="Percentual" suffix="%" min={0} max={100} step={1} initial={60} onSave={adminService.setRankingThreshold} />
        <ParamCard title="Completude mínima" description="Exigida antes de gerar recomendações." label="Percentual" suffix="%" min={0} max={100} step={1} initial={50} onSave={adminService.setCompletionThreshold} />
        <ParamCard title="Multiplicador desejável" description="Obrigatório = 1 e indiferente = 0 são fixos." label="Fator" suffix="0–1" min={0.01} max={0.99} step={0.05} initial={0.5} onSave={adminService.setMultipliers} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Pesos iniciais por critério" description="Referência do Perfil de Match (VJ-28). Publicação consolidada via configuração MATCH_Vn." />
        <CardBody>
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...MATCH_FIELDS].sort((a, b) => b.weight - a.weight).map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-40 truncate text-sm">{f.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${f.weight * 10}%` }} />
                </div>
                <span className="w-6 text-right text-sm tabular-nums text-muted">{f.weight}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
