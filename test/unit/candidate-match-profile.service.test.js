require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const MatchProfile = require('../../src/models/candidate-match-profile.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { registerMatchProfile } = require('../../src/services/candidate-match-profile.service');

const user = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'candidate' };
const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';

function isolate(context, status = 'pending_validation') {
  const candidate = Candidate.hydrate({
    _id: candidateId, user: user.id, name: 'Maria', email: 'maria@example.com', status, deletedAt: null,
  });
  const configuration = new Configuration({
    version: 3,
    createdBy: user.id,
    fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
      key, weight,
      options: key === 'type' ? [
        { id: 'remote', label: 'Remoto', aliases: ['Home office'] },
        { id: 'hybrid', label: 'Hibrido', aliases: [] },
        { id: 'onsite', label: 'Presencial', aliases: [] },
      ] : key === 'apiTesting' ? [{
        id: 'api-testing', label: 'API Testing', aliases: [],
      }] : key === 'testAutomationTechnologies' ? [{
        id: 'cypress', label: 'Cypress', aliases: ['cypress.io', 'cypress framework'],
      }] : key === 'level' ? [{ id: 'junior', label: 'Júnior', aliases: [] }] : [],
    })),
  });
  const findCandidate = context.mock.method(Candidate, 'findOne', (filter) => {
    assert.deepEqual(filter, { user: user.id, deletedAt: null });
    return { select: async () => candidate };
  });
  context.mock.method(MatchProfile, 'init', async () => MatchProfile);
  const findProfile = context.mock.method(MatchProfile, 'findOne', async () => null);
  const findConfiguration = context.mock.method(Configuration, 'findOne', () => ({
    sort: async () => configuration,
  }));
  const create = context.mock.method(MatchProfile, 'create', async (data) => new MatchProfile(data));
  return { candidate, configuration, findCandidate, findProfile, findConfiguration, create };
}

for (const status of ['pending_validation', 'incomplete_profile', 'active']) {
  test(`registers a separate draft for own ${status} candidate without changing status`, async (context) => {
    const { candidate, create, findConfiguration } = isolate(context, status);
    const profile = await registerMatchProfile(user, {
      values: { testAutomationTechnologies: ['Cypress.io', 'cypress', 'CYPRESS FRAMEWORK'], yearsOfExperience: 2.5 },
    });
    assert.equal(profile.candidate.toString(), candidateId);
    assert.deepEqual(profile.values.testAutomationTechnologies, ['cypress']);
    assert.equal(profile.values.yearsOfExperience, 2.5);
    assert.equal(profile.configurationVersion, 3);
    assert.equal(candidate.status, status);
    assert.equal(candidate.visibleToCompanies, status === 'active');
    assert.equal(create.mock.callCount(), 1);
    assert.deepEqual(findConfiguration.mock.calls[0].arguments, []);
    const json = profile.toJSON();
    assert.ok(json.pendingFields.includes('type'));
    assert.equal(json.pendingFields.includes('yearsOfExperience'), false);
    assert.equal(json.user, undefined);
    assert.equal(JSON.stringify(json).includes('weight'), false);
  });
}

test('allows an empty draft with every field pending and does not invent skills', async (context) => {
  isolate(context);
  const profile = await registerMatchProfile(user, { values: {} });
  assert.equal(profile.toJSON().pendingFields.length, 22);
  assert.deepEqual(profile.toJSON().values, {});
});

test('normalizes boolean skill answers without treating explicit false as unanswered', async (context) => {
  isolate(context);
  const affirmed = await registerMatchProfile(user, { values: { apiTesting: true } });
  assert.deepEqual(affirmed.values.apiTesting, ['api-testing']);
  const denied = await registerMatchProfile(user, { values: { apiTesting: false } });
  assert.deepEqual(denied.values.apiTesting, []);
  assert.equal(denied.toJSON().pendingFields.includes('apiTesting'), false);
  const unknown = await registerMatchProfile(user, { values: {} });
  assert.equal(unknown.toJSON().pendingFields.includes('apiTesting'), true);
});

test('rejects ambiguous boolean true when the published field has multiple options', async (context) => {
  const { configuration, create } = isolate(context);
  configuration.fields.find((field) => field.key === 'apiTesting').options.push({
    id: 'contract-testing', label: 'Contract Testing', aliases: [],
  });
  await assert.rejects(registerMatchProfile(user, { values: { apiTesting: true } }), { statusCode: 400 });
  assert.equal(create.mock.callCount(), 0);
});

test('rejects unknown seniority at candidate registration even if a legacy catalog lists it', async (context) => {
  const { configuration, create } = isolate(context);
  configuration.fields.find((field) => field.key === 'level').options.push({
    id: 'unknown', label: 'Not Specified', aliases: ['Desconhecido'],
  });
  for (const level of ['unknown', 'Desconhecido', 'Not Specified', ['junior', 'UNKNOWN']]) {
    await assert.rejects(registerMatchProfile(user, { values: { level } }), { statusCode: 400 });
  }
  assert.equal(create.mock.callCount(), 0);
  const profile = await registerMatchProfile(user, { values: { level: 'Júnior' } });
  assert.deepEqual(profile.values.level, ['junior']);
});

test('rejects unknown fields, free text and client-controlled metadata without saving', async (context) => {
  const { create } = isolate(context);
  for (const input of [
    { values: { unknown: 'cypress' } },
    { values: { testAutomationTechnologies: 'Selenium' } },
    { values: { type: 'teletransportado' } },
    { values: { testAutomationTechnologies: false } },
    { values: { testAutomationTechnologies: [12] } },
    { values: { testAutomationTechnologies: { id: 'cypress' } } },
    { values: { testAutomationTechnologies: ['cypress'] }, status: 'active' },
    { values: { testAutomationTechnologies: ['cypress'] }, weight: 100 },
    { values: { testAutomationTechnologies: ['cypress'] }, candidate: candidateId },
  ]) {
    await assert.rejects(registerMatchProfile(user, input), { statusCode: 400 });
  }
  assert.equal(create.mock.callCount(), 0);
});

test('candidate declares distinct accepted modalities from shared catalog', async (context) => {
  isolate(context);
  const profile = await registerMatchProfile(user, { values: { type: ['Hibrido', 'Home office'] } });
  assert.deepEqual(profile.values.type, ['hybrid', 'remote']);
});

test('candidate registration rejects duplicate modalities and free text before persistence', async (context) => {
  const { create } = isolate(context);
  for (const type of [['remote', 'Remoto'], ['Home office', 'remote'],
    ['remote', 'remote'], 'unknown', 'teletransportado']) {
    await assert.rejects(registerMatchProfile(user, { values: { type } }), { statusCode: 400 });
  }
  assert.equal(create.mock.callCount(), 0);
});

test('validates years as a bounded number with at most one decimal', async (context) => {
  const { create } = isolate(context);
  for (const value of [-1, 101, 1.25, '2', false, null, Number.POSITIVE_INFINITY]) {
    await assert.rejects(registerMatchProfile(user, { values: { yearsOfExperience: value } }), { statusCode: 400 });
  }
  const profile = await registerMatchProfile(user, { values: { yearsOfExperience: 0 } });
  assert.equal(profile.values.yearsOfExperience, 0);
  assert.equal(create.mock.callCount(), 1);
});

test('prevents duplicate profile before configuration lookup or write', async (context) => {
  const { findProfile, findConfiguration, create } = isolate(context);
  findProfile.mock.mockImplementation(async () => ({ _id: 'existing' }));
  await assert.rejects(registerMatchProfile(user, { values: {} }), { statusCode: 409 });
  assert.equal(findConfiguration.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});

test('unique-index race becomes 409 without reporting success', async (context) => {
  const { create } = isolate(context);
  create.mock.mockImplementation(async () => {
    throw Object.assign(new Error('duplicate'), { code: 11000 });
  });
  await assert.rejects(registerMatchProfile(user, { values: {} }), { statusCode: 409 });
});

test('requires a published configuration before creating the profile', async (context) => {
  const { findConfiguration, create } = isolate(context);
  findConfiguration.mock.mockImplementation(() => ({ sort: async () => null }));
  await assert.rejects(registerMatchProfile(user, { values: {} }), { statusCode: 503 });
  assert.equal(create.mock.callCount(), 0);
});

test('requires an existing current candidate', async (context) => {
  const { findCandidate, create } = isolate(context);
  findCandidate.mock.mockImplementation(() => ({ select: async () => null }));
  await assert.rejects(registerMatchProfile(user, { values: {} }), { statusCode: 404 });
  assert.equal(create.mock.callCount(), 0);
});

for (const status of ['inactive', 'blocked']) {
  test(`rejects ${status} candidate without creating profile`, async (context) => {
    const { create } = isolate(context, status);
    await assert.rejects(registerMatchProfile(user, { values: {} }), { statusCode: 409 });
    assert.equal(create.mock.callCount(), 0);
  });
}

test('rejects company role before querying candidates', async (context) => {
  const { findCandidate, create } = isolate(context);
  await assert.rejects(registerMatchProfile({ id: user.id, role: 'company' }, { values: {} }), { statusCode: 403 });
  assert.equal(findCandidate.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});
