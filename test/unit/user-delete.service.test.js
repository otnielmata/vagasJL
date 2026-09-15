require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const userService = require('../../src/services/user.service');
const authService = require('../../src/services/auth.service');

const userId = '6512f1e2b3a1c2d3e4f5a6b7';
const otherId = '6512f1e2b3a1c2d3e4f5a6b8';

function isolateDeletion(context) {
  const user = User.hydrate({ _id: userId, name: 'Maria', email: 'maria@example.com', status: 'active' });
  const session = { testSession: true };
  const state = { user, candidates: [{ user: user._id, email: user.email, status: 'active' }], committed: false };
  const transaction = context.mock.method(User.db, 'transaction', async (callback) => {
    const originalUser = state.user;
    const originalCandidates = state.candidates;
    try {
      await callback(session);
      state.committed = true;
    } catch (error) {
      state.user = originalUser;
      state.candidates = originalCandidates;
      throw error;
    }
  });
  const find = context.mock.method(User, 'findById', () => ({
    session: async (received) => {
      assert.equal(received, session);
      return state.user;
    },
  }));
  const candidates = { deleteMany: async (filter, options) => {
    assert.deepEqual(filter, { user: user._id });
    assert.deepEqual(options, { session });
    state.candidates = state.candidates.filter((candidate) => candidate.user.toString() !== filter.user.toString());
    return { deletedCount: 1 };
  } };
  const cleanup = context.mock.method(candidates, 'deleteMany');
  const collection = context.mock.method(User.db, 'collection', (name) => {
    assert.equal(name, 'candidates');
    return candidates;
  });
  const remove = context.mock.method(User, 'deleteOne', async (filter, options) => {
    assert.deepEqual(filter, { _id: user._id, status: 'active' });
    assert.deepEqual(options, { session });
    state.user = null;
    return { deletedCount: 1 };
  });
  return { user, state, transaction, find, cleanup, collection, remove };
}

test('deletes own account and only its candidates within the same transaction', async (context) => {
  const { user, state, transaction, find, remove } = isolateDeletion(context);
  state.candidates.push({ user: otherId, status: 'active' });
  await userService.deleteUser(userId, userId.toUpperCase());
  assert.equal(state.user, null);
  assert.deepEqual(state.candidates, [{ user: otherId, status: 'active' }]);
  assert.equal(state.committed, true);
  assert.deepEqual(find.mock.calls[0].arguments, [user.id]);
  assert.equal(remove.mock.callCount(), 1);
  assert.deepEqual(transaction.mock.calls[0].arguments[1], {
    readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
  });
});

test('deletes an account without a candidate profile', async (context) => {
  const { state } = isolateDeletion(context);
  state.candidates = [];
  await userService.deleteUser(userId, userId);
  assert.equal(state.user, null);
  assert.equal(state.committed, true);
});

for (const scenario of ['missing', 'other', 'inactive']) {
  test(`rejects ${scenario} user without removing any data`, async (context) => {
    const { state, cleanup, remove } = isolateDeletion(context);
    if (scenario === 'missing') state.user = null;
    if (scenario === 'inactive') state.user.status = 'inactive';
    await assert.rejects(userService.deleteUser(userId, scenario === 'other' ? otherId : userId), {
      statusCode: { missing: 404, other: 403, inactive: 401 }[scenario],
    });
    assert.equal(cleanup.mock.callCount(), 0);
    assert.equal(remove.mock.callCount(), 0);
    assert.equal(state.committed, false);
  });
}

test('second deletion returns 404 without another mutation', async (context) => {
  const { cleanup, remove } = isolateDeletion(context);
  await userService.deleteUser(userId, userId);
  await assert.rejects(userService.deleteUser(userId, userId), { statusCode: 404 });
  assert.equal(cleanup.mock.callCount(), 1);
  assert.equal(remove.mock.callCount(), 1);
});

for (const stage of ['cleanup', 'user', 'commit']) {
  test(`propagates ${stage} failure rather than acknowledging partial deletion`, async (context) => {
    const { state, cleanup, remove, transaction } = isolateDeletion(context);
    const failure = new Error('storage unavailable');
    if (stage === 'cleanup') cleanup.mock.mockImplementation(async () => { throw failure; });
    if (stage === 'user') remove.mock.mockImplementation(async () => { throw failure; });
    if (stage === 'commit') transaction.mock.mockImplementation(async () => { throw failure; });
    await assert.rejects(userService.deleteUser(userId, userId), (error) => error === failure);
    assert.equal(state.committed, false);
    assert.equal(state.candidates.length, 1);
    assert.ok(state.user);
    if (stage === 'cleanup') assert.equal(remove.mock.callCount(), 0);
  });
}

test('zero deleted users aborts the transaction instead of returning success', async (context) => {
  const { state, remove } = isolateDeletion(context);
  remove.mock.mockImplementation(async () => ({ deletedCount: 0 }));
  await assert.rejects(userService.deleteUser(userId, userId), { statusCode: 404 });
  assert.equal(state.committed, false);
  assert.equal(state.candidates.length, 1);
});

test('unsupported standalone transaction returns actionable 503 without fallback writes', async (context) => {
  const { transaction, cleanup, remove } = isolateDeletion(context);
  transaction.mock.mockImplementation(async () => { throw Object.assign(new Error('unsupported'), { code: 20 }); });
  await assert.rejects(userService.deleteUser(userId, userId), { statusCode: 503 });
  assert.equal(cleanup.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
});

test('deleted account credentials are rejected and its email can be registered again', async (context) => {
  const { user, state } = isolateDeletion(context);
  await userService.deleteUser(userId, userId);
  context.mock.method(User, 'findOne', () => ({
    select: async () => state.user,
    then: (resolve) => Promise.resolve(state.user).then(resolve),
  }));
  await assert.rejects(authService.login({ email: user.email, password: 'previousPassword' }), { statusCode: 401 });
  context.mock.method(User, 'init', async () => User);
  context.mock.method(User, 'create', async (data) => new User(data));
  const replacement = await userService.createUser({ name: 'Maria', email: user.email, password: 'newPassword123' });
  assert.equal(replacement.email, user.email);
  assert.notEqual(replacement.id, user.id);
  assert.equal(replacement.status, 'active');
});
