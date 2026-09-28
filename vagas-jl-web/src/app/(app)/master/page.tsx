import Link from 'next/link';
import { ArrowRight, ShieldCheck, UploadCloud } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';

export default function MasterHome() {
  return (
    <>
      <PageHeader
        eyebrow="Perfil master"
        title="Operações protegidas"
        description="Área exclusiva para operações de alto privilégio da plataforma."
      />
      <Link href="/master/importacao" className="group block max-w-xl">
        <Card className="transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-pop">
          <CardBody className="flex gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display font-semibold group-hover:text-primary">Importar vagas</h2>
              <p className="mt-1 text-sm text-muted">Validar e importar o enriched-dataset.json na base de vagas.</p>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-success">
                <ShieldCheck className="h-4 w-4" /> Acesso exclusivo do perfil master
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 self-center text-subtle group-hover:text-primary" />
          </CardBody>
        </Card>
      </Link>
    </>
  );
}
