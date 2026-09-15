# Vagas JL API

API REST que conecta profissionais de testes de software a oportunidades de trabalho e permite
que empresas encontrem candidatos compatíveis com suas vagas, a partir de um motor de match
baseado em uma estrutura padronizada de competências.

Este repositório contém a estrutura inicial do projeto (arquitetura, autenticação,
documentação e scripts de execução) e o cadastro de usuários da
[VJ-1](https://jl-mentoria.atlassian.net/browse/VJ-1).
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
│   │   ├── registration.routes.js # POST /usuarios
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
- Esse endpoint retorna apenas o usuário. Use `/api/auth/login` para obter um JWT.
- `/api/auth/register` continua disponível com retorno de usuário e token e validação **422**.
  Os dois cadastros agora exigem no mínimo **8 caracteres** e criam usuários ativos.
  O login mantém compatibilidade com senhas de usuários já cadastrados.

## Contrato de autenticação e erros

- O cadastro público aceita somente `candidate` (padrão) e `company`. A criação de
  administradores não é exposta nesta estrutura inicial.
- E-mails são armazenados e consultados em minúsculas, sem espaços nas extremidades.
- Senhas exigem pelo menos 8 caracteres no cadastro e no máximo 72 bytes em UTF-8.
  O banco armazena o hash bcrypt; senhas e hashes nunca aparecem nas respostas.
- JWTs usam HS256 e expiração configurável. `/api/users/me` exige um Bearer token válido.
- Erros retornam `{ "message": "..." }`; validações podem incluir `errors` com campo e mensagem.
- Status: `400` para JSON inválido e campos inválidos em `/usuarios`, `401` para credenciais/token inválidos, `409` para
  e-mail duplicado (inclusive cadastros concorrentes), `413` para corpo excessivo,
  `422` para dados inválidos nas rotas de autenticação e `503` para indisponibilidade de conexão com o MongoDB.
- Falhas internas retornam uma mensagem genérica. A stack só é incluída em `development`.

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

A suíte também cobre a compatibilidade do cadastro existente e o middleware de conexão.
Não há testes de API/E2E nesta implementação.

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
