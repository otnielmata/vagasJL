require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const User = require('../../src/models/user.model');
const { getCandidateById } = require('../../src/services/candidate.service');
const { UNKNOWN, PROFILE_FIELDS, CANDIDATE_STATUS } = require('../../src/config/candidate');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';
const ownerId = '6512f1e2b3a1c2d3e4f5a6b7';
const otherUserId = '6512f1e2b3a1c2d3e4f5a6b8';

function storedCandidate(overrides = {}) {
  return {
    _id: candidateId,
    user: ownerId,
    name: 'Maria Silva',
    photoUrl: 'https://example.com/maria.png',
    email: 'maria@example.com',
    phone: '+55 11 99999-9999',
    city: 'Sao Paulo',
    state: 'SP',
    country: 'Brasil',
    linkedinUrl: 'https://linkedin.com/in/maria',
    githubUrl: 'https://github.com/maria',
    portfolioUrl: 'https://maria.example.com',
    professionalSummary: 'Profissional de testes',
    availability: 'available',
    availableForOpportunities: true,
    status: CANDIDATE_STATUS.ACTIVE,
    eligibility: { status: 'approved', method: 'purchase_code', source: 'mongodb' },
    purchaseCode: 'private-proof',
    trustedIdentifier: 'private-id',
    password: 'private-hash',
    token: 'private-token',
    createdAt: new Date('2026-09-15T10:00:00.000Z'),
    updatedAt: new Date('2026-09-15T11:00:00.000Z'),
    __v: 0,
    ...overrides,
  };
}

function isolateLookup(context, stored) {
  const query = {
    projection: undefined,
    result: undefined,
    leanCalled: false,
    select(projection) {
      this.projection = projection;
      return this;
    },
    async lean() {
      this.leanCalled = true;
      return this.result;
    },
  };
  const findOne = context.mock.method(Candidate, 'findOne', (filter) => {
    query.result = stored && (!filter.status || filter.status === stored.status) &&
      (!filter.availableForOpportunities || stored.availableForOpportunities === true) &&
      (!filter['eligibility.status'] || stored.eligibility?.status === filter['eligibility.status'])
      ? stored : null;
    return query;
  });
  return { findOne, query };
}

for (const status of Object.values(CANDIDATE_STATUS)) {
  test(`candidate owner can view own ${status} profile including status`, async (context) => {
    const stored = storedCandidate({ status });
    const snapshot = structuredClone(stored);
    const { findOne, query } = isolateLookup(context, stored);

    const result = await getCandidateById(candidateId, ownerId.toUpperCase(), 'candidate');

    assert.deepEqual(findOne.mock.calls[0].arguments, [{ _id: candidateId }]);
    assert.equal(query.leanCalled, true);
    assert.equal(result.status, status);
    assert.equal(result._id, candidateId);
    assert.equal(result.name, stored.name);
    assert.deepEqual(stored, snapshot);
  });
}

for (const status of Object.values(CANDIDATE_STATUS)) {
  test(`company role alone cannot view a ${status} candidate`, async (context) => {
    const { findOne } = isolateLookup(context, storedCandidate({ status }));
    context.mock.method(User, 'findOne', async () => null);
    await assert.rejects(getCandidateById(candidateId, otherUserId, 'company'), { statusCode: 403 });
    assert.equal(findOne.mock.callCount(), 0);
  });
}

test('active recruiter of active company sees only active candidates', async (context) => {
  const account = { _id: otherUserId };
  const findUser = context.mock.method(User, 'findOne', async () => account);
  const findMembership = context.mock.method(CompanyUser, 'findOne', async () => ({ company: 'company-id' }));
  const findCompany = context.mock.method(Company, 'findOne', async () => ({ status: 'active' }));
  const { findOne } = isolateLookup(context, storedCandidate());
  const result = await getCandidateById(candidateId, otherUserId, 'company');
  assert.equal(result.name, 'Maria Silva');
  assert.equal(result.status, undefined);
  assert.deepEqual(findUser.mock.calls[0].arguments[0], {
    _id: otherUserId, role: 'company', status: 'active', emailVerifiedAt: { $type: 'date' },
  });
  assert.deepEqual(findMembership.mock.calls[0].arguments[0], { user: otherUserId, status: 'active' });
  assert.deepEqual(findCompany.mock.calls[0].arguments[0], {
    _id: 'company-id', status: 'active', deletedAt: null,
  });
  assert.deepEqual(findOne.mock.calls[0].arguments[0], {
    _id: candidateId,
    status: CANDIDATE_STATUS.ACTIVE,
    availableForOpportunities: true,
    'eligibility.status': 'approved',
  });
});

test('active recruiter cannot read an active candidate who disabled opportunities', async (context) => {
  context.mock.method(User, 'findOne', async () => ({ _id: otherUserId }));
  context.mock.method(CompanyUser, 'findOne', async () => ({ company: 'company-id' }));
  context.mock.method(Company, 'findOne', async () => ({ status: 'active' }));
  isolateLookup(context, storedCandidate({ availableForOpportunities: false }));
  await assert.rejects(getCandidateById(candidateId, otherUserId, 'company'), { statusCode: 404 });
});

for (const status of Object.values(CANDIDATE_STATUS).filter((value) => value !== CANDIDATE_STATUS.ACTIVE)) {
  test(`company cannot see a ${status} candidate even with active membership`, async (context) => {
    context.mock.method(User, 'findOne', async () => ({ _id: otherUserId }));
    context.mock.method(CompanyUser, 'findOne', async () => ({ company: 'company-id' }));
    context.mock.method(Company, 'findOne', async () => ({ status: 'active' }));
    isolateLookup(context, storedCandidate({ status }));
    await assert.rejects(getCandidateById(candidateId, otherUserId, 'company'), { statusCode: 404 });
  });
}

test('inactive account, missing membership or non-active company deny access before candidate lookup', async (context) => {
  const { findOne } = isolateLookup(context, storedCandidate());
  const account = { _id: otherUserId };
  const membership = { company: 'company-id' };
  const findUser = context.mock.method(User, 'findOne', async () => account);
  const findMembership = context.mock.method(CompanyUser, 'findOne', async () => membership);
  const findCompany = context.mock.method(Company, 'findOne', async () => null);
  for (const companyStatus of ['pending', 'inactive', 'blocked']) {
    await assert.rejects(getCandidateById(candidateId, otherUserId, 'company'), { statusCode: 403 });
  }
  findMembership.mock.mockImplementation(async () => null);
  await assert.rejects(getCandidateById(candidateId, otherUserId, 'company'), { statusCode: 403 });
  findUser.mock.mockImplementation(async () => null);
  await assert.rejects(getCandidateById(candidateId, otherUserId, 'company'), { statusCode: 403 });
  assert.equal(findOne.mock.callCount(), 0);
  assert.equal(findCompany.mock.callCount(), 3);
});

test('candidate cannot view another candidate profile', async (context) => {
  isolateLookup(context, storedCandidate({ user: otherUserId }));
  await assert.rejects(getCandidateById(candidateId, ownerId, 'candidate'), { statusCode: 403 });
});

for (const role of ['candidate']) {
  test(`${role} receives 404 for an unknown candidate`, async (context) => {
    isolateLookup(context, null);
    await assert.rejects(getCandidateById(candidateId, ownerId, role), {
      statusCode: 404,
      message: 'Candidato nao encontrado',
    });
  });
}

test('missing or invalid optional values are returned as UNKNOWN and never false', async (context) => {
  const unknownValues = [undefined, null, false, '', '   ', 0];
  const missingProfile = Object.fromEntries(PROFILE_FIELDS.map((field, index) => [
    field,
    unknownValues[index % unknownValues.length],
  ]));
  isolateLookup(context, storedCandidate(missingProfile));

  const result = await getCandidateById(candidateId, ownerId, 'candidate');

  for (const field of PROFILE_FIELDS) assert.equal(result[field], UNKNOWN);
  assert.equal(Object.values(result).includes(false), false);
});

test('legacy candidate without opportunity preference is returned as conservatively unavailable', async (context) => {
  const stored = storedCandidate();
  delete stored.availableForOpportunities;
  isolateLookup(context, stored);
  const result = await getCandidateById(candidateId, ownerId, 'candidate');
  assert.equal(result.availableForOpportunities, false);
});

test('unsupported account role is rejected before querying candidates', async (context) => {
  const findOne = context.mock.method(Candidate, 'findOne', () => {
    assert.fail('unsupported role must not query candidates');
  });
  await assert.rejects(getCandidateById(candidateId, ownerId, 'admin'), { statusCode: 403 });
  assert.equal(findOne.mock.callCount(), 0);
});
