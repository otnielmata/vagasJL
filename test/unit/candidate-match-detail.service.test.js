require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const CandidateMatchProfile = require('../../src/models/candidate-match-profile.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const MatchMultipliersConfiguration = require('../../src/models/match-multipliers-configuration.model');
const MatchEvaluation = require('../../src/models/match-evaluation.model');
const MatchEngineConfiguration = require('../../src/models/match-engine-configuration.model');
const RankingThresholdConfiguration = require('../../src/models/ranking-threshold-configuration.model');
const Vacancy = require('../../src/models/vacancy.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { getCandidateMatchDetail, classifyMatchResult } =
  require('../../src/services/candidate-match-detail.service');

const actor = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'candidate' };
const candidateId = '6512f1e2b3a1c2d3e4f5a6b8';
const vacancyId = '6512f1e2b3a1c2d3e4f5a6b9';
const now = new Date('2026-09-22T12:00:00Z');

function configuration() {
  return { version: 1, geographyWeights: { country: 6, state: 4, city: 2 },
    fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
      key, label: key, weight, options: key === 'testAutomationTechnologies' ? [
        { id: 'cypress', label: 'Cypress', aliases: [] },
        { id: 'playwright', label: 'Playwright', aliases: [] },
        { id: 'selenium', label: 'Selenium', aliases: [] },
      ] : key === 'programmingLanguages' ? [
        { id: 'javascript', label: 'JavaScript', aliases: [] },
        { id: 'python', label: 'Python', aliases: [] },
      ] : [],
    })) };
}

function vacancy(overrides = {}) {
  return { _id: vacancyId, title: 'QA Engineer', origin: 'ADMIN', status: 'active',
    createdBy: '6512f1e2b3a1c2d3e4f5a6ba', company: null, importSource: null,
    importSourceId: null, expiresAt: null, deletedAt: null,
    matchProfile: { configurationVersion: 1, values: {
      testAutomationTechnologies: ['cypress', 'playwright'],
      programmingLanguages: ['javascript'],
    }, requirements: [
      { field: 'testAutomationTechnologies', id: 'cypress', importance: 'required' },
      { field: 'testAutomationTechnologies', id: 'playwright', importance: 'desirable' },
      { field: 'programmingLanguages', id: 'javascript', importance: 'required' },
    ] }, ...overrides };
}

function setup(context, currentVacancy = vacancy(), values = {
  testAutomationTechnologies: ['cypress', 'selenium'], programmingLanguages: ['javascript'],
}) {
  const engineState = { current: null };
  context.mock.method(MatchEngineConfiguration, 'findOne', () => ({
    sort: async () => engineState.current,
  }));
  context.mock.method(MatchEvaluation, 'init', async () => MatchEvaluation);
  context.mock.method(MatchEvaluation, 'findOneAndUpdate', async (_filter, update) => ({
    _id: `audit-${update.$setOnInsert.vacancy}`,
  }));
  context.mock.method(Candidate, 'findOne', () => ({ select: async () => ({ _id: candidateId }) }));
  context.mock.method(Vacancy, 'findById', () => ({ select: async () => currentVacancy }));
  context.mock.method(Configuration, 'findOne', async () => configuration());
  context.mock.method(MatchMultipliersConfiguration, 'findOne', () => ({ sort: async () => ({
    version: 3, multipliers: { required: 1, desirable: 0.5, indifferent: 0 },
  }) }));
  const thresholdState = { current: null };
  context.mock.method(RankingThresholdConfiguration, 'findOne', () => ({
    sort: async () => thresholdState.current,
  }));
  const profileQuery = { select: async () => values === null ? null : {
    values, configurationVersion: 1, revision: 1, updatedAt: now,
  } };
  context.mock.method(CandidateMatchProfile, 'findOne', () => profileQuery);
  return { profileQuery, thresholdState, engineState };
}

test('effective consolidated configuration controls score, threshold and audit version', async (context) => {
  const { engineState } = setup(context);
  engineState.current = {
    version: 'MATCH_V2', revision: 2, state: 'published', effectiveAt: now,
    weights: Object.fromEntries(Object.keys(INITIAL_MATCH_WEIGHTS).map((key) =>
      [key, key === 'testAutomationTechnologies' ? 20 : INITIAL_MATCH_WEIGHTS[key]])),
    multipliers: { required: 1, desirable: 0.25, indifferent: 0 },
    defaultImportImportance: 'desirable', minimumMatchPercentage: 70,
    minimumProfileCompletionPercentage: null,
    recalculation: { policy: 'affected_matches' },
  };
  const result = await getCandidateMatchDetail(actor, vacancyId, now);
  assert.equal(result.percentage, 85.29);
  assert.equal(result.engineConfigurationVersion, 'MATCH_V2');
  assert.equal(result.multipliersVersion, 2);
  assert.equal(result.minimumMatchPercentage, 70);
  assert.equal(result.audit.algorithmVersion, 'MATCH_V2');
  assert.equal(result.audit.configurationVersions.engine, 'MATCH_V2');
});

test('returns reconciled strengths and canonical gaps without penalizing extra skills', async (context) => {
  setup(context);
  const result = await getCandidateMatchDetail(actor, vacancyId, now);
  assert.equal(result.calculationStatus, 'calculable');
  assert.deepEqual(result.indicator, { dimension: 'technical_match', label: 'Match tecnico',
    percentage: 79.17, status: 'eligible' });
  assert.deepEqual([result.resultState, result.resultLabel], ['eligible', 'Compatível']);
  assert.deepEqual([result.earnedPoints, result.possiblePoints, result.percentage], [19, 24, 79.17]);
  assert.deepEqual(result.metCriteria.map((criterion) => criterion.id), ['cypress', 'javascript']);
  assert.deepEqual(result.gaps.map((criterion) => criterion.id), ['playwright']);
  assert.deepEqual(result.gaps[0], { field: 'testAutomationTechnologies', id: 'playwright',
    label: 'Playwright', importance: 'desirable', status: 'gap', earnedPoints: 0,
    possiblePoints: 5, lostPoints: 5 });
  assert.equal(result.availableCriteria.some((criterion) => criterion.id === 'selenium'), false);
  assert.equal(Object.hasOwn(result, 'studyPlan'), false);
  assert.equal(Object.hasOwn(result, 'engagement'), false);
  assert.deepEqual([result.configurationVersion, result.multipliersVersion], [1, 3]);
});

test('returns below threshold for low compatibility without changing eligibility or gaps', async (context) => {
  const { thresholdState } = setup(context);
  thresholdState.current = { version: 4, minimumPercentage: 80 };
  const result = await getCandidateMatchDetail(actor, vacancyId, now);
  assert.equal(result.resultState, 'below_threshold');
  assert.equal(result.resultLabel, 'Compatibilidade baixa');
  assert.equal(result.percentage, 79.17);
  assert.deepEqual(result.eligibility, { eligible: true, reason: null });
  assert.deepEqual(result.gaps.map((criterion) => criterion.id), ['playwright']);
  assert.deepEqual([result.minimumMatchPercentage, result.rankingThresholdVersion], [80, 4]);
  assert.equal(Object.hasOwn(result, 'studyPlan'), false);
});

test('orders gaps by effective point loss with a stable fallback', async (context) => {
  setup(context, vacancy(), { testAutomationTechnologies: ['selenium'], programmingLanguages: ['python'] });
  const result = await getCandidateMatchDetail(actor, vacancyId, now);
  assert.deepEqual(result.gaps.map((criterion) => [criterion.id, criterion.lostPoints]),
    [['javascript', 9], ['cypress', 10], ['playwright', 5]].sort((left, right) => right[1] - left[1]));
});

test('returns not calculable instead of 100 percent when vacancy has no applicable criteria', async (context) => {
  const currentVacancy = vacancy({ matchProfile: { configurationVersion: 1, values: {}, requirements: [] } });
  setup(context, currentVacancy);
  const result = await getCandidateMatchDetail(actor, vacancyId, now);
  assert.equal(result.calculationStatus, 'not_calculable');
  assert.equal(result.resultState, 'not_calculable');
  assert.equal(result.resultLabel, 'Compatibilidade não calculável');
  assert.equal(result.percentage, null);
  assert.equal(result.earnedPoints, null);
  assert.equal(result.possiblePoints, null);
  assert.deepEqual(result.availableCriteria, []);
});

test('returns available criteria as unknown when candidate profile is absent or incomplete', async (context) => {
  const { profileQuery } = setup(context, vacancy(), null);
  const absent = await getCandidateMatchDetail(actor, vacancyId, now);
  assert.equal(absent.calculationStatus, 'not_calculable');
  assert.equal(absent.percentage, null);
  assert.equal(absent.availableCriteria.every((criterion) => criterion.status === 'unknown'), true);
  assert.deepEqual(absent.eligibility, { eligible: null, reason: null });
  profileQuery.select = async () => ({ values: { testAutomationTechnologies: ['cypress'] },
    configurationVersion: 1 });
  const incomplete = await getCandidateMatchDetail(actor, vacancyId, now);
  assert.equal(incomplete.calculationStatus, 'not_calculable');
  assert.equal(incomplete.availableCriteria.find((criterion) => criterion.id === 'javascript').status,
    'unknown');
});

test('exposes only a safe structured eliminatory reason', async (context) => {
  const currentVacancy = vacancy();
  currentVacancy.matchProfile.requirements[1].eliminatory = true;
  setup(context, currentVacancy);
  const result = await getCandidateMatchDetail(actor, vacancyId, now);
  assert.equal(result.resultState, 'ineligible');
  assert.equal(result.resultLabel, 'Não atende critério eliminatório');
  assert.equal(result.percentage, 79.17);
  assert.deepEqual(result.eligibility, { eligible: false, reason: {
    code: 'ELIMINATORY_REQUIREMENT_UNMET', field: 'testAutomationTechnologies', id: 'playwright',
  } });
  assert.deepEqual(Object.keys(result.vacancy).sort(), ['_id', 'title']);
});

test('ineligibility takes precedence over threshold even with high technical percentage', () => {
  const score = { earnedPoints: 94, possiblePoints: 100, percentage: 94,
    eligibility: { eligible: false, reason: { code: 'ELIMINATORY_REQUIREMENT_UNMET' } } };
  assert.deepEqual(classifyMatchResult(score, true, { version: 1, minimumPercentage: 60 }),
    { state: 'ineligible', label: 'Não atende critério eliminatório' });
  assert.deepEqual(classifyMatchResult({ ...score, eligibility: { eligible: true, reason: null } },
    true, { version: 1, minimumPercentage: 95 }),
  { state: 'below_threshold', label: 'Compatibilidade baixa' });
});

test('rejects another role, malformed id and invisible vacancy without profile data', async (context) => {
  const currentVacancy = vacancy({ status: 'paused' });
  const { profileQuery } = setup(context, currentVacancy);
  let profileReads = 0;
  profileQuery.select = async () => { profileReads += 1; return null; };
  await assert.rejects(getCandidateMatchDetail({ role: 'company' }, vacancyId, now),
    { statusCode: 403 });
  await assert.rejects(getCandidateMatchDetail(actor, 'invalid', now), { statusCode: 400 });
  await assert.rejects(getCandidateMatchDetail(actor, vacancyId, now), { statusCode: 404 });
  assert.equal(profileReads, 0);
});

test('does not return Match detail when mandatory audit persistence fails', async (context) => {
  setup(context);
  MatchEvaluation.findOneAndUpdate.mock.mockImplementation(async () => {
    throw new Error('audit unavailable');
  });
  await assert.rejects(getCandidateMatchDetail(actor, vacancyId, now), { statusCode: 503 });
});
