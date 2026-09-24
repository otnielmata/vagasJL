require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Configuration = require('../../src/models/match-profile-configuration.model');
const ImportConfiguration = require('../../src/models/import-importance-configuration.model');
const Vacancy = require('../../src/models/vacancy.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');
const { registerImportedVacancy } = require('../../src/services/vacancy-origin.service');

const configuration = { version: 1, fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
  key, weight, options: [],
})) };
const multipliers = { required: 1, desirable: 0.5, indifferent: 0 };
const requirement = { field: 'yearsOfExperience', value: 3, importance: 'required' };

function score(candidateValues, overrides = {}) {
  return calculateCompetencyMatch({ configuration, multipliers,
    vacancyValues: { yearsOfExperience: 3 }, candidateValues,
    requirements: [requirement], ...overrides });
}

test('experience above the minimum is capped at all possible points', () => {
  for (const experience of [3, 4, 100]) {
    const result = score({ yearsOfExperience: experience });
    assert.equal(result.possiblePoints, 9);
    assert.equal(result.earnedPoints, 9);
    assert.equal(result.percentage, 100);
    assert.deepEqual(result.groups, [{ field: 'yearsOfExperience',
      earnedPoints: 9, possiblePoints: 9, percentage: 100 }]);
  }
});

test('partial experience earns its fraction of the published effective weight', () => {
  const result = score({ yearsOfExperience: 2 });
  assert.equal(result.earnedPoints, 6);
  assert.equal(result.possiblePoints, 9);
  assert.equal(result.percentage, 66.67);
  assert.equal(result.eligibility.eligible, true);

  const desirable = score({ yearsOfExperience: 2 }, {
    requirements: [{ ...requirement, importance: 'desirable' }],
  });
  assert.equal(desirable.earnedPoints, 3);
  assert.equal(desirable.possiblePoints, 4.5);
  assert.equal(desirable.percentage, 66.67);
  assert.equal(score({ yearsOfExperience: 0 }).earnedPoints, 0);
  assert.equal(score({}).earnedPoints, 0);
});

test('insufficient eliminatory experience stays ineligible despite partial credit', () => {
  const input = { requirements: [{ ...requirement, eliminatory: true }] };
  const result = score({ yearsOfExperience: 2 }, input);
  assert.equal(result.earnedPoints, 6);
  assert.equal(result.percentage, 66.67);
  assert.deepEqual(result.eligibility.reason, { code: 'ELIMINATORY_REQUIREMENT_UNMET',
    field: 'yearsOfExperience', value: 3 });
  assert.equal(result.eligibility.eligible, false);
  assert.equal(score({ yearsOfExperience: 3 }, input).eligibility.eligible, true);
  assert.equal(score({ yearsOfExperience: 2 }, {
    ...input, eliminatoryPolicyEnabled: false,
  }).eligibility.eligible, true);
});

test('imported zero is not applicable, while company and admin may explicitly require zero', () => {
  const zeroRequirement = [{ field: 'yearsOfExperience', value: 0, importance: 'required' }];
  const base = { vacancyValues: { yearsOfExperience: 0 }, requirements: zeroRequirement };
  const imported = score({ yearsOfExperience: 0 }, { ...base, vacancy: { origin: 'IMPORTED' } });
  assert.equal(imported.possiblePoints, 0);
  assert.equal(imported.earnedPoints, 0);
  assert.equal(imported.percentage, null);
  assert.deepEqual(imported.groups, []);
  for (const origin of ['COMPANY', 'ADMIN']) {
    const explicit = score({ yearsOfExperience: 0 }, { ...base, vacancy: { origin } });
    assert.equal(explicit.possiblePoints, 9);
    assert.equal(explicit.earnedPoints, 9);
    assert.equal(explicit.percentage, 100);
    assert.equal(score({}, { ...base, vacancy: { origin } }).earnedPoints, 0);
  }
});

test('invalid numeric precision, range or non-finite experience is rejected', () => {
  for (const value of [-1, 101, 1.25, Infinity, NaN, '2', true]) {
    assert.throws(() => score({ yearsOfExperience: value }), /Experiencia do candidato invalida/);
    assert.throws(() => score({}, { vacancyValues: { yearsOfExperience: value },
      requirements: [{ ...requirement, value }] }), /Experiencia invalida/);
  }
});

test('imported zero is removed before publication and never creates an automatic requirement', async (context) => {
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  const importConfig = context.mock.method(ImportConfiguration, 'findOne', () => {
    throw new Error('zero must not load importance configuration');
  });
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  context.mock.method(Vacancy, 'findOne', async () => null);
  context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
  for (const submitted of [0, { value: 0, identified: true }]) {
    const vacancy = await registerImportedVacancy({ source: 'board', sourceId: 'job-zero' }, {
      reference: 'job-zero', title: 'QA', description: 'Experiencia nao identificada',
      matchProfile: { values: { yearsOfExperience: submitted } },
    });
    assert.equal(vacancy.validateSync(), undefined);
    assert.deepEqual(vacancy.matchProfile.values.toObject(), {});
    assert.equal(vacancy.matchProfile.requirements.length, 0);
    assert.equal(vacancy.importImportance, null);
  }
  assert.equal(importConfig.mock.callCount(), 0);
});
