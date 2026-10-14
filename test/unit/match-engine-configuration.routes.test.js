require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const app = require('../../src/app');
const router = require('../../src/routes/match-engine-configuration.routes');
const controller = require('../../src/controllers/match-engine-configuration.controller');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('GET and PUT /master/configuracoes/match are mounted and restricted to master', () => {
  assert.ok(app._router.stack.some((layer) => layer.regexp.test('/master/configuracoes')));
  const readRoute = router.stack.find((layer) => layer.route?.path === '/match').route;
  const route = router.stack.find((layer) => layer.route?.path === '/match/:version').route;
  assert.equal(readRoute.stack[0].handle, authenticate);
  assert.equal(readRoute.stack[2].handle, ensureDatabase);
  assert.equal(readRoute.stack[3].handle, controller.show);
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.publish);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  for (const role of ['candidate', 'company', 'admin']) {
    handlers[1]({ user: { role } }, response, () => assert.fail('must not continue'));
    assert.equal(response.code, 403);
  }
});
