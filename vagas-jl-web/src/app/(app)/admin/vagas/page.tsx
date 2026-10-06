'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { buttonClasses } from '@/components/ui/button';
import { VacancyBrowser } from '@/components/vacancies/vacancy-browser';
import { CompanyGate } from '@/components/company/company-gate';

export default function AdminVacanciesPage() {
  return (
    <CompanyGate>{() => <>
      <PageHeader eyebrow="Recrutador" title="Vagas da empresa" description="Vagas cadastradas por recrutadores vinculados à sua empresa. A aprovação e alteração de status são realizadas pelo perfil Master."
        actions={<Link href="/admin/vagas/nova" className={buttonClasses()}><Plus className="h-4 w-4" /> Cadastrar vaga</Link>} />
      <div className="space-y-6">
        <VacancyBrowser admin hideOrigin />
      </div>
    </>}</CompanyGate>
  );
}
