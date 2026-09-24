import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle compact />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-xs text-subtle">© {new Date().getFullYear()} JL Treinamentos</p>
      </div>
      <aside className="relative hidden overflow-hidden bg-accent lg:block dark:bg-surface-2">
        <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:22px_22px] text-white" />
        <div className="relative flex h-full flex-col justify-center p-14 text-white">
          <p className="text-sm font-semibold uppercase tracking-widest text-teal-300">Motor de Match</p>
          <h2 className="mt-4 max-w-md font-display text-4xl font-bold leading-tight">
            Não mostre milhares de vagas. Mostre as que fazem sentido.
          </h2>
          <p className="mt-4 max-w-md text-white/70">
            Perfil estruturado do candidato + perfil estruturado da vaga = ranking explicável de oportunidades e talentos.
          </p>
          <div className="mt-10 grid max-w-md gap-3">
            {[
              ['94%', 'QA Engineer — Automação Web', 'Atende: Cypress, JavaScript, API Testing, CI/CD'],
              ['88%', 'Analista de Testes Pleno', 'Ponto de atenção: Playwright'],
            ].map(([pct, title, note]) => (
              <div key={title} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-teal-300 font-display text-sm font-bold text-teal-200">
                  {pct}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{title}</p>
                  <p className="truncate text-sm text-white/60">{note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
