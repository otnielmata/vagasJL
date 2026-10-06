'use client';

import { vacancyService } from '@/lib/api/services';
import type { VacancyStatus } from '@/lib/api/types';
import { StatusChangeForm } from '@/components/admin/status-change-form';
import { VACANCY_STATUS_LABEL } from '@/components/match/status-badges';
import { VacancyBrowser } from '@/components/vacancies/vacancy-browser';
import { PageHeader } from '@/components/ui/page-header';

type Target = Exclude<VacancyStatus, 'pending'>;

export default function MasterVacanciesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Perfil master"
        title="Vagas cadastradas"
        description="Consulte as vagas importadas e cadastradas, seus status e dados estruturados usando os filtros disponíveis."
      />
      <div className="space-y-6">
        <VacancyBrowser admin initialFilters={{ status: 'pending' }} />
        <StatusChangeForm<Target>
          title="Revisar status da vaga"
          description="Aprovar (ativar), pausar, expirar, remover ou rejeitar qualquer vaga cadastrada."
          idLabel="ID da vaga"
          statuses={(['active', 'paused', 'expired', 'removed', 'rejected'] as Target[])
            .map((value) => ({ value, label: VACANCY_STATUS_LABEL[value] }))}
          onSubmit={(id, status, reason) => vacancyService.setStatus(id, status, reason)}
        />
      </div>
    </>
  );
}
