const assert = require('node:assert/strict');
const { test } = require('node:test');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

function configuration() {
  return { version: 1, fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
    key, weight,
    options: key === 'testAutomationTechnologies' ? [
      { id: 'cypress', label: 'Cypress', aliases: ['Cypress.io', 'Cypress Framework'] },
      { id: 'cypress_recorder', label: 'Cypress Recorder', aliases: [] },
    ] : key === 'genAITools' ? [
      { id: 'chatgpt', label: 'ChatGPT', aliases: ['Chat GPT'] },
    ] : [],
  })) };
}

test('ChatGPT scores once from genAITools and never from hasGenAI or tool count', () => {
  const input = {
    vacancyValues: { genAITools: ['ChatGPT', 'chatgpt'], hasGenAI: true, amountOfGenAITools: 2 },
    candidateValues: { genAITools: ['Chat GPT'], hasGenAI: true, amountOfGenAITools: 1 },
    configuration: configuration(),
  };
  const result = calculateCompetencyMatch(input);
  assert.equal(result.percentage, 100);
  assert.equal(result.earnedPoints, 5);
  assert.equal(result.possiblePoints, 5);
  assert.deepEqual(result.details, [
    { field: 'genAITools', id: 'chatgpt', weight: 5, earnedPoints: 5 },
  ]);
  assert.deepEqual(calculateCompetencyMatch({ ...input,
    vacancyValues: { genAITools: ['chatgpt'], hasGenAI: false, amountOfGenAITools: 999 },
    candidateValues: { genAITools: ['chatgpt'], hasGenAI: false },
  }), result);
});

test('Cypress aliases on both sides collapse to one canonical contribution', () => {
  const result = calculateCompetencyMatch({
    vacancyValues: { testAutomationTechnologies: ['Cypress', 'cypress.io', 'CYPRESS FRAMEWORK'] },
    candidateValues: { testAutomationTechnologies: ['cypress', 'Cypress.io'] },
    configuration: configuration(),
  });
  assert.equal(result.earnedPoints, 10);
  assert.equal(result.possiblePoints, 10);
  assert.deepEqual(result.details, [
    { field: 'testAutomationTechnologies', id: 'cypress', weight: 10, earnedPoints: 10 },
  ]);
});

test('legacy duplicate IDs do not multiply numerator or denominator', () => {
  const baseline = calculateCompetencyMatch({
    vacancyValues: { testAutomationTechnologies: ['cypress'] },
    candidateValues: { testAutomationTechnologies: ['cypress'] }, configuration: configuration(),
  });
  const repeated = calculateCompetencyMatch({
    vacancyValues: { testAutomationTechnologies: ['cypress', 'cypress', 'Cypress'] },
    candidateValues: { testAutomationTechnologies: ['cypress', 'cypress', 'Cypress Framework'] },
    configuration: configuration(),
  });
  assert.deepEqual(repeated, baseline);
});

test('distinct canonical IDs remain separate even with similar display labels', () => {
  const result = calculateCompetencyMatch({
    vacancyValues: { testAutomationTechnologies: ['cypress', 'cypress_recorder'] },
    candidateValues: { testAutomationTechnologies: ['Cypress Recorder', 'Cypress'] },
    configuration: configuration(),
  });
  assert.equal(result.earnedPoints, 20);
  assert.equal(result.possiblePoints, 20);
  assert.deepEqual(result.details.map(({ id }) => id), ['cypress', 'cypress_recorder']);
});

test('missing one distinct requirement preserves its denominator and shows one missed entry', () => {
  const result = calculateCompetencyMatch({
    vacancyValues: { testAutomationTechnologies: ['cypress', 'cypress_recorder'] },
    candidateValues: { testAutomationTechnologies: ['cypress'] },
    configuration: configuration(),
  });
  assert.equal(result.percentage, 50);
  assert.equal(result.earnedPoints, 10);
  assert.equal(result.possiblePoints, 20);
  assert.equal(result.details[1].earnedPoints, 0);
});

test('configured weight applies once per distinct canonical ID', () => {
  const config = configuration();
  config.fields.find((field) => field.key === 'testAutomationTechnologies').weight = 7;
  const result = calculateCompetencyMatch({
    vacancyValues: { testAutomationTechnologies: ['cypress', 'cypress_recorder'] },
    candidateValues: { testAutomationTechnologies: ['cypress'] }, configuration: config,
  });
  assert.equal(result.earnedPoints, 7);
  assert.equal(result.possiblePoints, 14);
});

test('comparison does not mutate legacy inputs', () => {
  const vacancyValues = { testAutomationTechnologies: ['Cypress', 'cypress'] };
  const candidateValues = { testAutomationTechnologies: ['Cypress.io', 'cypress'] };
  const originalVacancy = JSON.stringify(vacancyValues);
  const originalCandidate = JSON.stringify(candidateValues);
  calculateCompetencyMatch({ vacancyValues, candidateValues, configuration: configuration() });
  assert.equal(JSON.stringify(vacancyValues), originalVacancy);
  assert.equal(JSON.stringify(candidateValues), originalCandidate);
});

test('unknown free text is rejected instead of scored by textual similarity', () => {
  assert.throws(() => calculateCompetencyMatch({
    vacancyValues: { testAutomationTechnologies: ['Cypress-like'] },
    candidateValues: { testAutomationTechnologies: ['cypress'] }, configuration: configuration(),
  }), TypeError);
});

test('missing competencies and derived-only data create no implicit points', () => {
  const result = calculateCompetencyMatch({
    vacancyValues: { hasGenAI: true, amountOfGenAITools: 5 },
    candidateValues: { hasGenAI: true, amountOfGenAITools: 5 }, configuration: configuration(),
  });
  assert.equal(result.percentage, 0);
  assert.deepEqual(result.details, []);
});
