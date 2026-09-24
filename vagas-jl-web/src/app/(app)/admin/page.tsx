import Link from 'next/link';
import { ArrowRight, Building2, FileSearch, SlidersHorizontal, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';

const SECTIONS = [
  { href: '/admin/empresas', icon: Building2, title: 'Empresas', text: 'Cadastrar, vincular recrutadores e ativar, inativar ou bloquear.' },
  { href: '/admin/candidatos', icon: Users, title: 'Candidatos', text: 'Administrar status com trilha de auditoria.' },
  { href: '/admin/vagas', icon: FileSearch, title: 'Vagas', text: 'Revisar status e consultar o ranking de candidatos de qualquer vaga.' },
  { href: '/admin/configuracoes', icon: SlidersHorizontal, title: 'Parâmetros do Match', text: 'Match mínimo, completude mínima e multiplicadores.' },
];

export default function AdminHome() {
  return (
    <>
      <PageHeader eyebrow="Administração" title="Painel administrativo" description="Gestão de candidatos, empresas, vagas, catálogos e parâmetros do Motor de Match." />
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
