# Vagas JL — Web

Camada web do **Vagas JL**, plataforma que conecta profissionais de Testes de Software às vagas mais compatíveis — e empresas aos candidatos certos — por meio de um Motor de Match explicável.

Consome a [Vagas JL API](../README.md) (raiz deste repositório) (Node/Express/MongoDB).

- Layout moderno e responsivo (mobile → desktop)
- Tema **claro, escuro e sistema**
- Áreas por papel: **Candidato**, **Empresa** e **Administrador**
- **Modo demonstração** para desenvolver sem backend

## Requisitos

- Node.js ≥ 20.9
- API rodando localmente (`http://localhost:3000`) ou URL do deploy

## Começando

```bash
cp .env.example .env.local      # ajuste NEXT_PUBLIC_API_URL
npm install
npm run dev                      # http://localhost:3001
```

Sem API? Rode com dados simulados:

```bash
npm run dev:mock
```

No modo demonstração qualquer senha funciona; e-mails começando com `empresa@` ou `admin@` entram com esses papéis.

> Com o proxy `/backend` não é preciso CORS. Se usar URL absoluta, inclua a origem do web em `CORS_ORIGIN` da API.

## Scripts

| Script | Descrição |
|---|---|
| `npm run dev` | Desenvolvimento na porta 3001 |
| `npm run dev:mock` | Desenvolvimento com dados simulados |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run lint` | ESLint (config Next) |
| `npm run typecheck` | Verificação de tipos |

## Variáveis de ambiente

| Variável | Exemplo | Descrição |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `/backend` | Base usada pelo navegador: `/backend` (proxy, recomendado) ou URL absoluta da API |
| `API_PROXY_TARGET` | `https://vagas-jl.vercel.app` | Para onde o Next encaminha `/backend/*` (sem CORS) |
| `NEXT_PUBLIC_API_MOCK` | `false` | `true` usa dados simulados |

## Telas

| Papel | Rota | Endpoints |
|---|---|---|
| Público | `/`, `/login`, `/cadastro` | `POST /login`, `POST /usuarios` |
| Candidato | `/candidato` | perfil-match, ranking (Top 3), engajamento |
| | `/candidato/vagas` | `GET /candidatos/me/vagas/ranking` (Top 3/5/10/todas) |
| | `/candidato/vagas/[id]` | `GET …/match`, `POST …/candidatura` |
| | `/candidato/perfil-match` | `GET/POST/PATCH /candidatos/me/perfil-match` |
| | `/candidato/cadastro` | `POST/GET/PATCH /candidatos`, `POST …/validacao` |
| | `/candidato/engajamento` | `GET /candidatos/me/engajamento` |
| | `/candidato/privacidade` | `PATCH disponibilidade / permissoes-exibicao / perfil-publico` |
| Empresa | `/empresa` | `GET /empresas/{id}/cadastro` |
| | `/empresa/vagas/nova` | `POST /empresas/{id}/vagas` |
| | `/empresa/ranking` | `GET /vagas/{id}/candidatos/ranking` |
| | `/empresa/cadastro` | `GET/PATCH /empresas/{id}/cadastro` |
| Admin | `/admin/empresas` | `POST /empresas`, `POST …/usuarios`, `PATCH /admin/empresas/{id}/status` |
| | `/admin/candidatos` | `PATCH /admin/candidatos/{id}/status` |
| | `/admin/vagas` | `PATCH /vagas/{id}/status`, ranking de candidatos |
| | `/admin/configuracoes` | `PUT /configuracoes/match/*` |

## Deploy na Vercel

1. Na Vercel: Add New → Project → importar `otnielmata/vagasJL` e definir **Root Directory = `vagas-jl-web`**.
2. Framework: Next.js (detectado automaticamente).
3. `.env.production` já define o proxy `/backend` → `https://vagas-jl.vercel.app`. Para outra API, defina `API_PROXY_TARGET` na Vercel.
4. Não é necessário mexer no `CORS_ORIGIN` da API.

## Documentação

- [Arquitetura e decisões](docs/ARQUITETURA.md)
- [Lacunas da API para o web](docs/API-GAPS.md) — endpoints que faltam e contornos temporários
