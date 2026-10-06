import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { buttonClasses } from '@/components/ui/button';
import { VacancyBrowser } from '@/components/vacancies/vacancy-browser';

export default function AdminVacanciesPage() {
  return (
    <>
      <PageHeader eyebrow="Administração" title="Minhas vagas" description="Vagas cadastradas por este administrador. A revisão e alteração de status são realizadas pelo perfil Master."
        actions={<Link href="/admin/vagas/nova" className={buttonClasses()}><Plus className="h-4 w-4" /> Cadastrar vaga</Link>} />
      <div className="space-y-6">
        <VacancyBrowser admin hideOrigin />
      </div>
    </>
  );
}
