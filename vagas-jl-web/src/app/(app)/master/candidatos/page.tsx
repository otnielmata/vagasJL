'use client';

import { adminService } from '@/lib/api/services';
import type { CandidateStatus } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChangeForm } from '@/components/admin/status-change-form';
import { CANDIDATE_STATUS_LABEL } from '@/components/match/status-badges';

export default function MasterCandidatesPage() {
  return (
    <>
      <PageHeader eyebrow="Perfil Master" title="Status dos candidatos"
        description="Ative, inative ou bloqueie candidatos com motivo auditado." />
      <StatusChangeForm<CandidateStatus>
        title="Alterar status do candidato"
        description="Somente o perfil Master pode executar esta operação."
        idLabel="ID do candidato"
        statuses={(Object.keys(CANDIDATE_STATUS_LABEL) as CandidateStatus[])
          .map((value) => ({ value, label: CANDIDATE_STATUS_LABEL[value] }))}
        onSubmit={(id, status, reason) => adminService.setCandidateStatus(id, status, reason)}
      />
    </>
  );
}
