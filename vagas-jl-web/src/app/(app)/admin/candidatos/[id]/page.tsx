'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import { CandidateReport } from '@/components/candidates/candidate-report';

export default function AdminCandidateReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const vacancyId = useSearchParams().get('vaga') ?? '';
  return <CandidateReport vacancyId={vacancyId} candidateId={id} backHref="/admin/candidatos" />;
}
