require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const app = require('../../src/app');
const router = require('../../src/routes/match-engine-configuration.routes');
const controller = require('../../src/controllers/match-engine-configuration.controller');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('PUT /admin/configuracoes/match/:version is mounted and restricted to admins', () => {
  assert.ok(app._router.stack.some((layer) => layer.regexp.test('/admin/configuracoes')));
  const route = router.stack.find((layer) => layer.route?.path === '/match/:version').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.publish);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  for (const role of ['candidate', 'company']) {
    handlers[1]({ user: { role } }, response, () => assert.fail('must not continue'));
    assert.equal(response.code, 403);
  }
});
