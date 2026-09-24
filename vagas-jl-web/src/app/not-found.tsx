import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="font-display text-6xl font-bold text-primary">404</p>
        <h1 className="mt-3 font-display text-xl font-semibold">Página não encontrada</h1>
        <p className="mt-1 text-sm text-muted">O endereço pode ter mudado ou não existe.</p>
        <Link href="/" className={buttonClasses('primary', 'md', 'mt-6')}>
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
