require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Configuration = require('../../src/models/match-engine-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { publishMatchEngineConfiguration, getEffectiveMatchEngineConfiguration,
  applyEngineWeights, normalizeInput } = require('../../src/services/match-engine-configuration.service');

const admin = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'admin' };
const now = new Date('2026-09-23T20:00:00.000Z');

function input(overrides = {}) {
  return {
    state: 'published',
    effectiveAt: '2026-09-24T00:00:00.000Z',
    weights: { ...INITIAL_MATCH_WEIGHTS },
    multipliers: { required: 1, desirable: 0.5, indifferent: 0 },
    defaultImportImportance: 'desirable',
    minimumMatchPercentage: 60,
    minimumProfileCompletionPercentage: 70,
    recalculationPolicy: 'affected_matches',
    ...overrides,
  };
}

test('publishes a complete immutable version with author, future validity and recalculation schedule', async (context) => {
  context.mock.method(Configuration, 'init', async () => Configuration);
  const find = context.mock.method(Configuration, 'findOne', async () => null);
  const create = context.mock.method(Configuration, 'create', async (data) => new Configuration(data));
  const configuration = await publishMatchEngineConfiguration(admin, 'MATCH_V2', input(), now);

  assert.equal(configuration.validateSync(), undefined);
  assert.equal(configuration.version, 'MATCH_V2');
  assert.equal(configuration.revision, 2);
  assert.equal(configuration.createdBy.toString(), admin.id);
  assert.equal(configuration.publishedBy.toString(), admin.id);
  assert.equal(configuration.publishedAt.toISOString(), now.toISOString());
  assert.equal(configuration.cacheVersion, 2);
  assert.equal(configuration.cacheInvalidatedAt.toISOString(), now.toISOString());
  assert.equal(configuration.recalculation.status, 'scheduled');
  assert.equal(configuration.recalculation.scheduledFor.toISOString(), '2026-09-24T00:00:00.000Z');
  assert.deepEqual(find.mock.calls[0].arguments[0], { $or: [
    { version: 'MATCH_V2' }, { revision: 2 },
  ] });
  assert.equal(create.mock.callCount(), 1);
});

test('rejects partial or invalid configuration atomically with 422', async (context) => {
  const init = context.mock.method(Configuration, 'init', async () => Configuration);
  const invalid = [
    { ...input(), weights: { type: 8 } },
    input({ minimumMatchPercentage: 101 }),
    input({ weights: { ...INITIAL_MATCH_WEIGHTS, type: -1 } }),
    input({ multipliers: { required: 1, desirable: 0, indifferent: 0 } }),
    input({ unexpected: true }),
  ];
  for (const body of invalid) {
    await assert.rejects(publishMatchEngineConfiguration(admin, 'MATCH_V2', body, now),
      { statusCode: 422 });
  }
  assert.equal(init.mock.callCount(), 0);
});

test('same version and content is idempotent while published content cannot be overwritten', async (context) => {
  const existing = new Configuration({
    version: 'MATCH_V2', revision: 2, ...input(), effectiveAt: new Date(input().effectiveAt),
    createdBy: admin.id, publishedBy: admin.id, publishedAt: now, cacheVersion: 2,
    cacheInvalidatedAt: now,
    recalculation: { policy: 'affected_matches', status: 'scheduled',
      scheduledFor: new Date(input().effectiveAt) },
  });
  context.mock.method(Configuration, 'init', async () => Configuration);
  const query = { current: existing };
  context.mock.method(Configuration, 'findOne', async () => query.current);
  const create = context.mock.method(Configuration, 'create', async () => assert.fail('must not create'));
  assert.equal(await publishMatchEngineConfiguration(admin, 'MATCH_V2', input(), now), existing);
  await assert.rejects(publishMatchEngineConfiguration(admin, 'MATCH_V2',
    input({ minimumMatchPercentage: 61 }), now), { statusCode: 409 });
  query.current = new Configuration({ ...existing.toObject(), version: 'MATCH_V3', revision: 3 });
  await assert.rejects(publishMatchEngineConfiguration(admin, 'MATCH_V2', input(), now),
    { statusCode: 409 });
  assert.equal(create.mock.callCount(), 0);
});

test('publishes an unchanged draft and never mutates its calibrated content', async (context) => {
  const draft = new Configuration({
    version: 'MATCH_V2', revision: 2, ...input({ state: 'draft' }),
    effectiveAt: new Date(input().effectiveAt), createdBy: admin.id, cacheVersion: 2,
    recalculation: { policy: 'affected_matches', status: 'not_scheduled' },
  });
  draft.updatedAt = now;
  context.mock.method(Configuration, 'init', async () => Configuration);
  context.mock.method(Configuration, 'findOne', async () => draft);
  const update = context.mock.method(Configuration, 'findOneAndUpdate', async (_filter, operation) =>
    new Configuration({ ...draft.toObject(), ...operation.$set }));
  const published = await publishMatchEngineConfiguration(admin, 'MATCH_V2', input(), now);
  assert.equal(published.state, 'published');
  assert.equal(update.mock.calls[0].arguments[1].$set.recalculation.status, 'scheduled');
});

test('operational read selects only the latest published version already in force', async (context) => {
  const effective = new Configuration({
    version: 'MATCH_V2', revision: 2, ...input({ effectiveAt: now }),
    effectiveAt: now, createdBy: admin.id, publishedBy: admin.id, publishedAt: now,
    cacheVersion: 2, recalculation: { policy: 'affected_matches', status: 'scheduled',
      scheduledFor: now },
  });
  const sort = context.mock.fn(async () => effective);
  const find = context.mock.method(Configuration, 'findOne', () => ({ sort }));
  const result = await getEffectiveMatchEngineConfiguration(now);
  assert.equal(result.version, 'MATCH_V2');
  assert.deepEqual(find.mock.calls[0].arguments[0], {
    state: 'published', effectiveAt: { $lte: now },
  });
  assert.deepEqual(sort.mock.calls[0].arguments[0], { effectiveAt: -1, revision: -1 });
});

test('engine weights override only scoring weights and preserve the historical catalog', () => {
  const catalog = { version: 7, geographyWeights: { country: 6, state: 4, city: 2 }, fields: [
    { key: 'type', weight: 8, options: [{ id: 'remote', label: 'Remoto', aliases: [] }] },
    ...Object.keys(INITIAL_MATCH_WEIGHTS).filter((key) => key !== 'type')
      .map((key) => ({ key, weight: INITIAL_MATCH_WEIGHTS[key], options: [] })),
  ] };
  const engine = { weights: { ...INITIAL_MATCH_WEIGHTS, type: 0 } };
  const result = applyEngineWeights(catalog, engine);
  assert.equal(result.fields.find((field) => field.key === 'type').weight, 0);
  assert.equal(result.fields.find((field) => field.key === 'type').options[0].id, 'remote');
  assert.equal(catalog.fields[0].weight, 8);
});

test('normalizes the eliminatory policy as a versioned administrative rule', () => {
  const normalized = normalizeInput('MATCH_V8', { ...input(), eliminatoryPolicyEnabled: false });
  assert.equal(normalized.eliminatoryPolicyEnabled, false);
  assert.equal(normalizeInput('MATCH_V8', input()).eliminatoryPolicyEnabled, true);
  assert.throws(() => normalizeInput('MATCH_V8', { ...input(), eliminatoryPolicyEnabled: 'false' }),
    { statusCode: 422 });
});

test('only authenticated administrators may publish', async () => {
  await assert.rejects(publishMatchEngineConfiguration({ ...admin, role: 'company' },
    'MATCH_V2', input(), now), { statusCode: 403 });
});
