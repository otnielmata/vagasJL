'use client';

import Link from 'next/link';
import { ArrowRight, FileSearch, SlidersHorizontal, UserRound, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';

const SECTIONS = [
  { href: '/admin/candidatos', icon: Users, title: 'Candidatos', text: 'Visualizar o ranking de candidatos das vagas cadastradas por você.' },
  { href: '/admin/vagas', icon: FileSearch, title: 'Vagas', text: 'Cadastrar e consultar somente as suas vagas.' },
  { href: '/admin/configuracoes', icon: SlidersHorizontal, title: 'Parâmetros do Match', text: 'Match mínimo, completude mínima e multiplicadores.' },
];

export default function AdminHome() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader eyebrow="Recrutador" title={user?.name || 'Visão geral'}
        description="Cadastre suas vagas e consulte os candidatos com maior compatibilidade." />
      <Card className="mb-6">
        <CardBody className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <UserRound className="h-6 w-6" />
          </div>
          <div>
            <p className="font-display font-semibold">{user?.name}</p>
            <p className="text-sm text-muted">{user?.email}</p>
          </div>
        </CardBody>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map(({ href, icon: Icon, title, text }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-pop">
              <CardBody className="flex gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display font-semibold group-hover:text-primary">{title}</h2>
                  <p className="mt-1 text-sm text-muted">{text}</p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 self-center text-subtle group-hover:text-primary" />
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
