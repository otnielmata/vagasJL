'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { vacancyService } from '@/lib/api/services';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Select, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { CandidateRanking } from '@/components/match/candidate-ranking';

function CandidatesContent() {
  const params = useSearchParams();
  const router = useRouter();
  const vacancies = useAsync(() => vacancyService.list({ status: 'active', page: 1 }), []);
  const selected = params.get('vaga') ?? '';
  const [manual, setManual] = useState('');
  const [minimumMatch, setMinimumMatch] = useState(60);
  const [minimumCompletion, setMinimumCompletion] = useState(50);
  const go = (id: string) => router.replace(`/admin/candidatos?vaga=${id}`);

  return (
    <>
      <PageHeader eyebrow="Candidatos" title="Quem mais combina com minhas vagas"
        description="Selecione uma vaga cadastrada por você para visualizar os candidatos ordenados pelo Match técnico." />
      <Card className="mb-6">
        <CardBody className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <Select label="Minha vaga ativa" value={selected} onChange={(event) => event.target.value && go(event.target.value)}>
            <option value="">Selecione uma vaga…</option>
            {vacancies.data?.items.map((vacancy) => (
              <option key={vacancy._id} value={vacancy._id}>{vacancy.title} ({vacancy.reference})</option>
            ))}
          </Select>
          <form className="flex items-end gap-2" onSubmit={(event) => {
            event.preventDefault();
            if (/^[a-f0-9]{24}$/i.test(manual.trim())) go(manual.trim());
          }}>
            <Input label="…ou informe o ID da sua vaga" value={manual}
              onChange={(event) => setManual(event.target.value)} wrapperClassName="flex-1" />
            <Button type="submit" variant="outline">Ver ranking</Button>
          </form>
        </CardBody>
      </Card>
      {selected && (
        <Card className="mb-6">
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input label="Match mínimo no ranking (%)" type="number" min={0} max={100} step={1}
              value={minimumMatch} onChange={(event) => setMinimumMatch(Math.min(100,
                Math.max(0, Number(event.target.value))))} />
            <Input label="Completude mínima do perfil (%)" type="number" min={0} max={100} step={1}
              value={minimumCompletion} onChange={(event) => setMinimumCompletion(Math.min(100,
                Math.max(0, Number(event.target.value))))} />
          </CardBody>
        </Card>
      )}
      {selected && <CandidateRanking vacancyId={selected} minimumMatchPercentage={minimumMatch}
        minimumProfileCompletionPercentage={minimumCompletion} />}
    </>
  );
}

export default function AdminCandidatesPage() {
  return <Suspense><CandidatesContent /></Suspense>;
}
