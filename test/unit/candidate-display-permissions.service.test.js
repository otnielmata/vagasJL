require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const {
  updateOwnDisplayPermissions,
  enterpriseCandidateData,
  normalizeInput,
} = require('../../src/services/candidate-display-permissions.service');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';
const ownerId = '6512f1e2b3a1c2d3e4f5a6b7';
const otherId = '6512f1e2b3a1c2d3e4f5a6b8';

function candidate(overrides = {}) {
  return Candidate.hydrate({
    _id: candidateId,
    user: ownerId,
    name: 'Maria',
    email: 'maria@example.com',
    phone: '+55 11 99999-9999',
    linkedinUrl: 'https://linkedin.com/in/maria',
    githubUrl: 'https://github.com/maria',
    city: 'Sao Paulo',
    state: 'SP',
    country: 'Brasil',
    professionalSummary: 'QA Engineer',
    availability: 'available',
    availableForOpportunities: true,
    status: 'active',
    deletedAt: null,
    enterpriseDisplayPermissions: {
      contact: [], formation: [], changedAt: null, cacheVersion: 1,
    },
    ...overrides,
  });
}

function isolate(context, current = candidate()) {
  const find = context.mock.method(Candidate, 'findOne', () => ({ select: async () => current }));
  const update = context.mock.method(Candidate, 'findOneAndUpdate', async (_filter, operation) => {
    current.set(operation.$set);
    current.enterpriseDisplayPermissions.cacheVersion +=
      operation.$inc['enterpriseDisplayPermissions.cacheVersion'];
    return current;
  });
  return { current, find, update };
}

test('stores granular contact and formation permissions with private audit and cache invalidation', async (context) => {
  const { update } = isolate(context);
  const now = new Date('2026-09-23T15:00:00.000Z');
  const result = await updateOwnDisplayPermissions(
    { id: ownerId, role: 'candidate' },
    { contact: ['linkedinUrl'], formation: ['projects', 'cohort'] },
    now
  );
  assert.deepEqual(result, {
    contact: ['linkedinUrl'], formation: ['cohort', 'projects'], changedAt: now,
  });
  const [filter, operation, options] = update.mock.calls[0].arguments;
  assert.equal(filter['enterpriseDisplayPermissions.changedAt'], null);
  assert.equal(operation.$set['enterpriseDisplayPermissions.cacheInvalidatedAt'], now);
  assert.equal(operation.$inc['enterpriseDisplayPermissions.cacheVersion'], 1);
  assert.deepEqual(operation.$push.enterpriseDisplayPermissionHistory, {
    contact: ['linkedinUrl'], formation: ['cohort', 'projects'], actor: ownerId, changedAt: now,
  });
  assert.deepEqual(options, {
    new: true, runValidators: true, projection: { enterpriseDisplayPermissions: 1 },
  });
});

test('omitted categories revoke every permission and repeated state is idempotent', async (context) => {
  const current = candidate({ enterpriseDisplayPermissions: {
    contact: ['email'], formation: ['cohort'], changedAt: new Date('2026-09-22T15:00:00.000Z'),
    cacheVersion: 2,
  } });
  const { update } = isolate(context, current);
  const result = await updateOwnDisplayPermissions(
    { id: ownerId, role: 'candidate' }, {}, new Date('2026-09-23T15:00:00.000Z')
  );
  assert.deepEqual(result.contact, []);
  assert.deepEqual(result.formation, []);
  assert.equal(update.mock.callCount(), 1);
  const repeated = await updateOwnDisplayPermissions({ id: ownerId, role: 'candidate' }, {});
  assert.deepEqual(repeated, result);
  assert.equal(update.mock.callCount(), 1);
});

test('enterprise response is private by default and minimizes basic fields', async () => {
  const result = await enterpriseCandidateData(candidate({ photoUrl: 'UNKNOWN' }), {
    fetchEngagement: async () => assert.fail('formation origin must not be called'),
  });
  assert.deepEqual(result, {
    _id: new Candidate({ _id: candidateId })._id,
    name: 'Maria', city: 'Sao Paulo', state: 'SP', country: 'Brasil',
    professionalSummary: 'QA Engineer', availability: 'available', availableForOpportunities: true,
  });
  assert.equal(result.email, undefined);
  assert.equal(result.phone, undefined);
  assert.equal(result.linkedinUrl, undefined);
  assert.equal(result.formation, undefined);
});

test('enterprise response exposes only specifically authorized contact', async () => {
  const result = await enterpriseCandidateData(candidate({ enterpriseDisplayPermissions: {
    contact: ['linkedinUrl'], formation: [], changedAt: new Date(),
  } }));
  assert.equal(result.linkedinUrl, 'https://linkedin.com/in/maria');
  assert.equal(result.email, undefined);
  assert.equal(result.phone, undefined);
  assert.equal(result.githubUrl, undefined);
});

test('formation requires candidate permission and an available source-authorized value', async () => {
  const current = candidate({ enterpriseDisplayPermissions: {
    contact: [], formation: ['cohort', 'projects'], changedAt: new Date(),
  } });
  const result = await enterpriseCandidateData(current, { fetchEngagement: async () => ({
    status: 'available',
    data: { projects: [{ name: 'VagasJL' }], privateEmail: 'hidden' },
  }) });
  assert.deepEqual(result.formation, { projects: [{ name: 'VagasJL' }] });
  assert.equal(result.formation.cohort, undefined);
  assert.equal(JSON.stringify(result).includes('privateEmail'), false);

  const unavailable = await enterpriseCandidateData(current, { fetchEngagement: async () => ({
    status: 'unavailable', data: null,
  }) });
  assert.equal(unavailable.formation, undefined);
});

test('candidate identity controls mutations and third parties cannot change permissions', async (context) => {
  const { find, update } = isolate(context, candidate({ user: otherId }));
  await assert.rejects(updateOwnDisplayPermissions(
    { id: ownerId, role: 'candidate' }, { contact: ['email'] }
  ), { statusCode: 403 });
  assert.equal(update.mock.callCount(), 0);
  await assert.rejects(updateOwnDisplayPermissions(
    { id: ownerId, role: 'company' }, { contact: ['email'] }
  ), { statusCode: 403 });
  assert.equal(find.mock.callCount(), 1);
});

test('missing candidate and concurrent change fail without false success', async (context) => {
  const { find, update } = isolate(context);
  find.mock.mockImplementation(() => ({ select: async () => null }));
  await assert.rejects(updateOwnDisplayPermissions(
    { id: ownerId, role: 'candidate' }, {}
  ), { statusCode: 404 });
  find.mock.mockImplementation(() => ({ select: async () => candidate() }));
  update.mock.mockImplementation(async () => null);
  await assert.rejects(updateOwnDisplayPermissions(
    { id: ownerId, role: 'candidate' }, { contact: ['phone'] }
  ), { statusCode: 409 });
});

test('validates category whitelists and treats absent category as no permission', () => {
  assert.deepEqual(normalizeInput({ contact: ['phone'] }), { contact: ['phone'], formation: [] });
  assert.deepEqual(normalizeInput({}), { contact: [], formation: [] });
  for (const input of [undefined, null, [], { contact: 'phone' }, { formation: ['privateEmail'] },
    { contact: ['phone', 'phone'] }, { contact: ['email'], candidateId }]) {
    assert.throws(() => normalizeInput(input), { statusCode: 400 });
  }
});
