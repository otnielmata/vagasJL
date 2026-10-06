import { VacancyBrowser } from '@/components/vacancies/vacancy-browser';
import { PageHeader } from '@/components/ui/page-header';

export default function CompanyVacanciesPage() {
  return (
    <>
      <PageHeader eyebrow="Empresa" title="Vagas cadastradas" description="Consulte somente as vagas cadastradas pela sua empresa e acesse os candidatos das vagas ativas." />
      <VacancyBrowser admin company />
    </>
  );
}
