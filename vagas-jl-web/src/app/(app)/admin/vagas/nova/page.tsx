'use client';

import { VacancyForm } from '@/app/(app)/empresa/vagas/nova/page';
import { CompanyGate } from '@/components/company/company-gate';

export default function NewAdminVacancyPage() {
  return <CompanyGate>{(companyId) => <VacancyForm companyId={companyId} admin />}</CompanyGate>;
}
