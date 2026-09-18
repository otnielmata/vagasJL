require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const router = require('../../src/routes/company.routes');
const controller = require('../../src/controllers/company.controller');
const service = require('../../src/services/company-delete.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('DELETE cadastro route requires JWT and admin/company role', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/:id/cadastro' && layer.route.methods.delete).route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.removeRegistration);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('missing JWT must stop'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'candidate' } }, response, () => assert.fail('candidate must stop'));
  assert.equal(response.code, 403);
});

test('controller returns 204 without body and forwards errors', async (context) => {
  const remove = context.mock.method(service, 'deleteRegistration', async () => undefined);
  const request = { user: { id: 'admin', role: 'admin' }, params: { id: 'company' } };
  const response = { status(code) { this.code = code; return this; }, end() { this.ended = true; return this; } };
  await controller.removeRegistration(request, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 204);
  assert.equal(response.ended, true);
  assert.deepEqual(remove.mock.calls[0].arguments, [request.user, request.params.id]);
  const failure = new Error('failure');
  remove.mock.mockImplementation(async () => { throw failure; });
  let forwarded;
  await controller.removeRegistration(request, {}, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
