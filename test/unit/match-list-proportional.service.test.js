const assert = require('node:assert/strict');
const { test } = require('node:test');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const options = {
  testAutomationTechnologies: [
    { id: 'cypress', label: 'Cypress', aliases: ['Cypress.io', 'Cypress Framework'] },
    { id: 'playwright', label: 'Playwright', aliases: [] },
    { id: 'postman', label: 'Postman', aliases: [] },
    { id: 'selenium', label: 'Selenium', aliases: [] },
  ],
  programmingLanguages: [{ id: 'javascript', label: 'JavaScript', aliases: ['JS'] }],
};
const configuration = { version: 1, fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
  key, weight, options: options[key] || [],
})) };
const multipliers = { required: 1, desirable: 0.5, indifferent: 0 };
const field = 'testAutomationTechnologies';
const requirement = (id, importance = 'required') => ({ field, id, importance });
const vacancyValues = { [field]: ['Cypress', 'playwright', 'postman'] };
const requirements = [requirement('cypress'), requirement('playwright'), requirement('postman')];

function score(candidateValues, overrides = {}) {
  return calculateCompetencyMatch({ configuration, multipliers, vacancyValues,
    candidateValues, requirements, ...overrides });
}

test('two of three equally weighted list requirements yield 66.67%; extra skills do not hurt', () => {
  const candidateValues = { [field]: ['cypress', 'Postman', 'Selenium'] };
  const result = score(candidateValues);
  assert.equal(result.earnedPoints, 20);
  assert.equal(result.possiblePoints, 30);
  assert.equal(result.percentage, 66.67);
  assert.deepEqual(result.groups, [{ field, earnedPoints: 20, possiblePoints: 30, percentage: 66.67 }]);
  assert.equal(result.details.length, 3);
  assert.deepEqual(score({ [field]: ['cypress', 'Postman'] }).groups, result.groups);
  assert.deepEqual(candidateValues[field], ['cypress', 'Postman', 'Selenium']);
});

test('effective weights sum per applicable requirement, not per list or extra skill', () => {
  const result = score({ [field]: ['cypress', 'postman'] }, {
    requirements: [requirement('cypress'), requirement('playwright', 'desirable'),
      requirement('postman')],
  });
  assert.equal(result.earnedPoints, 20);
  assert.equal(result.possiblePoints, 25);
  assert.equal(result.percentage, 80);
  assert.deepEqual(result.groups, [{ field, earnedPoints: 20, possiblePoints: 25, percentage: 80 }]);

  const mixed = score({ [field]: ['cypress', 'postman'], programmingLanguages: [] }, {
    vacancyValues: { ...vacancyValues, programmingLanguages: ['javascript'] },
    requirements: [requirement('cypress'), {
      field: 'programmingLanguages', id: 'javascript', importance: 'desirable',
    }],
  });
  assert.equal(mixed.earnedPoints, 10);
  assert.equal(mixed.possiblePoints, 14.5);
  assert.equal(mixed.percentage, 68.97);
  assert.deepEqual(mixed.groups, [
    { field, earnedPoints: 10, possiblePoints: 10, percentage: 100 },
    { field: 'programmingLanguages', earnedPoints: 0, possiblePoints: 4.5, percentage: 0 },
  ]);
});

test('repeated IDs and aliases count once; free text and derived fields do not score', () => {
  const baseline = score({ [field]: ['cypress', 'postman'] });
  const repeated = score({ [field]: ['Cypress.io', 'Cypress Framework', 'cypress', 'Postman',
    'Selenium', 'free text'], hasGenAI: true, amountOfGenAITools: 3,
  }, { vacancyValues: { [field]: ['cypress', 'Cypress.io', 'playwright', 'postman'],
    hasGenAI: true, testingRelatedKeywords: ['free text'] },
  requirements: [requirement('cypress'), requirement('cypress'), requirement('playwright'),
    requirement('postman')] });
  assert.equal(repeated.earnedPoints, baseline.earnedPoints);
  assert.equal(repeated.possiblePoints, baseline.possiblePoints);
  assert.deepEqual(repeated.groups, baseline.groups);
  assert.equal(repeated.details.length, 3);
});

test('indifferent or unidentified items form no calculable list group', () => {
  const result = score({ [field]: ['cypress', 'postman'] }, {
    vacancy: { origin: 'IMPORTED' },
    vacancyValues: { [field]: ['cypress', 'postman'], apiTesting: false },
    requirements: [requirement('cypress', 'indifferent'), requirement('postman', 'indifferent')],
  });
  assert.equal(result.earnedPoints, 0);
  assert.equal(result.possiblePoints, 0);
  assert.equal(result.percentage, null);
  assert.equal(result.calculationStatus, 'not_calculable');
  assert.deepEqual(result.groups, []);
});
