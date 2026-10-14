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

function RankingContent() {
  const params = useSearchParams();
  const router = useRouter();
  const vacancies = useAsync(() => vacancyService.list({ status: 'active', page: 1 }), []);
  const selected = params.get('vaga') ?? '';
  const [manual, setManual] = useState('');
  const [minimumMatch, setMinimumMatch] = useState(60);
  const [minimumCompletion, setMinimumCompletion] = useState(50);

  const go = (id: string) => router.replace(`/empresa/candidatos?vaga=${id}`);

  return (
    <>
      <PageHeader eyebrow="Top candidatos" title="Quem mais combina com a vaga" description="Candidatos ordenados pelo Match técnico. Engajamento não interfere no ranking." />
      <Card className="mb-6">
        <CardBody className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <Select label="Vaga" value={selected} onChange={(e) => e.target.value && go(e.target.value)}>
            <option value="">Selecione uma vaga…</option>
            {vacancies.data?.items.map((v) => (
              <option key={v._id} value={v._id}>{v.title} ({v.reference})</option>
            ))}
          </Select>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (/^[a-f0-9]{24}$/i.test(manual.trim())) go(manual.trim()); }}>
            <Input label="…ou informe o ID da vaga" value={manual} onChange={(e) => setManual(e.target.value)} wrapperClassName="flex-1" />
            <Button type="submit" variant="outline">Ver</Button>
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

export default function CompanyRankingPage() {
  return (
    <Suspense>
      <RankingContent />
    </Suspense>
  );
}
