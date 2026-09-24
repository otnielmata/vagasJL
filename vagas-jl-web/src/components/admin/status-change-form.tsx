'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api/client';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/field';

/**
 * Alteracao auditada de status (empresa, candidato, vaga): exige ID + motivo.
 * A API registra autor, data e status anterior.
 */
export function StatusChangeForm<S extends string>({
  title,
  description,
  idLabel,
  statuses,
  onSubmit,
}: {
  title: string;
  description: string;
  idLabel: string;
  statuses: { value: S; label: string }[];
  onSubmit: (id: string, status: S, reason: string) => Promise<{ previousStatus?: string; changed?: boolean } | unknown>;
}) {
  const [id, setId] = useState('');
  const [status, setStatus] = useState<S>(statuses[0].value);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'danger'; text: string }>();
  const valid = /^[a-fA-F0-9]{24}$/.test(id.trim()) && reason.trim().length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(undefined);
    try {
      const res = (await onSubmit(id.trim(), status, reason.trim())) as { previousStatus?: string; changed?: boolean } | undefined;
      const label = statuses.find((s) => s.value === status)?.label;
      setResult({
        tone: 'success',
        text: res?.changed === false ? `Nenhuma alteração: já estava como ${label}.` : `Status alterado para ${label}${res?.previousStatus ? ` (antes: ${res.previousStatus})` : ''}.`,
      });
      setReason('');
    } catch (err) {
      setResult({ tone: 'danger', text: err instanceof ApiError ? err.message : 'Falha ao alterar status.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Input label={idLabel} placeholder="ID (24 caracteres)" value={id} onChange={(e) => setId(e.target.value)} />
          <Select label="Novo status" value={status} onChange={(e) => setStatus(e.target.value as S)}>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
          <Textarea wrapperClassName="sm:col-span-2" label="Motivo" hint="Obrigatório — fica registrado na trilha de auditoria." maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20" />
          {result && <Alert tone={result.tone} className="sm:col-span-2">{result.text}</Alert>}
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={busy} disabled={!valid}>Aplicar</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
