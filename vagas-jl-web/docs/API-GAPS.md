# Lacunas da API para a camada web

Levantamento feito ao ligar as telas ao contrato atual (`vagas-jl-api/src/docs/swagger.yaml`).
Cada item tem um **contorno provisório no front** — ao implementar o endpoint, remova o contorno indicado.

| # | Necessidade da tela | Endpoint sugerido | Contorno atual no web | Onde remover |
|---|---|---|---|---|
| 1 | Candidato logado descobrir o próprio cadastro (ID, status, elegibilidade) | `GET /candidatos/me` | ID guardado no navegador ao criar o cadastro (`linkStorage.candidateId`). Em outro dispositivo o candidato não vê os dados até recriar o vínculo. | `src/lib/use-links.ts`, `candidato/cadastro/page.tsx`, `candidato/page.tsx` |
| 2 | Formulário do Perfil de Match com opções publicadas (IDs, labels, aliases, pesos) | `GET /perfil-match/configuracao` (autenticado, leitura) | Catálogo local espelhado de `src/config/*.js` da API em `src/config/match-catalog.ts`. **Risco:** IDs de modalidade, idiomas, senioridade, função, especialização, classificação e IA foram inferidos — confira com a configuração publicada. | `src/config/match-catalog.ts` → `getMatchCatalog()` |
| 3 | Recrutador descobrir a empresa a que pertence | `GET /empresas/me` ou `companyId` no `/api/users/me` | Recrutador informa uma vez o ID recebido do admin (`CompanyGate`). | `src/components/company/company-gate.tsx` |
| 4 | Listar vagas da empresa | `GET /empresas/{id}/vagas` | Vagas criadas no próprio navegador ficam em `localStorage` (`useCompanyVacancies`). | `src/lib/use-links.ts`, `empresa/page.tsx`, `empresa/ranking/page.tsx` |
| 5 | Detalhe da vaga para o candidato (descrição, local, canal) | `GET /vagas/{id}` | A tela de Match mostra só `vacancy.title` retornado por `/match`. | `candidato/vagas/[id]/page.tsx` |
| 6 | Ler estado atual de privacidade (disponibilidade, permissões, perfil público) | `GET /candidatos/me/privacidade` (ou incluir no item 1) | Tela parte de padrões seguros (tudo oculto) e só confirma após salvar. | `candidato/privacidade/page.tsx` |
| 7 | Ler parâmetros vigentes do Match (limiar, completude, multiplicadores) | `GET /configuracoes/match` | Campos iniciam com as propostas do documento de regras (60%, 50%, 0,5). | `admin/configuracoes/page.tsx` |
| 8 | Listagens administrativas (empresas, candidatos, vagas pendentes) | `GET /admin/empresas`, `/admin/candidatos`, `/admin/vagas?status=pending` | Admin opera por ID. | `admin/*` |
| 9 | Perfil do candidato visto pela empresa a partir do ranking | já existe `GET /candidatos/{id}` (VJ-25) | Ranking ainda não abre o perfil — próximo passo natural. | `components/match/candidate-ranking.tsx` |

## Configuração necessária na API

- **CORS:** resolvido pelo proxy `/backend` do Next (`API_PROXY_TARGET`). Só é necessário configurar `CORS_ORIGIN` se o web chamar a API por URL absoluta.
- **Porta local:** a API usa `3000`; o web roda em `3001` (`npm run dev`).
