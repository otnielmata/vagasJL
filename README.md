# Vagas JL API

API REST que conecta profissionais de testes de software a oportunidades de trabalho e permite
que empresas encontrem candidatos compatíveis com suas vagas, a partir de um motor de match
baseado em uma estrutura padronizada de competências.

Este repositório contém a estrutura inicial do projeto (arquitetura, autenticação,
documentação e scripts de execução), o cadastro de usuários da
[VJ-1](https://jl-mentoria.atlassian.net/browse/VJ-1), o login da
[VJ-2](https://jl-mentoria.atlassian.net/browse/VJ-2), a edição dos próprios dados da
[VJ-4](https://jl-mentoria.atlassian.net/browse/VJ-4), a consulta pública autenticada da
[VJ-6](https://jl-mentoria.atlassian.net/browse/VJ-6), o cadastro de candidatos da
[VJ-22](https://jl-mentoria.atlassian.net/browse/VJ-22) e a exclusão da própria conta da
[VJ-23](https://jl-mentoria.atlassian.net/browse/VJ-23), além da validação de elegibilidade da
[VJ-24](https://jl-mentoria.atlassian.net/browse/VJ-24) e da visualização individual da
[VJ-25](https://jl-mentoria.atlassian.net/browse/VJ-25), com alteração de candidatos na
[VJ-26](https://jl-mentoria.atlassian.net/browse/VJ-26) e exclusão lógica na
[VJ-27](https://jl-mentoria.atlassian.net/browse/VJ-27).
Vagas, competências e motor de match serão implementados nas próximas histórias.

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
│   │   ├── candidate.routes.js # Operações de candidatos
│   │   ├── registration.routes.js # POST /usuarios; GET, PUT e DELETE /usuarios/:id
│   │   ├── login.routes.js     # POST /login
│   │   └── user.routes.js
│   ├── controllers/           # Recebem a requisição, chamam os services e formatam a resposta
│   │   ├── auth.controller.js
│   │   ├── candidate.controller.js
│   │   └── user.controller.js
│   ├── services/               # Regra de negócio, isolada do Express (req/res)
│   │   ├── auth.service.js
│   │   ├── candidate.service.js
│   │   ├── student-validation.service.js
│   │   └── user.service.js
│   ├── errors/
│   │   └── api.error.js        # Erro de negócio com status HTTP
│   ├── models/                # Schemas do Mongoose
│   │   ├── candidate.model.js
│   │   ├── student-authorization.model.js
│   │   └── user.model.js
│   └── middleware/            # Autenticação JWT, validação, 404 e tratamento de erros
│       ├── auth.middleware.js
│       ├── candidate.middleware.js
│       ├── candidate-delete.middleware.js
│       ├── candidate-read.middleware.js
│       ├── candidate-update.middleware.js
│       ├── candidate-validation.middleware.js
│       ├── database.middleware.js
│       ├── registration.middleware.js
│       ├── user-update.middleware.js
│       ├── user-delete.middleware.js
│       ├── user-read.middleware.js
│       ├── login.middleware.js
│       ├── validate.middleware.js
│       ├── notFound.middleware.js
│       └── error.middleware.js
├── test/unit/                  # Testes de unidade, sem HTTP ou MongoDB real
├── scripts/revalidate-candidate.js # Revalidacao administrativa de candidato pendente
├── scripts/sync-candidate-indexes.js # Sincronizacao controlada dos indices de candidatos
├── .env.example                # Modelo de variáveis de ambiente
└── package.json
```

## Pré-requisitos

- Node.js 18+
- Uma instância do MongoDB (local ou Atlas)
- Para excluir contas ou alterar o e-mail de candidato: MongoDB com transações (replica set,
  inclusive local, ou Atlas). MongoDB standalone retorna 503 sem realizar alterações parciais.

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
   | `STUDENT_VALIDATION_SOURCE` | `pending` (padrão) ou `mongodb` para consultar a base autorizada |

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
| Revalidação de aluno | `npm run candidates:revalidate -- <id>` | Revalida um candidato pendente pela base confiável |
| Índices de candidatos | `npm run candidates:sync-indexes` | Migra os índices de e-mail ativo e cadastro atual por usuário |

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
| POST   | `/candidatos`      | Sim (Bearer) | Cadastra candidato e valida aluno (VJ-22) |
| GET    | `/candidatos/{id}` | Sim (Bearer) | Consulta candidato conforme o papel (VJ-25) |
| PATCH  | `/candidatos/{id}` | Sim (Bearer) | Altera o próprio candidato e recalcula o status (VJ-26) |
| DELETE | `/candidatos/{id}` | Sim (Bearer) | Exclui logicamente o próprio candidato (VJ-27) |
| POST   | `/candidatos/{id}/validacao` | Sim (Bearer) | Valida a elegibilidade do próprio candidato (VJ-24) |
| PUT    | `/usuarios/{id}`   | Sim (Bearer) | Edita os próprios dados (VJ-4)       |
| GET    | `/usuarios/{id}`   | Sim (Bearer) | Consulta dados públicos (VJ-6)      |
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

### Cadastro de candidato — VJ-22

`POST /candidatos` exige JWT válido e uma conta existente, ativa e com papel `candidate`.
Contas `company` ou `admin` recebem **403**. Os campos obrigatórios
são `name` e `email`; o e-mail deve coincidir com o da conta autenticada para impedir o uso
do e-mail de outro aluno como comprovação. Exemplo:

```json
{
  "name": "Maria Silva",
  "email": "maria@example.com",
  "phone": "+55 11 99999-9999",
  "city": "São Paulo",
  "state": "SP",
  "country": "Brasil",
  "githubUrl": "https://github.com/maria",
  "professionalSummary": "Profissional de testes de software",
  "availability": "available"
}
```

São aceitos `photoUrl`, `phone`, `city`, `state`, `country`, `linkedinUrl`, `githubUrl`,
`portfolioUrl`, `professionalSummary` e `availability`. Campos opcionais omitidos ou `null`
são persistidos como a string **`UNKNOWN`**, nunca como `false`. Strings vazias são inválidas.
Disponibilidade aceita `available`, `unavailable` ou `UNKNOWN`; booleanos não são aceitos.
Fotos e links são URLs HTTP/HTTPS, não uploads. Nome aceita até 200 caracteres, apresentação
até 5.000 e demais textos até 2.048; telefone usa dígitos/pontuação e tem de 6 a 40 caracteres.

`purchaseCode` e `trustedIdentifier` são comprovantes opcionais (1 a 256 caracteres). Quando
informados para um registro ainda pendente, ao menos um deve coincidir exatamente com o hash
armazenado na base confiável e vinculado ao mesmo e-mail. Um e-mail marcado como `authorized`
é suficiente por si só. Comprovantes e hashes não são gravados no perfil nem retornados pela API.
Campos de controle (`user`, `status`, `studentVerified`, `visibleToCompanies`) são rejeitados.
O vínculo vem do JWT e o status é definido pelo servidor.

O retorno é **201** com `{ "candidate": { ... } }`, incluindo `status`, resumo de `eligibility`,
campos do perfil e `visibleToCompanies`. A fonte interna da validação e os comprovantes não são
expostos. A coleção `candidates` mantém um índice único parcial para o cadastro atual de cada
`user` (`deletedAt: null`) e outro para `email` somente quando `status` é `active`.
Um segundo cadastro do mesmo usuário ou o uso de um e-mail já associado a candidato ativo retorna
**409**. Candidatos pendentes, incompletos, inativos ou bloqueados não reservam o e-mail pela regra
RN-004; a conta de usuário continua sujeita à sua própria regra de e-mail único. O endpoint não
cria uma nova conta de usuário.

| Status armazenado | Significado | Visível para empresas |
| --- | --- | --- |
| `pending_validation` | Pendente de validação | Não |
| `incomplete_profile` | Perfil incompleto | Não |
| `active` | Ativo | Sim |
| `inactive` | Inativo | Não |
| `blocked` | Bloqueado | Não |

O cadastro nunca retorna `active`: validação pendente mantém `pending_validation` e validação
concluída muda para `incomplete_profile`. `visibleToCompanies` é calculado exclusivamente pelo
status. O model oferece `Candidate.findVisibleToCompanies()` com filtro obrigatório `active`
para as futuras buscas de empresas. Esta história não cria busca de empresas nem fluxo de ativação.

#### Base confiável de alunos

A história não fornece a integração ou a base real. A implementação utiliza uma coleção
administrada **`authorized_students`**, separada dos cadastros públicos, e dois modos:

- `STUDENT_VALIDATION_SOURCE=pending`: validação ainda não configurada; cria candidato pendente.
- `STUDENT_VALIDATION_SOURCE=mongodb`: consulta a base autoritativa pelo e-mail da conta.
  Registro `authorized` permite criar perfil incompleto; um registro `pending` pode ser aprovado
  por código de compra ou identificador confiável e, sem comprovante, continua pendente;
  registro ausente, `denied` ou comprovante incorreto rejeita com **422**, sem criar candidato.

Somente um administrador com acesso direto ao banco deve alimentar essa coleção a partir da
fonte oficial de alunos. Não há endpoint público para autorizar alunos. Exemplo de operação
administrativa no `mongosh`, **após confirmar a matrícula na fonte oficial**:

```javascript
db.getSiblingDB('vagas-jl').authorized_students.updateOne(
  { email: 'aluno-validado@example.com' },
  { $set: { status: 'authorized' } },
  { upsert: true }
)
```

Os e-mails devem ser normalizados para minúsculas e são únicos. Para validar por compra, o
administrador pode registrar `purchaseCodeHash` com o SHA-256 hexadecimal (64 caracteres) do
código real, vinculado ao mesmo e-mail. `trustedIdentifierHash` segue o mesmo formato para outro
identificador confiável aprovado pelo produto. Ambos os hashes possuem índices únicos e não são
selecionados em consultas comuns. O cliente envia o valor original, nunca o hash; a comparação
usa tempo constante. Códigos e identificadores em texto puro não são persistidos nem registrados
em logs. Um e-mail com status `authorized` é suficiente por si só. Falhas da fonte retornam
**503**, não autorizam o aluno e não são confundidas com rejeição de elegibilidade.

Após atualizar uma instalação que já criou o índice global antigo de `candidates.email`, faça
backup e execute uma vez, em janela controlada:

```bash
npm run candidates:sync-indexes
```

O comando preenche `deletedAt: null` nos registros legados, remove os índices globais obsoletos
e cria `unique_active_candidate_email` e `unique_current_candidate_user`. Assim, cada conta possui
somente um cadastro atual, mas pode manter históricos inativos e criar um novo candidato após a
exclusão lógica. Na base de alunos, apenas cria/verifica os índices declarados; não remove índices
administrativos adicionais. O comando não é executado automaticamente durante o start.

Nenhum aluno foi importado ou autorizado automaticamente. O `.env.example` usa `pending`;
o `.env` local existente não foi alterado. Após preparar a base, configure `mongodb` e reinicie
a API. Um operador pode revalidar um cadastro já pendente com:

```bash
npm run candidates:revalidate -- <ObjectId-do-candidato>
```

Esse comando administrativo verifica novamente o e-mail na base confiável e muda somente
`pending_validation` para `incomplete_profile`. A atualização condicional impede sobrescrever
um bloqueio concorrente. Ele não ativa, desbloqueia ou recria candidatos.

| Condição | HTTP |
| --- | --- |
| Cadastro pendente ou validado com sucesso | 201 |
| Dados inválidos, campos não permitidos ou e-mail diferente da conta | 400 |
| JWT inválido/ausente/expirado ou conta inexistente/inativa | 401 |
| Conta autenticada não possui papel `candidate` | 403 |
| Mesmo usuário já cadastrado ou e-mail usado por candidato ativo | 409 |
| Fora da base autorizada ou comprovante incorreto | 422 |

### Validação de elegibilidade do candidato — VJ-24

`POST /candidatos/{id}/validacao` reprocessa a validação de um candidato já cadastrado. Exige
JWT válido de uma conta com perfil `candidate`; o identificador precisa ser um ObjectId e o
candidato deve pertencer ao titular do token. O corpo é opcional para validação por e-mail:

```json
{}
```

Para comprovação adicional, envie no máximo os campos abaixo, com 1 a 256 caracteres:

```json
{
  "purchaseCode": "codigo-original-da-compra",
  "trustedIdentifier": "identificador-aprovado"
}
```

A API ignora qualquer alegação de aprovação vinda do cliente: campos como `email`, `status`,
`approved`, `source` e `user` são rejeitados com **400**. A validação sempre usa o e-mail
normalizado que já está vinculado ao candidato e à conta autenticada. A base
`authorized_students` armazena apenas hashes SHA-256 dos comprovantes; os valores recebidos não
entram no documento de candidato, na resposta ou em mensagens de erro.

Cada tentativa concluída pela fonte grava em `candidate.eligibility` o resultado atual, método,
fonte interna, data da última tentativa e data da aprovação. A resposta omite a fonte interna e
expõe somente o resumo seguro (`status`, `method`, `lastAttemptAt` e `approvedAt`). O contrato do
service separa a fonte de validação do endpoint, permitindo incluir futuramente um adaptador da
plataforma de vendas sem alterar a URL nem o corpo público.

| Resultado | HTTP | Efeito no candidato |
| --- | --- | --- |
| Aprovado por e-mail ou comprovante | 200 | `pending_validation` muda para `incomplete_profile` |
| Já aprovado | 200 | Resposta idempotente, sem nova consulta ou efeito duplicado |
| Fonte ainda inconclusiva | 202 | Continua `pending_validation` e invisível para empresas |
| Definitivamente não elegível | 422 | Continua pendente; registra somente o resultado seguro |
| Inativo ou bloqueado | 409 | Nenhuma validação ou mudança de estado |
| E-mail do candidato diverge da conta atual | 409 | Nenhuma prova é consultada e o estado é preservado |
| Candidato de outro usuário | 403 | Nenhuma validação ou mudança de estado |
| Candidato inexistente | 404 | Nenhuma mudança |
| Fonte ou banco indisponível | 503 | Estado anterior preservado integralmente |

A aprovação de elegibilidade **nunca ativa** o cadastro. A conclusão do perfil e a ativação são
fluxos separados; somente `status: active` torna `visibleToCompanies` verdadeiro. Uma repetição
após aprovação retorna **200** e preserva o estado válido. Candidatos antigos já aprovados recebem
os metadados legados uma única vez, sem promoção para `active`.

### Visualização de candidato — VJ-25

`GET /candidatos/{id}` exige JWT válido de uma conta ativa com papel `candidate` ou `company`.
O candidato pode consultar somente o próprio cadastro, independentemente de estar pendente,
incompleto, ativo, inativo ou bloqueado. A empresa recebe dados somente quando o candidato está
`active`; cadastro inexistente ou em qualquer outro status retorna a mesma resposta **404**, sem
revelar o estado real.

A resposta contém apenas `_id`, nome, foto, e-mail de contato, telefone, localização, LinkedIn,
GitHub, portfólio, apresentação profissional e disponibilidade. O titular também recebe `status`;
a empresa não. Campos opcionais ausentes, nulos, vazios ou legados como booleano são apresentados
como `UNKNOWN`, nunca como `false`. Conta vinculada, senha, hashes, tokens, comprovantes, datas e
detalhes internos de elegibilidade não fazem parte da projeção nem do objeto retornado.

| Condição | HTTP |
| --- | --- |
| Titular consulta o próprio cadastro em qualquer status | 200 |
| Empresa consulta candidato ativo | 200 |
| Identificador malformado | 400 |
| JWT ausente/inválido ou conta inexistente/inativa | 401 |
| Candidato consulta outro candidato ou papel sem permissão | 403 |
| Candidato inexistente ou não ativo para empresa | 404 |

A consulta não executa gravações e não altera os dados nem o status do candidato. Listagem,
filtros, busca textual e cálculo de match continuam fora do escopo desta história.

### Alteração de candidato — VJ-26

`PATCH /candidatos/{id}` exige JWT válido de uma conta ativa com papel `candidate` e aceita ao
menos um campo: nome, foto, e-mail, telefone, cidade, estado, país, LinkedIn, GitHub, portfólio,
apresentação profissional ou disponibilidade. Campos omitidos permanecem inalterados. `null` nos
campos opcionais é convertido para `UNKNOWN`; booleanos como `false` são rejeitados. Identificador,
proprietário, status, elegibilidade, histórico, datas e visibilidade não podem ser enviados.

O status é calculado exclusivamente pelo servidor:

| Elegibilidade e perfil | Status resultante |
| --- | --- |
| Aprovada e com nome, e-mail, telefone, cidade, estado, país, apresentação e disponibilidade | `active` |
| Aprovada, mas faltando ao menos um desses campos | `incomplete_profile` |
| Pendente ou rejeitada, mesmo com perfil completo | `pending_validation` |
| Candidato `inactive` ou `blocked` | Edição recusada com 409; status preservado |

Ao alterar o e-mail, a API verifica unicidade entre contas e candidatos ativos, atualiza `users`
e `candidates` na mesma transação e mantém o mesmo identificador da conta. A validação anterior é
arquivada internamente com o e-mail antigo e sua data de invalidação; a elegibilidade atual volta
a `pending`, o status volta a `pending_validation` e o candidato deixa imediatamente de aparecer
para empresas. O histórico de auditoria e a fonte da validação nunca são retornados.

| Condição | HTTP |
| --- | --- |
| Atualização válida | 200 |
| Identificador, corpo, campo ou valor inválido | 400 |
| JWT ausente/inválido ou conta inexistente/inativa | 401 |
| Papel sem permissão ou candidato de outro usuário | 403 |
| Candidato inexistente | 404 |
| E-mail em uso, candidato inativo/bloqueado ou alteração concorrente | 409 |
| Troca de e-mail sem suporte transacional ou banco indisponível | 503 |

Edições sem troca de e-mail usam atualização condicional atômica e continuam disponíveis em
MongoDB standalone. A troca de e-mail requer replica set local ou MongoDB Atlas para garantir que
conta e candidato sejam confirmados ou revertidos juntos.

### Exclusão de candidato — VJ-27

`DELETE /candidatos/{id}` exige JWT válido de uma conta ativa com papel `candidate`, aceita um
ObjectId e não precisa de corpo. O titular pode excluir somente o próprio cadastro nos status
`pending_validation`, `incomplete_profile` ou `active`. A API grava `status: inactive` e
`deletedAt` na mesma atualização atômica e retorna **204 sem corpo**. O campo de auditoria é
privado e não aparece nas respostas.

A exclusão remove imediatamente o candidato das consultas de empresas e dos futuros fluxos de
busca e match, pois todos usam apenas `status: active`. A conta em `users`, suas credenciais e o
registro administrativo em `authorized_students` são preservados. O e-mail deixa de contar para
a unicidade de candidato ativo e o índice do cadastro atual é liberado; um novo cadastro recebe
outro ObjectId e passa novamente pela validação de aluno.

| Condição | HTTP | Efeito |
| --- | --- | --- |
| Titular exclui candidato pendente, incompleto ou ativo | 204 | Torna inativo e registra a data |
| Identificador malformado | 400 | Nenhuma alteração |
| JWT ausente/inválido ou conta inexistente/inativa | 401 | Nenhuma alteração |
| Papel sem permissão ou candidato de outro usuário | 403 | Nenhuma alteração |
| Candidato inexistente, já inativo ou segunda exclusão | 404 | Nenhuma nova alteração |
| Candidato bloqueado | 409 | Permanece bloqueado |

O endpoint ignora qualquer corpo e nunca atribui `blocked`, reativa registros ou exclui a conta.
Retenção e anonimização do histórico ficam para evolução futura. Em instalações existentes,
execute `npm run candidates:sync-indexes` em uma janela controlada antes de permitir recadastro.


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

### Consulta de usuário — VJ-6

Envie `GET /usuarios/{id}` com `Authorization: Bearer <token>`, sem corpo de requisição.
Qualquer usuário autenticado pode consultar os dados públicos de um usuário existente,
incluindo outro usuário. A regra de editar somente os próprios dados continua exclusiva da edição.

Resposta **200**:

```json
{
  "user": {
    "_id": "6512f1e2b3a1c2d3e4f5a6b7",
    "name": "Maria Silva"
  }
}
```

Como a história não enumera os campos públicos, este contrato define apenas **`_id` e `name`**.
O service limita os campos consultados no MongoDB e monta a resposta com essa lista explícita.
E-mail, perfil, status, datas internas, senha, hash e tokens ficam fora da resposta, inclusive
se novos campos privados forem adicionados ao model no futuro.

- **401**: autenticação ausente, inválida ou expirada; verificada antes do identificador e do banco.
- **400**: identificador malformado (é necessário um ObjectId com 24 caracteres hexadecimais).
- **404**: identificador válido, mas usuário inexistente.
- A consulta inclui usuários existentes sem filtrar por status; não informa se o alvo está ativo.
- O perfil próprio completo continua disponível em `/api/users/me`, com seu contrato existente.

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

A limpeza usa a coleção `candidates` e o vínculo `user` definidos pelo cadastro da VJ-22,
sem criar uma segunda definição de schema. Ausência de candidato não impede a exclusão.
Buscas de empresas não são implementadas nesta história.

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

| Critério da VJ-22 | Cobertura unitária |
| --- | --- |
| Aluno validado recebe 201 e perfil incompleto | Service e validação de e-mail/código na base simulada |
| Código de compra ou identificador confiável aprova registro pendente | Service e hashes vinculados ao e-mail |
| Validação pendente recebe 201 e não aparece para empresas | Default do model, service e filtro de visibilidade |
| Fora da base autorizada recebe 422 | Service de alunos e ausência de gravação do candidato |
| Duplicidade recebe 409 | Consulta por usuário/e-mail e erro concorrente dos índices únicos |
| E-mail é único somente entre candidatos ativos | Índice parcial do model e filtro explícito do service |
| Somente contas de candidato podem criar perfil | Autorização da rota e defesa no service |
| Dados inválidos recebem 400 | Middleware, campos obrigatórios e bloqueio de controles do cliente |
| Autenticação obrigatória recebe 401 | Middleware JWT, configuração da rota e conta existente/ativa |
| Dados omitidos permanecem UNKNOWN | Defaults do model, normalização de null e rejeição de booleanos |
| Validação posterior preserva o controle de status | Revalidação administrativa com atualização condicional |

| Critério da VJ-24 | Cobertura unitária |
| --- | --- |
| Validação apenas do próprio candidato autenticado | Rota, autorização de perfil e service com vínculo ao usuário |
| Aprovação por e-mail, código ou identificador | Adapter da base autorizada, hashes e service de candidato |
| Aprovação leva somente a perfil incompleto | Atualização condicional e filtro de visibilidade do model |
| Resultado inconclusivo retorna 202 | Controller e persistência do estado pendente |
| Não elegível retorna 422 sem ativação | Service com registro seguro do resultado rejeitado |
| Repetição aprovada é idempotente | Service sem nova consulta ou gravação duplicada |
| Inativo/bloqueado retorna 409 | Service preservando integralmente o documento |
| Prova vinculada ao e-mail atual da conta | Service rejeitando divergência antes de consultar a fonte |
| Identificador ou evidência inválida retorna 400 | Middleware com lista fechada de campos e erros sem valores |
| Fonte indisponível retorna 503 sem mudanças | Adapter e service sem operação de persistência |
| Comprovantes não são persistidos nem expostos | Schemas, serialização, controller e inspeção da atualização |

| Critério da VJ-25 | Cobertura unitária |
| --- | --- |
| Titular consulta o próprio perfil em qualquer status | Service com todos os status controlados e controller HTTP 200 |
| Empresa consulta somente candidato ativo | Filtro atômico por `_id` e `status: active` no banco |
| Status não ativo permanece oculto para empresa | Mesmo erro 404 para pendente, incompleto, inativo e bloqueado |
| Candidato não consulta outro candidato | Verificação de titularidade e erro 403 |
| Campos opcionais desconhecidos usam `UNKNOWN` | Normalização explícita, inclusive contra valores legados `false` |
| Dados sensíveis e internos nunca são expostos | Projeção fechada no banco e DTO público com lista permitida |
| Autenticação e identificador válido são obrigatórios | Ordem da rota e middleware de ObjectId, com erros 401 e 400 |
| Consulta não altera cadastro ou status | Service somente leitura e teste de imutabilidade do resultado armazenado |

| Critério da VJ-26 | Cobertura unitária |
| --- | --- |
| Completar perfil aprovado ativa o candidato | Cálculo com todos os campos mínimos e atualização condicional |
| Perfil aprovado incompleto deixa de ser visível | Rebaixamento imediato para `incomplete_profile` |
| Perfil completo sem aprovação permanece pendente | Elegibilidade pendente/rejeitada prevalece sobre completude |
| Alteração parcial preserva campos omitidos | Operação `$set` limitada à lista recebida e status calculado |
| Troca de e-mail reinicia a validação | Conta e candidato normalizados, histórico privado e estado pendente |
| Falha na troca de e-mail não deixa atualização parcial | Rollback simulado para falha na conta, candidato e commit |
| E-mail duplicado retorna 409 | Consultas de conflito e corrida protegida por índices únicos |
| Campos controlados ou valores inválidos retornam 400 | Middleware e whitelist defensiva no service |
| Inativo/bloqueado retorna 409 sem mutação | Verificação anterior à escrita para ambos os estados |
| Outro candidato retorna 403; inexistente retorna 404 | Titularidade e existência verificadas antes da atualização |
| Resposta não expõe auditoria ou validação interna | DTO público explícito e histórico com `select: false` |

| Critério da VJ-27 | Cobertura unitária |
| --- | --- |
| Exclusão própria nos três status permitidos retorna 204 | Service, controller e atualização simulada |
| Status inativo e data são persistidos atomicamente | Uma operação `$set` condicional com ambos os campos |
| Candidato excluído fica invisível para empresas | Status, virtual e filtro ativo do model |
| Conta, credenciais e base de alunos permanecem | Ausência de remoção e estado preservado nos testes |
| E-mail pode ser reutilizado com novo candidato | Índices parciais, filtro de cadastro atual e nova validação |
| Segunda exclusão ou candidato ausente retorna 404 | Service sem nova gravação |
| Outro candidato retorna 403 | Titularidade verificada antes da alteração |
| JWT e ObjectId válidos são obrigatórios | Ordem da rota e middleware de validação |
| Bloqueado não é excluído, reativado ou alterado | Service retorna 409 sem gravação |

| Critério da VJ-6 | Cobertura unitária |
| --- | --- |
| Consulta de usuário existente, HTTP 200 | Service e controller; permite consultar outro usuário |
| Somente dados públicos, sem informações de autenticação | Projeção do banco e lista explícita com testes para campos privados e futuros |
| Usuário inexistente, HTTP 404 | Service, controller e middleware de erros |
| Autenticação obrigatória, HTTP 401 | Middleware JWT e configuração da rota antes da validação/conexão |
| Identificador malformado, HTTP 400 | Regras de validação da consulta |

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

- Implementar vagas, empresas, competências e complementar o perfil de candidato a partir das
  user stories do Jira.
- Implementar o motor de match entre vagas e candidatos.
- Configurar CI via GitHub Actions e deploy via Vercel.
