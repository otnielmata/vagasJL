require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const app = require('../../src/app');
const router = require('../../src/routes/company.routes');
const controller = require('../../src/controllers/vacancy.controller');
const service = require('../../src/services/vacancy.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('POST company vacancy is mounted and requires active company JWT', () => {
  assert.ok(app._router.stack.some((layer) => layer.regexp.test('/empresas')));
  const route = router.stack.find((layer) => layer.route?.path === '/:id/vagas').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.registerCompany);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('missing JWT must stop'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'candidate' } }, response, () => assert.fail('candidate must stop'));
  assert.equal(response.code, 403);
});

test('controller returns 201 with safe vacancy and forwards errors', async (context) => {
  const register = context.mock.method(service, 'registerCompanyVacancy', async () => ({
    toJSON: () => ({ _id: 'vacancy-id', origin: 'COMPANY', status: 'pending' }),
  }));
  const request = { user: { id: 'user', role: 'company' }, params: { id: 'company' }, body: {} };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.registerCompany(request, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 201);
  assert.deepEqual(response.body, { vacancy: { _id: 'vacancy-id', origin: 'COMPANY', status: 'pending' } });
  assert.deepEqual(register.mock.calls[0].arguments, [request.user, request.params.id, request.body]);
  const failure = new Error('failure');
  register.mock.mockImplementation(async () => { throw failure; });
  let forwarded;
  await controller.registerCompany(request, {}, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
