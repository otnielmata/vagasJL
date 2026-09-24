'use client';

import { useState, type ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { useCompanyId } from '@/lib/use-links';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';

/**
 * A API ainda nao informa a empresa do recrutador autenticado (docs/API-GAPS.md).
 * Enquanto isso, o recrutador informa o ID recebido da administracao uma unica vez.
 */
export function CompanyGate({ children }: { children: (companyId: string) => ReactNode }) {
  const [companyId, setCompanyId] = useCompanyId();
  const [value, setValue] = useState('');
  const valid = /^[a-fA-F0-9]{24}$/.test(value.trim());

  if (companyId) return <>{children(companyId)}</>;

  return (
    <Card className="mx-auto max-w-lg">
      <CardBody className="text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Building2 className="h-6 w-6" />
        </div>
        <h2 className="font-display text-lg font-semibold">Vincule sua empresa</h2>
        <p className="mt-1 text-sm text-muted">Informe o identificador da empresa enviado pela administração ao liberar seu acesso.</p>
        <form
          className="mt-6 flex flex-col gap-3 text-left sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setCompanyId(value.trim());
          }}
        >
          <Input label="ID da empresa" placeholder="24 caracteres hexadecimais" value={value} onChange={(e) => setValue(e.target.value)} wrapperClassName="flex-1" />
          <Button type="submit" disabled={!valid}>
            Vincular
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
