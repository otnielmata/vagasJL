# Vagas JL API

API REST que conecta profissionais de testes de software a oportunidades de trabalho e permite
que empresas encontrem candidatos compatíveis com suas vagas, a partir de um motor de match
baseado em uma estrutura padronizada de competências.

Este repositório contém a estrutura inicial do projeto (arquitetura, autenticação,
documentação e scripts de execução), o cadastro de usuários da
[VJ-1](https://jl-mentoria.atlassian.net/browse/VJ-1), o login da
[VJ-2](https://jl-mentoria.atlassian.net/browse/VJ-2) e a edição dos próprios dados da
[VJ-4](https://jl-mentoria.atlassian.net/browse/VJ-4), além da exclusão da própria conta da
[VJ-23](https://jl-mentoria.atlassian.net/browse/VJ-23).
Os endpoints de domínio (vagas, candidatos, matching) serão implementados nas próximas histórias.

## Stack

- Node.js + Express
- MongoDB + Mongoose
- Autenticação via JWT (jsonwebtoken + bcryptjs)
- Documentação via Swagger (swagger-ui-express)
- Nodemon para desenvolvimento

## Estrutura de pastas

```
.
├── server.js                 # Ponto de entrada: conecta ao MongoDB e sobe o servidor HTTP
├── src/
│   ├── app.js                 # Configuração do Express (middlewares, rotas, docs, erros)
│   ├── config/                # Configuração de ambiente, conexão com o banco e Swagger
│   │   ├── env.js
│   │   ├── db.js
│   │   └── swagger.js
│   ├── docs/
│   │   └── swagger.yaml       # Especificação OpenAPI 3.0 da API
│   ├── routes/                # Definição de rotas (mapeiam URL -> controller)
│   │   ├── index.js
│   │   ├── auth.routes.js
│   │   ├── registration.routes.js # POST /usuarios; PUT e DELETE /usuarios/:id
│   │   ├── login.routes.js     # POST /login
│   │   └── user.routes.js
│   ├── controllers/           # Recebem a requisição, chamam os services e formatam a resposta
│   │   ├── auth.controller.js
│   │   └── user.controller.js
│   ├── services/               # Regra de negócio, isolada do Express (req/res)
│   │   ├── auth.service.js
│   │   └── user.service.js
│   ├── errors/
│   │   └── api.error.js        # Erro de negócio com status HTTP
│   ├── models/                # Schemas do Mongoose
│   │   └── user.model.js
│   └── middleware/            # Autenticação JWT, validação, 404 e tratamento de erros
│       ├── auth.middleware.js
│       ├── database.middleware.js
│       ├── registration.middleware.js
│       ├── user-update.middleware.js
│       ├── user-delete.middleware.js
│       ├── login.middleware.js
│       ├── validate.middleware.js
│       ├── notFound.middleware.js
│       └── error.middleware.js
├── test/unit/                  # Testes de unidade, sem HTTP ou MongoDB real
├── .env.example                # Modelo de variáveis de ambiente
└── package.json
```

## Pré-requisitos

- Node.js 18+
- Uma instância do MongoDB (local ou Atlas)
- Para excluir contas: MongoDB com transações (replica set, inclusive local, ou Atlas).
  MongoDB standalone não executa a exclusão; a API retorna 503 sem realizar exclusões parciais.

## Configuração

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie o arquivo de variáveis de ambiente e ajuste os valores conforme seu ambiente:

   ```bash
   cp .env.example .env
   ```

   | Variável         | Descrição                                                        |
   | ---------------- | ------------------------------------------------------------------ |
   | `NODE_ENV`       | `development`, `production` ou `test`                              |
   | `PORT`           | Porta em que a API vai rodar                                       |
   | `BASE_URL`       | URL base usada em logs e no Swagger                                 |
   | `MONGODB_URI`    | String de conexão do MongoDB                                       |
   | `JWT_SECRET`     | Segredo próprio obrigatório com pelo menos 32 bytes                |
   | `JWT_EXPIRES_IN` | Tempo de expiração do token (ex.: `1h`, `7d`)                       |
   | `CORS_ORIGIN`    | Origem(ns) permitida(s) para CORS, separadas por vírgula, ou `*`     |

3. Gere um segredo e preencha `JWT_SECRET` no `.env`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Inicie o MongoDB indicado em `MONGODB_URI` e execute `npm run dev` ou `npm start`.

A inicialização falha se o segredo estiver ausente, for curto ou usar o antigo exemplo
`troque-...`. Porta, URL base, protocolo da conexão e duração do JWT também são validados.
Use uma duração positiva com unidade em `JWT_EXPIRES_IN`, por exemplo `30m`, `1h` ou `7d`.
O `.env` e suas variantes ficam fora do Git; somente `.env.example` é versionado.

## Scripts disponíveis

| Script         | Comando         | Descrição                                                                 |
| -------------- | --------------- | ---------------------------------------------------------------------------- |
| Start (estático) | `npm start`   | Inicia a API uma única vez com `node server.js`                              |
| Start (dev/watch) | `npm run dev` | Inicia a API com `nodemon`, reiniciando automaticamente a cada alteração  |
| Testes de unidade | `npm test` | Executa os testes com o runner nativo do Node.js |

## Documentação da API (Swagger)

Com o servidor em execução, a documentação interativa fica disponível em:

- Interface Swagger UI: `http://localhost:3000/api-docs`
- Especificação OpenAPI em JSON: `http://localhost:3000/api-docs.json`

A especificação também pode ser consultada diretamente em [`src/docs/swagger.yaml`](./src/docs/swagger.yaml).

## Endpoints iniciais

| Método | Rota               | Autenticação | Descrição                          |
| ------ | ------------------ | ------------ | ------------------------------------ |
| GET    | `/api/health`       | Não          | Verifica se a API está no ar         |
| POST   | `/usuarios`        | Não          | Registra usuário ativo (VJ-1)        |
| PUT    | `/usuarios/{id}`   | Sim (Bearer) | Edita os próprios dados (VJ-4)       |
| DELETE | `/usuarios/{id}`   | Sim (Bearer) | Exclui a própria conta e o candidato vinculado (VJ-23) |
| POST   | `/login`           | Não          | Autentica usuário ativo (VJ-2)       |
| POST   | `/api/auth/register`| Não          | Cadastra um novo usuário             |
| POST   | `/api/auth/login`   | Não          | Autentica e retorna um token JWT     |
| GET    | `/api/users/me`     | Sim (Bearer) | Retorna os dados do usuário logado   |

Para rotas autenticadas, envie o token retornado no login/registro no header:

```
Authorization: Bearer <token>
```

## Cadastro de usuários — VJ-1

`POST /usuarios` recebe JSON com os mesmos nomes de campos do scaffold:

```json
{
  "name": "Maria Silva",
  "email": "maria.silva@example.com",
  "password": "senhaForte123"
}
```

`name`, `email` e `password` são obrigatórios e devem ser strings. O nome não pode ficar
vazio após remover espaços; o e-mail deve ser válido; a senha deve ter no mínimo 8 caracteres
e no máximo 72 bytes em UTF-8. O campo opcional `role` aceita `candidate` (padrão) ou `company`.

Resposta **201**:

```json
{
  "user": {
    "_id": "6512f1e2b3a1c2d3e4f5a6b7",
    "name": "Maria Silva",
    "email": "maria.silva@example.com",
    "role": "candidate",
    "status": "active",
    "createdAt": "2026-09-15T12:00:00.000Z",
    "updatedAt": "2026-09-15T12:00:00.000Z"
  }
}
```

- O servidor sempre cria o usuário com `status: "active"`; `status` e `_id` enviados pelo
  cliente não são usados. Usuários existentes não são alterados por uma migração.
- A senha é transformada em hash bcrypt antes da persistência e não aparece na resposta.
- E-mails são únicos na coleção compartilhada com `/api/auth/register`, inclusive em
  solicitações concorrentes. O índice único precisa estar pronto antes da criação.
- E-mail duplicado retorna **409**. Campos ausentes/inválidos retornam **400** e seus nomes
  aparecem em `errors`, sem ecoar os valores enviados. A validação precede a conexão com o banco.
- Esse endpoint retorna apenas o usuário. Use `/login` para obter um JWT.
- `/api/auth/register` continua disponível com retorno de usuário e token e validação **422**.
  Os dois cadastros agora exigem no mínimo **8 caracteres** e criam usuários ativos.
  O login mantém compatibilidade com senhas de usuários já cadastrados.

## Login de usuários — VJ-2

`POST /login` recebe:

```json
{
  "email": "maria.silva@example.com",
  "password": "senhaForte123"
}
```

O e-mail deve ser válido e a senha deve ser uma string não vazia, com até 72 bytes em UTF-8.
O e-mail é normalizado para minúsculas e sem espaços nas extremidades. A senha é comparada
exatamente como enviada contra o hash bcrypt armazenado, sem remover espaços ou alterar seu conteúdo.

- **200**: usuário cadastrado e ativo (`status: "active"`), com senha correta. Retorna
  `{ "user": { ... }, "token": "..." }`, sem senha ou hash nos dados do usuário.
- **401**: e-mail não cadastrado, senha incorreta ou usuário inativo. Todos retornam
  `{ "message": "Credenciais invalidas" }`, sem identificar qual credencial está incorreta.
- **400**: e-mail/senha ausentes, tipos ou formatos inválidos, ou JSON inválido. A validação
  dos campos ocorre antes da conexão com o MongoDB; valores recebidos não são ecoados nos erros.

O token é um JWT assinado com HS256 usando `JWT_SECRET`, com identificador (`sub`), perfil
(`role`), emissão (`iat`) e expiração (`exp`). A validade é definida por `JWT_EXPIRES_IN`
(padrão `1d`). Use `Authorization: Bearer <token>` em `/api/users/me` e nas demais rotas protegidas.

O endpoint existente `/api/auth/login` compartilha autenticação e bloqueio de usuários inativos,
mantendo **422** para campos inválidos. A exigência de 8 caracteres vale para novos cadastros;
o login continua aceitando as senhas de usuários antigos. A VJ-23 acrescenta a revogação
efetiva de tokens após exclusão, consultando a conta em cada requisição autenticada.
Refresh token e alteração de status de usuários não fazem parte deste escopo.

## Contrato de autenticação e erros

### Edição de usuário — VJ-4

Envie `PUT /usuarios/{id}` com `Authorization: Bearer <token>` e ao menos um dos campos
`name`, `email` ou `password`. Por exemplo:

```json
{
  "name": "Maria Silva",
  "email": "maria.nova@example.com"
}
```

- Apesar de usar `PUT` conforme a história, campos omitidos são preservados. O corpo não
  pode ser vazio. Valores `null` e campos não editáveis, como `_id`, `id`, `role`, `status`,
  `createdAt`, `updatedAt` e `__v`, são rejeitados com **400**.
- O identificador deve ser um ObjectId de 24 caracteres hexadecimais. Identificador
  malformado retorna **400**; usuário inexistente retorna **404**.
- Somente o titular do JWT pode editar seus dados. Tentativas de editar outro usuário
  existente retornam **403**, inclusive para administradores. Token ausente, inválido ou
  expirado retorna **401**.
- O nome precisa ser uma string não vazia. O novo e-mail é validado e normalizado e deve
  continuar único. Conflitos, inclusive detectados pelo índice único durante a gravação,
  retornam **409**. Manter o próprio e-mail é permitido.
- A senha alterada segue as regras do cadastro: mínimo de 8 caracteres e máximo de 72 bytes
  em UTF-8. O model gera um novo hash bcrypt antes de salvar. Quando omitida, a senha
  armazenada permanece intacta. A troca de senha não revoga JWTs já emitidos nesta etapa.
- Sucesso retorna **200** com `{ "user": { ... } }`, sem senha ou hash. Nenhum token novo
  é emitido pela edição.

Para dados válidos e token válido, a existência do alvo é verificada antes da titularidade:
alvo inexistente retorna 404; alvo existente de outra pessoa retorna 403, conforme os cenários
da VJ-4. A edição utiliza o documento Mongoose e `save()` para executar validações e hooks.

### Regras gerais

- O cadastro público aceita somente `candidate` (padrão) e `company`. A criação de
  administradores não é exposta nesta estrutura inicial.
- E-mails são armazenados e consultados em minúsculas, sem espaços nas extremidades.
- Senhas exigem pelo menos 8 caracteres no cadastro e no máximo 72 bytes em UTF-8.
  O banco armazena o hash bcrypt; senhas e hashes nunca aparecem nas respostas.
- JWTs usam HS256 e expiração configurável. `/api/users/me` exige um Bearer token válido.
- Erros retornam `{ "message": "..." }`; validações podem incluir `errors` com campo e mensagem.
- Status: `400` para JSON inválido e campos inválidos no cadastro/edição em `/usuarios` e no `/login`, `401` para credenciais/token inválidos, `409` para
  e-mail duplicado (inclusive cadastros concorrentes), `413` para corpo excessivo,
  `422` para dados inválidos em `/api/auth/*` e `503` para indisponibilidade de conexão com o MongoDB.
- Falhas internas retornam uma mensagem genérica. A stack só é incluída em `development`.

## Exclusão da própria conta — VJ-23

`DELETE /usuarios/{id}` exige `Authorization: Bearer <token>` e não precisa de corpo.
O identificador deve ser um ObjectId de 24 caracteres hexadecimais. Nem administradores
podem excluir outras contas por este endpoint.

| Situação | Resposta |
| --- | --- |
| Conta própria existente e ativa, exclusão confirmada | **204**, sem corpo |
| Identificador malformado, com autenticação válida | **400** |
| JWT ausente, inválido ou expirado; conta autenticada inativa | **401** |
| Alvo existente pertence a outro usuário | **403** |
| Alvo inexistente, solicitado por uma conta autenticada ativa | **404** |
| Repetição da exclusão do próprio identificador com JWT ainda assinado e não expirado | **404**, sem nova remoção |
| Banco indisponível ou sem suporte a transações | **503**, sem confirmação de sucesso |

A exclusão é física: remove o documento em `users` e todos os documentos em `candidates`
cujo campo `user` corresponde ao mesmo ObjectId, independentemente do status do candidato.
Assim, o candidato não permanece disponível para consultas de empresas e os índices únicos
deixam de reservar os e-mails removidos. O novo cadastro recebe outro identificador: tokens
da conta antiga não passam a representar a nova conta. Outros usuários/candidatos não são
alterados. A base administrativa de autorização de alunos não é um cadastro de candidato
e não é modificada por esta operação.

Todas as rotas que usam `authenticate` verificam agora a existência e o status ativo da conta
no MongoDB, além da assinatura e expiração do JWT; o papel de autorização vem do banco.
Depois da exclusão, login com as antigas credenciais e uso dos antigos tokens retornam **401**.
A única exceção de resposta é a repetição de `DELETE` contra o próprio identificador ausente:
retorna **404** para cumprir a idempotência da história, sem autorizar acesso ou qualquer mutação.
JWT expirado/inválido continua retornando **401**, mesmo nessa repetição.

### Atomicidade e ambiente MongoDB

A remoção usa uma única transação com a mesma sessão para leitura e exclusão de usuário
e candidatos, confirmação majoritária e leituras no primário. Uma falha aborta a transação;
o controller só retorna 204 depois da confirmação. Não existe fallback com remoções isoladas.
Consulte a documentação oficial de [transações do MongoDB](https://www.mongodb.com/docs/manual/core/transactions/)
e [transações do Mongoose](https://mongoosejs.com/docs/transactions.html).

Para desenvolvimento, configure um replica set local antes de usar o DELETE e ajuste
`MONGODB_URI`, por exemplo `mongodb://localhost:27017/vagas-jl?replicaSet=rs0`, se o conjunto
configurado se chamar `rs0`. Acrescentar o parâmetro à URI **não** transforma um servidor
standalone em replica set. Alternativamente, use um cluster Atlas. Esta implementação não
altera o `.env`, a topologia do MongoDB nem dados reais automaticamente.

A branch parte da `main`, que ainda não contém o cadastro de candidatos da VJ-22.
A limpeza usa a coleção `candidates` e o vínculo `user` já definidos naquele PR, sem copiar
a funcionalidade pendente de revisão nem criar uma segunda definição de schema. Ausência
de candidato não impede a exclusão. Buscas de empresas não são implementadas nesta história.

## Conexão e execução

`server.js` aguarda a conexão com o MongoDB antes de abrir a porta HTTP. Na parada por
`SIGINT` ou `SIGTERM`, encerra o servidor e desconecta o banco.

`src/app.js` exporta o Express; o middleware de banco estabelece a conexão nas rotas de
autenticação, perfil e cadastro. A conexão é reutilizada entre requisições, inclusive quando a aplicação é
importada por um ambiente de funções. Tentativas simultâneas compartilham a mesma conexão;
uma falha permite nova tentativa. A seleção do servidor MongoDB tem limite de 5 segundos.

`GET /api/health` verifica apenas se o processo HTTP responde; não atesta a disponibilidade
do banco. A documentação também pode responder sem uma conexão ativa.

## Validação local

Com MongoDB e API em execução, consulte `/api/health` e `/api-docs`, cadastre um usuário
em `/api/auth/register`, faça login em `/api/auth/login` e use o token em `/api/users/me`.
O Swagger permite executar esse fluxo pelo navegador usando **Authorize**.

Confira também e-mail duplicado, senha incorreta, tentativa de `role: admin` e token expirado.

### Testes de unidade

Após `npm install`, execute `npm test`. A suíte usa `node:test` e mocks das dependências de
persistência, sem iniciar a API, abrir portas HTTP ou conectar a um MongoDB. Não depende de
um `.env`: os testes que precisam de configuração usam valores temporários de teste.

| Critério da VJ-1 | Cobertura unitária |
| --- | --- |
| Cadastro válido, HTTP 201 e status ativo | Service, controller e model |
| E-mail duplicado, HTTP 409 | Service (consulta e erro do índice único) e middleware de erros |
| Campos obrigatórios inválidos, HTTP 400 | Regras de validação, model, controller e middleware de erros |
| Senha com no mínimo 8 caracteres e hash seguro | Regras de validação e hook do model com persistência simulada |
| Resposta sem senha | Serialização do model e controller |

| Critério da VJ-2 | Cobertura unitária |
| --- | --- |
| Login válido, HTTP 200 e resposta sem senha | Service com bcrypt real e controller com persistência simulada |
| Usuário ativo e senha validada contra hash | Service: ativo, inativo, e-mail desconhecido e senha incorreta |
| Credenciais inválidas, HTTP 401 e mensagem genérica | Service, controller e middleware de erros |
| E-mail/senha ausentes ou inválidos, HTTP 400 | Regras de validação de login |
| Token válido com prazo de expiração | Assinatura HS256, claims, expiração configurável e rejeição após expirar |

| Critério da VJ-4 | Cobertura unitária |
| --- | --- |
| Edição própria, HTTP 200 e resposta sem senha | Service, controller e model |
| Autenticação obrigatória | Middleware JWT: válido, ausente, expirado e inválido |
| Usuário inexistente, HTTP 404 | Service e erro de remoção durante a gravação |
| Edição de outro usuário, HTTP 403 | Service sem alterações nem gravação |
| E-mail já utilizado, HTTP 409 | Consulta e erro concorrente do índice único |
| Dados inválidos e campos não editáveis, HTTP 400 | Regras de validação, controller e whitelist do service |
| Senha alterada com hash; senha omitida preservada | Hooks do model com gravação simulada |

A suíte também cobre a compatibilidade dos endpoints existentes e o middleware de conexão.
Não há testes de API/E2E nesta implementação.

| Critério da VJ-23 | Cobertura unitária |
| --- | --- |
| Exclusão própria, 204 sem corpo | Service com sessão simulada e controller |
| Somente usuário autenticado; 401 para JWT ausente/inválido/expirado | Middleware de autenticação e ordem da rota |
| Usuário inexistente e segunda exclusão, 404 | Service e middleware, sem novas mutações |
| Exclusão de outro usuário, 403 | Service, sem limpeza de registros |
| Login rejeitado após exclusão | Service de autenticação com persistência simulada |
| Tokens anteriores deixam de autorizar acesso | Middleware com conta inexistente/inativa e papel atualizado |
| Candidato removido deixa de aparecer em consultas | Limpeza pelo vínculo user, preservando outros candidatos |
| Reutilização de e-mail com novo identificador | Services de exclusão e cadastro com persistência simulada |
| Falhas não retornam sucesso parcial | Contrato de transação/sessão e propagação de erros |

Os testes não comprovam uma transação contra infraestrutura real: MongoDB, rollback e
confirmação são simulados. Não foram executadas exclusões reais nem testes de API/E2E.

## Integração contínua e deploy futuros

- Para o GitHub Actions, use `npm ci` e `npm test` com o `package-lock.json` versionado.
  O workflow será definido na etapa de integração contínua.
- A Vercel oferece detecção nativa do Express exportado em `src/app.js`, conforme a
  [documentação oficial](https://vercel.com/docs/frameworks/backend/express).
  Configure `NODE_ENV=production`, `BASE_URL` com a URL pública, `MONGODB_URI` com o banco
  de destino, `JWT_SECRET`, `JWT_EXPIRES_IN` e `CORS_ORIGIN` no ambiente da plataforma.
- Valide os assets do Swagger no futuro preview: a Vercel documenta que `express.static()`
  não é servido nesse modo. O Swagger atual serve seus assets localmente por esse mecanismo;
  será necessário preparar os assets em `public/` ou usar URLs externas na etapa de deploy.
- GitHub Actions, integração com MongoDB Atlas e deploy na Vercel ainda não foram executados.

## Próximos passos

- Implementar as entidades de domínio (vagas, candidatos, empresas, competências) a partir das
  user stories do Jira.
- Implementar o motor de match entre vagas e candidatos.
- Configurar CI via GitHub Actions e deploy via Vercel.
