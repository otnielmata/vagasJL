require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const User = require('../../src/models/user.model');
const { updateCompanyStatus } = require('../../src/services/company-status.service');

const companyId = '6512f1e2b3a1c2d3e4f5a6b7';
const recruiterId = '6512f1e2b3a1c2d3e4f5a6b8';
const admin = { id: '6512f1e2b3a1c2d3e4f5a6b9', role: 'admin' };
const now = new Date('2026-09-23T18:00:00.000Z');

function setup(context, status = 'pending', overrides = {}) {
  const company = Company.hydrate({
    _id: companyId,
    legalName: 'Empresa de Testes Ltda',
    responsibleName: 'Ana Souza',
    email: 'contato@example.com',
    city: 'Sao Paulo',
    state: 'SP',
    country: 'Brasil',
    registeredBy: admin.id,
    status,
    updatedAt: new Date('2026-09-23T17:00:00.000Z'),
    authorizationVersion: 2,
    ...overrides,
  });
  const companyQuery = { select: async () => company };
  const membershipQuery = { select: () => ({ lean: async () => ({ user: recruiterId }) }) };
  const userQuery = { select: () => ({ lean: async () => ({ _id: recruiterId }) }) };
  const findCompany = context.mock.method(Company, 'findOne', () => companyQuery);
  const findMembership = context.mock.method(CompanyUser, 'findOne', () => membershipQuery);
  const findUser = context.mock.method(User, 'findOne', () => userQuery);
  const updateCompany = context.mock.method(Company, 'findOneAndUpdate', async (_filter, update) => {
    company.status = update.$set.status;
    company.authorizationInvalidatedAt = update.$set.authorizationInvalidatedAt;
    company.authorizationVersion += update.$inc.authorizationVersion;
    company.statusHistory.push(update.$push.statusHistory);
    return company;
  });
  return { company, companyQuery, membershipQuery, userQuery, findCompany, findMembership,
    findUser, updateCompany };
}

test('admin activates complete company with verified responsible and audit', async (context) => {
  const { company, findMembership, findUser, updateCompany } = setup(context);
  const response = await updateCompanyStatus(admin, companyId, {
    status: 'active', reason: 'Revisao documental aprovada',
  }, now);

  assert.deepEqual(response, {
    company: { _id: company._id, status: 'active' },
    previousStatus: 'pending', changed: true, changedAt: now,
  });
  assert.equal(findMembership.mock.callCount(), 1);
  assert.deepEqual(findMembership.mock.calls[0].arguments[0], {
    company: company._id, role: 'recruiter', status: 'active',
  });
  assert.equal(findUser.mock.callCount(), 1);
  assert.deepEqual(findUser.mock.calls[0].arguments[0], {
    _id: recruiterId, role: 'company', status: 'active', emailVerifiedAt: { $type: 'date' },
  });
  const [filter, update, options] = updateCompany.mock.calls[0].arguments;
  assert.deepEqual(filter, {
    _id: company._id, status: 'pending', updatedAt: company.updatedAt, deletedAt: null,
  });
  assert.equal(update.$set.status, 'active');
  assert.equal(update.$set.statusVerifiedBy, admin.id);
  assert.equal(update.$set.statusVerificationReference, 'Revisao documental aprovada');
  assert.equal(update.$set.authorizationInvalidatedAt, now);
  assert.deepEqual(update.$inc, { authorizationVersion: 1 });
  assert.deepEqual(update.$push.statusHistory, {
    from: 'pending', to: 'active', actor: admin.id, changedAt: now,
    reason: 'Revisao documental aprovada',
  });
  assert.deepEqual(options, { new: true, runValidators: true });
});

test('activation rejects incomplete company and missing verified responsible without write', async (context) => {
  const { company, membershipQuery, userQuery, updateCompany } = setup(context);
  company.city = undefined;
  await assert.rejects(updateCompanyStatus(admin, companyId,
    { status: 'active', reason: 'Revisao' }, now), { statusCode: 409 });
  company.city = 'Sao Paulo';
  membershipQuery.select = () => ({ lean: async () => null });
  await assert.rejects(updateCompanyStatus(admin, companyId,
    { status: 'active', reason: 'Revisao' }, now), { statusCode: 409 });
  membershipQuery.select = () => ({ lean: async () => ({ user: recruiterId }) });
  userQuery.select = () => ({ lean: async () => null });
  await assert.rejects(updateCompanyStatus(admin, companyId,
    { status: 'active', reason: 'Revisao' }, now), { statusCode: 409 });
  assert.equal(updateCompany.mock.callCount(), 0);
});

for (const target of ['inactive', 'blocked']) {
  test(`admin changes active company to ${target} and invalidates authorization`, async (context) => {
    const { company, findMembership, findUser } = setup(context, 'active');
    const response = await updateCompanyStatus(admin, companyId,
      { status: target, reason: `Motivo ${target}` }, now);
    assert.equal(response.company.status, target);
    assert.equal(company.authorizationVersion, 3);
    assert.equal(company.authorizationInvalidatedAt, now);
    assert.equal(company.statusHistory.at(-1).to, target);
    assert.equal(findMembership.mock.callCount(), 0);
    assert.equal(findUser.mock.callCount(), 0);
  });
}

test('same status is idempotent and creates no audit or cache invalidation', async (context) => {
  const { company, findMembership, updateCompany } = setup(context, 'inactive');
  const beforeVersion = company.authorizationVersion;
  const response = await updateCompanyStatus(admin, companyId,
    { status: 'inactive', reason: 'Repeticao segura' }, now);
  assert.deepEqual(response, {
    company: { _id: company._id, status: 'inactive' },
    previousStatus: 'inactive', changed: false, changedAt: null,
  });
  assert.equal(company.authorizationVersion, beforeVersion);
  assert.equal(findMembership.mock.callCount(), 0);
  assert.equal(updateCompany.mock.callCount(), 0);
});

test('invalid actors, IDs and bodies are rejected before storage', async (context) => {
  const { findCompany } = setup(context);
  await assert.rejects(updateCompanyStatus({ ...admin, role: 'company' }, companyId,
    { status: 'active', reason: 'x' }), { statusCode: 403 });
  const invalid = [
    ['bad', { status: 'active', reason: 'x' }],
    [companyId, null],
    [companyId, { status: 'unknown', reason: 'x' }],
    [companyId, { status: 'active', reason: ' ' }],
    [companyId, { status: 'active', reason: 'x', authorizationVersion: 99 }],
  ];
  for (const [id, body] of invalid) {
    await assert.rejects(updateCompanyStatus(admin, id, body), { statusCode: 400 });
  }
  assert.equal(findCompany.mock.callCount(), 0);
});

test('missing company, forbidden transition and concurrent change return safe errors', async (context) => {
  const { companyQuery, updateCompany } = setup(context, 'active');
  companyQuery.select = async () => null;
  await assert.rejects(updateCompanyStatus(admin, companyId,
    { status: 'blocked', reason: 'Revisao' }, now), { statusCode: 404 });

  companyQuery.select = async () => Company.hydrate({
    _id: companyId, status: 'active', updatedAt: now,
  });
  await assert.rejects(updateCompanyStatus(admin, companyId,
    { status: 'pending', reason: 'Retorno invalido' }, now), { statusCode: 409 });

  companyQuery.select = async () => Company.hydrate({
    _id: companyId, legalName: 'Empresa', responsibleName: 'Ana', email: 'a@b.com',
    city: 'SP', state: 'SP', country: 'Brasil', status: 'active', updatedAt: now,
  });
  updateCompany.mock.mockImplementation(async () => null);
  await assert.rejects(updateCompanyStatus(admin, companyId,
    { status: 'blocked', reason: 'Concorrencia' }, now), { statusCode: 409 });
});

test('company status audit and authorization metadata stay private', () => {
  const company = new Company({
    legalName: 'Empresa', responsibleName: 'Ana', email: 'a@b.com', city: 'SP', state: 'SP',
    country: 'Brasil', registeredBy: admin.id, statusHistory: [{ from: 'pending', to: 'active',
      actor: admin.id, changedAt: now, reason: 'Aprovada' }], authorizationVersion: 1,
    authorizationInvalidatedAt: now,
  });
  assert.equal(company.validateSync(), undefined);
  assert.equal(Company.schema.path('statusHistory').options.select, false);
  assert.equal(Company.schema.path('authorizationVersion').options.select, false);
  assert.equal(company.toJSON().statusHistory, undefined);
  assert.equal(company.toJSON().authorizationVersion, undefined);
  assert.equal(company.toJSON().authorizationInvalidatedAt, undefined);
});
