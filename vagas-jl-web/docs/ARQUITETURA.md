# Arquitetura — vagas-jl-web

## Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | **Next.js 16 (App Router) + React 19 + TypeScript** | Deploy nativo na Vercel (mesmo time da API), rotas por pasta, build estático das telas. |
| Estilo | **Tailwind CSS 4** com design tokens em CSS variables | Claro/escuro sem condicionais nos componentes. |
| Tema | **next-themes** (`class` no `<html>`) | Claro, escuro e "sistema", sem flash na carga. |
| Ícones | lucide-react | Leves e consistentes. |
| Fontes | Inter + Plus Jakarta Sans (self-hosted via @fontsource) | Sem dependência de rede no build. |

Sem biblioteca de estado ou de UI pesada: o kit de componentes é próprio e pequeno (`src/components/ui`).

## Estrutura

```
src/
├── app/
│   ├── page.tsx                 # Landing pública
│   ├── (auth)/                  # login, cadastro (layout split com painel de marca)
│   └── (app)/                   # área autenticada — cada papel tem layout com AppShell
│       ├── candidato/           # visão geral, vagas, vagas/[id], perfil-match, cadastro, engajamento, privacidade
│       ├── empresa/             # visão geral, vagas/nova, ranking, cadastro
│       └── admin/               # empresas, candidatos, vagas, configuracoes
├── components/
│   ├── ui/                      # Button, Card, Input/Select/Textarea, Badge, Alert, Switch, ChipGroup, TriState, Segmented, Toast...
│   ├── layout/                  # AppShell (sidebar + drawer mobile), Logo, ThemeToggle
│   ├── match/                   # MatchRing, VacancyCard, CriteriaList, CandidateRanking, badges de status
│   ├── company/ admin/          # componentes de domínio
│   └── providers.tsx            # Theme + Toast + Auth
├── config/
│   ├── navigation.ts            # menu por papel
│   └── match-catalog.ts         # 22 campos do Perfil de Match, pesos e opções (fallback — ver API-GAPS)
└── lib/
    ├── api/client.ts            # fetch + JWT + ApiError + modo mock
    ├── api/services.ts          # 1 função por endpoint do Swagger, agrupadas por domínio
    ├── api/types.ts             # tipos do contrato OpenAPI
    ├── api/mock.ts              # dados de demonstração
    ├── auth/auth-context.tsx    # sessão, login/logout, redirecionamento por papel
    ├── use-async.ts             # hook de carregamento com loading/erro/reload
    ├── use-links.ts             # vínculos locais (candidato/empresa/vagas) — ponte até os GETs da API
    └── storage.ts               # localStorage com try/catch
```

## Decisões

1. **Tokens semânticos.** Componentes usam `bg-surface`, `text-muted`, `border-border`, `text-primary`… definidos em `globals.css` para `:root` e `.dark`. Criar uma cor nova = adicionar o token nos dois temas.
2. **Autenticação no cliente.** JWT do `POST /login` fica no `localStorage` e vai como `Bearer`. `401` em qualquer chamada encerra a sessão. `AppShell` bloqueia a área de outro papel e redireciona para a home correta.
3. **Services 1:1 com o Swagger.** Telas nunca montam URL; ao mudar a API, altere `services.ts` + `types.ts`.
4. **Regras de negócio refletidas na UI.**
   - RN-007/031: competências só por catálogo (`ChipGroup`), nunca texto livre.
   - RN-044: `TriState` Sim / Não / Não informado — "não informado" é enviado como `null`, não `false`.
   - RN-034/037: tela de Match mostra critérios atendidos, gaps e diferencia *compatibilidade baixa* de *inelegível*.
   - RN-038: engajamento sempre em card separado e rotulado como "não altera o Match técnico".
   - RN-047/048/050: privacidade parte de tudo oculto.
   - RN-018/019: nova vaga define importância (obrigatório/desejável/indiferente) e eliminatório por critério.
5. **Modo demonstração** (`NEXT_PUBLIC_API_MOCK=true`): todas as telas funcionam sem backend, útil para design review e testes de UI. Um banner deixa explícito que os dados são simulados.

## Como evoluir

- Implementar os endpoints de `docs/API-GAPS.md` e remover os contornos.
- Perfil do candidato para a empresa (`GET /candidatos/{id}`) a partir do ranking.
- Testes E2E (Playwright) para os fluxos 27.1 e 27.2 do documento de regras — o modo mock já permite rodá-los sem API.
