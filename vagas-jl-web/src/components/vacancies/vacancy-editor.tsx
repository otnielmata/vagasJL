'use client';

import { companyService } from '@/lib/api/services';
import { useAsync } from '@/lib/use-async';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { VacancyForm } from '@/app/(app)/empresa/vagas/nova/page';

export function VacancyEditor({ companyId, vacancyId, admin = false }: {
  companyId: string;
  vacancyId: string;
  admin?: boolean;
}) {
  const vacancy = useAsync(() => companyService.getVacancy(companyId, vacancyId), [companyId, vacancyId]);
  if (vacancy.loading) return <Skeleton className="h-[32rem] rounded-2xl" />;
  if (vacancy.error || !vacancy.data?.vacancy) {
    return <Alert tone="danger" title="Não foi possível carregar a vaga">
      {vacancy.error?.message ?? 'Vaga não encontrada.'}
    </Alert>;
  }
  return <VacancyForm companyId={companyId} admin={admin} vacancy={vacancy.data.vacancy} />;
}
