require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Company = require('../../src/models/company.model');
const User = require('../../src/models/user.model');
const Candidate = require('../../src/models/candidate.model');
const { registerCompany } = require('../../src/services/company.service');

const admin = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'admin' };
const minimum = {
  legalName: 'Empresa de Testes Ltda',
  responsibleName: 'Ana Souza',
  email: ' CONTATO@EMPRESA.COM.BR ',
  city: 'São Paulo',
  state: 'SP',
  country: 'Brasil',
};

function isolate(context) {
  context.mock.method(Company, 'init', async () => Company);
  const find = context.mock.method(Company, 'findOne', async () => null);
  const create = context.mock.method(Company, 'create', async (data) => new Company(data));
  const createUser = context.mock.method(User, 'create', async () => assert.fail('must not create user'));
  const createCandidate = context.mock.method(Candidate, 'create', async () => assert.fail('must not create candidate'));
  return { find, create, createUser, createCandidate };
}

test('admin registers separate company with pending status and minimum fields', async (context) => {
  const { find, create, createUser, createCandidate } = isolate(context);
  const company = await registerCompany(admin, minimum);
  assert.equal(company.validateSync(), undefined);
  assert.equal(company.status, 'pending');
  assert.equal(company.email, 'contato@empresa.com.br');
  assert.equal(company.website, null);
  assert.equal(company.registeredBy.toString(), admin.id);
  assert.deepEqual(find.mock.calls[0].arguments[0], { email: 'contato@empresa.com.br', deletedAt: null });
  assert.equal(create.mock.callCount(), 1);
  assert.equal(createUser.mock.callCount(), 0);
  assert.equal(createCandidate.mock.callCount(), 0);
  assert.equal(company.toJSON().registeredBy, undefined);
  assert.equal(company.toJSON().deletedAt, undefined);
});

test('optional business data and HTTPS links are preserved without credentials', async (context) => {
  isolate(context);
  const company = await registerCompany(admin, {
    ...minimum, tradeName: 'Testes JL', website: 'https://empresa.com.br',
    description: 'Serviços de QA', phone: '+55 (11) 99999-9999',
    linkedinUrl: 'https://linkedin.com/company/empresa', segment: 'Tecnologia',
  });
  assert.equal(company.tradeName, 'Testes JL');
  assert.equal(company.website, 'https://empresa.com.br');
  assert.equal(company.segment, 'Tecnologia');
});

test('invalid fields, URLs and client-controlled status create no company', async (context) => {
  const { create, find } = isolate(context);
  const invalidBodies = [
    {}, { ...minimum, legalName: ' ' }, { ...minimum, responsibleName: null },
    { ...minimum, email: 'not-an-email' }, { ...minimum, email: 'a@@b.com' },
    { ...minimum, city: '' },
    { ...minimum, website: 'ftp://empresa.com.br' }, { ...minimum, linkedinUrl: 'not-a-url' },
    { ...minimum, phone: 'abc' }, { ...minimum, status: 'active' },
    { ...minimum, password: 'secret' }, { ...minimum, user: admin.id },
    { ...minimum, registeredBy: admin.id },
  ];
  for (const body of invalidBodies) {
    await assert.rejects(registerCompany(admin, body), { statusCode: 400 });
  }
  assert.equal(find.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});

test('duplicate current company email returns 409 without write', async (context) => {
  const { find, create } = isolate(context);
  find.mock.mockImplementation(async () => ({ _id: 'existing' }));
  await assert.rejects(registerCompany(admin, minimum), { statusCode: 409 });
  assert.equal(create.mock.callCount(), 0);
});

test('unique-index race maps to 409', async (context) => {
  const { create } = isolate(context);
  create.mock.mockImplementation(async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  await assert.rejects(registerCompany(admin, minimum), { statusCode: 409 });
});

test('only admin can register; company role does not reach storage', async (context) => {
  const { find, create } = isolate(context);
  await assert.rejects(registerCompany({ ...admin, role: 'company' }, minimum), { statusCode: 403 });
  assert.equal(find.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});

test('company schema has unique current-email index and controlled statuses', () => {
  const indexes = Company.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.email === 1 && options.unique &&
    options.partialFilterExpression.deletedAt === null));
  assert.deepEqual(Company.schema.path('status').enumValues, ['pending', 'active', 'inactive', 'blocked']);
});
