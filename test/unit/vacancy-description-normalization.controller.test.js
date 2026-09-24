require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const routes = require('../../src/routes/vacancy.routes');
const controller = require('../../src/controllers/vacancy.controller');
const service = require('../../src/services/vacancy-description-normalization.service');

test('normalization route authenticates and authorizes before the controller', () => {
  const layer = routes.stack.find((entry) => entry.route?.path === '/:id/normalizacao');
  assert.ok(layer);
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack.length, 4);
  assert.equal(layer.route.stack[3].handle, controller.normalizeDescription);
});

test('normalization controller returns the review draft and forwards errors', async (context) => {
  const normalization = { revision: 1, status: 'draft', suggestions: [] };
  const call = context.mock.method(service, 'normalizeVacancyDescription', async () => normalization);
  const req = { user: { id: 'actor', role: 'admin' }, params: { id: 'vacancy' },
    body: { action: 'extract' } };
  const res = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  let forwarded;
  await controller.normalizeDescription(req, res, (error) => { forwarded = error; });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { normalization });
  assert.deepEqual(call.mock.calls[0].arguments, [req.user, req.params.id, req.body]);
  call.mock.mockImplementation(async () => { throw new Error('database'); });
  await controller.normalizeDescription(req, res, (error) => { forwarded = error; });
  assert.equal(forwarded.message, 'database');
});
