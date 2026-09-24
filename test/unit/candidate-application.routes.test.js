require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const router = require('../../src/routes/candidate.routes');
const controller = require('../../src/controllers/candidate.controller');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');
const candidateApplicationRules = require('../../src/middleware/candidate-application.middleware');
const validate = require('../../src/middleware/validate.middleware');

async function check(id, body) {
  const request = { params: { id }, body };
  const response = { status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; } };
  let continued = false;
  for (const rule of candidateApplicationRules()) await rule.run(request);
  validate(request, response, () => { continued = true; }, 400);
  return { continued, response };
}

test('application input accepts no body or an empty object only', async () => {
  assert.equal((await check('6512f1e2b3a1c2d3e4f5a6b7', undefined)).continued, true);
  assert.equal((await check('6512f1e2b3a1c2d3e4f5a6b7', {})).continued, true);
  for (const [id, body] of [['invalid', undefined],
    ['6512f1e2b3a1c2d3e4f5a6b7', { email: 'private@example.com' }]]) {
    const result = await check(id, body);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
  }
});

test('application route authenticates, authorizes and validates before storage', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/me/vagas/:id/candidatura').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(route.methods.post, true);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[5], ensureDatabase);
  assert.equal(handlers[6], controller.referToApplication);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('unauthenticated'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'company' } }, response, () => assert.fail('forbidden'));
  assert.equal(response.code, 403);
});
