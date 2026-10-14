'use client';

import { useParams } from 'next/navigation';
import { CompanyGate } from '@/components/company/company-gate';
import { VacancyEditor } from '@/components/vacancies/vacancy-editor';

export default function EditAdminVacancyPage() {
  const { id } = useParams<{ id: string }>();
  return <CompanyGate>{(companyId) => <VacancyEditor companyId={companyId} vacancyId={id} admin />}</CompanyGate>;
}
