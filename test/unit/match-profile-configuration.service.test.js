require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Configuration = require('../../src/models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { publishConfiguration } = require('../../src/services/match-profile-configuration.service');

const admin = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'admin' };
const initial = () => ({
  fields: Object.fromEntries(Object.entries(INITIAL_MATCH_WEIGHTS)
    .map(([key, weight]) => [key, { weight, options: [] }])),
});

function isolate(context) {
  let current = null;
  context.mock.method(Configuration, 'init', async () => Configuration);
  const find = context.mock.method(Configuration, 'findOne', () => ({
    sort: async () => current,
  }));
  const create = context.mock.method(Configuration, 'create', async (input) => {
    current = new Configuration(input);
    return current;
  });
  return { find, create, get current() { return current; } };
}

test('publishes exactly 22 initial fields and weights as version 1', async (context) => {
  const { create } = isolate(context);
  const result = await publishConfiguration(admin, initial());
  assert.equal(result.version, 1);
  assert.equal(result.fields.length, 22);
  assert.deepEqual(Object.fromEntries(result.fields.map(({ key, weight }) => [key, weight])), INITIAL_MATCH_WEIGHTS);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(result.toJSON().createdBy, undefined);
  assert.equal(result.validateSync(), undefined);
});

test('normalizes configured aliases and treats repeat PUT as idempotent', async (context) => {
  const { create } = isolate(context);
  const input = initial();
  input.fields.testAutomationTechnologies.options = [{
    id: 'cypress', label: 'Cypress', aliases: ['cypress', 'Cypress.io', 'Cypress Framework'],
  }];
  const first = await publishConfiguration(admin, input);
  const second = await publishConfiguration(admin, input);
  assert.equal(first.version, 1);
  assert.equal(second.version, 1);
  assert.equal(create.mock.callCount(), 1);
  assert.deepEqual(first.fields.find((field) => field.key === 'testAutomationTechnologies')
    .options[0].aliases, ['cypress framework', 'cypress.io']);
});

test('publishes changed weight as new immutable version', async (context) => {
  const { create } = isolate(context);
  const original = await publishConfiguration(admin, initial());
  const changed = initial();
  changed.fields.type.weight = 9;
  const latest = await publishConfiguration(admin, changed);
  assert.equal(latest.version, 2);
  assert.equal(original.fields[0].weight, 8);
  assert.equal(latest.fields[0].weight, 9);
  assert.equal(create.mock.callCount(), 2);
});

test('rejects unknown key, missing field, nonpositive weight and client metadata', async (context) => {
  const { create } = isolate(context);
  const cases = [
    { fields: { ...initial().fields, unknown: { weight: 1, options: [] } } },
    { fields: Object.fromEntries(Object.entries(initial().fields).slice(1)) },
    { fields: { ...initial().fields, type: { weight: 0, options: [] } } },
    { fields: { ...initial().fields, type: { weight: 2.5, options: [] } } },
    { ...initial(), version: 99 },
    { ...initial(), createdBy: admin.id },
  ];
  for (const input of cases) {
    await assert.rejects(publishConfiguration(admin, input), { statusCode: 400 });
  }
  assert.equal(create.mock.callCount(), 0);
});

test('rejects aliases claimed by two canonical ids without partial publish', async (context) => {
  const { create } = isolate(context);
  const input = initial();
  input.fields.testAutomationTechnologies.options = [
    { id: 'cypress', label: 'Cypress', aliases: ['Cypress Framework'] },
    { id: 'another', label: 'Another', aliases: ['cypress framework'] },
  ];
  await assert.rejects(publishConfiguration(admin, input), { statusCode: 409 });
  assert.equal(create.mock.callCount(), 0);
});

test('unknown seniority cannot be published as an id, label or alias', async (context) => {
  const { create } = isolate(context);
  for (const option of [
    { id: 'unknown', label: 'Unknown', aliases: [] },
    { id: 'junior', label: 'Desconhecido', aliases: [] },
    { id: 'junior', label: 'Júnior', aliases: ['UNKNOWN'] },
  ]) {
    const input = initial();
    input.fields.level.options = [option];
    await assert.rejects(publishConfiguration(admin, input), { statusCode: 400 });
  }
  assert.equal(create.mock.callCount(), 0);
});

test('refuses removal of a published canonical id', async (context) => {
  const { create } = isolate(context);
  const input = initial();
  input.fields.testAutomationTechnologies.options = [{ id: 'cypress', label: 'Cypress', aliases: [] }];
  await publishConfiguration(admin, input);
  await assert.rejects(publishConfiguration(admin, initial()), { statusCode: 409 });
  assert.equal(create.mock.callCount(), 1);
});

test('refuses reassignment of a published alias to another canonical id', async (context) => {
  const { create } = isolate(context);
  const input = initial();
  input.fields.testAutomationTechnologies.options = [
    { id: 'cypress', label: 'Cypress', aliases: ['Cypress Framework'] },
  ];
  await publishConfiguration(admin, input);
  const changed = initial();
  changed.fields.testAutomationTechnologies.options = [
    { id: 'cypress', label: 'Cypress', aliases: [] },
    { id: 'other', label: 'Other', aliases: ['Cypress Framework'] },
  ];
  await assert.rejects(publishConfiguration(admin, changed), { statusCode: 409 });
  assert.equal(create.mock.callCount(), 1);
});

test('rejects non-admin before touching storage', async (context) => {
  const { find, create } = isolate(context);
  await assert.rejects(publishConfiguration({ id: admin.id, role: 'company' }, initial()), { statusCode: 403 });
  assert.equal(find.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});

test('concurrent identical publication returns the winning version', async (context) => {
  const { find, create } = isolate(context);
  const input = initial();
  const winner = new Configuration({
    version: 1,
    createdBy: admin.id,
    fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({ key, weight, options: [] })),
  });
  let reads = 0;
  find.mock.mockImplementation(() => ({ sort: async () => (++reads === 1 ? null : winner) }));
  create.mock.mockImplementationOnce(async () => {
    throw Object.assign(new Error('duplicate version'), { code: 11000 });
  });
  assert.equal(await publishConfiguration(admin, input), winner);
});

test('concurrent different publication returns 409', async (context) => {
  const { create } = isolate(context);
  const input = initial();
  create.mock.mockImplementationOnce(async () => {
    throw Object.assign(new Error('duplicate version'), { code: 11000 });
  });
  await assert.rejects(publishConfiguration(admin, input), { statusCode: 409 });
});
