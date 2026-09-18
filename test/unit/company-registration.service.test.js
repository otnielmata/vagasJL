require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const User = require('../../src/models/user.model');
const { updateRegistration } = require('../../src/services/company-registration.service');

const companyId = '6512f1e2b3a1c2d3e4f5a6b7';
const userId = '6512f1e2b3a1c2d3e4f5a6b8';
const adminId = '6512f1e2b3a1c2d3e4f5a6b9';
const recruiter = { id: userId, role: 'company' };
const admin = { id: adminId, role: 'admin' };

function setup(context, status = 'pending') {
  const session = { testSession: true };
  const company = new Company({
    _id: companyId, legalName: 'Empresa Antiga', city: 'SP', state: 'SP', country: 'Brasil',
    responsibleName: 'Ana', email: 'old@example.com', registeredBy: adminId, status,
  });
  const account = User.hydrate({
    _id: userId, name: 'Ana', email: 'ana@example.com', role: 'company', status: 'active',
    emailVerifiedAt: new Date(),
  });
  const transaction = context.mock.method(Company.db, 'transaction', async (callback) => callback(session));
  const companyQuery = { session: async (received) => { assert.equal(received, session); return company; } };
  const userQuery = { session: async (received) => { assert.equal(received, session); return account; } };
  const membershipQuery = { session: async (received) => { assert.equal(received, session); return {}; } };
  const findCompany = context.mock.method(Company, 'findOne', () => companyQuery);
  const findUser = context.mock.method(User, 'findOne', () => userQuery);
  const findMembership = context.mock.method(CompanyUser, 'findOne', () => membershipQuery);
  const saveCompany = context.mock.method(company, 'save', async () => company);
  const saveUser = context.mock.method(account, 'save', async () => account);
  context.mock.method(Company, 'init', async () => Company);
  return { company, account, session, transaction, companyQuery, userQuery, membershipQuery,
    findCompany, findUser, findMembership, saveCompany, saveUser };
}

test('linked recruiter edits company and own public name atomically, retaining omitted fields and status', async (context) => {
  const { company, account, session, transaction, saveCompany, saveUser, findMembership } = setup(context);
  const result = await updateRegistration(recruiter, companyId, {
    empresa: { legalName: '  Nova Empresa  ', website: 'https://example.com' },
    usuarioAtual: { name: '  Ana Silva  ' },
  });
  assert.equal(result.company.legalName, 'Nova Empresa');
  assert.equal(result.company.email, 'old@example.com');
  assert.equal(result.company.status, 'pending');
  assert.equal(result.usuarioAtual.name, 'Ana Silva');
  assert.equal(result.usuarioAtual.email, 'ana@example.com');
  assert.equal(result.company.registeredBy, undefined);
  assert.equal(company.status, 'pending');
  assert.equal(account.name, 'Ana Silva');
  assert.equal(saveCompany.mock.callCount(), 1);
  assert.equal(saveUser.mock.callCount(), 1);
  assert.equal(saveCompany.mock.calls[0].arguments[0].session, session);
  assert.equal(saveUser.mock.calls[0].arguments[0].session, session);
  assert.equal(transaction.mock.callCount(), 1);
  assert.equal(findMembership.mock.callCount(), 1);
});

test('company-only update does not alter account or status', async (context) => {
  const { saveUser, company } = setup(context);
  const result = await updateRegistration(recruiter, companyId, { empresa: { phone: '+55 11 99999-9999' } });
  assert.equal(result.company.phone, '+55 11 99999-9999');
  assert.equal(result.usuarioAtual, undefined);
  assert.equal(company.status, 'pending');
  assert.equal(saveUser.mock.callCount(), 0);
});

test('admin activates pending company only with verification reference and private audit', async (context) => {
  const { company, findUser, findMembership } = setup(context);
  const result = await updateRegistration(admin, companyId, {
    status: 'active', verificationReference: 'review-2026-01',
  });
  assert.equal(result.company.status, 'active');
  assert.equal(company.statusVerifiedBy.toString(), adminId);
  assert.equal(company.statusVerificationReference, 'review-2026-01');
  assert.ok(company.statusVerifiedAt instanceof Date);
  assert.equal(result.company.statusVerificationReference, undefined);
  assert.equal(findUser.mock.callCount(), 0);
  assert.equal(findMembership.mock.callCount(), 0);
});

for (const target of ['inactive', 'blocked']) {
  test(`admin can change active company to ${target} without recruiter authorization`, async (context) => {
    const { company, findUser } = setup(context, 'active');
    const result = await updateRegistration(admin, companyId, { status: target });
    assert.equal(result.company.status, target);
    assert.equal(company.status, target);
    assert.equal(findUser.mock.callCount(), 0);
  });
}

for (const previous of ['inactive', 'blocked']) {
  test(`reactivation from ${previous} requires a new verification reference`, async (context) => {
    const { company } = setup(context, previous);
    await assert.rejects(updateRegistration(admin, companyId, { status: 'active' }), { statusCode: 400 });
    await updateRegistration(admin, companyId, { status: 'active', verificationReference: 'new-review' });
    assert.equal(company.statusVerificationReference, 'new-review');
  });
}

test('forbidden transitions and self-activation do not save', async (context) => {
  const { saveCompany, saveUser } = setup(context);
  await assert.rejects(updateRegistration(recruiter, companyId, { status: 'active', verificationReference: 'x' }),
    { statusCode: 403 });
  await assert.rejects(updateRegistration(admin, companyId, { status: 'blocked' }), { statusCode: 409 });
  await assert.rejects(updateRegistration(admin, companyId, { status: 'pending' }), { statusCode: 400 });
  assert.equal(saveCompany.mock.callCount(), 0);
  assert.equal(saveUser.mock.callCount(), 0);
});

test('another company recruiter or inactive company is denied before any write', async (context) => {
  const { membershipQuery, company, saveCompany } = setup(context);
  membershipQuery.session = async () => null;
  await assert.rejects(updateRegistration(recruiter, companyId, { empresa: { city: 'Rio' } }),
    { statusCode: 403 });
  company.status = 'blocked';
  await assert.rejects(updateRegistration(recruiter, companyId, { empresa: { city: 'Rio' } }),
    { statusCode: 403 });
  assert.equal(saveCompany.mock.callCount(), 0);
});

test('rejects credentials, permissions, audit fields and invalid URLs before persistence', async (context) => {
  const { transaction, saveCompany } = setup(context);
  const invalid = [
    { empresa: { website: 'ftp://example.com' } },
    { empresa: { email: 'invalid' } },
    { empresa: { status: 'active' } },
    { empresa: { registeredBy: adminId } },
    { usuarioAtual: { password: 'secret' } },
    { usuarioAtual: { email: 'new@example.com' } },
    { usuarioAtual: { role: 'admin' } },
    { verificationReference: 'review' },
    {},
  ];
  for (const input of invalid) {
    await assert.rejects(updateRegistration(recruiter, companyId, input), { statusCode: 400 });
  }
  assert.equal(transaction.mock.callCount(), 0);
  assert.equal(saveCompany.mock.callCount(), 0);
});

test('duplicate corporate email returns 409 and preserves company and user', async (context) => {
  const { company, account, findCompany, saveCompany, saveUser } = setup(context);
  findCompany.mock.mockImplementation((filter) => ({ session: async () =>
    filter.email ? { _id: 'other' } : company }));
  await assert.rejects(updateRegistration(recruiter, companyId, {
    empresa: { email: ' TAKEN@Example.COM ' }, usuarioAtual: { name: 'Changed' },
  }), { statusCode: 409 });
  assert.equal(company.email, 'old@example.com');
  assert.equal(account.name, 'Ana');
  assert.equal(saveCompany.mock.callCount(), 0);
  assert.equal(saveUser.mock.callCount(), 0);
});

test('unique-index race and unsupported transactions map to actionable errors', async (context) => {
  const { saveCompany, transaction } = setup(context);
  saveCompany.mock.mockImplementation(async () => {
    throw Object.assign(new Error('duplicate'), { code: 11000 });
  });
  await assert.rejects(updateRegistration(admin, companyId, { empresa: { email: 'new@example.com' } }),
    { statusCode: 409 });
  transaction.mock.mockImplementation(async () => {
    throw Object.assign(new Error('no replica set'), { code: 20 });
  });
  await assert.rejects(updateRegistration(admin, companyId, { empresa: { city: 'Rio' } }),
    { statusCode: 503 });
});

test('combined edit saves both documents in one transaction and propagates second write failure', async (context) => {
  const { saveCompany, saveUser, transaction } = setup(context);
  const failure = new Error('storage unavailable');
  saveUser.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(updateRegistration(recruiter, companyId, {
    empresa: { city: 'Rio' }, usuarioAtual: { name: 'Ana Silva' },
  }), (error) => error === failure);
  assert.equal(transaction.mock.callCount(), 1);
  assert.equal(saveCompany.mock.callCount(), 1);
  assert.equal(saveUser.mock.callCount(), 1);
});
