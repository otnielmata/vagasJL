require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const MasterCatalogItem = require('../../src/models/master-catalog-item.model');
const MatchProfileConfiguration = require('../../src/models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { publishMasterCatalogItem, normalizeCatalogAlias } =
  require('../../src/services/master-catalog.service');

const admin = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'admin' };
const now = new Date('2026-09-23T18:00:00.000Z');

function configuration(version = 1, options = []) {
  return new MatchProfileConfiguration({ version, createdBy: admin.id,
    fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({ key, weight,
      options: key === 'testAutomationTechnologies' ? options : [] })) });
}

function input(overrides = {}) {
  return { id: 'cypress', name: 'Cypress', category: 'test_automation',
    aliases: ['Cypress.io', 'Cypress Framework'], active: true, reason: 'Catalogo revisado',
    ...overrides };
}

function setup(context, { rows = [], configurations = [configuration()] } = {}) {
  context.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: admin.id }) }));
  context.mock.method(MasterCatalogItem, 'init', async () => MasterCatalogItem);
  context.mock.method(MatchProfileConfiguration, 'init', async () => MatchProfileConfiguration);
  context.mock.method(MasterCatalogItem, 'findOne', (filter) => ({ sort: async () => rows
    .filter((row) => row.id === filter.id && row.state === filter.state)
    .sort((left, right) => right.revision - left.revision)[0] || null }));
  context.mock.method(MasterCatalogItem, 'find', () => ({ sort: async () => [...rows]
    .sort((left, right) => right.revision - left.revision) }));
  context.mock.method(MatchProfileConfiguration, 'findOne', () => ({ sort: async () =>
    configurations.at(-1) || null }));
  const createItem = context.mock.method(MasterCatalogItem, 'create', async (data) => {
    const item = new MasterCatalogItem(data);
    rows.push(item);
    return item;
  });
  const createConfiguration = context.mock.method(MatchProfileConfiguration, 'create', async (data) => {
    const item = new MatchProfileConfiguration(data);
    configurations.push(item);
    return item;
  });
  context.mock.method(MasterCatalogItem, 'deleteOne', async ({ _id }) => {
    const index = rows.findIndex((row) => row._id?.equals(_id));
    if (index >= 0) rows.splice(index, 1);
  });
  return { rows, configurations, createItem, createConfiguration };
}

function catalogItem(overrides = {}) {
  return new MasterCatalogItem({ category: 'test_automation', id: 'cypress', revision: 1,
    name: 'Cypress', aliases: ['Cypress.io'], normalizedAliases: ['cypress', 'cypressio'],
    active: true, state: 'published', effectiveAt: now, reason: 'Inicial', createdBy: admin.id,
    profileConfigurationVersion: 1, cacheInvalidatedAt: now,
    recalculation: { status: 'scheduled', scheduledFor: now }, ...overrides });
}

test('publishes a stable canonical item and creates a functional profile catalog version', async (context) => {
  const state = setup(context);
  const item = await publishMasterCatalogItem(admin, 'test_automation', 'cypress', input(), now);

  assert.equal(item.validateSync(), undefined);
  assert.equal(item.revision, 1);
  assert.equal(item.id, 'cypress');
  assert.equal(item.profileConfigurationVersion, 2);
  assert.equal(state.configurations.length, 2);
  const option = state.configurations[1].fields
    .find((field) => field.key === 'testAutomationTechnologies').options[0];
  assert.equal(option.id, 'cypress');
  assert.equal(option.label, 'Cypress');
  assert.deepEqual(option.aliases, ['Cypress Framework', 'Cypress.io']);
  assert.equal(item.toJSON().normalizedAliases, undefined);
});

test('REST Assured spelling variants converge to one normalized alias', () => {
  assert.equal(normalizeCatalogAlias('REST Assured'), 'restassured');
  assert.equal(normalizeCatalogAlias('RestAssured'), 'restassured');
  assert.equal(normalizeCatalogAlias('rest-assured'), 'restassured');
  assert.notEqual(normalizeCatalogAlias('C++'), normalizeCatalogAlias('C#'));
});

test('rejects an ambiguous active alias before changing published versions', async (context) => {
  const owner = catalogItem({ id: 'rest_assured', name: 'REST Assured',
    aliases: ['rest-assured'], normalizedAliases: ['restassured'] });
  const state = setup(context, { rows: [owner] });
  await assert.rejects(publishMasterCatalogItem(admin, 'test_automation', 'karate', {
    id: 'karate', name: 'Karate', category: 'test_automation', aliases: ['RestAssured'],
    active: true,
  }, now), { statusCode: 409 });
  assert.equal(state.createItem.mock.callCount(), 0);
  assert.equal(state.createConfiguration.mock.callCount(), 0);
  assert.equal(state.configurations.length, 1);
});

test('rejects alias already owned by the legacy functional catalog', async (context) => {
  const state = setup(context, { configurations: [configuration(1, [{
    id: 'cypress', label: 'Cypress', aliases: ['Cypress.io'],
  }])] });
  await assert.rejects(publishMasterCatalogItem(admin, 'test_automation', 'karate', {
    id: 'karate', name: 'Karate', category: 'test_automation', aliases: ['cypress-io'],
    active: true,
  }, now), { statusCode: 409 });
  assert.equal(state.createItem.mock.callCount(), 0);
  assert.equal(state.createConfiguration.mock.callCount(), 0);
});

test('changes friendly name in a new revision without changing the canonical ID', async (context) => {
  const current = catalogItem();
  const state = setup(context, { rows: [current], configurations: [configuration(1, [{
    id: 'cypress', label: 'Cypress', aliases: ['Cypress.io'],
  }])] });
  const item = await publishMasterCatalogItem(admin, 'test_automation', 'cypress', input({
    name: 'Cypress Test Runner', aliases: ['Cypress.io'],
  }), now);

  assert.equal(item.revision, 2);
  assert.equal(item.id, 'cypress');
  assert.equal(state.rows[0].name, 'Cypress');
  const option = state.configurations.at(-1).fields
    .find((field) => field.key === 'testAutomationTechnologies').options[0];
  assert.equal(option.id, 'cypress');
  assert.equal(option.label, 'Cypress Test Runner');
});

test('deactivates new selection while preserving historical item and profile versions', async (context) => {
  const current = catalogItem();
  const historicalConfiguration = configuration(1, [{
    id: 'cypress', label: 'Cypress', aliases: ['Cypress.io'],
  }]);
  const state = setup(context, { rows: [current], configurations: [historicalConfiguration] });
  const item = await publishMasterCatalogItem(admin, 'test_automation', 'cypress', input({
    aliases: ['Cypress.io'], active: false, reason: 'Ferramenta desativada',
  }), now);

  assert.equal(item.active, false);
  assert.equal(item.revision, 2);
  assert.equal(state.rows[0].active, true);
  assert.equal(historicalConfiguration.fields
    .find((field) => field.key === 'testAutomationTechnologies').options.length, 1);
  assert.equal(state.configurations.at(-1).fields
    .find((field) => field.key === 'testAutomationTechnologies').options.length, 0);
});

test('repeating the same representation is idempotent without duplicate revision', async (context) => {
  const current = catalogItem({ aliases: ['Cypress Framework', 'Cypress.io'],
    normalizedAliases: ['cypress', 'cypressframework', 'cypressio'] });
  const state = setup(context, { rows: [current], configurations: [configuration(1, [{
    id: 'cypress', label: 'Cypress', aliases: ['Cypress Framework', 'Cypress.io'],
  }])] });
  const result = await publishMasterCatalogItem(admin, 'test_automation', 'cypress', input(), now);
  assert.equal(result, current);
  assert.equal(state.createItem.mock.callCount(), 0);
  assert.equal(state.createConfiguration.mock.callCount(), 0);
});

test('prevents reuse of a global ID in another category and requires active admin', async (context) => {
  const current = catalogItem();
  const state = setup(context, { rows: [current] });
  await assert.rejects(publishMasterCatalogItem(admin, 'qa_tool', 'cypress', {
    id: 'cypress', name: 'Outro conceito', category: 'qa_tool', aliases: [], active: true,
  }, now), { statusCode: 409 });
  await assert.rejects(publishMasterCatalogItem({ ...admin, role: 'company' },
    'test_automation', 'cypress', input(), now), { statusCode: 403 });
  assert.equal(state.createItem.mock.callCount(), 0);
});

test('model enforces immutable version history indexes', () => {
  const index = MasterCatalogItem.schema.indexes().find(([, options]) =>
    options.name === 'unique_master_catalog_item_revision');
  assert.deepEqual(index[0], { category: 1, id: 1, revision: 1 });
  assert.equal(index[1].unique, true);
  assert.equal(MasterCatalogItem.schema.path('normalizedAliases').options.select, false);
  assert.equal(MasterCatalogItem.schema.path('id').options.immutable, true);
});
