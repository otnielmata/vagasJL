require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const app = require('../../src/app');
const router = require('../../src/routes/admin-candidate.routes');
const controller = require('../../src/controllers/candidate-status.controller');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('PATCH /admin/candidatos/:id/status is mounted and restricted to admins', () => {
  assert.ok(app._router.stack.some((layer) => layer.regexp.test('/admin/candidatos')));
  const route = router.stack.find((layer) => layer.route?.path === '/:id/status').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.updateStatus);

  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('missing JWT must stop'));
  assert.equal(response.code, 401);
  for (const role of ['candidate', 'company']) {
    handlers[1]({ user: { role } }, response, () => assert.fail(`${role} must stop`));
    assert.equal(response.code, 403);
  }
  let passed = false;
  handlers[1]({ user: { role: 'admin' } }, response, () => { passed = true; });
  assert.equal(passed, true);
});
