# Vagas JL API

API REST que conecta profissionais de testes de software a oportunidades de trabalho e permite
que empresas encontrem candidatos compatíveis com suas vagas, a partir de um motor de match
baseado em uma estrutura padronizada de competências.

Este repositório contém **apenas a estrutura inicial** do projeto (arquitetura, autenticação,
documentação e scripts de execução). Os endpoints de domínio (vagas, candidatos, matching) serão
implementados a partir das user stories do Jira em etapas seguintes.

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
│   │   └── user.routes.js
│   ├── controllers/           # Recebem a requisição, chamam os services e formatam a resposta
│   │   ├── auth.controller.js
│   │   └── user.controller.js
│   ├── services/               # Regra de negócio, isolada do Express (req/res)
│   │   ├── auth.service.js
│   │   └── user.service.js
│   ├── models/                # Schemas do Mongoose
│   │   └── user.model.js
│   └── middleware/            # Autenticação JWT, validação, 404 e tratamento de erros
│       ├── auth.middleware.js
│       ├── validate.middleware.js
│       ├── notFound.middleware.js
│       └── error.middleware.js
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

## Documentação da API (Swagger)

Com o servidor em execução, a documentação interativa fica disponível em:

- Interface Swagger UI: `http://localhost:3000/api-docs`
- Especificação OpenAPI em JSON: `http://localhost:3000/api-docs.json`

A especificação também pode ser consultada diretamente em [`src/docs/swagger.yaml`](./src/docs/swagger.yaml).

## Endpoints iniciais

| Método | Rota               | Autenticação | Descrição                          |
| ------ | ------------------ | ------------ | ------------------------------------ |
| GET    | `/api/health`       | Não          | Verifica se a API está no ar         |
| POST   | `/api/auth/register`| Não          | Cadastra um novo usuário             |
| POST   | `/api/auth/login`   | Não          | Autentica e retorna um token JWT     |
| GET    | `/api/users/me`     | Sim (Bearer) | Retorna os dados do usuário logado   |

Para rotas autenticadas, envie o token retornado no login/registro no header:

```
Authorization: Bearer <token>
```

## Contrato de autenticação e erros

- O cadastro público aceita somente `candidate` (padrão) e `company`. A criação de
  administradores não é exposta nesta estrutura inicial.
- E-mails são armazenados e consultados em minúsculas, sem espaços nas extremidades.
- Senhas exigem pelo menos 6 caracteres no cadastro e no máximo 72 bytes em UTF-8.
  O banco armazena o hash bcrypt; senhas e hashes nunca aparecem nas respostas.
- JWTs usam HS256 e expiração configurável. `/api/users/me` exige um Bearer token válido.
- Erros retornam `{ "message": "..." }`; validações podem incluir `errors` com campo e mensagem.
- Status: `400` para JSON inválido, `401` para credenciais/token inválidos, `409` para
  e-mail duplicado (inclusive cadastros concorrentes), `413` para corpo excessivo,
  `422` para dados inválidos e `503` para indisponibilidade de conexão com o MongoDB.
- Falhas internas retornam uma mensagem genérica. A stack só é incluída em `development`.

## Conexão e execução

`server.js` aguarda a conexão com o MongoDB antes de abrir a porta HTTP. Na parada por
`SIGINT` ou `SIGTERM`, encerra o servidor e desconecta o banco.

`src/app.js` exporta o Express e também estabelece a conexão antes das rotas de autenticação
e perfil. A conexão é reutilizada entre requisições, inclusive quando a aplicação é
importada por um ambiente de funções. Tentativas simultâneas compartilham a mesma conexão;
uma falha permite nova tentativa. A seleção do servidor MongoDB tem limite de 5 segundos.

`GET /api/health` verifica apenas se o processo HTTP responde; não atesta a disponibilidade
do banco. A documentação também pode responder sem uma conexão ativa.

## Validação local

Com MongoDB e API em execução, consulte `/api/health` e `/api-docs`, cadastre um usuário
em `/api/auth/register`, faça login em `/api/auth/login` e use o token em `/api/users/me`.
O Swagger permite executar esse fluxo pelo navegador usando **Authorize**.

Confira também e-mail duplicado, senha incorreta, tentativa de `role: admin` e token expirado.
O projeto ainda não possui suíte automatizada versionada; o antigo script `npm test`,
que apenas retornava sucesso sem executar testes, foi removido.

## Integração contínua e deploy futuros

- Para o GitHub Actions, use `npm ci` com o `package-lock.json` versionado. Uma suíte de
  testes e o workflow serão definidos na etapa de integração contínua.
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
