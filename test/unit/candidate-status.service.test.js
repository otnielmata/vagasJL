require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const CandidateMatchProfile = require('../../src/models/candidate-match-profile.model');
const MatchProfileConfiguration = require('../../src/models/match-profile-configuration.model');
const ProfileCompletionThresholdConfiguration =
  require('../../src/models/profile-completion-threshold-configuration.model');
const User = require('../../src/models/user.model');
const { CANDIDATE_STATUS, ELIGIBILITY_STATUS, UNKNOWN } = require('../../src/config/candidate');
const { updateCandidateStatus } = require('../../src/services/candidate-status.service');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b7';
const userId = '6512f1e2b3a1c2d3e4f5a6b8';
const admin = { id: '6512f1e2b3a1c2d3e4f5a6b9', role: 'admin' };
const now = new Date('2026-09-23T19:00:00.000Z');

function completeCandidate(status = CANDIDATE_STATUS.INCOMPLETE_PROFILE, overrides = {}) {
  return Candidate.hydrate({
    _id: candidateId,
    user: userId,
    name: 'Maria',
    email: 'maria@example.com',
    phone: '11999999999',
    city: 'Sao Paulo',
    state: 'SP',
    country: 'Brasil',
    professionalSummary: 'QA Engineer',
    availability: 'available',
    status,
    eligibility: { status: ELIGIBILITY_STATUS.APPROVED, method: 'email', source: 'mongodb',
      lastAttemptAt: now, approvedAt: now },
    availableForOpportunities: true,
    opportunitySearchCacheVersion: 2,
    publicProfile: { enabled: true, fields: ['name'], consentedAt: now, cacheVersion: 2 },
    enterpriseDisplayPermissions: { contact: ['linkedinUrl'], formation: ['cohort'], cacheVersion: 2 },
    updatedAt: new Date('2026-09-23T18:00:00.000Z'),
    ...overrides,
  });
}

function setup(context, status = CANDIDATE_STATUS.INCOMPLETE_PROFILE, overrides = {}) {
  const candidate = completeCandidate(status, overrides);
  const initialQuery = { select: async () => candidate };
  const duplicateQuery = { select: () => ({ lean: async () => null }) };
  const findCandidate = context.mock.method(Candidate, 'findOne', (filter) =>
    filter._id?.$ne ? duplicateQuery : initialQuery);
  const thresholdQuery = { sort: async () => null };
  context.mock.method(ProfileCompletionThresholdConfiguration, 'findOne', () => thresholdQuery);
  const updateCandidate = context.mock.method(Candidate, 'findOneAndUpdate', async (_filter, update) => {
    candidate.status = update.$set.status;
    return candidate;
  });
  const updateUser = context.mock.method(User, 'updateOne', async () => ({ matchedCount: 1 }));
  const transaction = context.mock.method(Candidate.db, 'transaction', async (operation) =>
    operation({ id: 'session' }));
  return { candidate, initialQuery, duplicateQuery, findCandidate, updateCandidate, updateUser,
    transaction, thresholdQuery };
}

test('admin activates eligible complete candidate and records audited status change', async (context) => {
  const { candidate, findCandidate, updateCandidate, updateUser } = setup(context);
  const response = await updateCandidateStatus(admin, candidateId, {
    status: CANDIDATE_STATUS.ACTIVE, reason: 'Perfil revisado e aprovado',
  }, now);

  assert.deepEqual(response, {
    candidate: { _id: candidate._id, status: CANDIDATE_STATUS.ACTIVE },
    previousStatus: CANDIDATE_STATUS.INCOMPLETE_PROFILE,
    changed: true,
    changedAt: now,
  });
  assert.equal(findCandidate.mock.callCount(), 2);
  assert.deepEqual(findCandidate.mock.calls[1].arguments[0], {
    _id: { $ne: candidate._id }, email: candidate.email,
    status: CANDIDATE_STATUS.ACTIVE, deletedAt: null,
  });
  const [filter, update, options] = updateCandidate.mock.calls[0].arguments;
  assert.deepEqual(filter, { _id: candidate._id, status: CANDIDATE_STATUS.INCOMPLETE_PROFILE,
    updatedAt: candidate.updatedAt, deletedAt: null });
  assert.equal(update.$set.status, CANDIDATE_STATUS.ACTIVE);
  assert.equal(update.$set.opportunitySearchCacheInvalidatedAt, now);
  assert.deepEqual(update.$push.statusHistory, {
    from: CANDIDATE_STATUS.INCOMPLETE_PROFILE, to: CANDIDATE_STATUS.ACTIVE,
    actor: admin.id, changedAt: now, reason: 'Perfil revisado e aprovado',
  });
  assert.deepEqual(options, { new: true, runValidators: true });
  assert.equal(updateUser.mock.callCount(), 0);
});

test('activation rejects missing eligibility, incomplete profile and duplicate active email', async (context) => {
  const { candidate, duplicateQuery, updateCandidate } = setup(context);
  candidate.eligibility.status = ELIGIBILITY_STATUS.PENDING;
  await assert.rejects(updateCandidateStatus(admin, candidateId,
    { status: CANDIDATE_STATUS.ACTIVE, reason: 'Revisao' }, now), { statusCode: 409 });

  candidate.eligibility.status = ELIGIBILITY_STATUS.APPROVED;
  candidate.phone = UNKNOWN;
  await assert.rejects(updateCandidateStatus(admin, candidateId,
    { status: CANDIDATE_STATUS.ACTIVE, reason: 'Revisao' }, now), { statusCode: 409 });

  candidate.phone = '11999999999';
  duplicateQuery.select = () => ({ lean: async () => ({ _id: '6512f1e2b3a1c2d3e4f5a6c0' }) });
  await assert.rejects(updateCandidateStatus(admin, candidateId,
    { status: CANDIDATE_STATUS.ACTIVE, reason: 'Revisao' }, now), { statusCode: 409 });
  assert.equal(updateCandidate.mock.callCount(), 0);
});

test('activation applies published minimum Match Profile completion', async (context) => {
  const { thresholdQuery, updateCandidate } = setup(context);
  thresholdQuery.sort = async () => ({ version: 1, minimumPercentage: 100, effectiveAt: now });
  const profile = { candidate: candidateId, configurationVersion: 3, values: { yearsOfExperience: 2 } };
  context.mock.method(CandidateMatchProfile, 'findOne', async () => profile);
  context.mock.method(MatchProfileConfiguration, 'findOne', async () => ({ version: 3, fields: [
    { key: 'yearsOfExperience', options: [] },
    { key: 'apiTesting', options: [{ id: 'api-testing' }] },
  ] }));

  await assert.rejects(updateCandidateStatus(admin, candidateId,
    { status: CANDIDATE_STATUS.ACTIVE, reason: 'Revisao' }, now), {
    statusCode: 409,
    message: 'Candidato abaixo da completude minima de perfil para ativacao',
  });
  assert.equal(updateCandidate.mock.callCount(), 0);
});

test('blocking revokes visibility, consents, permissions and all issued tokens atomically', async (context) => {
  const { candidate, updateCandidate, updateUser, transaction } = setup(context, CANDIDATE_STATUS.ACTIVE);
  const response = await updateCandidateStatus(admin, candidateId, {
    status: CANDIDATE_STATUS.BLOCKED, reason: 'Violacao dos termos',
  }, now);

  assert.equal(response.candidate.status, CANDIDATE_STATUS.BLOCKED);
  assert.equal(transaction.mock.callCount(), 1);
  const [, update, options] = updateCandidate.mock.calls[0].arguments;
  assert.equal(update.$set.availableForOpportunities, false);
  assert.equal(update.$set['publicProfile.enabled'], false);
  assert.deepEqual(update.$set['publicProfile.fields'], []);
  assert.deepEqual(update.$set['enterpriseDisplayPermissions.contact'], []);
  assert.deepEqual(update.$set['enterpriseDisplayPermissions.formation'], []);
  assert.equal(update.$inc.opportunitySearchCacheVersion, 1);
  assert.equal(update.$inc['publicProfile.cacheVersion'], 1);
  assert.equal(options.session.id, 'session');
  assert.deepEqual(updateUser.mock.calls[0].arguments, [
    { _id: candidate.user, role: 'candidate' },
    { $inc: { tokenVersion: 1 } },
    { session: options.session },
  ]);
});

test('same status is idempotent and creates no duplicate audit or revocation', async (context) => {
  const { candidate, updateCandidate, updateUser, transaction } = setup(context, CANDIDATE_STATUS.INACTIVE);
  const response = await updateCandidateStatus(admin, candidateId, {
    status: CANDIDATE_STATUS.INACTIVE, reason: 'Repeticao segura',
  }, now);
  assert.deepEqual(response, { candidate: { _id: candidate._id, status: CANDIDATE_STATUS.INACTIVE },
    previousStatus: CANDIDATE_STATUS.INACTIVE, changed: false, changedAt: null });
  assert.equal(updateCandidate.mock.callCount(), 0);
  assert.equal(updateUser.mock.callCount(), 0);
  assert.equal(transaction.mock.callCount(), 0);
});

test('invalid actors, payloads, transitions and concurrent writes fail without mutation', async (context) => {
  const { candidate, initialQuery, updateCandidate } = setup(context, CANDIDATE_STATUS.PENDING_VALIDATION);
  await assert.rejects(updateCandidateStatus({ ...admin, role: 'company' }, candidateId,
    { status: CANDIDATE_STATUS.BLOCKED, reason: 'x' }), { statusCode: 403 });
  for (const [id, body] of [
    ['bad', { status: CANDIDATE_STATUS.BLOCKED, reason: 'x' }],
    [candidateId, null],
    [candidateId, { status: 'unknown', reason: 'x' }],
    [candidateId, { status: CANDIDATE_STATUS.BLOCKED, reason: ' ' }],
    [candidateId, { status: CANDIDATE_STATUS.BLOCKED, reason: 'x', name: 'alterado' }],
  ]) await assert.rejects(updateCandidateStatus(admin, id, body), { statusCode: 400 });

  await assert.rejects(updateCandidateStatus(admin, candidateId,
    { status: CANDIDATE_STATUS.ACTIVE, reason: 'Atalho invalido' }, now), { statusCode: 409 });
  candidate.status = CANDIDATE_STATUS.ACTIVE;
  updateCandidate.mock.mockImplementation(async () => null);
  await assert.rejects(updateCandidateStatus(admin, candidateId,
    { status: CANDIDATE_STATUS.INACTIVE, reason: 'Concorrencia' }, now), { statusCode: 409 });
  initialQuery.select = async () => null;
  await assert.rejects(updateCandidateStatus(admin, candidateId,
    { status: CANDIDATE_STATUS.INACTIVE, reason: 'Ausente' }, now), { statusCode: 404 });
});

test('candidate status audit remains private', () => {
  const candidate = completeCandidate(CANDIDATE_STATUS.ACTIVE, { statusHistory: [{
    from: CANDIDATE_STATUS.INCOMPLETE_PROFILE, to: CANDIDATE_STATUS.ACTIVE,
    actor: admin.id, changedAt: now, reason: 'Aprovado',
  }] });
  assert.equal(candidate.validateSync(), undefined);
  assert.equal(Candidate.schema.path('statusHistory').options.select, false);
  assert.equal(candidate.toJSON().statusHistory, undefined);
});
