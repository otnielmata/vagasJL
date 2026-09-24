import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5 font-display font-bold tracking-tight', className)}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-sm text-background dark:bg-primary dark:text-primary-foreground">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12.5l4.5 4.5L20 6" />
        </svg>
      </span>
      <span className="text-lg">
        Vagas<span className="text-primary">JL</span>
      </span>
    </Link>
  );
}
