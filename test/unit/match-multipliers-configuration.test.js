require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Model = require('../../src/models/match-multipliers-configuration.model');
const { publishMultipliers, getPublishedMultipliers } =
  require('../../src/services/match-multipliers-configuration.service');
const controller = require('../../src/controllers/match-multipliers-configuration.controller');
const router = require('../../src/routes/match-multipliers-configuration.routes');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const admin = { id: '507f1f77bcf86cd799439011', role: 'admin' };
const initial = { required: 1, desirable: 0.5, indifferent: 0 };

test('route requires JWT and admin before publishing', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/match/multiplicadores').route;
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

test('publication is versioned, attributed, idempotent and effective from publication time', async (context) => {
  let current = null;
  context.mock.method(Model, 'init', async () => Model);
  context.mock.method(Model, 'findOne', () => ({ sort: async () => current }));
  const create = context.mock.method(Model, 'create', async (data) => {
    current = new Model(data); return current;
  });
  const now = new Date('2026-09-18T12:00:00Z');
  const first = await publishMultipliers(admin, initial, now);
  assert.equal(first.validateSync(), undefined);
  assert.equal(first.version, 1);
  assert.equal(String(first.author), admin.id);
  assert.equal(first.effectiveAt.toISOString(), now.toISOString());
  assert.equal(await publishMultipliers(admin, initial), first);
  assert.equal(create.mock.callCount(), 1);
  const second = await publishMultipliers(admin, { ...initial, desirable: 0.4 });
  assert.equal(second.version, 2);
  assert.equal(second.multipliers.desirable, 0.4);
  assert.deepEqual(await getPublishedMultipliers(), { version: 2, multipliers: {
    required: 1, desirable: 0.4, indifferent: 0,
  } });
  assert.equal(first.multipliers.desirable, 0.5);
});

test('invalid values and unauthorized actor do not write', async (context) => {
  const init = context.mock.method(Model, 'init', async () => Model);
  await assert.rejects(publishMultipliers({ role: 'company' }, initial), { statusCode: 403 });
  for (const input of [{}, { required: 1, indifferent: 0 },
    { ...initial, desirable: -0.1 }, { ...initial, desirable: 1 },
    { ...initial, desirable: '0.5' }, { ...initial, required: 0.9 },
    { ...initial, indifferent: 0.1 }, { ...initial, extra: 2 }]) {
    await assert.rejects(publishMultipliers(admin, input), { statusCode: 400 });
  }
  assert.equal(init.mock.callCount(), 0);
});

test('missing or invalid published configuration prevents calculation; race is atomic', async (context) => {
  let current = null;
  context.mock.method(Model, 'findOne', () => ({ sort: async () => current }));
  await assert.rejects(getPublishedMultipliers(), { statusCode: 503 });
  current = { version: 1, multipliers: { ...initial, desirable: 1 } };
  await assert.rejects(getPublishedMultipliers(), { statusCode: 503 });
  current = { version: 1, multipliers: initial };
  context.mock.method(Model, 'init', async () => Model);
  context.mock.method(Model, 'create', async () => { const error = new Error('duplicate');
    error.code = 11000; throw error; });
  await assert.rejects(publishMultipliers(admin, { ...initial, desirable: 0.4 }),
    { statusCode: 409 });
});

test('published multipliers yield 10, 5 or zero points for Playwright', () => {
  const configuration = { fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({ key,
    weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'testAutomationTechnologies'
      ? [{ id: 'playwright', label: 'Playwright', aliases: [] }] : [],
  })) };
  for (const [importance, expected] of [['required', 10], ['desirable', 5], ['indifferent', 0]]) {
    const input = { configuration, vacancyValues: { testAutomationTechnologies: ['playwright'] },
      candidateValues: { testAutomationTechnologies: ['playwright'] },
      requirements: [{ field: 'testAutomationTechnologies', id: 'playwright', importance }] };
    const result = calculateCompetencyMatch({ ...input, multipliers: initial });
    assert.equal(result.possiblePoints, expected);
    assert.equal(result.earnedPoints, expected);
    assert.throws(() => calculateCompetencyMatch(input), /Importancia invalida/);
  }
});
