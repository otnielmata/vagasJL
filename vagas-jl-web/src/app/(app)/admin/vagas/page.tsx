'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button';
import { CandidateRanking } from '@/components/match/candidate-ranking';
import { VacancyBrowser } from '@/components/vacancies/vacancy-browser';

export default function AdminVacanciesPage() {
  const [input, setInput] = useState('');
  const [vacancyId, setVacancyId] = useState('');

  return (
    <>
      <PageHeader eyebrow="Administração" title="Minhas vagas" description="Vagas cadastradas por este administrador. A revisão e alteração de status são realizadas pelo perfil Master."
        actions={<Link href="/admin/vagas/nova" className={buttonClasses()}><Plus className="h-4 w-4" /> Cadastrar vaga</Link>} />
      <div className="space-y-6">
        <VacancyBrowser admin hideOrigin />
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
