require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const {
  updateOwnPublicProfile,
  buildPublicProfileSnapshot,
  effectiveFields,
  normalizeInput,
} = require('../../src/services/candidate-public-profile.service');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';
const ownerId = '6512f1e2b3a1c2d3e4f5a6b7';

function activeCandidate(overrides = {}) {
  return Candidate.hydrate({
    _id: candidateId,
    user: ownerId,
    name: 'Maria',
    email: 'maria@example.com',
    professionalSummary: 'QA Engineer',
    githubUrl: 'https://github.com/maria',
    phone: '+55 11 99999-9999',
    status: 'active',
    deletedAt: null,
    publicProfile: {
      enabled: false,
      fields: [],
      consentedAt: null,
      revokedAt: null,
      cacheVersion: 1,
      cacheInvalidatedAt: null,
    },
    ...overrides,
  });
}

function isolateUpdate(context, candidate = activeCandidate()) {
  const find = context.mock.method(Candidate, 'findOne', () => ({
    select: async () => candidate,
  }));
  const update = context.mock.method(Candidate, 'findOneAndUpdate', async (_filter, operation) => {
    candidate.set(operation.$set);
    candidate.publicProfile.cacheVersion += operation.$inc['publicProfile.cacheVersion'];
    return candidate;
  });
  return { candidate, find, update };
}

test('enables an active candidate profile with explicit allowed fields and private audit', async (context) => {
  const { update } = isolateUpdate(context);
  const now = new Date('2026-09-23T12:00:00.000Z');
  const result = await updateOwnPublicProfile(
    { id: ownerId, role: 'candidate' },
    { enabled: true, fields: ['professionalSummary', 'name', 'matchProfile.apiTesting'] },
    now
  );

  assert.deepEqual(result.fields, ['matchProfile.apiTesting', 'name', 'professionalSummary']);
  assert.deepEqual(result.effectiveFields, result.fields);
  assert.equal(result.enabled, true);
  assert.equal(result.consentedAt.toISOString(), now.toISOString());
  assert.equal(result.revokedAt, null);
  assert.equal(result.cacheVersion, 2);
  const [filter, operation, options] = update.mock.calls[0].arguments;
  assert.deepEqual(filter, {
    _id: new Candidate({ _id: candidateId })._id,
    user: new Candidate({ user: ownerId }).user,
    status: 'active',
    deletedAt: null,
  });
  assert.equal(operation.$push.publicProfileConsentHistory.action, 'opt_in');
  assert.equal(operation.$push.publicProfileConsentHistory.actor, ownerId);
  assert.deepEqual(options, { new: true, runValidators: true, projection: { publicProfile: 1 } });
});

test('revocation clears fields, invalidates cache and keeps the original consent date', async (context) => {
  const consentedAt = new Date('2026-09-22T10:00:00.000Z');
  const candidate = activeCandidate({ publicProfile: {
    enabled: true, fields: ['name'], consentedAt, revokedAt: null, cacheVersion: 4,
  } });
  const { update } = isolateUpdate(context, candidate);
  const now = new Date('2026-09-23T12:00:00.000Z');
  const result = await updateOwnPublicProfile(
    { id: ownerId, role: 'candidate' }, { enabled: false }, now
  );

  assert.equal(result.enabled, false);
  assert.deepEqual(result.fields, []);
  assert.deepEqual(result.effectiveFields, []);
  assert.equal(result.consentedAt.toISOString(), consentedAt.toISOString());
  assert.equal(result.revokedAt.toISOString(), now.toISOString());
  assert.equal(result.cacheInvalidatedAt.toISOString(), now.toISOString());
  assert.equal(result.cacheVersion, 5);
  assert.equal(update.mock.calls[0].arguments[1].$push.publicProfileConsentHistory.action, 'revoked');
});

test('rejects publication for missing, inactive or non-candidate accounts', async (context) => {
  const { find, update } = isolateUpdate(context, activeCandidate({ status: 'incomplete_profile' }));
  await assert.rejects(updateOwnPublicProfile({ id: ownerId, role: 'company' },
    { enabled: true, fields: ['name'] }), { statusCode: 403 });
  assert.equal(find.mock.callCount(), 0);
  await assert.rejects(updateOwnPublicProfile({ id: ownerId, role: 'candidate' },
    { enabled: true, fields: ['name'] }), { statusCode: 409 });
  assert.equal(update.mock.callCount(), 0);

  find.mock.mockImplementation(() => ({ select: async () => null }));
  await assert.rejects(updateOwnPublicProfile({ id: ownerId, role: 'candidate' },
    { enabled: false }), { statusCode: 404 });
});

test('accepts only explicit consent and whitelisted non-sensitive fields', () => {
  assert.deepEqual(normalizeInput({ enabled: false }), { enabled: false, fields: [] });
  for (const input of [
    {},
    { enabled: 'true', fields: ['name'] },
    { enabled: true },
    { enabled: true, fields: ['email'] },
    { enabled: true, fields: ['phone'] },
    { enabled: true, fields: ['name', 'name'] },
    { enabled: false, fields: ['name'] },
    { enabled: true, fields: ['name'], slug: 'maria' },
  ]) assert.throws(() => normalizeInput(input), { statusCode: 400 });
});

test('private, revoked, inactive and deleted candidates produce no public snapshot', () => {
  for (const candidate of [
    activeCandidate(),
    activeCandidate({ publicProfile: { enabled: false, fields: ['name'] } }),
    activeCandidate({ status: 'inactive', publicProfile: { enabled: true, fields: ['name'] } }),
    activeCandidate({ deletedAt: new Date(), publicProfile: { enabled: true, fields: ['name'] } }),
  ]) assert.equal(buildPublicProfileSnapshot({ candidate }), null);
});

test('snapshot returns only selected fields and source-approved formation data', () => {
  const candidate = activeCandidate({ publicProfile: { enabled: true, fields: [
    'name', 'professionalSummary', 'githubUrl', 'matchProfile.apiTesting',
    'formation.cohort', 'formation.projects',
  ] } });
  const snapshot = buildPublicProfileSnapshot({
    candidate,
    matchProfile: { values: { apiTesting: ['api-testing'], automation: ['automation'] } },
    formationData: { cohort: 'Turma 10', projects: [{ name: 'Projeto' }], score: 900 },
    sourceAllowedFormationFields: ['formation.projects'],
  });
  assert.deepEqual(snapshot, {
    name: 'Maria',
    professionalSummary: 'QA Engineer',
    githubUrl: 'https://github.com/maria',
    matchProfile: { apiTesting: ['api-testing'] },
    formation: { projects: [{ name: 'Projeto' }] },
  });
  assert.equal(JSON.stringify(snapshot).includes('99999'), false);
  assert.deepEqual(effectiveFields(candidate.publicProfile.fields, ['formation.projects']), [
    'name', 'professionalSummary', 'githubUrl', 'matchProfile.apiTesting', 'formation.projects',
  ]);
});

test('public consent does not change company-search availability', () => {
  const candidate = activeCandidate({
    availability: 'unavailable',
    publicProfile: { enabled: true, fields: ['name'] },
  });
  assert.deepEqual(buildPublicProfileSnapshot({ candidate }), { name: 'Maria' });
  assert.equal(candidate.availability, 'unavailable');
});

test('opportunity availability does not publish a profile without separate consent', () => {
  const candidate = activeCandidate({
    availableForOpportunities: true,
    publicProfile: { enabled: false, fields: ['name'] },
  });
  assert.equal(buildPublicProfileSnapshot({ candidate }), null);
  assert.equal(candidate.availableForOpportunities, true);
});
