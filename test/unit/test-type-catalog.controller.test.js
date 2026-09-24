require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const router = require('../../src/routes/match-profile-configuration.routes');
const controller = require('../../src/controllers/test-type-catalog.controller');
const service = require('../../src/services/test-type-catalog.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('route authenticates and authorizes admin before publishing catalog', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/catalogos/tipos-de-teste').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.publish);
  const unauthorized = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, unauthorized, () => assert.fail('missing JWT must stop'));
  assert.equal(unauthorized.code, 401);
  const forbidden = { status(code) { this.code = code; return this; }, json() {} };
  handlers[1]({ user: { role: 'candidate' } }, forbidden, () => assert.fail('non-admin must stop'));
  assert.equal(forbidden.code, 403);
});

test('controller returns 200 with published version and forwards errors', async (context) => {
  const publication = context.mock.method(service, 'publishTestTypeCatalog', async () => ({
    toJSON: () => ({ version: 1, types: [] }),
  }));
  const req = { user: { id: 'admin', role: 'admin' }, body: { types: [] } };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.publish(req, res, () => assert.fail('unexpected error'));
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { catalog: { version: 1, types: [] } });
  assert.deepEqual(publication.mock.calls[0].arguments, [req.user, req.body]);
  const failure = new Error('conflict');
  publication.mock.mockImplementation(async () => { throw failure; });
  let forwarded;
  await controller.publish(req, {}, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
