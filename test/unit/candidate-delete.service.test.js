require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const User = require('../../src/models/user.model');
const StudentAuthorization = require('../../src/models/student-authorization.model');
const { deleteCandidate } = require('../../src/services/candidate.service');
const { CANDIDATE_STATUS } = require('../../src/config/candidate');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';
const ownerId = '6512f1e2b3a1c2d3e4f5a6b7';
const otherId = '6512f1e2b3a1c2d3e4f5a6b8';

function isolateDeletion(context, status = CANDIDATE_STATUS.ACTIVE) {
  const candidate = Candidate.hydrate({
    _id: candidateId,
    user: ownerId,
    name: 'Maria',
    email: 'maria@example.com',
    status,
    deletedAt: null,
  });
  const state = {
    candidate,
    user: { _id: ownerId, email: candidate.email, status: 'active' },
    authorization: { email: candidate.email, status: 'authorized' },
  };
  const find = context.mock.method(Candidate, 'findById', () => ({
    select: async () => state.candidate,
  }));
  const update = context.mock.method(Candidate, 'findOneAndUpdate', async (filter, operation) => {
    if (!state.candidate || state.candidate.status === CANDIDATE_STATUS.INACTIVE) return null;
    assert.equal(filter._id.toString(), candidateId);
    assert.equal(filter.user.toString(), ownerId);
    assert.deepEqual(filter.status.$in, [
      CANDIDATE_STATUS.PENDING_VALIDATION,
      CANDIDATE_STATUS.INCOMPLETE_PROFILE,
      CANDIDATE_STATUS.ACTIVE,
    ]);
    assert.equal(filter.deletedAt, null);
    state.candidate.set(operation.$set);
    return state.candidate;
  });
  const removeUser = context.mock.method(User, 'deleteOne', async () => assert.fail('must keep user'));
  const removeAuthorization = context.mock.method(
    StudentAuthorization,
    'deleteOne',
    async () => assert.fail('must keep authorization')
  );
  return { state, find, update, removeUser, removeAuthorization };
}

for (const status of [
  CANDIDATE_STATUS.PENDING_VALIDATION,
  CANDIDATE_STATUS.INCOMPLETE_PROFILE,
  CANDIDATE_STATUS.ACTIVE,
]) {
  test(`logically deletes own ${status} candidate with status and audit date atomically`, async (context) => {
    const { state, update, removeUser, removeAuthorization } = isolateDeletion(context, status);
    await deleteCandidate(candidateId, ownerId.toUpperCase(), 'candidate');

    assert.equal(state.candidate.status, CANDIDATE_STATUS.INACTIVE);
    assert.ok(state.candidate.deletedAt instanceof Date);
    assert.equal(state.candidate.visibleToCompanies, false);
    assert.equal(update.mock.callCount(), 1);
    const [filter, operation, options] = update.mock.calls[0].arguments;
    assert.equal(operation.$set.status, CANDIDATE_STATUS.INACTIVE);
    assert.equal(operation.$set.deletedAt, state.candidate.deletedAt);
    assert.equal(operation.$set['publicProfile.enabled'], false);
    assert.deepEqual(operation.$set['publicProfile.fields'], []);
    assert.equal(operation.$set['publicProfile.revokedAt'], state.candidate.deletedAt);
    assert.equal(operation.$inc['publicProfile.cacheVersion'], 1);
    assert.equal(operation.$push.publicProfileConsentHistory.action, 'candidate_deleted');
    assert.equal(operation.$push.publicProfileConsentHistory.actor, ownerId.toUpperCase());
    assert.deepEqual(options, { new: true, runValidators: true });
    assert.equal(Object.prototype.hasOwnProperty.call(filter, 'email'), false);
    assert.deepEqual(state.user, { _id: ownerId, email: 'maria@example.com', status: 'active' });
    assert.deepEqual(state.authorization, { email: 'maria@example.com', status: 'authorized' });
    assert.equal(removeUser.mock.callCount(), 0);
    assert.equal(removeAuthorization.mock.callCount(), 0);
  });
}

test('second deletion returns 404 without another mutation', async (context) => {
  const { state, update } = isolateDeletion(context);
  await deleteCandidate(candidateId, ownerId, 'candidate');
  const deletedAt = state.candidate.deletedAt;
  await assert.rejects(deleteCandidate(candidateId, ownerId, 'candidate'), { statusCode: 404 });
  assert.equal(update.mock.callCount(), 1);
  assert.equal(state.candidate.deletedAt, deletedAt);
});

test('rejects another owner with 403 and does not mutate candidate', async (context) => {
  const { state, update } = isolateDeletion(context);
  await assert.rejects(deleteCandidate(candidateId, otherId, 'candidate'), { statusCode: 403 });
  assert.equal(state.candidate.status, CANDIDATE_STATUS.ACTIVE);
  assert.equal(state.candidate.deletedAt, null);
  assert.equal(update.mock.callCount(), 0);
});

test('returns 404 for missing candidate and performs no write', async (context) => {
  const { state, update } = isolateDeletion(context);
  state.candidate = null;
  await assert.rejects(deleteCandidate(candidateId, ownerId, 'candidate'), { statusCode: 404 });
  assert.equal(update.mock.callCount(), 0);
});

test('returns 404 for an already inactive candidate without changing its audit date', async (context) => {
  const { state, update } = isolateDeletion(context, CANDIDATE_STATUS.INACTIVE);
  state.candidate.deletedAt = new Date('2026-09-15T12:00:00.000Z');
  await assert.rejects(deleteCandidate(candidateId, ownerId, 'candidate'), { statusCode: 404 });
  assert.equal(state.candidate.deletedAt.toISOString(), '2026-09-15T12:00:00.000Z');
  assert.equal(update.mock.callCount(), 0);
});

test('blocked candidate cannot be deleted or reactivated', async (context) => {
  const { state, update } = isolateDeletion(context, CANDIDATE_STATUS.BLOCKED);
  await assert.rejects(deleteCandidate(candidateId, ownerId, 'candidate'), { statusCode: 409 });
  assert.equal(state.candidate.status, CANDIDATE_STATUS.BLOCKED);
  assert.equal(state.candidate.deletedAt, null);
  assert.equal(update.mock.callCount(), 0);
});

for (const role of ['company', 'admin']) {
  test(`rejects ${role} role before reading or writing candidate data`, async (context) => {
    const { find, update } = isolateDeletion(context);
    await assert.rejects(deleteCandidate(candidateId, ownerId, role), { statusCode: 403 });
    assert.equal(find.mock.callCount(), 0);
    assert.equal(update.mock.callCount(), 0);
  });
}

test('concurrent deletion returns 404 instead of acknowledging an unapplied write', async (context) => {
  const { state, update } = isolateDeletion(context);
  update.mock.mockImplementation(async () => null);
  await assert.rejects(deleteCandidate(candidateId, ownerId, 'candidate'), { statusCode: 404 });
  assert.equal(state.candidate.status, CANDIDATE_STATUS.ACTIVE);
  assert.equal(state.candidate.deletedAt, null);
});
