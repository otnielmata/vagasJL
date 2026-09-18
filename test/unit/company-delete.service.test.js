require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const User = require('../../src/models/user.model');
const Candidate = require('../../src/models/candidate.model');
const { deleteRegistration } = require('../../src/services/company-delete.service');
const { registerCompany } = require('../../src/services/company.service');
const { getCandidateById } = require('../../src/services/candidate.service');

const companyId = '6512f1e2b3a1c2d3e4f5a6b7';
const userId = '6512f1e2b3a1c2d3e4f5a6b8';
const adminId = '6512f1e2b3a1c2d3e4f5a6b9';
const candidateId = '6512f1e2b3a1c2d3e4f5a6ba';
const admin = { id: adminId, role: 'admin' };
const recruiter = { id: userId, role: 'company' };

function setup(context, status = 'active') {
  const company = new Company({
    _id: companyId, legalName: 'Empresa JL', city: 'SP', state: 'SP', country: 'Brasil',
    responsibleName: 'Ana', email: 'contato@example.com', registeredBy: adminId, status,
  });
  const session = { testSession: true };
  const state = {
    companyCurrent: true,
    memberships: [{ company: companyId, user: userId, status: 'active', revokedAt: null }],
    committed: false,
  };
  const transaction = context.mock.method(Company.db, 'transaction', async (callback) => {
    const previous = { status: company.status, deletedAt: company.deletedAt,
      companyCurrent: state.companyCurrent,
      deletedBy: company.deletedBy, memberships: structuredClone(state.memberships) };
    try {
      await callback(session);
      state.committed = true;
    } catch (error) {
      company.status = previous.status;
      company.deletedAt = previous.deletedAt;
      company.deletedBy = previous.deletedBy;
      state.companyCurrent = previous.companyCurrent;
      state.memberships = previous.memberships;
      throw error;
    }
  });
  const companyQuery = { session: async (received) => {
    assert.equal(received, session);
    return state.companyCurrent ? company : null;
  } };
  const accountQuery = { session: async (received) => {
    assert.equal(received, session);
    return { _id: userId };
  } };
  const membershipQuery = {
    select(selection) { assert.equal(selection, '+canDeleteCompany'); return this; },
    async session(received) { assert.equal(received, session); return { canDeleteCompany: true }; },
  };
  const findCompany = context.mock.method(Company, 'findOne', () => companyQuery);
  const findUser = context.mock.method(User, 'findOne', () => accountQuery);
  const findMembership = context.mock.method(CompanyUser, 'findOne', () => membershipQuery);
  const saveCompany = context.mock.method(company, 'save', async ({ session: received }) => {
    assert.equal(received, session);
    state.companyCurrent = false;
    return company;
  });
  const updateMemberships = context.mock.method(CompanyUser, 'updateMany', async (filter, update, options) => {
    assert.deepEqual(filter, { company: company._id, status: 'active' });
    assert.equal(options.session, session);
    const active = state.memberships.filter((membership) => membership.status === 'active');
    for (const membership of active) {
      membership.status = update.$set.status;
      membership.revokedAt = update.$set.revokedAt;
    }
    return { acknowledged: true, matchedCount: active.length, modifiedCount: active.length };
  });
  const deleteUser = context.mock.method(User, 'deleteOne', async () => assert.fail('must preserve User'));
  const deleteCandidate = context.mock.method(Candidate, 'deleteMany', async () => assert.fail('must preserve Candidate'));
  return { company, state, session, transaction, companyQuery, accountQuery, membershipQuery,
    findCompany, findUser, findMembership, saveCompany, updateMemberships,
    deleteUser, deleteCandidate };
}

test('admin logically deletes company and revokes recruiter in one transaction', async (context) => {
  const { company, state, transaction, findUser, findMembership, saveCompany,
    updateMemberships, deleteUser, deleteCandidate } = setup(context);
  await deleteRegistration(admin, companyId);
  assert.equal(company.status, 'inactive');
  assert.ok(company.deletedAt instanceof Date);
  assert.equal(company.deletedBy.toString(), adminId);
  assert.equal(state.memberships[0].status, 'inactive');
  assert.equal(state.memberships[0].revokedAt, company.deletedAt);
  assert.equal(state.committed, true);
  assert.equal(findUser.mock.callCount(), 0);
  assert.equal(findMembership.mock.callCount(), 0);
  assert.equal(saveCompany.mock.callCount(), 1);
  assert.equal(updateMemberships.mock.callCount(), 1);
  assert.equal(deleteUser.mock.callCount(), 0);
  assert.equal(deleteCandidate.mock.callCount(), 0);
  assert.deepEqual(transaction.mock.calls[0].arguments[1], {
    readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
  });
  assert.equal(company.toJSON().deletedAt, undefined);
  assert.equal(company.toJSON().deletedBy, undefined);
});

test('responsible recruiter must have explicit delete permission', async (context) => {
  const { company, state, membershipQuery, saveCompany } = setup(context);
  membershipQuery.session = async () => ({ canDeleteCompany: false });
  await assert.rejects(deleteRegistration(recruiter, companyId), { statusCode: 403 });
  assert.equal(company.status, 'active');
  assert.equal(state.memberships[0].status, 'active');
  assert.equal(saveCompany.mock.callCount(), 0);
  assert.equal(CompanyUser.schema.path('canDeleteCompany').defaultValue, false);
  assert.equal(CompanyUser.schema.path('canDeleteCompany').options.select, false);
  assert.equal(new CompanyUser({ canDeleteCompany: true }).toJSON().canDeleteCompany, undefined);
});

test('authorized recruiter can delete own company', async (context) => {
  const { company, state, findUser, findMembership } = setup(context);
  await deleteRegistration(recruiter, companyId);
  assert.ok(company.deletedAt instanceof Date);
  assert.equal(company.deletedBy.toString(), userId);
  assert.equal(state.memberships[0].status, 'inactive');
  assert.equal(findUser.mock.callCount(), 1);
  assert.equal(findMembership.mock.callCount(), 1);
  assert.deepEqual(findMembership.mock.calls[0].arguments[0], {
    company: company._id, user: userId, role: 'recruiter', status: 'active',
  });
});

test('another company recruiter and inactive account cannot delete without mutation', async (context) => {
  const { accountQuery, membershipQuery, saveCompany, updateMemberships } = setup(context);
  membershipQuery.session = async () => null;
  await assert.rejects(deleteRegistration(recruiter, companyId), { statusCode: 403 });
  accountQuery.session = async () => null;
  await assert.rejects(deleteRegistration(recruiter, companyId), { statusCode: 403 });
  assert.equal(saveCompany.mock.callCount(), 0);
  assert.equal(updateMemberships.mock.callCount(), 0);
});

test('missing or already deleted company returns 404 without another mutation', async (context) => {
  const { state, saveCompany, updateMemberships } = setup(context);
  await deleteRegistration(admin, companyId);
  await assert.rejects(deleteRegistration(admin, companyId), { statusCode: 404 });
  assert.equal(saveCompany.mock.callCount(), 1);
  assert.equal(updateMemberships.mock.callCount(), 1);
  assert.equal(state.memberships[0].status, 'inactive');
});

test('later registration with the former email creates a distinct pending company', async (context) => {
  const { findCompany } = setup(context);
  await deleteRegistration(admin, companyId);
  findCompany.mock.mockImplementation(async () => null);
  context.mock.method(Company, 'init', async () => Company);
  context.mock.method(Company, 'create', async (data) => new Company(data));
  const replacement = await registerCompany(admin, {
    legalName: 'Empresa Nova', responsibleName: 'Ana', email: 'contato@example.com',
    city: 'SP', state: 'SP', country: 'Brasil',
  });
  assert.notEqual(replacement.id, companyId);
  assert.equal(replacement.status, 'pending');
  assert.ok(Company.schema.indexes().some(([keys, options]) => keys.email === 1 &&
    options.unique && options.partialFilterExpression.deletedAt === null));
});

test('deletion succeeds even when there are no active recruiter links', async (context) => {
  const { company, state } = setup(context);
  state.memberships = [];
  await deleteRegistration(admin, companyId);
  assert.ok(company.deletedAt instanceof Date);
  assert.equal(state.committed, true);
});

test('blocked company is deleted, not reactivated', async (context) => {
  const { company } = setup(context, 'blocked');
  await deleteRegistration(admin, companyId);
  assert.equal(company.status, 'inactive');
  assert.ok(company.deletedAt instanceof Date);
});

test('invalid id and unsupported role are rejected before any storage access', async (context) => {
  const { transaction, findCompany } = setup(context);
  await assert.rejects(deleteRegistration(admin, 'bad'), { statusCode: 400 });
  await assert.rejects(deleteRegistration({ id: userId, role: 'candidate' }, companyId), { statusCode: 403 });
  assert.equal(transaction.mock.callCount(), 0);
  assert.equal(findCompany.mock.callCount(), 0);
});

test('membership revocation failure aborts company deletion', async (context) => {
  const { company, state, updateMemberships, saveCompany } = setup(context);
  const failure = new Error('revocation failed');
  updateMemberships.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(deleteRegistration(admin, companyId), (error) => error === failure);
  assert.equal(company.status, 'active');
  assert.equal(company.deletedAt, null);
  assert.equal(state.memberships[0].status, 'active');
  assert.equal(state.committed, false);
  assert.equal(saveCompany.mock.callCount(), 1);
});

test('unacknowledged or incomplete revocation aborts deletion', async (context) => {
  const { company, updateMemberships } = setup(context);
  updateMemberships.mock.mockImplementation(async () => ({ acknowledged: false,
    matchedCount: 1, modifiedCount: 0 }));
  await assert.rejects(deleteRegistration(admin, companyId));
  assert.equal(company.status, 'active');
  assert.equal(company.deletedAt, null);
  updateMemberships.mock.mockImplementation(async () => ({ acknowledged: true,
    matchedCount: 2, modifiedCount: 1 }));
  await assert.rejects(deleteRegistration(admin, companyId));
  assert.equal(company.status, 'active');
  assert.equal(company.deletedAt, null);
});

test('MongoDB without transactions returns 503 before partial writes', async (context) => {
  const { transaction, saveCompany, updateMemberships } = setup(context);
  transaction.mock.mockImplementation(async () => {
    throw Object.assign(new Error('transactions unsupported'), { code: 20 });
  });
  await assert.rejects(deleteRegistration(admin, companyId), { statusCode: 503 });
  assert.equal(saveCompany.mock.callCount(), 0);
  assert.equal(updateMemberships.mock.callCount(), 0);
});

test('valid recruiter JWT cannot read candidates after deletion', async (context) => {
  const { state } = setup(context);
  await deleteRegistration(admin, companyId);
  User.findOne.mock.mockImplementation(async () => ({ _id: userId }));
  CompanyUser.findOne.mock.mockImplementation(async () =>
    state.memberships.find((membership) => membership.status === 'active') || null);
  const findCandidate = context.mock.method(Candidate, 'findOne', () => assert.fail('must not query candidates'));
  await assert.rejects(getCandidateById(candidateId, userId, 'company'), { statusCode: 403 });
  assert.equal(findCandidate.mock.callCount(), 0);
});
