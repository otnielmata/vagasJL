require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Catalog = require('../../src/models/test-type-catalog.model');
const { INITIAL_TEST_TYPES } = require('../../src/config/test-type-catalog');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { calculateMatchScore } = require('../../src/services/match-scoring.service');
const { publishTestTypeCatalog, resolveTestType, reviewLegacyTestType } =
  require('../../src/services/test-type-catalog.service');

const admin = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'admin' };

function initialTypes() {
  return INITIAL_TEST_TYPES.map(({ id, label }) => ({ id, label, aliases: [] }));
}

function isolate(context, current = null) {
  context.mock.method(Catalog, 'init', async () => Catalog);
  const find = context.mock.method(Catalog, 'findOne', () => ({ sort: async () => current }));
  const create = context.mock.method(Catalog, 'create', async (data) => new Catalog(data));
  return { find, create };
}

test('admin publishes exactly the 12 product types as version 1', async (context) => {
  const { create } = isolate(context);
  const catalog = await publishTestTypeCatalog(admin, { types: initialTypes() });
  assert.equal(catalog.version, 1);
  assert.equal(catalog.types.length, 12);
  assert.equal(catalog.types.find((type) => type.id === 'testes-de-api').label, 'Testes de API');
  assert.equal(create.mock.callCount(), 1);
  assert.equal(catalog.toJSON().createdBy, undefined);
  assert.equal(catalog.toJSON().__v, undefined);
});

test('same normalized publication is idempotent and alias resolves to canonical ID', async (context) => {
  const types = initialTypes();
  types.find((type) => type.id === 'testes-de-api').aliases = ['API Testing'];
  const current = new Catalog({ version: 1, types: types.map((type) => ({ ...type,
    aliases: type.aliases.map((alias) => alias.toLowerCase()) })), createdBy: admin.id });
  const { create } = isolate(context, current);
  const repeated = await publishTestTypeCatalog(admin, { types });
  assert.equal(repeated, current);
  assert.equal(create.mock.callCount(), 0);
  assert.equal(resolveTestType('  áPI   TESTING ', current), 'testes-de-api');
  assert.equal(resolveTestType('Testes de API', current), 'testes-de-api');
  assert.equal(resolveTestType('testes-de-api', current), 'testes-de-api');
});

test('new alias publishes version 2 and preserves prior canonical IDs', async (context) => {
  const current = new Catalog({ version: 1, types: initialTypes(), createdBy: admin.id });
  const { create } = isolate(context, current);
  const types = initialTypes();
  types.find((type) => type.id === 'testes-de-api').aliases = ['API Testing'];
  const next = await publishTestTypeCatalog(admin, { types });
  assert.equal(next.version, 2);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(next.types.length, 12);
  assert.equal(resolveTestType('api testing', next), 'testes-de-api');
});

test('rejects duplicate ID or missing initial type before writing', async (context) => {
  const { create } = isolate(context);
  const duplicate = initialTypes();
  duplicate[1].id = duplicate[0].id;
  await assert.rejects(publishTestTypeCatalog(admin, { types: duplicate }), { statusCode: 400 });
  const incomplete = initialTypes().slice(1);
  await assert.rejects(publishTestTypeCatalog(admin, { types: incomplete }), { statusCode: 400 });
  const wrongLabel = initialTypes();
  wrongLabel[0].label = 'Outro';
  await assert.rejects(publishTestTypeCatalog(admin, { types: wrongLabel }), { statusCode: 400 });
  assert.equal(create.mock.callCount(), 0);
});

test('rejects conflicting alias and preserves current version', async (context) => {
  const current = new Catalog({ version: 1, types: initialTypes(), createdBy: admin.id });
  const { create } = isolate(context, current);
  const types = initialTypes();
  types.find((type) => type.id === 'testes-de-api').aliases = ['teste compartilhado'];
  types.find((type) => type.id === 'regressao').aliases = ['TESTE  COMPARTILHADO'];
  await assert.rejects(publishTestTypeCatalog(admin, { types }), { statusCode: 409 });
  assert.equal(create.mock.callCount(), 0);
  assert.equal(current.version, 1);
});

test('cannot remove an existing ID or transfer an established alias', async (context) => {
  const previous = initialTypes();
  previous.find((type) => type.id === 'testes-de-api').aliases = ['api testing'];
  const current = new Catalog({ version: 1, types: previous, createdBy: admin.id });
  const { create } = isolate(context, current);
  const removed = initialTypes().filter((type) => type.id !== 'bdd');
  removed.push({ id: 'outro', label: 'Outro', aliases: [] });
  await assert.rejects(publishTestTypeCatalog(admin, { types: removed }), { statusCode: 409 });
  const transferred = initialTypes();
  transferred.find((type) => type.id === 'regressao').aliases = ['api testing'];
  await assert.rejects(publishTestTypeCatalog(admin, { types: transferred }), { statusCode: 409 });
  assert.equal(create.mock.callCount(), 0);
});

test('unrecognized structured value is rejected rather than created', () => {
  const catalog = new Catalog({ version: 1, types: initialTypes(), createdBy: admin.id });
  assert.throws(() => resolveTestType('Testes inventados', catalog), { statusCode: 400 });
  assert.equal(catalog.types.length, 12);
});

test('legacy review keeps original text and never auto-assigns a category', () => {
  const catalog = new Catalog({ version: 1, types: initialTypes(), createdBy: admin.id });
  assert.deepEqual(reviewLegacyTestType('Testes de API e Regressão', catalog), {
    originalText: 'Testes de API e Regressão', suggestedId: null, requiresReview: true,
  });
  assert.deepEqual(reviewLegacyTestType('Testes de API', catalog), {
    originalText: 'Testes de API', suggestedId: 'testes-de-api', requiresReview: true,
  });
});

test('non-admin role cannot publish or touch storage', async (context) => {
  const { find, create } = isolate(context);
  await assert.rejects(publishTestTypeCatalog({ id: admin.id, role: 'candidate' }, { types: initialTypes() }),
    { statusCode: 403 });
  assert.equal(find.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});

test('a published test-type catalog does not change Match v1 scoring', async (context) => {
  isolate(context);
  const catalog = await publishTestTypeCatalog(admin, { types: initialTypes() });
  const configuration = { fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({ key, weight })) };
  const baseline = calculateMatchScore({ technicalResults: { apiTesting: { applicable: true, matched: true } },
    configuration });
  const withCatalog = calculateMatchScore({ technicalResults: {
    apiTesting: { applicable: true, matched: true },
    testingRelatedKeywords: ['Testes de API'],
  }, configuration: { ...configuration, testTypeCatalog: catalog } });
  assert.deepEqual(withCatalog, baseline);
});

test('concurrent duplicate version returns the identical winner or 409 without partial publish', async (context) => {
  const { find, create } = isolate(context);
  create.mock.mockImplementation(async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  const winner = new Catalog({ version: 1, types: initialTypes(), createdBy: admin.id });
  let reads = 0;
  find.mock.mockImplementation(() => ({ sort: async () => (++reads === 1 ? null : winner) }));
  const result = await publishTestTypeCatalog(admin, { types: initialTypes() });
  assert.equal(result, winner);
  assert.equal(create.mock.callCount(), 1);
  reads = 0;
  find.mock.mockImplementation(() => ({ sort: async () => (++reads === 1 ? null :
    new Catalog({ version: 1, types: initialTypes().map((type) => type.id === 'testes-de-api'
      ? { ...type, aliases: ['api testing'] } : type), createdBy: admin.id })) }));
  await assert.rejects(publishTestTypeCatalog(admin, { types: initialTypes() }), { statusCode: 409 });
});
