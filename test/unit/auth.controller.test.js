require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const authService = require('../../src/services/auth.service');
const authController = require('../../src/controllers/auth.controller');
const ApiError = require('../../src/errors/api.error');

test('login returns 200 with token and serialized user without password', async (context) => {
  const user = new User({ name: 'Maria', email: 'maria@example.com', password: 'private-hash' });
  const login = context.mock.method(authService, 'login', async () => ({ user, token: 'signed-token' }));
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await authController.login({ body: { email: user.email, password: 'senhaForte123', status: 'active', role: 'admin' } }, response, () => assert.fail('unexpected error'));
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.token, 'signed-token');
  assert.equal(response.body.user.email, user.email);
  assert.equal(response.body.user.status, 'active');
  assert.equal(response.body.user.password, undefined);
  assert.equal(response.body.user.__v, undefined);
  assert.equal(JSON.stringify(response.body).includes('private-hash'), false);
  assert.equal(JSON.stringify(response.body).includes('senhaForte123'), false);
  assert.deepEqual(login.mock.calls[0].arguments, [{ email: user.email, password: 'senhaForte123' }]);
});

test('login forwards rejected credentials without returning success or a token', async (context) => {
  const failure = new ApiError(401, 'Credenciais invalidas');
  context.mock.method(authService, 'login', async () => { throw failure; });
  let forwarded;
  await authController.login({ body: { email: 'maria@example.com', password: 'incorrect' } }, {
    status() { assert.fail('must not return a successful response'); },
  }, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});

test('login forwards unexpected service failures', async (context) => {
  const failure = new Error('storage unavailable');
  context.mock.method(authService, 'login', async () => { throw failure; });
  let forwarded;
  await authController.login({ body: {} }, {}, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
