'use client';

import { adminService } from '@/lib/api/services';
import type { CandidateStatus } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChangeForm } from '@/components/admin/status-change-form';
import { CANDIDATE_STATUS_LABEL } from '@/components/match/status-badges';

export default function AdminCandidatesPage() {
  return (
    <>
      <PageHeader eyebrow="Administração" title="Candidatos" description="Somente candidatos ativos aparecem para empresas." />
      <StatusChangeForm<CandidateStatus>
        title="Alterar status do candidato"
        description="Ativar, inativar ou bloquear com motivo auditado."
        idLabel="ID do candidato"
        statuses={(Object.keys(CANDIDATE_STATUS_LABEL) as CandidateStatus[]).map((v) => ({ value: v, label: CANDIDATE_STATUS_LABEL[v] }))}
        onSubmit={(id, status, reason) => adminService.setCandidateStatus(id, status, reason)}
      />
    </>
  );
}
