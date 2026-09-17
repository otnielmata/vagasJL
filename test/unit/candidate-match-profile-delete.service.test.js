require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const MatchProfile = require('../../src/models/candidate-match-profile.model');
const { deleteMatchProfile } = require('../../src/services/candidate-match-profile.service');

const user = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'candidate' };
const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';

function isolate(context) {
  const candidate = Candidate.hydrate({
    _id: candidateId, user: user.id, name: 'Maria', email: 'maria@example.com', status: 'active',
  });
  const findCandidate = context.mock.method(Candidate, 'findOne', (filter) => {
    assert.deepEqual(filter, { user: user.id, deletedAt: null });
    return { select: async () => candidate };
  });
  const update = context.mock.method(MatchProfile, 'updateOne', async () => ({ matchedCount: 1, modifiedCount: 1 }));
  const saveCandidate = context.mock.method(Candidate, 'findOneAndUpdate', async () => assert.fail('candidate cannot change'));
  return { candidate, findCandidate, update, saveCandidate };
}

test('atomically marks only own current profile deleted without touching candidate or account', async (context) => {
  const { candidate, update, saveCandidate } = isolate(context);
  await deleteMatchProfile(user);
  assert.equal(update.mock.callCount(), 1);
  const [filter, operation] = update.mock.calls[0].arguments;
  assert.equal(filter.candidate.toString(), candidateId);
  assert.equal(filter.deletedAt, null);
  assert.deepEqual(Object.keys(operation), ['$set']);
  assert.deepEqual(Object.keys(operation.$set), ['deletedAt']);
  assert.ok(operation.$set.deletedAt instanceof Date);
  assert.equal(candidate.status, 'active');
  assert.equal(candidate.deletedAt, null);
  assert.equal(saveCandidate.mock.callCount(), 0);
});

test('repeated or absent profile returns 404 without another mutation', async (context) => {
  const { update } = isolate(context);
  update.mock.mockImplementation(async (filter) => {
    assert.equal(filter.deletedAt, null);
    return { matchedCount: 0, modifiedCount: 0 };
  });
  await assert.rejects(deleteMatchProfile(user), { statusCode: 404 });
  assert.equal(update.mock.callCount(), 1);
});

test('missing current candidate returns 404 without profile write', async (context) => {
  const { findCandidate, update } = isolate(context);
  findCandidate.mock.mockImplementation(() => ({ select: async () => null }));
  await assert.rejects(deleteMatchProfile(user), { statusCode: 404 });
  assert.equal(update.mock.callCount(), 0);
});

test('company cannot delete a candidate profile', async (context) => {
  const { findCandidate, update } = isolate(context);
  await assert.rejects(deleteMatchProfile({ id: user.id, role: 'company' }), { statusCode: 403 });
  assert.equal(findCandidate.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
});

test('read and registration filters exclude logically deleted profiles', () => {
  const indexes = MatchProfile.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.candidate === 1 && options.unique &&
    options.partialFilterExpression.deletedAt === null));
});
