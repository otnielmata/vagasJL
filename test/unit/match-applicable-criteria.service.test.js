const assert = require('node:assert/strict');
const { test } = require('node:test');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const configuration = { version: 3, fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({
  key, weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'testAutomationTechnologies'
    ? [{ id: 'cypress', label: 'Cypress', aliases: [] }]
    : key === 'automation' ? [{ id: 'automated', label: 'Automacao', aliases: [] }]
      : key === 'type' ? [{ id: 'remote', label: 'Remoto', aliases: [] }] : [],
})) };
const multipliers = { required: 1, desirable: 0.5, indifferent: 0 };

test('only classified applicable requirements form numerator and denominator', () => {
  const result = calculateCompetencyMatch({ configuration, multipliers,
    vacancy: { origin: 'IMPORTED' },
    vacancyValues: { testAutomationTechnologies: ['cypress'], automation: ['automated'],
      type: ['remote'], apiTesting: false, testingRelatedKeywords: ['Cypress'] },
    candidateValues: { testAutomationTechnologies: ['cypress'], automation: [],
      apiTesting: false, hasGenAI: true },
    requirements: [
      { field: 'testAutomationTechnologies', id: 'cypress', importance: 'required' },
      { field: 'automation', id: 'automated', importance: 'required' },
      { field: 'type', id: 'remote', importance: 'indifferent' },
    ] });
  assert.equal(result.earnedPoints, 10);
  assert.equal(result.possiblePoints, 15);
  assert.equal(result.percentage, 66.67);
  assert.equal(result.calculationStatus, 'calculable');
  assert.deepEqual(result.details.map((detail) => detail.field),
    ['testAutomationTechnologies', 'automation']);
});

test('desirable weight affects both sides while unknown candidate earns zero', () => {
  const result = calculateCompetencyMatch({ configuration, multipliers,
    vacancyValues: { testAutomationTechnologies: ['cypress'], automation: ['automated'] },
    candidateValues: { testAutomationTechnologies: ['cypress'] },
    requirements: [
      { field: 'testAutomationTechnologies', id: 'cypress', importance: 'desirable' },
      { field: 'automation', id: 'automated', importance: 'required' },
    ] });
  assert.equal(result.earnedPoints, 5);
  assert.equal(result.possiblePoints, 10);
  assert.equal(result.percentage, 50);
});

test('identical repeated canonical requirement contributes once, conflicting duplicate is rejected', () => {
  const requirement = { field: 'testAutomationTechnologies', id: 'cypress', importance: 'required' };
  const input = { configuration, multipliers,
    vacancyValues: { testAutomationTechnologies: ['cypress'] },
    candidateValues: { testAutomationTechnologies: ['cypress'] } };
  const result = calculateCompetencyMatch({ ...input, requirements: [requirement, { ...requirement }] });
  assert.equal(result.earnedPoints, 10);
  assert.equal(result.possiblePoints, 10);
  assert.equal(result.details.length, 1);
  assert.throws(() => calculateCompetencyMatch({ ...input, requirements: [requirement,
    { ...requirement, importance: 'desirable' }] }), /duplicado conflitante/);
});

test('zero applicable points is explicitly not calculable for every origin', () => {
  for (const origin of ['IMPORTED', 'COMPANY', 'ADMIN']) {
    const result = calculateCompetencyMatch({ configuration, multipliers, vacancy: { origin },
      vacancyValues: { type: ['remote'] }, candidateValues: { type: ['remote'] },
      requirements: [{ field: 'type', id: 'remote', importance: 'indifferent' }] });
    assert.equal(result.earnedPoints, 0);
    assert.equal(result.possiblePoints, 0);
    assert.equal(result.percentage, null);
    assert.equal(result.calculationStatus, 'not_calculable');
  }
});

test('numeric threshold and eliminatory decision remain separate from score', () => {
  const input = { configuration, multipliers, vacancyValues: { yearsOfExperience: 3 },
    candidateValues: { yearsOfExperience: 2 }, requirements: [{
      field: 'yearsOfExperience', value: 3, importance: 'required', eliminatory: true,
    }] };
  const result = calculateCompetencyMatch(input);
  assert.equal(result.possiblePoints, 9);
  assert.equal(result.earnedPoints, 6);
  assert.equal(result.percentage, 66.67);
  assert.equal(result.eligibility.eligible, false);
  const disabled = calculateCompetencyMatch({ ...input, eliminatoryPolicyEnabled: false });
  assert.equal(disabled.percentage, result.percentage);
  assert.equal(disabled.eligibility.eligible, true);
});
