require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const User = require('../../src/models/user.model');
const Candidate = require('../../src/models/candidate.model');
const { getRegistration } = require('../../src/services/company-read.service');

const companyId = '6512f1e2b3a1c2d3e4f5a6b7';
const recruiterId = '6512f1e2b3a1c2d3e4f5a6b8';
const otherId = '6512f1e2b3a1c2d3e4f5a6b9';
const recruiter = { id: recruiterId, role: 'company' };
const admin = { id: otherId, role: 'admin' };

function query(result) {
  return {
    projection: null,
    select(projection) { this.projection = projection; return this; },
    async lean() { return result; },
  };
}

function setup(context, status = 'active') {
  const company = {
    _id: companyId, legalName: 'Empresa JL', tradeName: 'JL', website: 'https://example.com',
    description: 'Vagas QA', city: 'São Paulo', state: 'SP', country: 'Brasil',
    responsibleName: 'Ana', email: 'contato@example.com', phone: '+55 11 99999-9999',
    linkedinUrl: 'https://linkedin.com/company/jl', segment: 'Tecnologia', status,
    registeredBy: otherId, statusVerifiedBy: otherId, statusVerificationReference: 'private',
    deletedAt: null, secretToken: 'private',
  };
  const account = { _id: recruiterId, role: 'company', status: 'active', password: 'hash' };
  const membership = { company: companyId, user: recruiterId, status: 'active', authorizedBy: otherId };
  const publicUser = { _id: recruiterId, name: 'Ana', email: 'ana@example.com',
    password: 'hash', emailVerifiedAt: new Date(), token: 'private' };
  const companyQuery = query(company);
  const accountQuery = query(account);
  const membershipQuery = query(membership);
  const membershipsQuery = query([membership]);
  const usersQuery = query([publicUser]);
  const findCompany = context.mock.method(Company, 'findOne', () => companyQuery);
  const findAccount = context.mock.method(User, 'findOne', () => accountQuery);
  const findMembership = context.mock.method(CompanyUser, 'findOne', () => membershipQuery);
  const findMemberships = context.mock.method(CompanyUser, 'find', () => membershipsQuery);
  const findUsers = context.mock.method(User, 'find', () => usersQuery);
  const saveCompany = context.mock.method(Company.prototype, 'save', async () => assert.fail('read only'));
  const saveUser = context.mock.method(User.prototype, 'save', async () => assert.fail('read only'));
  const findCandidate = context.mock.method(Candidate, 'findOne', () => assert.fail('no candidate read'));
  return { company, companyQuery, accountQuery, membershipQuery, membershipsQuery, usersQuery,
    findCompany, findAccount, findMembership, findMemberships, findUsers,
    saveCompany, saveUser, findCandidate };
}

for (const status of ['pending', 'active', 'inactive', 'blocked']) {
  test(`linked recruiter reads own ${status} company with only public fields`, async (context) => {
    const { company, companyQuery, accountQuery, membershipQuery, usersQuery, findMemberships,
      saveCompany, saveUser, findCandidate } = setup(context, status);
    const before = structuredClone(company);
    const result = await getRegistration(recruiter, companyId);
    assert.equal(result.company.status, status);
    assert.equal(result.company.legalName, 'Empresa JL');
    assert.equal(result.company.email, 'contato@example.com');
    assert.deepEqual(result.usuarios, [{ _id: recruiterId, name: 'Ana', email: 'ana@example.com' }]);
    for (const field of ['registeredBy', 'statusVerifiedBy', 'statusVerificationReference',
      'deletedAt', 'secretToken', 'password', 'token']) {
      assert.equal(result.company[field], undefined);
      assert.equal(result.usuarios[0][field], undefined);
    }
    assert.equal(companyQuery.projection.status, 1);
    assert.equal(companyQuery.projection.registeredBy, undefined);
    assert.deepEqual(accountQuery.projection, { _id: 1 });
    assert.deepEqual(membershipQuery.projection, { user: 1 });
    assert.deepEqual(usersQuery.projection, { _id: 1, name: 1, email: 1 });
    assert.equal(findMemberships.mock.callCount(), 0);
    assert.equal(saveCompany.mock.callCount(), 0);
    assert.equal(saveUser.mock.callCount(), 0);
    assert.equal(findCandidate.mock.callCount(), 0);
    assert.deepEqual(company, before);
  });
}

test('admin sees pending company and allowed public linked users without mutation', async (context) => {
  const { findAccount, findMembership, findMemberships, saveCompany } = setup(context, 'pending');
  const result = await getRegistration(admin, companyId);
  assert.equal(result.company.status, 'pending');
  assert.equal(result.usuarios.length, 1);
  assert.equal(findAccount.mock.callCount(), 0);
  assert.equal(findMembership.mock.callCount(), 0);
  assert.deepEqual(findMemberships.mock.calls[0].arguments[0], {
    company: companyId, status: 'active',
  });
  assert.equal(saveCompany.mock.callCount(), 0);
});

test('admin response keeps a users list for future recruiter expansion', async (context) => {
  const { membershipsQuery, usersQuery } = setup(context);
  membershipsQuery.lean = async () => [{ user: recruiterId }, { user: otherId }];
  usersQuery.lean = async () => [
    { _id: recruiterId, name: 'Ana', email: 'ana@example.com' },
    { _id: otherId, name: 'Bia', email: 'bia@example.com' },
  ];
  const result = await getRegistration(admin, companyId);
  assert.deepEqual(result.usuarios.map((user) => user.name), ['Ana', 'Bia']);
});

test('other company recruiter gets 403 without fetching linked users', async (context) => {
  const { membershipQuery, findUsers } = setup(context);
  membershipQuery.lean = async () => null;
  await assert.rejects(getRegistration(recruiter, companyId), { statusCode: 403 });
  assert.equal(findUsers.mock.callCount(), 0);
});

test('inactive or missing recruiter account gets 403', async (context) => {
  const { accountQuery, findMembership, findUsers } = setup(context);
  accountQuery.lean = async () => null;
  await assert.rejects(getRegistration(recruiter, companyId), { statusCode: 403 });
  assert.equal(findMembership.mock.callCount(), 0);
  assert.equal(findUsers.mock.callCount(), 0);
});

test('invalid id and unsupported role are rejected before storage access', async (context) => {
  const { findCompany } = setup(context);
  await assert.rejects(getRegistration(recruiter, 'invalid'), { statusCode: 400 });
  await assert.rejects(getRegistration({ id: otherId, role: 'candidate' }, companyId), { statusCode: 403 });
  assert.equal(findCompany.mock.callCount(), 0);
});

test('missing or deleted company returns 404', async (context) => {
  const { companyQuery, findAccount } = setup(context);
  companyQuery.lean = async () => null;
  await assert.rejects(getRegistration(recruiter, companyId), { statusCode: 404 });
  assert.equal(findAccount.mock.callCount(), 0);
});

test('admin sees empty users list when no active membership exists', async (context) => {
  const { membershipsQuery, findUsers } = setup(context);
  membershipsQuery.lean = async () => [];
  const result = await getRegistration(admin, companyId);
  assert.deepEqual(result.usuarios, []);
  assert.equal(findUsers.mock.callCount(), 0);
});
