require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const routes = require('../../src/routes/candidate.routes');
const controller = require('../../src/controllers/candidate.controller');
const service = require('../../src/services/candidate-match-detail.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('match detail route authenticates and authorizes only candidates', () => {
  const layer = routes.stack.find((entry) => entry.route?.path === '/me/vagas/:id/match');
  assert.ok(layer);
  const handlers = layer.route.stack.map((entry) => entry.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.showMatchDetail);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('unauthenticated'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'company' } }, response, () => assert.fail('forbidden'));
  assert.equal(response.code, 403);
});

test('match detail controller returns service result and forwards errors', async (context) => {
  const detail = { calculationStatus: 'not_calculable', percentage: null };
  const call = context.mock.method(service, 'getCandidateMatchDetail', async () => detail);
  const req = { user: { id: 'actor', role: 'candidate' }, params: { id: 'vacancy' } };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.showMatchDetail(req, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, detail);
  assert.deepEqual(call.mock.calls[0].arguments, [req.user, req.params.id]);
  call.mock.mockImplementation(async () => { throw new Error('db'); });
  await controller.showMatchDetail(req, response, (error) => assert.equal(error.message, 'db'));
});
