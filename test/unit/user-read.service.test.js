const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const userService = require('../../src/services/user.service');

const userId = '6512f1e2b3a1c2d3e4f5a6b7';

function mockLookup(context, result) {
  let projection;
  const find = context.mock.method(User, 'findById', () => ({
    select(fields) {
      projection = fields;
      return { lean: async () => result };
    },
  }));
  return { find, getProjection: () => projection };
}

test('reads only public fields and explicitly excludes sensitive and future fields', async (context) => {
  const stored = {
    _id: userId, name: 'Maria Silva', email: 'private@example.com', password: 'private-hash',
    role: 'admin', status: 'active', token: 'private-token', refreshToken: 'private-refresh-token',
    resetPasswordToken: 'private-reset-token', __v: 4, createdAt: new Date(), futurePrivateField: 'private',
  };
  const lookup = mockLookup(context, stored);
  const result = await userService.getPublicUserById(userId);
  assert.deepEqual(lookup.find.mock.calls[0].arguments, [userId]);
  assert.equal(lookup.getProjection(), '_id name');
  assert.deepEqual(result, { _id: userId, name: 'Maria Silva' });
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.notEqual(result, stored);
});

test('returns 404 when target user does not exist', async (context) => {
  mockLookup(context, null);
  await assert.rejects(userService.getPublicUserById(userId), { statusCode: 404, message: 'Usuario nao encontrado' });
});

test('returns public data for an existing inactive user without disclosing status', async (context) => {
  mockLookup(context, { _id: userId, name: 'Maria Silva', status: 'inactive' });
  assert.deepEqual(await userService.getPublicUserById(userId), { _id: userId, name: 'Maria Silva' });
});

test('propagates storage failure without reporting a missing user', async (context) => {
  const failure = new Error('storage unavailable');
  context.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => { throw failure; } }) }));
  await assert.rejects(userService.getPublicUserById(userId), (error) => error === failure);
});
