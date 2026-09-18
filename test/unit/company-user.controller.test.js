require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const router = require('../../src/routes/company.routes');
const controller = require('../../src/controllers/company.controller');
const service = require('../../src/services/company-user.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('company user route requires JWT and admin role', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/:id/usuarios').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.addUser);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('must require JWT'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'company' } }, response, () => assert.fail('must require admin'));
  assert.equal(response.code, 403);
});

test('controller returns public membership and user data, forwarding failures', async (context) => {
  const link = context.mock.method(service, 'linkRecruiter', async () => ({
    membership: { toJSON: () => ({ _id: 'membership', status: 'active' }) },
    user: { _id: 'user', name: 'Ana', email: 'ana@example.com' },
  }));
  const request = { user: { id: 'admin', role: 'admin' }, params: { id: 'company' }, body: { userId: 'user' } };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.addUser(request, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 201);
  assert.deepEqual(response.body, {
    membership: { _id: 'membership', status: 'active' },
    user: { _id: 'user', name: 'Ana', email: 'ana@example.com' },
  });
  assert.deepEqual(link.mock.calls[0].arguments, [request.user, request.params.id, request.body]);
  const failure = new Error('failure');
  link.mock.mockImplementation(async () => { throw failure; });
  let forwarded;
  await controller.addUser(request, {}, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
