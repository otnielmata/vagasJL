require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const controller = require('../../src/controllers/match-profile-configuration.controller');
const service = require('../../src/services/match-profile-configuration.service');
const router = require('../../src/routes/match-profile-configuration.routes');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('route authenticates and authorizes admin before publishing', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/configuracao').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.publish);

  const unauthorized = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, unauthorized, () => assert.fail('must stop without JWT'));
  assert.equal(unauthorized.code, 401);
  const forbidden = { status(code) { this.code = code; return this; }, json() {} };
  handlers[1]({ user: { role: 'candidate' } }, forbidden, () => assert.fail('must stop non-admin'));
  assert.equal(forbidden.code, 403);
});

test('controller responds 200 with published version', async (context) => {
  const publish = context.mock.method(service, 'publishConfiguration', async () => ({
    toJSON: () => ({ version: 1, fields: [] }),
  }));
  const req = { user: { id: 'owner', role: 'admin' }, body: { fields: {} } };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.publish(req, res, () => assert.fail('unexpected error'));
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { configuration: { version: 1, fields: [] } });
  assert.deepEqual(publish.mock.calls[0].arguments, [req.user, req.body]);
});
