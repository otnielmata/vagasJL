require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const router = require('../../src/routes/company.routes');
const controller = require('../../src/controllers/company.controller');
const service = require('../../src/services/company-registration.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('company registration update route requires an active admin or company JWT', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/:id/cadastro').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.updateRegistration);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('must require JWT'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'candidate' } }, response, () => assert.fail('must reject candidate'));
  assert.equal(response.code, 403);
  for (const role of ['admin', 'company']) {
    let passed = false;
    handlers[1]({ user: { role } }, response, () => { passed = true; });
    assert.equal(passed, true);
  }
});

test('controller returns 200 and forwards errors', async (context) => {
  const update = context.mock.method(service, 'updateRegistration', async () => ({ company: { status: 'pending' } }));
  const request = { user: { id: 'admin', role: 'admin' }, params: { id: 'company' },
    body: { empresa: { city: 'Rio' } } };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.updateRegistration(request, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { company: { status: 'pending' } });
  assert.deepEqual(update.mock.calls[0].arguments, [request.user, request.params.id, request.body]);
  const failure = new Error('failure');
  update.mock.mockImplementation(async () => { throw failure; });
  let forwarded;
  await controller.updateRegistration(request, {}, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
