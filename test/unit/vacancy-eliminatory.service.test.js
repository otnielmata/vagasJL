require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Vacancy = require('../../src/models/vacancy.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { validateRequirements } = require('../../src/services/vacancy-requirements.service');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const configuration = { version: 1, fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({
  key, weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'type'
    ? [{ id: 'remote', label: 'Remoto', aliases: [] },
      { id: 'onsite', label: 'Presencial', aliases: [] }] : [],
})) };
const requirement = { field: 'type', id: 'remote', importance: 'required', eliminatory: true };

test('eliminatory flag defaults to false in the persisted requirement model', () => {
  const vacancy = new Vacancy({ origin: 'ADMIN', createdBy: '6512f1e2b3a1c2d3e4f5a6b7',
    title: 'QA', description: 'Testes', matchProfile: { configurationVersion: 1,
      values: { type: ['remote'] }, requirements: [{ field: 'type', id: 'remote', importance: 'required' }] } });
  assert.equal(vacancy.validateSync(), undefined);
  assert.equal(vacancy.matchProfile.requirements[0].eliminatory, false);
  assert.equal(vacancy.toJSON().matchProfile.requirements[0].eliminatory, false);
});

test('explicit canonical requirement accepts eliminatory true and preserves technical weight', () => {
  const validated = validateRequirements([requirement], { type: ['remote'] }, configuration, true);
  assert.deepEqual(validated, [requirement]);
  const score = calculateCompetencyMatch({ vacancyValues: { type: ['remote'] },
    candidateValues: { type: ['remote'] }, configuration, requirements: validated });
  assert.equal(score.percentage, 100);
  assert.equal(score.possiblePoints, 8);
  assert.deepEqual(score.eligibility, { eligible: true, reason: null });
});

test('unmet or unknown eliminatory criterion yields structured ineligibility without extra penalty', () => {
  const base = { vacancyValues: { type: ['remote'] }, configuration, requirements: [requirement] };
  for (const candidateValues of [{}, { type: ['onsite'] }, { type: ['UNKNOWN'] }]) {
    const score = calculateCompetencyMatch({ ...base, candidateValues });
    assert.equal(score.percentage, 0);
    assert.equal(score.possiblePoints, 8);
    assert.equal(score.earnedPoints, 0);
    assert.deepEqual(score.eligibility, { eligible: false, reason: {
      code: 'ELIMINATORY_REQUIREMENT_UNMET', field: 'type', id: 'remote',
    } });
  }
});

test('required without explicit flag affects points but not eligibility', () => {
  const score = calculateCompetencyMatch({ vacancyValues: { type: ['remote'] },
    candidateValues: {}, configuration,
    requirements: [{ field: 'type', id: 'remote', importance: 'required' }] });
  assert.equal(score.percentage, 0);
  assert.deepEqual(score.eligibility, { eligible: true, reason: null });
});

test('numeric eliminatory level requires candidate to meet or exceed threshold', () => {
  const numeric = { field: 'yearsOfExperience', value: 3, importance: 'desirable', eliminatory: true };
  const values = { yearsOfExperience: 3 };
  assert.deepEqual(validateRequirements([numeric], values, configuration), [numeric]);
  const base = { vacancyValues: values, configuration, requirements: [numeric], desirableFactor: 0.25 };
  const unmatched = calculateCompetencyMatch({ ...base, candidateValues: { yearsOfExperience: 2 } });
  const matched = calculateCompetencyMatch({ ...base, candidateValues: { yearsOfExperience: 3 } });
  assert.equal(unmatched.eligibility.eligible, false);
  assert.equal(unmatched.possiblePoints, 2.25);
  assert.equal(matched.eligibility.eligible, true);
  assert.equal(matched.percentage, 100);
});

test('disabled policy preserves percentage while not eliminating candidate', () => {
  const base = { vacancyValues: { type: ['remote'] }, candidateValues: {}, configuration,
    requirements: [requirement] };
  const enabled = calculateCompetencyMatch(base);
  const disabled = calculateCompetencyMatch({ ...base, eliminatoryPolicyEnabled: false });
  assert.equal(enabled.percentage, disabled.percentage);
  assert.equal(enabled.eligibility.eligible, false);
  assert.equal(disabled.eligibility.eligible, true);
});

test('indifferent, free text and nonboolean eliminatory combinations are rejected', () => {
  for (const input of [
    [{ ...requirement, importance: 'indifferent' }],
    [{ ...requirement, id: 'description-only' }],
    [{ ...requirement, eliminatory: 'true' }],
    [{ field: 'testingRelatedKeywords', id: 'smoke', importance: 'required', eliminatory: true }],
  ]) {
    assert.throws(() => validateRequirements(input, { type: ['remote'] }, configuration),
      { statusCode: 400 });
  }
});
