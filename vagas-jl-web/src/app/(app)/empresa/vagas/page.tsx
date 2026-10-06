'use client';

import { VacancyBrowser } from '@/components/vacancies/vacancy-browser';
import { PageHeader } from '@/components/ui/page-header';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { CompanyGate } from '@/components/company/company-gate';

export default function CompanyVacanciesPage() {
  return (
    <CompanyGate>{() => <>
      <PageHeader eyebrow="Recrutador" title="Vagas cadastradas" description="Consulte somente as vagas cadastradas pela sua empresa. Novas vagas aguardam aprovação do Master."
        actions={<Link href="/empresa/vagas/nova" className={buttonClasses()}><Plus className="h-4 w-4" /> Cadastrar vaga</Link>} />
      <VacancyBrowser admin company />
    </>}</CompanyGate>
  );
}
