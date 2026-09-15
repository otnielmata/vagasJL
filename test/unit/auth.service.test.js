require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../../src/config/env');
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

for (const [expiresIn, seconds] of [['1h', 3600], ['15m', 900]]) {
  test(`active user login validates bcrypt and issues JWT expiring in ${expiresIn}`, async (context) => {
    const password = ' senhaForte123 ';
    const user = new User({ name: 'Maria', email: 'maria@example.com', password: await bcrypt.hash(password, 4), status: 'active' });
    const originalExpiry = config.jwt.expiresIn;
    config.jwt.expiresIn = expiresIn;
    context.after(() => { config.jwt.expiresIn = originalExpiry; });
    let selection;
    const find = context.mock.method(User, 'findOne', () => ({
      select(fields) { selection = fields; return Promise.resolve(user); },
    }));
    const result = await authService.login({ email: ' MARIA@Example.COM ', password });
    assert.deepEqual(find.mock.calls[0].arguments, [{ email: 'maria@example.com' }]);
    assert.equal(selection, '+password');
    assert.equal(result.user, user);
    const decoded = jwt.verify(result.token, config.jwt.secret, { algorithms: ['HS256'] });
    assert.equal(decoded.sub, user.id);
    assert.equal(decoded.role, user.role);
    assert.equal(decoded.exp - decoded.iat, seconds);
    assert.equal(decoded.password, undefined);
    assert.equal(decoded.email, undefined);
    assert.throws(() => jwt.verify(result.token, config.jwt.secret, { clockTimestamp: decoded.exp }), { name: 'TokenExpiredError' });
    assert.throws(() => jwt.verify(result.token, 'incorrect-secret'), { name: 'JsonWebTokenError' });
  });
}

for (const reason of ['unknown email', 'incorrect password', 'inactive user', 'invalid status']) {
  test(`rejects ${reason} with the same generic 401 and no token`, async (context) => {
    const user = reason === 'unknown email' ? null : new User({
      name: 'Maria', email: 'maria@example.com', password: await bcrypt.hash('correct-password', 4),
      status: reason === 'inactive user' ? 'inactive' : reason === 'invalid status' ? null : 'active',
    });
    context.mock.method(User, 'findOne', () => ({ select: async () => user }));
    const sign = context.mock.method(jwt, 'sign', () => assert.fail('rejected login must not issue token'));
    await assert.rejects(authService.login({
      email: 'maria@example.com', password: reason === 'incorrect password' ? 'wrong-password' : 'correct-password',
    }), { statusCode: 401, message: 'Credenciais invalidas' });
    assert.equal(sign.mock.callCount(), 0);
  });
}

test('propagates database errors instead of disguising them as invalid credentials', async (context) => {
  const failure = new Error('storage unavailable');
  context.mock.method(User, 'findOne', () => ({ select: async () => { throw failure; } }));
  const sign = context.mock.method(jwt, 'sign', () => assert.fail('must not issue token'));
  await assert.rejects(authService.login({ email: 'maria@example.com', password: 'correct-password' }), (error) => error === failure);
  assert.equal(sign.mock.callCount(), 0);
});
