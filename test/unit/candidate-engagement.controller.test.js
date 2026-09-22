require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const routes = require('../../src/routes/candidate.routes');
const controller = require('../../src/controllers/candidate-engagement.controller');
const service = require('../../src/services/candidate-engagement.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('engagement exposes one read-only route protected for candidates', () => {
  const layer = routes.stack.find((entry) => entry.route?.path === '/me/engajamento');
  assert.ok(layer);
  assert.deepEqual(layer.route.methods, { get: true });
  const handlers = layer.route.stack.map((entry) => entry.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.show);
  assert.equal(routes.stack.some((entry) => entry.route?.path === '/me/engajamento' &&
    (entry.route.methods.post || entry.route.methods.patch || entry.route.methods.delete)), false);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('missing JWT'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'company' } }, response, () => assert.fail('non-candidate'));
  assert.equal(response.code, 403);
});

test('controller returns official state and forwards errors', async (context) => {
  const engagement = { status: 'unavailable', readOnly: true, data: null };
  const call = context.mock.method(service, 'getOwnEngagement', async () => engagement);
  const req = { user: { id: 'actor', role: 'candidate' }, query: {} };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.show(req, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { engagement });
  assert.deepEqual(call.mock.calls[0].arguments, [req.user, req.query]);
  call.mock.mockImplementation(async () => { throw new Error('db'); });
  await controller.show(req, response, (error) => assert.equal(error.message, 'db'));
});
