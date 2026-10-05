import { VacancyBrowser } from '@/components/vacancies/vacancy-browser';
import { PageHeader } from '@/components/ui/page-header';

export default function MasterVacanciesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Perfil master"
        title="Vagas cadastradas"
        description="Consulte as vagas importadas e cadastradas, seus status e dados estruturados usando os filtros disponíveis."
      />
      <VacancyBrowser admin />
    </>
  );
}
