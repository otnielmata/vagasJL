const assert = require('node:assert/strict');
const { test } = require('node:test');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const configuration = { fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
  key, weight, options: key === 'apiTesting'
    ? [{ id: 'api-testing', label: 'API Testing', aliases: [] }] : [],
})) };
const multipliers = { required: 1, desirable: 0.5, indifferent: 0 };
const requirement = { field: 'apiTesting', id: 'api-testing', importance: 'required' };
const vacancyValues = { apiTesting: ['api-testing'] };

function score(candidateValues, overrides = {}) {
  return calculateCompetencyMatch({ configuration, multipliers, vacancyValues,
    candidateValues, requirements: [requirement], ...overrides });
}

test('identified boolean true earns its full configured effective weight once', () => {
  const result = score({ apiTesting: true, hasGenAI: true }, {
    requirements: [requirement, { ...requirement }],
  });
  assert.equal(result.possiblePoints, 7);
  assert.equal(result.earnedPoints, 7);
  assert.equal(result.percentage, 100);
  assert.deepEqual(result.details, [{ field: 'apiTesting', id: 'api-testing', weight: 7, earnedPoints: 7 }]);
  const desirable = score({ apiTesting: ['api-testing'] }, {
    requirements: [{ ...requirement, importance: 'desirable' }],
  });
  assert.equal(desirable.possiblePoints, 3.5);
  assert.equal(desirable.earnedPoints, 3.5);
});

test('false, unknown and missing candidate values earn zero without removing possible points', () => {
  for (const candidateValues of [{ apiTesting: false }, { apiTesting: [] },
    { apiTesting: 'UNKNOWN' }, { apiTesting: null }, {}]) {
    const result = score(candidateValues);
    assert.equal(result.earnedPoints, 0);
    assert.equal(result.possiblePoints, 7);
    assert.equal(result.percentage, 0);
  }
});

test('imported false/false and absent requirement never award points', () => {
  const result = score({ apiTesting: false }, { vacancy: { origin: 'IMPORTED' },
    vacancyValues: { apiTesting: false }, requirements: [] });
  assert.equal(result.earnedPoints, 0);
  assert.equal(result.possiblePoints, 0);
  assert.equal(result.percentage, null);
  assert.equal(result.technicalCompatibility, 'not_calculable');
  assert.deepEqual(result.details, []);
});

test('unmet eliminatory boolean changes eligibility but never adds a second penalty', () => {
  const result = score({ apiTesting: false }, {
    requirements: [{ ...requirement, eliminatory: true }],
  });
  assert.equal(result.percentage, 0);
  assert.equal(result.possiblePoints, 7);
  assert.equal(result.details.length, 1);
  assert.deepEqual(result.eligibility.reason,
    { code: 'ELIMINATORY_REQUIREMENT_UNMET', field: 'apiTesting', id: 'api-testing' });
  assert.equal(score({ apiTesting: false }, { eliminatoryPolicyEnabled: false }).percentage, 0);
});

test('boolean true is not inferred for a non-boolean catalog field', () => {
  const result = calculateCompetencyMatch({ configuration: {
    fields: configuration.fields.map((field) => field.key === 'type'
      ? { ...field, options: [{ id: 'remote', label: 'Remoto', aliases: [] }] } : field),
  }, multipliers, vacancyValues: { type: ['remote'] }, candidateValues: { type: true },
  requirements: [{ field: 'type', id: 'remote', importance: 'required' }] });
  assert.equal(result.earnedPoints, 0);
  assert.equal(result.possiblePoints, 8);
});
