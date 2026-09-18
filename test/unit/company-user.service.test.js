require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const User = require('../../src/models/user.model');
const { linkRecruiter } = require('../../src/services/company-user.service');

const companyId = '6512f1e2b3a1c2d3e4f5a6b7';
const userId = '6512f1e2b3a1c2d3e4f5a6b8';
const operator = { id: '6512f1e2b3a1c2d3e4f5a6b9', role: 'admin' };

function setup(context) {
  const company = { _id: companyId, status: 'pending' };
  const account = new User({
    _id: userId, name: 'Ana', email: 'ana@example.com', password: 'secure-password',
    role: 'company', status: 'active', emailVerifiedAt: new Date(),
  });
  const companyQuery = { select: async () => company };
  const userQuery = { select: async () => account };
  const findCompany = context.mock.method(Company, 'findOne', () => companyQuery);
  const findUser = context.mock.method(User, 'findById', () => userQuery);
  context.mock.method(CompanyUser, 'init', async () => CompanyUser);
  const findMembership = context.mock.method(CompanyUser, 'findOne', async () => null);
  const createMembership = context.mock.method(CompanyUser, 'create', async (data) => new CompanyUser(data));
  return { company, account, companyQuery, userQuery, findCompany, findUser,
    findMembership, createMembership };
}

test('admin links verified company user without creating credentials or leaking secrets', async (context) => {
  const { findCompany, findUser, createMembership } = setup(context);
  const createUser = context.mock.method(User, 'create', async () => assert.fail('no credential creation'));
  const result = await linkRecruiter(operator, companyId, { userId });
  assert.equal(result.membership.validateSync(), undefined);
  assert.equal(result.membership.company.toString(), companyId);
  assert.equal(result.membership.role, 'recruiter');
  assert.equal(result.membership.status, 'active');
  assert.equal(result.membership.authorizedBy.toString(), operator.id);
  assert.deepEqual(result.user, { _id: result.membership.user, name: 'Ana', email: 'ana@example.com' });
  assert.equal(result.membership.toJSON().authorizedBy, undefined);
  assert.equal(JSON.stringify(result).includes('secure-password'), false);
  assert.equal(JSON.stringify(result).includes('emailVerifiedAt'), false);
  assert.equal(findCompany.mock.callCount(), 1);
  assert.equal(findUser.mock.callCount(), 1);
  assert.equal(createMembership.mock.callCount(), 1);
  assert.equal(createUser.mock.callCount(), 0);
});

test('rejects malformed input and non-admin before database access', async (context) => {
  const { findCompany, createMembership } = setup(context);
  for (const body of [{}, { userId: 'bad' }, { userId: 123 },
    { userId, password: 'secret' }, null, []]) {
    await assert.rejects(linkRecruiter(operator, companyId, body), { statusCode: 400 });
  }
  await assert.rejects(linkRecruiter(operator, 'bad', { userId }), { statusCode: 400 });
  await assert.rejects(linkRecruiter({ ...operator, role: 'company' }, companyId, { userId }), { statusCode: 403 });
  assert.equal(findCompany.mock.callCount(), 0);
  assert.equal(createMembership.mock.callCount(), 0);
});

test('missing, inactive and blocked companies cannot receive a recruiter', async (context) => {
  const { company, companyQuery, findUser, createMembership } = setup(context);
  for (const status of ['inactive', 'blocked']) {
    company.status = status;
    await assert.rejects(linkRecruiter(operator, companyId, { userId }), { statusCode: 409 });
  }
  companyQuery.select = async () => null;
  await assert.rejects(linkRecruiter(operator, companyId, { userId }), { statusCode: 404 });
  assert.equal(findUser.mock.callCount(), 0);
  assert.equal(createMembership.mock.callCount(), 0);
});

test('unverified, inactive, missing or non-company accounts cannot be linked', async (context) => {
  const { account, userQuery, createMembership } = setup(context);
  account.emailVerifiedAt = null;
  await assert.rejects(linkRecruiter(operator, companyId, { userId }), { statusCode: 403 });
  account.emailVerifiedAt = new Date();
  account.status = 'inactive';
  await assert.rejects(linkRecruiter(operator, companyId, { userId }), { statusCode: 403 });
  account.status = 'active';
  account.role = 'candidate';
  await assert.rejects(linkRecruiter(operator, companyId, { userId }), { statusCode: 403 });
  userQuery.select = async () => null;
  await assert.rejects(linkRecruiter(operator, companyId, { userId }), { statusCode: 403 });
  assert.equal(createMembership.mock.callCount(), 0);
});

test('MVP limits one active recruiter per company and one company per user', async (context) => {
  const { findMembership, createMembership } = setup(context);
  findMembership.mock.mockImplementation(async () => ({ _id: 'existing' }));
  await assert.rejects(linkRecruiter(operator, companyId, { userId }), { statusCode: 409 });
  assert.equal(createMembership.mock.callCount(), 0);
  const filter = findMembership.mock.calls[0].arguments[0];
  assert.equal(filter.status, 'active');
  assert.equal(String(filter.$or[0].company), companyId);
  assert.equal(String(filter.$or[1].user), userId);
  const indexes = CompanyUser.schema.indexes();
  assert.equal(indexes.filter(([keys, options]) => options.unique &&
    options.partialFilterExpression?.status === 'active' &&
    (keys.company === 1 || keys.user === 1)).length, 2);
});

test('unique index race returns conflict without a second association', async (context) => {
  const { createMembership } = setup(context);
  createMembership.mock.mockImplementation(async () => {
    throw Object.assign(new Error('duplicate'), { code: 11000 });
  });
  await assert.rejects(linkRecruiter(operator, companyId, { userId }), { statusCode: 409 });
});
