const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const userService = require('../../src/services/user.service');

const userId = '6512f1e2b3a1c2d3e4f5a6b7';
const otherId = '6512f1e2b3a1c2d3e4f5a6b8';

function isolateUser(context) {
  const user = User.hydrate({ _id: userId, name: 'Maria', email: 'maria@example.com', role: 'candidate', status: 'active' }, { password: 0 });
  context.mock.method(User, 'findById', async () => user);
  context.mock.method(User, 'findOne', async () => null);
  context.mock.method(User, 'init', async () => User);
  context.mock.method(user, 'save', async () => user);
  return user;
}

test('updates own name and preserves omitted fields and privileged fields', async (context) => {
  const user = isolateUser(context);
  const result = await userService.updateUser(userId, userId.toUpperCase(), {
    name: 'Maria Silva', _id: otherId, role: 'admin', status: 'inactive', createdAt: new Date(),
  });
  assert.equal(result, user);
  assert.equal(user.name, 'Maria Silva');
  assert.equal(user.email, 'maria@example.com');
  assert.equal(user.id, userId);
  assert.equal(user.role, 'candidate');
  assert.equal(user.status, 'active');
  assert.equal(user.createdAt, undefined);
  assert.equal(user.isModified('password'), false);
  assert.equal(user.save.mock.callCount(), 1);
});

test('returns 404 for missing target before comparing ownership', async (context) => {
  const user = isolateUser(context);
  User.findById.mock.mockImplementation(async () => null);
  await assert.rejects(userService.updateUser(otherId, userId, { name: 'Maria Silva' }), { statusCode: 404 });
  assert.equal(user.save.mock.callCount(), 0);
});

test('returns 403 for another existing user before modifying or saving anything', async (context) => {
  const user = isolateUser(context);
  await assert.rejects(userService.updateUser(userId, otherId, { name: 'Changed', email: 'other@example.com', password: 'newPassword123' }), { statusCode: 403 });
  assert.equal(user.name, 'Maria');
  assert.equal(user.email, 'maria@example.com');
  assert.equal(user.save.mock.callCount(), 0);
  assert.equal(User.findOne.mock.callCount(), 0);
});

test('updates to a normalized unique email excluding the current user from lookup', async (context) => {
  const user = isolateUser(context);
  user.emailVerifiedAt = new Date();
  await userService.updateUser(userId, userId, { email: ' NEW@Example.COM ' });
  assert.equal(user.email, 'new@example.com');
  assert.equal(user.emailVerifiedAt, null);
  assert.deepEqual(User.findOne.mock.calls[0].arguments, [{ email: 'new@example.com', _id: { $ne: user._id } }]);
  assert.equal(user.save.mock.callCount(), 1);
});

test('allows keeping the same email without reporting a conflict', async (context) => {
  const user = isolateUser(context);
  const verifiedAt = new Date();
  user.emailVerifiedAt = verifiedAt;
  await userService.updateUser(userId, userId, { email: ' MARIA@Example.COM ' });
  assert.equal(user.email, 'maria@example.com');
  assert.equal(user.emailVerifiedAt, verifiedAt);
  assert.equal(User.findOne.mock.callCount(), 0);
  assert.equal(user.save.mock.callCount(), 1);
});

test('email conflict returns 409 without saving any requested field', async (context) => {
  const user = isolateUser(context);
  User.findOne.mock.mockImplementation(async () => ({ _id: otherId }));
  await assert.rejects(userService.updateUser(userId, userId, { name: 'Changed', email: 'taken@example.com', password: 'newPassword123' }), { statusCode: 409 });
  assert.equal(user.name, 'Maria');
  assert.equal(user.email, 'maria@example.com');
  assert.equal(user.save.mock.callCount(), 0);
});

test('assigns changed password through document save so hashing hooks run', async (context) => {
  const user = isolateUser(context);
  await userService.updateUser(userId, userId, { password: 'newPassword123' });
  assert.equal(user.isModified('password'), true);
  assert.equal(user.save.mock.callCount(), 1);
});

for (const [failure, statusCode] of [
  [Object.assign(new Error('E11000 private details'), { code: 11000 }), 409],
  [Object.assign(new Error('invalid model'), { name: 'ValidationError' }), 400],
  [Object.assign(new Error('deleted during save'), { name: 'DocumentNotFoundError' }), 404],
]) {
  test(`maps persistence failure ${failure.name}/${failure.code || ''} to ${statusCode}`, async (context) => {
    const user = isolateUser(context);
    user.save.mock.mockImplementation(async () => { throw failure; });
    await assert.rejects(userService.updateUser(userId, userId, { name: 'Maria Silva' }), { statusCode });
  });
}

test('propagates unexpected storage errors', async (context) => {
  const user = isolateUser(context);
  const failure = new Error('storage unavailable');
  user.save.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(userService.updateUser(userId, userId, { name: 'Maria Silva' }), (error) => error === failure);
});
