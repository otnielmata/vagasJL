require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Vacancy = require('../../src/models/vacancy.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const ImportConfiguration = require('../../src/models/import-importance-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { registerImportedVacancy } = require('../../src/services/vacancy-origin.service');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const configuration = { version: 1, fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({
  key, weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'automation'
    ? [{ id: 'cypress', label: 'Cypress', aliases: [] }] : [],
})) };
const provenance = { source: 'board', sourceId: 'job-49' };
const input = { reference: 'job-49', title: 'QA', description: 'Cypress', matchProfile: {
  values: { automation: [{ id: 'cypress', identified: true },
    { id: 'cypress', identified: true }], webTesting: false },
} };

function setup(context, importance = 'desirable') {
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  context.mock.method(ImportConfiguration, 'findOne', () => ({ sort: async () => importance
    ? { version: 2, importance } : null }));
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  context.mock.method(Vacancy, 'findOne', async () => null);
  return context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
}

test('true canonical IDs receive one configurable non-eliminatory requirement with audit', async (context) => {
  setup(context);
  const vacancy = await registerImportedVacancy(provenance, input);
  assert.equal(vacancy.validateSync(), undefined);
  assert.equal(vacancy.status, 'pending');
  assert.equal(vacancy.importImportance.version, 2);
  assert.equal(vacancy.importImportance.importance, 'desirable');
  assert.equal(vacancy.requirementsRevision, 1);
  assert.equal(vacancy.requirementsHistory[0].process, 'import');
  assert.equal(vacancy.matchProfile.requirements.length, 1);
  assert.equal(vacancy.matchProfile.requirements[0].eliminatory, false);
  assert.equal(vacancy.matchProfile.values.webTesting, undefined);
  const score = calculateCompetencyMatch({ vacancyValues: vacancy.matchProfile.values.toObject(),
    candidateValues: { automation: ['cypress'] }, configuration,
    requirements: vacancy.matchProfile.requirements, vacancy: { origin: 'IMPORTED' } });
  assert.equal(score.possiblePoints, INITIAL_MATCH_WEIGHTS.automation * 0.5);
  assert.equal(score.earnedPoints, score.possiblePoints);
  assert.equal(score.details.length, 1);
});

test('unpublished default blocks true processing but not false-only imports', async (context) => {
  const create = setup(context, null);
  await assert.rejects(registerImportedVacancy(provenance, input), { statusCode: 409 });
  assert.equal(create.mock.callCount(), 0);
  const vacancy = await registerImportedVacancy(provenance, { ...input,
    matchProfile: { values: { automation: false } } });
  assert.equal(vacancy.importImportance, null);
});

test('bare true and non-canonical IDs fail without persisting vacancy', async (context) => {
  const create = setup(context);
  await assert.rejects(registerImportedVacancy(provenance, { ...input,
    matchProfile: { values: { automation: true } } }), { statusCode: 400 });
  await assert.rejects(registerImportedVacancy(provenance, { ...input,
    matchProfile: { values: { automation: { id: 'unknown', identified: true } } } }),
  { statusCode: 400 });
  assert.equal(create.mock.callCount(), 0);
});

test('indifferent true requirement remains non-scoring', async (context) => {
  setup(context, 'indifferent');
  const vacancy = await registerImportedVacancy(provenance, input);
  const score = calculateCompetencyMatch({ vacancyValues: vacancy.matchProfile.values.toObject(),
    candidateValues: { automation: ['cypress'] }, configuration,
    requirements: vacancy.matchProfile.requirements, vacancy: { origin: 'IMPORTED' } });
  assert.equal(score.possiblePoints, 0);
  assert.equal(score.percentage, null);
});

test('new configuration never changes a previously imported vacancy', async (context) => {
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  let current = { version: 1, importance: 'desirable' };
  context.mock.method(ImportConfiguration, 'findOne', () => ({ sort: async () => current }));
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  context.mock.method(Vacancy, 'findOne', async () => null);
  context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
  const earlier = await registerImportedVacancy(provenance, input);
  current = { version: 2, importance: 'required' };
  const later = await registerImportedVacancy({ ...provenance, sourceId: 'job-50' },
    { ...input, reference: 'job-50' });
  assert.equal(earlier.importImportance.version, 1);
  assert.equal(earlier.matchProfile.requirements[0].importance, 'desirable');
  assert.equal(later.importImportance.version, 2);
  assert.equal(later.matchProfile.requirements[0].importance, 'required');
});
