require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const router = require('../../src/routes/master-directory.routes');
const controller = require('../../src/controllers/master-directory.controller');
const service = require('../../src/services/master-directory.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

const master = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'master' };

test('master directory routes authenticate and reject recruiter profiles', () => {
  for (const [path, handler] of [['/empresas', controller.listCompanies],
    ['/recrutadores', controller.listRecruiters], ['/candidatos', controller.listCandidates]]) {
    const route = router.stack.find((layer) => layer.route?.path === path).route;
    const handlers = route.stack.map((layer) => layer.handle);
    assert.equal(handlers[0], authenticate);
    assert.equal(handlers[2], ensureDatabase);
    assert.equal(handlers[3], handler);
    const response = { status(code) { this.code = code; return this; }, json() {} };
    handlers[1]({ user: { role: 'admin' } }, response, () => assert.fail('admin must stop'));
    assert.equal(response.code, 403);
    let passed = false;
    handlers[1]({ user: { role: 'master' } }, response, () => { passed = true; });
    assert.equal(passed, true);
  }
});

test('master directory controller returns both paginated collections', async (context) => {
  context.mock.method(service, 'listCompanies', async () => ({ items: [{ _id: 'company' }], total: 1 }));
  context.mock.method(service, 'listRecruiters', async () => ({ items: [{ _id: 'user' }], total: 1 }));
  context.mock.method(service, 'listCandidates', async () => ({ items: [{ _id: 'candidate' }], total: 1 }));
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.listCompanies({ user: master, query: {} }, response, assert.fail);
  assert.equal(response.code, 200);
  assert.equal(response.body.items[0]._id, 'company');
  await controller.listRecruiters({ user: master, query: {} }, response, assert.fail);
  assert.equal(response.body.items[0]._id, 'user');
  await controller.listCandidates({ user: master, query: {} }, response, assert.fail);
  assert.equal(response.body.items[0]._id, 'candidate');
});
