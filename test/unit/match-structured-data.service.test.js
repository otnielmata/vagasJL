require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');
const { scorePair } = require('../../src/services/match-ranking.service');
const { auditData } = require('../../src/services/match-evaluation-audit.service');

const multipliers = { required: 1, desirable: 0.5, indifferent: 0 };
const configuration = { version: 12, fields: Object.entries(INITIAL_MATCH_WEIGHTS)
  .map(([key, weight]) => ({ key, weight, options: key === 'type'
    ? [{ id: 'remote', label: 'Remoto', aliases: [] }]
    : key === 'testAutomationTechnologies'
      ? [{ id: 'cypress', label: 'Cypress', aliases: ['Cypress.io', 'Cypress Framework'] }]
      : [] })) };
const candidate = { _id: '6512f1e2b3a1c2d3e4f5a6b7' };

function vacancy(description, overrides = {}) {
  return { _id: '6512f1e2b3a1c2d3e4f5a6b8', title: 'QA', description,
    origin: 'ADMIN', status: 'active', createdBy: '6512f1e2b3a1c2d3e4f5a6b9',
    company: null, importSource: null, importSourceId: null, deletedAt: null, expiresAt: null,
    requirementsRevision: 2, updatedAt: new Date('2026-09-23T15:00:00Z'),
    matchProfile: { configurationVersion: 12, values: {
      type: ['remote'], testAutomationTechnologies: ['cypress'],
    }, requirements: [
      { field: 'type', id: 'remote', importance: 'required' },
      { field: 'testAutomationTechnologies', id: 'cypress', importance: 'required' },
    ] }, ...overrides };
}

test('changing only vacancy description cannot change points, percentage or eligibility', () => {
  const candidateValues = { type: ['remote'], testAutomationTechnologies: ['cypress'] };
  const before = scorePair(vacancy('Cypress required'), candidateValues, configuration,
    multipliers, new Date(), candidate);
  const after = scorePair(vacancy('Completely unrelated marketing text'), candidateValues,
    configuration, multipliers, new Date(), candidate);
  assert.deepEqual(after, before);
});

test('canonical aliases collapse to one criterion and original text earns no points', () => {
  const result = calculateCompetencyMatch({
    vacancyValues: { testAutomationTechnologies: ['Cypress Framework', 'Cypress.io', 'cypress'] },
    candidateValues: { testAutomationTechnologies: ['Cypress.io'] }, configuration,
  });
  assert.equal(result.percentage, 100);
  assert.deepEqual(result.details, [{ field: 'testAutomationTechnologies', id: 'cypress',
    weight: 10, earnedPoints: 10 }]);
});

test('description without applicable structured requirements is not calculable', () => {
  const current = vacancy('Cypress Cypress Cypress', { matchProfile: {
    configurationVersion: 12, values: {}, requirements: [],
  } });
  const result = scorePair(current, { testAutomationTechnologies: ['cypress'] }, configuration,
    multipliers, new Date(), candidate);
  assert.equal(result.calculationStatus, 'not_calculable');
  assert.equal(result.percentage, null);
  assert.equal(result.possiblePoints, 0);
});

test('same structured pair and versions produce equivalent results in both directions', () => {
  const current = vacancy('Ignored text');
  const candidateValues = { type: ['remote'], testAutomationTechnologies: ['cypress'] };
  const candidateToVacancy = scorePair(current, candidateValues, configuration,
    multipliers, new Date(), candidate);
  const vacancyToCandidate = scorePair(current, candidateValues, configuration,
    multipliers, new Date(), candidate);
  assert.deepEqual(vacancyToCandidate, candidateToVacancy);
  const common = { candidate, vacancy: current,
    profile: { revision: 3, updatedAt: new Date('2026-09-23T14:00:00Z') },
    score: candidateToVacancy, cause: 'candidate_ranking', executionId: 'structured-v1',
    calculatedAt: new Date('2026-09-23T16:00:00Z'), algorithmVersion: 'MATCH_V4',
    versions: { engine: 'MATCH_V4', profileCatalog: 12, multipliers: 4,
      rankingThreshold: 4 } };
  const first = auditData(common);
  const second = auditData({ ...common, cause: 'vacancy_ranking' });
  assert.deepEqual(second.configurationVersions, first.configurationVersions);
  assert.deepEqual([second.percentage, second.earnedPoints, second.possiblePoints],
    [first.percentage, first.earnedPoints, first.possiblePoints]);
});

test('unpublished textual requirement is excluded and exposed as a safe diagnostic', () => {
  const result = calculateCompetencyMatch({ configuration, multipliers,
    vacancyValues: { testAutomationTechnologies: ['Cypress-like free text'] },
    candidateValues: { testAutomationTechnologies: ['cypress'] },
    requirements: [{ field: 'testAutomationTechnologies', id: 'Cypress-like free text',
      importance: 'required' }] });
  assert.equal(result.calculationStatus, 'not_calculable');
  assert.equal(result.percentage, null);
  assert.deepEqual(result.details, []);
  assert.deepEqual(result.diagnostics, [{ code: 'UNPUBLISHED_REQUIREMENT',
    field: 'testAutomationTechnologies' }]);
});

test('published engine rule controls eliminatory eligibility without code changes', () => {
  const current = vacancy('Ignored', { matchProfile: { configurationVersion: 12,
    values: { type: ['remote'], testAutomationTechnologies: ['cypress'] }, requirements: [
      { field: 'testAutomationTechnologies', id: 'cypress', importance: 'required',
        eliminatory: true },
    ] } });
  const disabled = scorePair(current, {}, configuration, multipliers, new Date(), candidate,
    { eliminatoryPolicyEnabled: false });
  const enabled = scorePair(current, {}, configuration, multipliers, new Date(), candidate,
    { eliminatoryPolicyEnabled: true });
  assert.equal(disabled.eligibility.eligible, true);
  assert.equal(enabled.eligibility.eligible, false);
  assert.equal(disabled.percentage, enabled.percentage);
});
