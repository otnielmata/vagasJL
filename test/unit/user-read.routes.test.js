require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const router = require('../../src/routes/registration.routes');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');
const userController = require('../../src/controllers/user.controller');

test('public user lookup is wired with authentication before validation and database access', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/:id' && layer.route.methods.get).route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.ok(handlers.indexOf(ensureDatabase) > 1);
  assert.equal(handlers.at(-1), userController.show);
});
