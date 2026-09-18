require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const router = require('../../src/routes/vacancy.routes');
const controller = require('../../src/controllers/vacancy.controller');
const service = require('../../src/services/candidate-ranking.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('ranking route authenticates and authorizes company or admin', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/:id/candidatos/ranking').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.rankCandidates);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('unauthenticated'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'candidate' } }, response, () => assert.fail('forbidden'));
  assert.equal(response.code, 403);
});

test('controller returns ranking and forwards failures', async (context) => {
  const ranking = { items: [], total: 0, page: 1, limit: 20, pages: 0 };
  const call = context.mock.method(service, 'rankCandidates', async () => ranking);
  const req = { user: { role: 'admin' }, params: { id: 'id' }, query: { page: '1' } };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.rankCandidates(req, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, ranking);
  assert.deepEqual(call.mock.calls[0].arguments, [req.user, req.params.id, req.query]);
  call.mock.mockImplementation(async () => { throw new Error('db'); });
  await controller.rankCandidates(req, response, (error) => assert.equal(error.message, 'db'));
});
