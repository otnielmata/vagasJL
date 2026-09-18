require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const routes = require('../../src/routes/candidate.routes');
const controller = require('../../src/controllers/candidate.controller');
const service = require('../../src/services/vacancy-ranking.service');

test('ranking route runs authentication and candidate authorization before controller', () => {
  const layer = routes.stack.find((entry) => entry.route?.path === '/me/vagas/ranking');
  assert.ok(layer);
  assert.deepEqual(layer.route.methods, { get: true });
  assert.equal(layer.route.stack.length, 4);
  assert.equal(layer.route.stack[3].handle, controller.rankVacancies);
});

test('ranking controller returns service result and forwards errors', async (context) => {
  const ranking = { items: [], total: 0, page: 1, limit: 20, pages: 0 };
  const call = context.mock.method(service, 'rankVacancies', async () => ranking);
  const req = { user: { id: 'actor', role: 'candidate' }, query: { page: '1' } };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  let forwarded;
  await controller.rankVacancies(req, res, (error) => { forwarded = error; });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, ranking);
  assert.deepEqual(call.mock.calls[0].arguments, [req.user, req.query]);
  call.mock.mockImplementation(async () => { throw new Error('db'); });
  await controller.rankVacancies(req, res, (error) => { forwarded = error; });
  assert.equal(forwarded.message, 'db');
});
