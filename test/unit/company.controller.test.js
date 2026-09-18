require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const app = require('../../src/app');
const router = require('../../src/routes/company.routes');
const controller = require('../../src/controllers/company.controller');
const service = require('../../src/services/company.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('POST /empresas is mounted and restricted to authenticated admins', () => {
  assert.ok(app._router.stack.some((layer) => layer.regexp.test('/empresas')));
  const route = router.stack.find((layer) => layer.route?.path === '/').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.register);
  const unauthorized = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, unauthorized, () => assert.fail('missing JWT must stop'));
  assert.equal(unauthorized.code, 401);
  const forbidden = { status(code) { this.code = code; return this; }, json() {} };
  handlers[1]({ user: { role: 'company' } }, forbidden, () => assert.fail('company must stop'));
  assert.equal(forbidden.code, 403);
});

test('controller returns 201 with company identifier and forwards errors', async (context) => {
  const registration = context.mock.method(service, 'registerCompany', async () => ({
    toJSON: () => ({ _id: 'company-id', status: 'pending' }),
  }));
  const req = { user: { id: 'admin', role: 'admin' }, body: { legalName: 'Empresa' } };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.register(req, res, () => assert.fail('unexpected error'));
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { company: { _id: 'company-id', status: 'pending' } });
  assert.deepEqual(registration.mock.calls[0].arguments, [req.user, req.body]);
  const failure = new Error('failure');
  registration.mock.mockImplementation(async () => { throw failure; });
  let forwarded;
  await controller.register(req, {}, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
