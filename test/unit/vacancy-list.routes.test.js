require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const app = require('../../src/app');
const router = require('../../src/routes/vacancy.routes');
const controller = require('../../src/controllers/vacancy.controller');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('GET /vagas is mounted for candidates and administrators with database protection', () => {
  assert.ok(app._router.stack.some((layer) => layer.regexp.test('/vagas')));
  const route = router.stack.find((layer) => layer.route?.path === '/' &&
    layer.route.methods.get).route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.list);

  const response = { status(code) { this.code = code; return this; }, json() {} };
  for (const role of ['company', 'master']) {
    handlers[1]({ user: { role } }, response, () => assert.fail('must not continue'));
    assert.equal(response.code, 403);
  }
  for (const role of ['candidate', 'admin']) {
    let continued = false;
    handlers[1]({ user: { role } }, response, () => { continued = true; });
    assert.equal(continued, true);
  }
});
