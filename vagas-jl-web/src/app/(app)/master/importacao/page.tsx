'use client';

import { useState, type FormEvent } from 'react';
import { FileJson, ShieldCheck, UploadCloud } from 'lucide-react';
import { masterService } from '@/lib/api/services';
import type { VacancyImportResult } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export default function VacancyImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [activatePending, setActivatePending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<VacancyImportResult>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setResult(undefined);
    if (!file) return setError('Selecione o arquivo enriched-dataset.json.');
    if (!file.name.toLowerCase().endsWith('.json')) return setError('O arquivo deve possuir extensão .json.');
    if (file.size > MAX_FILE_SIZE) return setError('O arquivo deve ter no máximo 25 MB.');
    setBusy(true);
    try {
      setResult(await masterService.importVacancies(file, { dryRun, activatePending }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível importar o arquivo.');
    } finally {
      setBusy(false);
    }
  }

  const summary = result?.importacao;
  const failureCount = summary?.result?.failed ?? summary?.failures?.length ?? summary?.preview?.invalid ?? 0;
  return (
    <>
      <PageHeader
        eyebrow="Perfil master"
        title="Importar vagas"
        description="Envie o enriched-dataset.json para validação, normalização e gravação idempotente no MongoDB."
      />
      <Alert tone="warning" className="mb-6" title="Operação restrita">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Somente usuários com perfil master podem acessar este recurso.</span>
      </Alert>
      <Card>
        <CardHeader title="Arquivo de vagas" description="Formato esperado: lista JSON do dataset enriquecido, com limite de 25 MB." />
        <CardBody>
          <form className="space-y-5" onSubmit={submit}>
            <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-border p-5 transition-colors hover:border-primary/50 hover:bg-primary-soft/30">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                {file ? <FileJson className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file?.name ?? 'Selecionar enriched-dataset.json'}</p>
                <p className="mt-1 text-xs text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Clique para escolher o arquivo'}</p>
              </div>
              <input
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                className="mt-0.5 h-4 w-4 accent-primary"
                type="checkbox"
                checked={dryRun}
                onChange={(event) => {
                  setDryRun(event.target.checked);
                  if (event.target.checked) setActivatePending(false);
                }}
              />
              <span><strong>Somente validar</strong><span className="block text-muted">Analisa o arquivo e informa problemas sem alterar a base.</span></span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                className="mt-0.5 h-4 w-4 accent-primary"
                type="checkbox"
                checked={activatePending}
                disabled={dryRun}
                onChange={(event) => setActivatePending(event.target.checked)}
              />
              <span><strong>Publicar vagas pendentes após importar</strong><span className="block text-muted">Ativa somente vagas importadas que atendam às validações de publicação.</span></span>
            </label>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex justify-end">
              <Button type="submit" loading={busy} disabled={!file}>{dryRun ? 'Validar arquivo' : 'Importar vagas'}</Button>
            </div>
          </form>
        </CardBody>
      </Card>
      {summary && (
        <Card className="mt-6">
          <CardHeader title={summary.dryRun ? 'Validação concluída' : 'Importação concluída'} description={`${result.arquivo.nome} · configuração v${summary.configurationVersion}`} />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[['Recebidas', summary.received], ['Importáveis', summary.importable], ['Falhas', failureCount]].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-surface-2 p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>
              ))}
            </div>
            {summary.result && <Alert tone={failureCount ? 'warning' : 'success'}>Criadas: {summary.result.created ?? 0} · Atualizadas: {summary.result.updated ?? 0} · Já existentes: {summary.result.unchanged ?? 0}.</Alert>}
            {result.publicacao && <Alert tone={result.publicacao.failed ? 'warning' : 'success'}>Publicadas: {result.publicacao.activated} de {result.publicacao.pending} vagas pendentes.</Alert>}
            {failureCount ? <Alert tone="warning">A importação teve {failureCount} falha(s). A resposta apresenta uma amostra de até 50 ocorrências.</Alert> : <Alert tone="success">O arquivo foi processado sem falhas registradas.</Alert>}
          </CardBody>
        </Card>
      )}
    </>
  );
}
