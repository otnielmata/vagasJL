require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Vacancy = require('../../src/models/vacancy.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const ImportConfiguration = require('../../src/models/import-importance-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { registerImportedVacancy } = require('../../src/services/vacancy-origin.service');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');
const { validateRequirements } = require('../../src/services/vacancy-requirements.service');

const configuration = { version: 1, fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
  key, weight, options: key === 'level' ? [{ id: 'junior', label: 'Júnior', aliases: [] }]
    : key === 'type' ? [{ id: 'remote', label: 'Remoto', aliases: [] }] : [],
})) };
const multipliers = { required: 1, desirable: 0.5, indifferent: 0 };

function setup(context, importance = 'desirable') {
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  const importConfig = context.mock.method(ImportConfiguration, 'findOne', () => ({
    sort: async () => ({ version: 1, importance }),
  }));
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  context.mock.method(Vacancy, 'findOne', async () => null);
  context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
  return { importConfig };
}

function input(level) {
  return { reference: 'job-56', title: 'QA', description: 'Senior QA em texto livre',
    matchProfile: { values: { level } } };
}

test('unknown imported level is omitted, audited privately and never scored or eliminatory', async (context) => {
  const { importConfig } = setup(context);
  for (const level of ['unknown', 'Desconhecido', { id: 'unknown', identified: true },
    ['DESCONHECIDA']]) {
    const vacancy = await registerImportedVacancy({ source: 'board', sourceId: 'job-56' }, input(level));
    assert.equal(vacancy.validateSync(), undefined);
    assert.deepEqual(vacancy.matchProfile.values.toObject(), {});
    assert.equal(vacancy.matchProfile.requirements.length, 0);
    assert.equal(vacancy.importImportance, null);
    assert.equal(vacancy.importMappingAudit.unknownLevel, true);
    assert.equal(vacancy.toJSON().importMappingAudit, undefined);
    const score = calculateCompetencyMatch({ configuration, multipliers,
      vacancy: { origin: 'IMPORTED' }, vacancyValues: vacancy.matchProfile.values.toObject(),
      candidateValues: { level: ['junior'] }, requirements: vacancy.matchProfile.requirements });
    assert.equal(score.possiblePoints, 0);
    assert.equal(score.earnedPoints, 0);
    assert.equal(score.percentage, null);
    assert.equal(score.eligibility.eligible, true);
  }
  assert.equal(importConfig.mock.callCount(), 0);
});

test('known imported level uses the canonical catalog and published importance', async (context) => {
  setup(context);
  const vacancy = await registerImportedVacancy({ source: 'board', sourceId: 'job-57' },
    input({ id: 'junior', identified: true }));
  assert.deepEqual(vacancy.matchProfile.values.level, ['junior']);
  assert.equal(vacancy.importMappingAudit.unknownLevel, false);
  assert.equal(vacancy.matchProfile.requirements[0].id, 'junior');
  const score = calculateCompetencyMatch({ configuration, multipliers,
    vacancy: { origin: 'IMPORTED' }, vacancyValues: vacancy.matchProfile.values.toObject(),
    candidateValues: { level: ['junior'] }, requirements: vacancy.matchProfile.requirements });
  assert.equal(score.earnedPoints, 5);
  assert.equal(score.possiblePoints, 5);
  assert.equal(score.percentage, 100);
});

test('legacy imported unknown requirement is ignored even when eliminatory', () => {
  const score = calculateCompetencyMatch({ configuration, multipliers,
    vacancy: { origin: 'IMPORTED' }, vacancyValues: { level: ['unknown'] },
    candidateValues: { level: ['junior'] },
    requirements: [{ field: 'level', id: 'unknown', importance: 'required', eliminatory: true }] });
  assert.equal(score.possiblePoints, 0);
  assert.equal(score.earnedPoints, 0);
  assert.equal(score.eligibility.eligible, true);
  assert.deepEqual(score.details, []);
  const legacy = calculateCompetencyMatch({ configuration, vacancy: { origin: 'IMPORTED' },
    vacancyValues: { level: ['unknown'] }, candidateValues: { level: ['junior'] } });
  assert.equal(legacy.possiblePoints, 0);
  assert.equal(legacy.eligibility.eligible, true);
  assert.throws(() => validateRequirements([{ field: 'level', id: 'unknown', importance: 'required' }],
    { level: ['unknown'] }, configuration), { statusCode: 400 });
});
