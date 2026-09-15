require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
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
    query.result = stored && (!filter.status || filter.status === stored.status) ? stored : null;
    return query;
  });
  return { findOne, query };
}

const publicFields = [
  '_id', 'name', 'photoUrl', 'email', 'phone', 'city', 'state', 'country', 'linkedinUrl',
  'githubUrl', 'portfolioUrl', 'professionalSummary', 'availability',
];

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

test('company receives only the explicit public projection for an active candidate', async (context) => {
  const stored = storedCandidate();
  const { findOne, query } = isolateLookup(context, stored);

  const result = await getCandidateById(candidateId, otherUserId, 'company');

  assert.deepEqual(findOne.mock.calls[0].arguments, [{
    _id: candidateId,
    status: CANDIDATE_STATUS.ACTIVE,
  }]);
  assert.deepEqual(Object.keys(query.projection).sort(), [
    '_id', 'availability', 'city', 'country', 'email', 'githubUrl', 'linkedinUrl', 'name',
    'phone', 'photoUrl', 'portfolioUrl', 'professionalSummary', 'state', 'status', 'user',
  ]);
  assert.deepEqual(Object.keys(result), publicFields);
  assert.equal(result.status, undefined);
  assert.equal(result.user, undefined);
  assert.equal(query.projection.user, 1);
  for (const field of ['eligibility', 'purchaseCode', 'trustedIdentifier', 'password',
    'token', 'createdAt', 'updatedAt', '__v']) {
    assert.equal(result[field], undefined);
    assert.equal(query.projection[field], undefined);
  }
});

for (const status of [
  CANDIDATE_STATUS.PENDING_VALIDATION,
  CANDIDATE_STATUS.INCOMPLETE_PROFILE,
  CANDIDATE_STATUS.INACTIVE,
  CANDIDATE_STATUS.BLOCKED,
]) {
  test(`company receives generic 404 for ${status} candidate`, async (context) => {
    const { findOne } = isolateLookup(context, storedCandidate({ status }));

    await assert.rejects(
      getCandidateById(candidateId, otherUserId, 'company'),
      (error) => {
        assert.equal(error.statusCode, 404);
        assert.equal(error.message, 'Candidato nao encontrado');
        assert.equal(error.message.includes(status), false);
        return true;
      }
    );
    assert.deepEqual(findOne.mock.calls[0].arguments[0], {
      _id: candidateId,
      status: CANDIDATE_STATUS.ACTIVE,
    });
  });
}

test('candidate cannot view another candidate profile', async (context) => {
  isolateLookup(context, storedCandidate({ user: otherUserId }));
  await assert.rejects(getCandidateById(candidateId, ownerId, 'candidate'), { statusCode: 403 });
});

for (const role of ['candidate', 'company']) {
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

test('unsupported account role is rejected before querying candidates', async (context) => {
  const findOne = context.mock.method(Candidate, 'findOne', () => {
    assert.fail('unsupported role must not query candidates');
  });
  await assert.rejects(getCandidateById(candidateId, ownerId, 'admin'), { statusCode: 403 });
  assert.equal(findOne.mock.callCount(), 0);
});
