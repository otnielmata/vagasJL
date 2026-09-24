require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Model = require('../../src/models/profile-completion-threshold-configuration.model');
const { publishProfileCompletionThreshold, getPublishedProfileCompletionThreshold,
  meetsProfileCompletionThreshold } =
  require('../../src/services/profile-completion-threshold-configuration.service');
const controller = require('../../src/controllers/profile-completion-threshold-configuration.controller');
const router = require('../../src/routes/profile-completion-threshold-configuration.routes');
const app = require('../../src/app');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

const admin = { id: '507f1f77bcf86cd799439011', role: 'admin' };

test('route requires JWT and active admin authorization before publishing', () => {
  assert.ok(app._router.stack.some((layer) => layer.handle === router));
  const route = router.stack.find((layer) => layer.route?.path === '/match/completude-minima').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.publish);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('missing JWT'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'candidate' } }, response, () => assert.fail('non-admin'));
  assert.equal(response.code, 403);
});

test('publication is versioned, attributed, effective and idempotent', async (context) => {
  let current = null;
  context.mock.method(Model, 'init', async () => Model);
  context.mock.method(Model, 'findOne', () => ({ sort: async () => current }));
  const create = context.mock.method(Model, 'create', async (data) => {
    current = new Model(data); return current;
  });
  const now = new Date('2026-09-23T15:00:00Z');
  const first = await publishProfileCompletionThreshold(admin, { minimumPercentage: 70 }, now);
  assert.equal(first.validateSync(), undefined);
  assert.equal(first.version, 1);
  assert.equal(first.minimumPercentage, 70);
  assert.equal(String(first.author), admin.id);
  assert.equal(first.effectiveAt.toISOString(), now.toISOString());
  assert.equal(await publishProfileCompletionThreshold(admin, { minimumPercentage: 70 }), first);
  assert.equal(create.mock.callCount(), 1);
  const second = await publishProfileCompletionThreshold(admin, { minimumPercentage: 75.25 });
  assert.equal(second.version, 2);
  const published = await getPublishedProfileCompletionThreshold();
  assert.deepEqual({ version: published.version, minimumPercentage: published.minimumPercentage },
    { version: 2, minimumPercentage: 75.25 });
});

test('invalid values and actors preserve the current configuration', async (context) => {
  const current = { version: 1, minimumPercentage: 70 };
  const init = context.mock.method(Model, 'init', async () => Model);
  context.mock.method(Model, 'findOne', () => ({ sort: async () => current }));
  await assert.rejects(publishProfileCompletionThreshold({ role: 'company' },
    { minimumPercentage: 70 }), { statusCode: 403 });
  for (const input of [{}, { minimumPercentage: -0.01 }, { minimumPercentage: 100.01 },
    { minimumPercentage: '70' }, { minimumPercentage: 70.001 },
    { minimumPercentage: 70, extra: true }, 70, null]) {
    await assert.rejects(publishProfileCompletionThreshold(admin, input), { statusCode: 400 });
  }
  assert.equal(init.mock.callCount(), 0);
  assert.equal(current.minimumPercentage, 70);
});

test('missing publication applies no arbitrary block and inclusive minimum is respected', async (context) => {
  let current = null;
  context.mock.method(Model, 'findOne', () => ({ sort: async () => current }));
  assert.equal(await getPublishedProfileCompletionThreshold(), null);
  assert.equal(meetsProfileCompletionThreshold({ percentage: 50 }, null), true);
  const threshold = { version: 1, minimumPercentage: 70 };
  assert.equal(meetsProfileCompletionThreshold({ percentage: 69.99 }, threshold), false);
  assert.equal(meetsProfileCompletionThreshold({ percentage: 70 }, threshold), true);
  current = { version: 1, minimumPercentage: 101, effectiveAt: new Date() };
  await assert.rejects(getPublishedProfileCompletionThreshold(), { statusCode: 503 });
});

test('concurrent publication never overwrites a different version', async (context) => {
  const current = { version: 1, minimumPercentage: 70 };
  context.mock.method(Model, 'init', async () => Model);
  context.mock.method(Model, 'findOne', () => ({ sort: async () => current }));
  context.mock.method(Model, 'create', async () => {
    const error = new Error('duplicate'); error.code = 11000; throw error;
  });
  await assert.rejects(publishProfileCompletionThreshold(admin, { minimumPercentage: 80 }),
    { statusCode: 409 });
  assert.equal(current.minimumPercentage, 70);
});

test('controller returns the published configuration', async (context) => {
  const document = { toJSON: () => ({ version: 1, minimumPercentage: 70 }) };
  context.mock.method(Model, 'init', async () => Model);
  context.mock.method(Model, 'findOne', () => ({ sort: async () => null }));
  context.mock.method(Model, 'create', async () => document);
  const req = { user: admin, body: { minimumPercentage: 70 } };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.publish(req, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { configuration: document.toJSON() });
});
