require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Configuration = require('../../src/models/match-profile-configuration.model');
const Vacancy = require('../../src/models/vacancy.model');
const ImportConfiguration = require('../../src/models/import-importance-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');
const { registerImportedVacancy } = require('../../src/services/vacancy-origin.service');

const configuration = { version: 1, fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
  key, weight, options: key === 'type' ? [
    { id: 'remote', label: 'Remoto', aliases: [] },
    { id: 'hybrid', label: 'Hibrido', aliases: [] },
    { id: 'onsite', label: 'Presencial', aliases: [] },
  ] : [],
})) };
const multipliers = { required: 1, desirable: 0.5, indifferent: 0 };

test('remote principal modality matches one of several candidate modalities at full weight', () => {
  const score = calculateCompetencyMatch({ configuration, multipliers,
    vacancyValues: { type: ['remote'] }, candidateValues: { type: ['remote', 'hybrid'] },
    requirements: [{ field: 'type', id: 'remote', importance: 'desirable' }] });
  assert.deepEqual([score.earnedPoints, score.possiblePoints, score.percentage], [4, 4, 100]);
  assert.deepEqual(score.details.map(({ field, id }) => ({ field, id })), [{ field: 'type', id: 'remote' }]);
});

test('different modalities receive zero without removing principal modality from denominator', () => {
  const score = calculateCompetencyMatch({ configuration, multipliers,
    vacancyValues: { type: ['onsite'] }, candidateValues: { type: ['remote', 'hybrid'] },
    requirements: [{ field: 'type', id: 'onsite', importance: 'required' }] });
  assert.deepEqual([score.earnedPoints, score.possiblePoints, score.percentage], [0, 8, 0]);
  const legacy = calculateCompetencyMatch({ configuration, vacancyValues: { type: ['onsite'] },
    candidateValues: { type: ['remote'] } });
  assert.deepEqual([legacy.earnedPoints, legacy.possiblePoints], [0, 8]);
});

test('legacy vacancy with multiple principal modalities cannot double score', () => {
  assert.throws(() => calculateCompetencyMatch({ configuration,
    vacancyValues: { type: ['remote', 'onsite'] }, candidateValues: { type: ['remote'] } }),
  { name: 'TypeError' });
});

test('unidentified imported modality never scores or eliminates, including legacy requirements', async (context) => {
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  context.mock.method(Vacancy, 'findOne', async () => null);
  context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
  for (const type of [false, 'unknown', { id: 'unknown', identified: true }]) {
    const vacancy = await registerImportedVacancy({ source: 'board', sourceId: 'vj-57' }, {
      reference: 'vj-57', title: 'QA', description: 'Sem modalidade identificada',
      matchProfile: { values: { type } },
    });
    assert.equal(vacancy.matchProfile.values.type, undefined);
    assert.equal(vacancy.matchProfile.requirements.length, 0);
    const score = calculateCompetencyMatch({ configuration, multipliers,
      vacancy: { origin: 'IMPORTED' }, vacancyValues: vacancy.matchProfile.values.toObject(),
      candidateValues: { type: ['remote'] }, requirements: vacancy.matchProfile.requirements });
    assert.deepEqual([score.earnedPoints, score.possiblePoints, score.percentage], [0, 0, null]);
  }
  const legacy = calculateCompetencyMatch({ configuration, multipliers, vacancy: { origin: 'IMPORTED' },
    vacancyValues: { type: ['unknown'] }, candidateValues: { type: ['remote'] },
    requirements: [{ field: 'type', id: 'remote', importance: 'required', eliminatory: true }] });
  assert.equal(legacy.possiblePoints, 0);
  assert.equal(legacy.eligibility.eligible, true);
});

test('identified imported modality applies published default importance', async (context) => {
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  context.mock.method(ImportConfiguration, 'findOne', () => ({ sort: async () => ({
    version: 2, importance: 'desirable',
  }) }));
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  context.mock.method(Vacancy, 'findOne', async () => null);
  context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
  const vacancy = await registerImportedVacancy({ source: 'board', sourceId: 'remote-job' }, {
    reference: 'remote-job', title: 'QA', description: 'Modalidade identificada',
    matchProfile: { values: { type: { id: 'remote', identified: true } } },
  });
  assert.deepEqual(vacancy.matchProfile.values.type, ['remote']);
  assert.equal(vacancy.matchProfile.requirements[0].importance, 'desirable');
  const score = calculateCompetencyMatch({ configuration, multipliers,
    vacancy: { origin: 'IMPORTED' }, vacancyValues: vacancy.matchProfile.values.toObject(),
    candidateValues: { type: ['hybrid', 'remote'] }, requirements: vacancy.matchProfile.requirements });
  assert.deepEqual([score.earnedPoints, score.possiblePoints, score.percentage], [4, 4, 100]);
});
