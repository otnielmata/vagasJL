const assert = require('node:assert/strict');
const { test } = require('node:test');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const {
  calculateMatchScore,
  calculateCompetencyMatch,
  TECHNICAL_FIELDS,
  MATCH_V1_EXCLUDED_FIELDS,
  MATCH_SCORING_VERSION,
} = require('../../src/services/match-scoring.service');

function configuration() {
  return {
    version: 1,
    fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
      key, weight,
      options: key === 'apiTesting' ? [{ id: 'api-tests', label: 'Testes de API', aliases: [] }] : [],
    })),
  };
}

test('Match v1 explicitly excludes testingRelatedKeywords from technical criteria', () => {
  assert.equal(MATCH_SCORING_VERSION, 1);
  assert.equal(MATCH_V1_EXCLUDED_FIELDS.includes('testingRelatedKeywords'), true);
  assert.equal(TECHNICAL_FIELDS.includes('testingRelatedKeywords'), false);
  assert.equal(INITIAL_MATCH_WEIGHTS.testingRelatedKeywords, undefined);
});

test('free-text testing keywords cannot change percentage or point details', () => {
  const technicalResults = { apiTesting: { applicable: true, matched: true } };
  const baseline = calculateMatchScore({ technicalResults, configuration: configuration() });
  for (const value of [undefined, null, [], 'Testes de API', ['Teste de API', 'Ruído']]) {
    const result = calculateMatchScore({ technicalResults: {
      ...technicalResults, testingRelatedKeywords: value, amountOfTestingRelatedKeywords: 999,
    }, configuration: configuration() });
    assert.equal(result.percentage, baseline.percentage);
    assert.equal(result.earnedPoints, baseline.earnedPoints);
    assert.equal(result.possiblePoints, baseline.possiblePoints);
    assert.deepEqual(result.details, baseline.details);
  }
});

test('keyword counter changes never affect a competency comparison', () => {
  const baseline = calculateCompetencyMatch({
    vacancyValues: { apiTesting: ['api-tests'] },
    candidateValues: { apiTesting: ['api-tests'] }, configuration: configuration(),
  });
  for (const count of [null, 0, 1, 999]) {
    const result = calculateCompetencyMatch({
      vacancyValues: { apiTesting: ['api-tests'], amountOfTestingRelatedKeywords: count },
      candidateValues: { apiTesting: ['api-tests'], amountOfTestingRelatedKeywords: count },
      configuration: configuration(),
    });
    assert.deepEqual(result, baseline);
  }
});

test('legacy Testes de API text is not silently promoted into apiTesting ID', () => {
  const legacyVacancy = { testingRelatedKeywords: ['Testes de API'] };
  const legacyCandidate = { testingRelatedKeywords: ['Testes de API'] };
  const result = calculateCompetencyMatch({
    vacancyValues: legacyVacancy, candidateValues: legacyCandidate, configuration: configuration(),
  });
  assert.equal(result.percentage, 0);
  assert.equal(result.earnedPoints, 0);
  assert.equal(result.possiblePoints, 0);
  assert.deepEqual(result.details, []);
  assert.deepEqual(legacyVacancy, { testingRelatedKeywords: ['Testes de API'] });
  assert.deepEqual(legacyCandidate, { testingRelatedKeywords: ['Testes de API'] });
});

test('a separate controlled keyword catalog does not enable scoring in v1', () => {
  const config = configuration();
  config.testingKeywordCatalog = [{ id: 'api-tests', label: 'Testes de API' }];
  const result = calculateCompetencyMatch({
    vacancyValues: { testingRelatedKeywords: ['Testes de API'] },
    candidateValues: { testingRelatedKeywords: ['api-tests'] }, configuration: config,
  });
  assert.equal(result.percentage, 0);
  assert.deepEqual(result.details, []);
});

test('adding testingRelatedKeywords to scoring weights requires a new explicit version', () => {
  const config = configuration();
  config.fields.push({ key: 'testingRelatedKeywords', weight: 100, options: [] });
  assert.throws(() => calculateMatchScore({ technicalResults: {}, configuration: config }), TypeError);
  assert.throws(() => calculateCompetencyMatch({ vacancyValues: {}, candidateValues: {}, configuration: config }),
    TypeError);
});
