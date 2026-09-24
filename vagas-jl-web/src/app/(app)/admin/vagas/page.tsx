'use client';

import { useState } from 'react';
import { vacancyService } from '@/lib/api/services';
import type { VacancyStatus } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { StatusChangeForm } from '@/components/admin/status-change-form';
import { CandidateRanking } from '@/components/match/candidate-ranking';
import { VACANCY_STATUS_LABEL } from '@/components/match/status-badges';

type Target = Exclude<VacancyStatus, 'pending'>;

export default function AdminVacanciesPage() {
  const [input, setInput] = useState('');
  const [vacancyId, setVacancyId] = useState('');

  return (
    <>
      <PageHeader eyebrow="Administração" title="Vagas" description="Somente vagas Ativas participam dos rankings apresentados aos candidatos." />
      <div className="space-y-6">
        <StatusChangeForm<Target>
          title="Revisar status da vaga"
          description="Aprovar (ativar), pausar, expirar, remover ou rejeitar."
          idLabel="ID da vaga"
          statuses={(['active', 'paused', 'expired', 'removed', 'rejected'] as Target[]).map((v) => ({ value: v, label: VACANCY_STATUS_LABEL[v] }))}
          onSubmit={(id, status, reason) => vacancyService.setStatus(id, status, reason)}
        />
        <Card>
          <CardBody>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); setVacancyId(input.trim()); }}>
              <Input label="Consultar ranking de candidatos da vaga" placeholder="ID da vaga" value={input} onChange={(e) => setInput(e.target.value)} wrapperClassName="flex-1" />
              <Button type="submit" variant="outline" disabled={!/^[a-f0-9]{24}$/i.test(input.trim())}>Consultar</Button>
            </form>
          </CardBody>
        </Card>
        {vacancyId && <CandidateRanking vacancyId={vacancyId} />}
      </div>
    </>
  );
}
