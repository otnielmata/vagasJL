require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Model = require('../../src/models/ranking-threshold-configuration.model');
const { publishRankingThreshold, getPublishedRankingThreshold, meetsRankingThreshold } =
  require('../../src/services/ranking-threshold-configuration.service');
const controller = require('../../src/controllers/ranking-threshold-configuration.controller');
const router = require('../../src/routes/ranking-threshold-configuration.routes');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

const admin = { id: '507f1f77bcf86cd799439011', role: 'admin' };

test('route requires JWT and active admin authorization before publishing', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/match/limiar-ranking').route;
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
  const now = new Date('2026-09-22T15:00:00Z');
  const first = await publishRankingThreshold(admin, { minimumPercentage: 60 }, now);
  assert.equal(first.validateSync(), undefined);
  assert.equal(first.version, 1);
  assert.equal(first.minimumPercentage, 60);
  assert.equal(String(first.author), admin.id);
  assert.equal(first.effectiveAt.toISOString(), now.toISOString());
  assert.equal(await publishRankingThreshold(admin, { minimumPercentage: 60 }), first);
  assert.equal(create.mock.callCount(), 1);
  const second = await publishRankingThreshold(admin, { minimumPercentage: 75.25 });
  assert.equal(second.version, 2);
  assert.deepEqual(await getPublishedRankingThreshold(),
    { version: 2, minimumPercentage: 75.25 });
});

test('invalid values and extra fields are rejected without replacing current configuration', async (context) => {
  const current = { version: 1, minimumPercentage: 60 };
  const init = context.mock.method(Model, 'init', async () => Model);
  context.mock.method(Model, 'findOne', () => ({ sort: async () => current }));
  await assert.rejects(publishRankingThreshold({ role: 'company' }, { minimumPercentage: 60 }),
    { statusCode: 403 });
  for (const input of [{}, { minimumPercentage: -0.01 }, { minimumPercentage: 100.01 },
    { minimumPercentage: '60' }, { minimumPercentage: 60.001 },
    { minimumPercentage: 60, extra: true }, 60, null]) {
    await assert.rejects(publishRankingThreshold(admin, input), { statusCode: 400 });
  }
  assert.equal(init.mock.callCount(), 0);
  assert.equal(current.minimumPercentage, 60);
});

test('missing threshold applies no arbitrary cutoff and corrupt threshold fails safely', async (context) => {
  let current = null;
  context.mock.method(Model, 'findOne', () => ({ sort: async () => current }));
  assert.equal(await getPublishedRankingThreshold(), null);
  current = { version: 1, minimumPercentage: 101 };
  await assert.rejects(getPublishedRankingThreshold(), { statusCode: 503 });
});

test('concurrent publication never overwrites another threshold version', async (context) => {
  const current = { version: 1, minimumPercentage: 60 };
  context.mock.method(Model, 'init', async () => Model);
  context.mock.method(Model, 'findOne', () => ({ sort: async () => current }));
  context.mock.method(Model, 'create', async () => {
    const error = new Error('duplicate'); error.code = 11000; throw error;
  });
  await assert.rejects(publishRankingThreshold(admin, { minimumPercentage: 75 }),
    { statusCode: 409 });
  assert.equal(current.minimumPercentage, 60);
});

test('inclusive cutoff compares unrounded technical percentage and never promotes ineligible pairs', () => {
  const score = (percentage, eligible = true) => ({ earnedPoints: percentage,
    possiblePoints: 100, eligibility: { eligible } });
  const threshold = { version: 1, minimumPercentage: 60 };
  assert.equal(meetsRankingThreshold(score(59.99), threshold), false);
  assert.equal(meetsRankingThreshold(score(59.995), threshold), false);
  assert.equal(meetsRankingThreshold(score(60), threshold), true);
  assert.equal(meetsRankingThreshold(score(75), threshold), true);
  assert.equal(meetsRankingThreshold(score(90, false), { version: 2, minimumPercentage: 0 }), false);
  assert.equal(meetsRankingThreshold(score(1), null), true);
  assert.equal(meetsRankingThreshold({ ...score(100), possiblePoints: 0 }, null), false);
});

test('controller returns published configuration and forwards failures', async (context) => {
  const document = { toJSON: () => ({ version: 1, minimumPercentage: 60 }) };
  const create = context.mock.method(Model, 'init', async () => Model);
  context.mock.method(Model, 'findOne', () => ({ sort: async () => null }));
  context.mock.method(Model, 'create', async () => document);
  const req = { user: admin, body: { minimumPercentage: 60 } };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.publish(req, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { configuration: document.toJSON() });
  assert.equal(create.mock.callCount(), 1);
});
