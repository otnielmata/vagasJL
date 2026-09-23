require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const configuration = { fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
  key, weight, options: key === 'apiTesting'
    ? [{ id: 'api-testing', label: 'API Testing', aliases: [] }] : [],
})) };
const input = { vacancyValues: { apiTesting: ['api-testing'] }, configuration,
  requirements: [{ field: 'apiTesting', id: 'api-testing', importance: 'required' }],
  multipliers: { required: 1, desirable: 0.5, indifferent: 0 },
  vacancy: { origin: 'COMPANY' } };

test('engagement data has zero contribution to technical numerator and denominator', () => {
  const engaged = calculateCompetencyMatch({ ...input, candidateValues: {
    apiTesting: ['api-testing'], engagementLevel: 'Alto', challengesCompleted: 100, score: 9999,
  } });
  const withoutChallenges = calculateCompetencyMatch({ ...input,
    candidateValues: { apiTesting: ['api-testing'], challengesCompleted: 0, score: 0 } });
  assert.deepEqual(engaged, withoutChallenges);
  assert.deepEqual([engaged.earnedPoints, engaged.possiblePoints, engaged.percentage], [7, 7, 100]);
});
