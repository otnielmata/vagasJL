import Link from 'next/link';
import { ArrowRight, Building2, Gauge, ListChecks, Scale, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { buttonClasses } from '@/components/ui/button';

const features = [
  { icon: Target, title: 'Match explicável', text: 'Não só um percentual: veja quais critérios foram atendidos e quais são os gaps.' },
  { icon: ListChecks, title: 'Catálogo padronizado', text: 'Cypress, cypress e Cypress.io viram uma única competência. Sem ruído de texto livre.' },
  { icon: Scale, title: 'Pesos configuráveis', text: 'Obrigatório, desejável ou indiferente — e critérios eliminatórios claramente sinalizados.' },
  { icon: ShieldCheck, title: 'Privacidade por padrão', text: 'O candidato decide se aparece para empresas e quais contatos ficam visíveis.' },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle compact />
            <Link href="/login" className={buttonClasses('ghost', 'md', 'hidden sm:inline-flex')}>
              Entrar
            </Link>
            <Link href="/cadastro" className={buttonClasses('primary', 'md')}>
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-4xl rounded-full bg-primary/15 blur-3xl dark:bg-primary/10" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Para profissionais de Testes de Software
              </span>
              <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                As vagas de QA que <span className="text-primary">combinam com você</span>, primeiro.
              </h1>
              <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
                Um motor de Match compara seu perfil estruturado com os requisitos de cada vaga e mostra o porquê de cada
                recomendação.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/cadastro" className={buttonClasses('primary', 'lg')}>
                  Quero vagas compatíveis <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/cadastro" className={buttonClasses('outline', 'lg')}>
                  <Building2 className="h-4 w-4" /> Sou empresa
                </Link>
              </div>
            </div>

            {/* Mock visual do resultado */}
            <div className="rounded-3xl border border-border bg-surface p-5 shadow-pop sm:p-6">
              <div className="flex items-center justify-between">
                <p className="font-display font-semibold">Suas Top vagas</p>
                <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">Top 3</span>
              </div>
              <ul className="mt-4 space-y-3">
                {[
                  { pct: 94, t: 'QA Engineer — Automação Web', m: 'Cypress · JavaScript · API Testing', c: 'border-success text-success' },
                  { pct: 88, t: 'Analista de Testes Pleno', m: 'Selenium · Postman · Agile', c: 'border-primary text-primary' },
                  { pct: 76, t: 'QA Mobile', m: 'Gap: Appium', c: 'border-warning text-warning' },
                ].map((v) => (
                  <li key={v.t} className="flex items-center gap-4 rounded-2xl border border-border bg-surface-2/60 p-3.5">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-[3px] font-display text-sm font-bold ${v.c}`}>
                      {v.pct}%
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{v.t}</p>
                      <p className="truncate text-xs text-muted">{v.m}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-accent-soft p-3.5 text-sm">
                <Gauge className="h-5 w-5 shrink-0 text-accent" />
                <span>
                  <b>Match técnico: 92%</b> <span className="text-muted">| Engajamento na formação: Alto</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {[
              { q: 'Para o candidato', a: '“Quais vagas mais combinam com o meu perfil?”', steps: ['Cadastro e validação como aluno', 'Perfil de Match', 'Top vagas com pontos compatíveis e gaps', 'Candidatura no canal oficial da vaga'] },
              { q: 'Para a empresa', a: '“Quais candidatos mais combinam com esta vaga?”', steps: ['Cadastro e validação', 'Criação da vaga com requisitos', 'Top candidatos ranqueados', 'Visualização do perfil profissional'] },
            ].map((b) => (
              <div key={b.q} className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{b.q}</p>
                <p className="mt-2 font-display text-xl font-semibold">{b.a}</p>
                <ol className="mt-5 space-y-2.5">
                  {b.steps.map((s, i) => (
                    <li key={s} className="flex items-center gap-3 text-sm">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Logo />
          <p>© {new Date().getFullYear()} JL Treinamentos · Vagas JL</p>
        </div>
      </footer>
    </div>
  );
}
