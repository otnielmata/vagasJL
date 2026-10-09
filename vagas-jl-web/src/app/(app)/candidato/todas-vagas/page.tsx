import { VacancyBrowser } from '@/components/vacancies/vacancy-browser';
import { PageHeader } from '@/components/ui/page-header';

export default function AllVacanciesPage() {
  return (
    <>
      <PageHeader eyebrow="Pesquisa de vagas" title="Todas as vagas" description="Consulte oportunidades ativas usando filtros, sem depender do percentual de Match." />
      <VacancyBrowser />
    </>
  );
}
