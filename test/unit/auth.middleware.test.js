require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../../src/middleware/auth.middleware');

const userId = '6512f1e2b3a1c2d3e4f5a6b7';

test('valid JWT provides authenticated identity for editing', () => {
  const token = jwt.sign({ sub: userId, role: 'candidate' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const request = { headers: { authorization: `Bearer ${token}` } };
  let continued = false;
  authenticate(request, {}, () => { continued = true; });
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
