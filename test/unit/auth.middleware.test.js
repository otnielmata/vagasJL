require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../../src/models/user.model');
const { authenticate, authenticateDeletion, authorize } = require('../../src/middleware/auth.middleware');

const userId = '6512f1e2b3a1c2d3e4f5a6b7';

test('valid JWT provides current active account identity for editing', async (context) => {
  context.mock.method(mongoose, 'connect', async () => mongoose);
  context.mock.method(User, 'findById', () => ({ select: async () => ({ status: 'active', role: 'candidate' }) }));
  const token = jwt.sign({ sub: userId, role: 'candidate' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const request = { headers: { authorization: `Bearer ${token}` } };
  let continued = false;
  await authenticate(request, {}, () => { continued = true; });
  assert.equal(continued, true);
  assert.deepEqual(request.user, { id: userId, role: 'candidate' });
});

for (const [label, authorization] of [
  ['missing token', undefined],
  ['invalid token', 'Bearer invalid'],
  ['expired token', `Bearer ${jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: -1 })}`],
  ['forged token', `Bearer ${jwt.sign({ sub: userId }, 'wrong-secret')}`],
  ['invalid subject', `Bearer ${jwt.sign({ sub: 'not-an-id' }, process.env.JWT_SECRET)}`],
]) {
  test(`blocks editing with ${label}`, () => {
    const response = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    authenticate({ headers: { authorization } }, response, () => assert.fail('unauthenticated request must not continue'));
    assert.equal(response.statusCode, 401);
  });
}

function responseMock() {
  return {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

for (const status of [null, 'inactive', 'unknown']) {
  test(`rejects a previously issued token for account status ${status}`, async (context) => {
    context.mock.method(mongoose, 'connect', async () => mongoose);
    const find = context.mock.method(User, 'findById', () => ({
      select: async () => status === null ? null : { status, role: 'candidate' },
    }));
    const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET);
    const response = responseMock();
    await authenticate({ headers: { authorization: `Bearer ${token}` } }, response,
      () => assert.fail('revoked token must not authorize any operation'));
    assert.equal(response.statusCode, 401);
    assert.deepEqual(find.mock.calls[0].arguments, [userId]);
  });
}

test('authorizes roles from current account, not stale token claims', async (context) => {
  context.mock.method(mongoose, 'connect', async () => mongoose);
  context.mock.method(User, 'findById', () => ({ select: async () => ({ status: 'active', role: 'candidate' }) }));
  const token = jwt.sign({ sub: userId.toUpperCase(), role: 'admin' }, process.env.JWT_SECRET);
  const request = { headers: { authorization: `Bearer ${token}` } };
  await authenticate(request, {}, () => {});
  assert.deepEqual(request.user, { id: userId, role: 'candidate' });
  const response = responseMock();
  authorize('admin')(request, response, () => assert.fail('must not grant stale admin role'));
  assert.equal(response.statusCode, 403);
});

test('rejects a valid signed token after its account token version is revoked', async (context) => {
  context.mock.method(mongoose, 'connect', async () => mongoose);
  context.mock.method(User, 'findById', () => ({
    select: async () => ({ status: 'active', role: 'candidate', tokenVersion: 2 }),
  }));
  const token = jwt.sign({ sub: userId, role: 'candidate', version: 1 }, process.env.JWT_SECRET);
  const response = responseMock();
  await authenticate({ headers: { authorization: `Bearer ${token}` } }, response,
    () => assert.fail('revoked token must not continue'));
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.message, 'Token invalido ou sessao revogada');
});

for (const [target, statusCode] of [[userId.toUpperCase(), 404], ['6512f1e2b3a1c2d3e4f5a6b8', 401]]) {
  test(`deleted actor receives ${statusCode} deleting target ${target}`, async (context) => {
    context.mock.method(mongoose, 'connect', async () => mongoose);
    context.mock.method(User, 'findById', () => ({ select: async () => null }));
    const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET);
    const response = responseMock();
    await authenticateDeletion({ headers: { authorization: `Bearer ${token}` }, params: { id: target } }, response,
      () => assert.fail('missing account must not reach deletion service'));
    assert.equal(response.statusCode, statusCode);
  });
}

test('active account can reach deletion service', async (context) => {
  context.mock.method(mongoose, 'connect', async () => mongoose);
  context.mock.method(User, 'findById', () => ({ select: async () => ({ status: 'active', role: 'candidate' }) }));
  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET);
  let continued = false;
  await authenticateDeletion({ headers: { authorization: `Bearer ${token}` }, params: { id: userId } }, {},
    () => { continued = true; });
  assert.equal(continued, true);
});

for (const authorization of [undefined, 'Bearer invalid', `Bearer ${jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: -1 })}`]) {
  test(`deletion rejects invalid authentication ${authorization?.slice(0, 14)}`, async (context) => {
    const find = context.mock.method(User, 'findById', () => assert.fail('must verify signature first'));
    const response = responseMock();
    await authenticateDeletion({ headers: { authorization }, params: { id: userId } }, response,
      () => assert.fail('must not delete'));
    assert.equal(response.statusCode, 401);
    assert.equal(find.mock.callCount(), 0);
  });
}

for (const stage of ['connection', 'lookup']) {
  test(`forwards ${stage} failures without accepting token`, async (context) => {
    const failure = new Error('database failure');
    context.mock.method(mongoose, 'connect', async () => {
      if (stage === 'connection') throw failure;
      return mongoose;
    });
    context.mock.method(User, 'findById', () => ({ select: async () => { throw failure; } }));
    const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET);
    let forwarded;
    await authenticate({ headers: { authorization: `Bearer ${token}` } }, {}, (error) => { forwarded = error; });
    assert.equal(forwarded, failure);
  });
}
