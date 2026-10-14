require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const app = require('../../src/app');
const router = require('../../src/routes/company.routes');
const controller = require('../../src/controllers/company.controller');
const service = require('../../src/services/company-read.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('GET cadastro by id is mounted and restricted to master', () => {
  assert.ok(app._router.stack.some((layer) => layer.regexp.test('/empresas')));
  const route = router.stack.find((layer) => layer.route?.path === '/:id/cadastro' && layer.route.methods.get).route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.showRegistration);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('missing JWT must stop'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'candidate' } }, response, () => assert.fail('candidate must stop'));
  assert.equal(response.code, 403);
  for (const role of ['admin', 'company']) {
    let passed = false;
    handlers[1]({ user: { role } }, response, () => { passed = true; });
    assert.equal(passed, false);
  }
  let masterPassed = false;
  handlers[1]({ user: { role: 'master' } }, response, () => { masterPassed = true; });
  assert.equal(masterPassed, true);
});

test('GET /empresas/me/cadastro resolves the authenticated recruiter membership', async (context) => {
  const route = router.stack.find((layer) => layer.route?.path === '/me/cadastro').route;
  const handlers = route.stack.map((layer) => layer.handle);
  let companyPassed = false;
  handlers[1]({ user: { role: 'company' } }, {}, () => { companyPassed = true; });
  assert.equal(companyPassed, true);
  let adminPassed = false;
  handlers[1]({ user: { role: 'admin' } }, {}, () => { adminPassed = true; });
  assert.equal(adminPassed, true);
  let masterPassed = false;
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[1]({ user: { role: 'master' } }, response, () => { masterPassed = true; });
  assert.equal(masterPassed, false);
  const read = context.mock.method(service, 'getMyRegistration', async () => ({
    company: { _id: 'company' }, usuarios: [],
  }));
  const request = { user: { id: 'user', role: 'company' } };
  const controllerResponse = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.showMyRegistration(request, controllerResponse, assert.fail);
  assert.equal(controllerResponse.code, 200);
  assert.deepEqual(read.mock.calls[0].arguments, [request.user]);
});

test('controller returns 200 with public company and user list, forwarding errors', async (context) => {
  const read = context.mock.method(service, 'getRegistration', async () => ({
    company: { _id: 'company', status: 'pending' }, usuarios: [{ _id: 'user', name: 'Ana' }],
  }));
  const request = { user: { id: 'user', role: 'company' }, params: { id: 'company' } };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.showRegistration(request, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body.usuarios, [{ _id: 'user', name: 'Ana' }]);
  assert.deepEqual(read.mock.calls[0].arguments, [request.user, request.params.id]);
  const failure = new Error('failure');
  read.mock.mockImplementation(async () => { throw failure; });
  let forwarded;
  await controller.showRegistration(request, {}, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
