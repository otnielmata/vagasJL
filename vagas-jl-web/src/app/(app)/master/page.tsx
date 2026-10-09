import Link from 'next/link';
import { ArrowRight, Building2, ShieldCheck, UploadCloud, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';

export default function MasterHome() {
  const sections = [
    { href: '/master/empresas', icon: Building2, title: 'Empresas e recrutadores',
      text: 'Cadastrar empresas, vincular recrutadores e controlar status.' },
    { href: '/master/candidatos', icon: Users, title: 'Status dos candidatos',
      text: 'Ativar, inativar ou bloquear candidatos com auditoria.' },
    { href: '/master/importacao', icon: UploadCloud, title: 'Importar vagas',
      text: 'Validar e importar o enriched-dataset.json na base de vagas.' },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Perfil master"
        title="Operações protegidas"
        description="Área exclusiva para operações de alto privilégio da plataforma."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map(({ href, icon: Icon, title, text }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-pop">
              <CardBody className="flex gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display font-semibold group-hover:text-primary">{title}</h2>
                  <p className="mt-1 text-sm text-muted">{text}</p>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-success"><ShieldCheck className="h-4 w-4" /> Acesso exclusivo do perfil Master</p>
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
