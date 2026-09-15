require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/user.model');
const userService = require('../../src/services/user.service');
const authService = require('../../src/services/auth.service');

test('existing registration delegates to shared user creation and still issues JWT', async (context) => {
  const input = { name: 'Maria', email: 'maria@example.com', password: '12345678' };
  const user = new User(input);
  const create = context.mock.method(userService, 'createUser', async () => user);
  const result = await authService.register(input);
  assert.equal(result.user, user);
  assert.deepEqual(create.mock.calls[0].arguments, [{ ...input, role: 'candidate' }]);
  const decoded = jwt.verify(result.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  assert.equal(decoded.sub, user.id);
  assert.equal(decoded.exp - decoded.iat, 3600);
});

test('existing registration preserves conflicts from shared service', async (context) => {
  const failure = new authService.ApiError(409, 'Email duplicado');
  context.mock.method(userService, 'createUser', async () => { throw failure; });
  await assert.rejects(authService.register({}), (error) => error === failure);
});

test('existing registration still rejects administrator role with 422', async (context) => {
  const create = context.mock.method(userService, 'createUser', async () => assert.fail('must not create admin'));
  await assert.rejects(authService.register({ role: 'admin' }), { statusCode: 422 });
  assert.equal(create.mock.callCount(), 0);
});
