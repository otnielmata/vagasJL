'use client';

import type { ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { companyService } from '@/lib/api/services';
import { useAsync } from '@/lib/use-async';
import { Card, CardBody } from '@/components/ui/card';
import { Alert, Skeleton } from '@/components/ui/feedback';

export function CompanyGate({ children }: { children: (companyId: string) => ReactNode }) {
  const membership = useAsync(() => companyService.getMine(), []);
  if (membership.loading) return <Skeleton className="h-52 rounded-2xl" />;
  if (membership.data?.company._id) return <>{children(membership.data.company._id)}</>;

  return (
    <Card className="mx-auto max-w-lg">
      <CardBody className="text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Building2 className="h-6 w-6" />
        </div>
        <h2 className="font-display text-lg font-semibold">Aguardando vínculo empresarial</h2>
        <p className="mt-1 text-sm text-muted">O perfil Master deve vincular sua conta de recrutador a uma empresa.</p>
        {membership.error && (
          <Alert tone="info" className="mt-5">
            {membership.error.message || 'Após o vínculo, o acesso será liberado automaticamente.'}
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}
