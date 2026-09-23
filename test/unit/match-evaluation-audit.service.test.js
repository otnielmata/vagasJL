require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const MatchEvaluation = require('../../src/models/match-evaluation.model');
const { recordMatchEvaluation, getLatestMatchEvaluation, auditData, MATCH_ALGORITHM_VERSION } =
  require('../../src/services/match-evaluation-audit.service');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b7';
const vacancyId = '6512f1e2b3a1c2d3e4f5a6b8';
const calculatedAt = new Date('2026-09-23T15:00:00Z');

function input(overrides = {}) {
  return { candidate: { _id: candidateId }, vacancy: { _id: vacancyId,
    requirementsRevision: 4, updatedAt: new Date('2026-09-23T14:00:00Z') },
  profile: { revision: 3, updatedAt: new Date('2026-09-23T13:00:00Z') },
  score: { calculationStatus: 'calculable', percentage: 82.5, earnedPoints: 33,
    possiblePoints: 40, eligibility: { eligible: true, reason: null } },
  versions: { profileCatalog: 7, multipliers: 2, rankingThreshold: 3 },
  cause: 'match_detail', executionId: 'run-123', calculatedAt, ...overrides };
}

function setup(context) {
  context.mock.method(MatchEvaluation, 'init', async () => MatchEvaluation);
  const writes = context.mock.method(MatchEvaluation, 'findOneAndUpdate', async (_filter, update) => ({
    _id: '6512f1e2b3a1c2d3e4f5a6b9', ...update.$setOnInsert,
  }));
  return writes;
}

test('records calculable result with algorithm, configuration versions and input revisions', async (context) => {
  const writes = setup(context);
  const audit = await recordMatchEvaluation(input());
  assert.equal(audit.algorithmVersion, 'MATCH_V1');
  assert.equal(MATCH_ALGORITHM_VERSION, 'MATCH_V1');
  assert.deepEqual(audit.configurationVersions,
    { profileCatalog: 7, multipliers: 2, rankingThreshold: 3, completionThreshold: null });
  const [filter, update, options] = writes.mock.calls[0].arguments;
  assert.equal(filter.executionId, 'run-123');
  assert.equal(filter['inputRevisions.vacancyRequirements'], 4);
  assert.equal(filter['inputRevisions.candidateProfile'], 3);
  assert.deepEqual([update.$setOnInsert.percentage, update.$setOnInsert.earnedPoints,
    update.$setOnInsert.possiblePoints], [82.5, 33, 40]);
  assert.deepEqual(options, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
});

test('keeps MATCH_V1 and MATCH_V2 evaluations distinguishable and immutable', async (context) => {
  const writes = setup(context);
  await recordMatchEvaluation(input({ executionId: 'run-v1', algorithmVersion: 'MATCH_V1' }));
  await recordMatchEvaluation(input({ executionId: 'run-v2', algorithmVersion: 'MATCH_V2' }));
  assert.deepEqual(writes.mock.calls.map((call) => call.arguments[1].$setOnInsert.algorithmVersion),
    ['MATCH_V1', 'MATCH_V2']);
  assert.equal(MatchEvaluation.schema.path('algorithmVersion').options.immutable, true);
});

test('stores not calculable without invented percentage and keeps eliminatory reason separate', () => {
  const notCalculable = auditData(input({ profile: null, score: {
    calculationStatus: 'not_calculable', percentage: 100, earnedPoints: 0, possiblePoints: 0,
    eligibility: { eligible: null, reason: null },
  } }));
  assert.deepEqual([notCalculable.percentage, notCalculable.earnedPoints,
    notCalculable.possiblePoints], [null, null, null]);
  assert.equal(notCalculable.inputRevisions.candidateProfile, null);
  const ineligible = auditData(input({ score: {
    calculationStatus: 'calculable', percentage: 90, earnedPoints: 9, possiblePoints: 10,
    eligibility: { eligible: false, reason: { code: 'ELIMINATORY_REQUIREMENT_UNMET',
      field: 'level', id: 'senior', internal: 'hidden' } },
  } }));
  assert.equal(ineligible.percentage, 90);
  assert.equal(ineligible.eligibility.eligible, false);
  assert.deepEqual(ineligible.eligibility.reason,
    { code: 'ELIMINATORY_REQUIREMENT_UNMET', field: 'level', id: 'senior' });
});

test('uses atomic upsert and unique execution index for idempotent reprocessing', async (context) => {
  const writes = setup(context);
  await recordMatchEvaluation(input());
  await recordMatchEvaluation(input());
  assert.deepEqual(writes.mock.calls[0].arguments[0], writes.mock.calls[1].arguments[0]);
  const index = MatchEvaluation.schema.indexes().find(([, options]) =>
    options.name === 'unique_match_evaluation_execution');
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[0], { candidate: 1, vacancy: 1, executionId: 1,
    'inputRevisions.vacancyRequirements': 1, 'inputRevisions.candidateProfile': 1,
    algorithmVersion: 1 });
});

test('audit write failure blocks a misleading successful result', async (context) => {
  setup(context).mock.mockImplementation(async () => { throw new Error('database unavailable'); });
  await assert.rejects(recordMatchEvaluation(input()),
    { statusCode: 503, message: 'Auditoria do Match indisponivel' });
});

test('audit stores internal IDs and no candidate personal fields', () => {
  const data = auditData(input({ candidate: { _id: candidateId, name: 'Ana', email: 'private@example.com' } }));
  assert.equal(data.candidate, candidateId);
  assert.equal(JSON.stringify(data).includes('private@example.com'), false);
  assert.equal(JSON.stringify(data).includes('Ana'), false);
});

test('latest pair lookup uses calculation time and stable id without deleting history', async (context) => {
  const sort = context.mock.fn(async () => ({ _id: 'latest' }));
  const find = context.mock.method(MatchEvaluation, 'findOne', () => ({ sort }));
  const latest = await getLatestMatchEvaluation(candidateId, vacancyId);
  assert.equal(latest._id, 'latest');
  assert.deepEqual(find.mock.calls[0].arguments[0], { candidate: candidateId, vacancy: vacancyId });
  assert.deepEqual(sort.mock.calls[0].arguments[0], { calculatedAt: -1, _id: -1 });
});
