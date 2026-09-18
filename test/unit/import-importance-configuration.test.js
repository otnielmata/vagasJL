require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Model = require('../../src/models/import-importance-configuration.model');
const { publishImportImportance } = require('../../src/services/import-importance-configuration.service');
const controller = require('../../src/controllers/import-importance-configuration.controller');
const router = require('../../src/routes/import-importance-configuration.routes');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

const admin = { id: '507f1f77bcf86cd799439011', role: 'admin' };

test('configuration route requires authentication and admin role', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/importacao/importancia-padrao').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.publish);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('missing JWT must stop'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'candidate' } }, response, () => assert.fail('non-admin must stop'));
  assert.equal(response.code, 403);
});

test('publishes versioned importance with author and effective date; identical requests are stable', async (context) => {
  let current = null;
  context.mock.method(Model, 'init', async () => Model);
  context.mock.method(Model, 'findOne', () => ({ sort: async () => current }));
  context.mock.method(Model, 'create', async (data) => { current = new Model(data); return current; });
  const now = new Date('2026-09-18T12:00:00Z');
  const first = await publishImportImportance(admin, { importance: 'desirable' }, now);
  assert.equal(first.validateSync(), undefined);
  assert.equal(first.version, 1);
  assert.equal(first.importance, 'desirable');
  assert.equal(String(first.author), admin.id);
  assert.equal(first.effectiveAt.toISOString(), now.toISOString());
  assert.equal(await publishImportImportance(admin, { importance: 'desirable' }), first);
  const second = await publishImportImportance(admin, { importance: 'required' });
  assert.equal(second.version, 2);
  assert.equal(second.toJSON().author.toString(), admin.id);
});

test('rejects invalid payload, unauthorized actor and concurrent publication without partial version', async (context) => {
  await assert.rejects(publishImportImportance({ role: 'candidate' }, { importance: 'required' }),
    { statusCode: 403 });
  for (const body of [{}, { importance: 'maybe' }, { importance: 'required', version: 5 }]) {
    await assert.rejects(publishImportImportance(admin, body), { statusCode: 400 });
  }
  context.mock.method(Model, 'init', async () => Model);
  context.mock.method(Model, 'findOne', () => ({ sort: async () => ({ version: 1,
    importance: 'required' }) }));
  context.mock.method(Model, 'create', async () => { const error = new Error('duplicate');
    error.code = 11000; throw error; });
  await assert.rejects(publishImportImportance(admin, { importance: 'desirable' }),
    { statusCode: 409 });
});
