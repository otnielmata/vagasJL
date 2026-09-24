require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Configuration = require('../../src/models/match-profile-configuration.model');
const ImportBatch = require('../../src/models/import-batch.model');
const Vacancy = require('../../src/models/vacancy.model');
const VacancyImportRevision = require('../../src/models/vacancy-import-revision.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { reconcileImportBatch, contentFingerprint } =
  require('../../src/services/vacancy-import-reconciliation.service');

const vacancyId = '6512f1e2b3a1c2d3e4f5a6b7';
const referenceAt = '2026-09-24T12:00:00.000Z';

function content(title = 'QA Engineer') {
  return { reference: 'qa-01', title, description: 'Testes web',
    matchProfile: { values: { type: 'remote' } } };
}

function prepared(title = 'QA Engineer') {
  return { reference: 'qa-01', title, description: 'Testes web', location: null,
    geographicRestrictions: null, expiresAt: null,
    matchProfile: { configurationVersion: 2, values: { type: ['remote'] }, requirements: [] },
    importMappingAudit: { unknownLevel: false, rawLocation: null, rawFalseValues: [] },
    importImportance: null };
}

function existing(title = 'QA Engineer', overrides = {}) {
  const snapshot = prepared(title);
  return { _id: vacancyId, origin: 'IMPORTED', importSource: 'board-x', importSourceId: 'known',
    status: 'active', updatedAt: new Date('2026-09-23T00:00:00Z'), requirementsHistory: [],
    ...snapshot, importContentFingerprint: contentFingerprint(snapshot), ...overrides };
}

function batch(items, overrides = {}) {
  return { source: 'Board-X', batchId: 'batch-01', collectionType: 'incremental',
    referenceAt, scope: 'qa', items, ...overrides };
}

function setup(context, vacancies = []) {
  const configuration = { version: 2, fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({
    key, weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'type'
      ? [{ id: 'remote', label: 'Remoto', aliases: [] }] : [],
  })) };
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  context.mock.method(ImportBatch, 'init', async () => ImportBatch);
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  context.mock.method(VacancyImportRevision, 'init', async () => VacancyImportRevision);
  let transactionNumber = 0;
  const transaction = context.mock.method(Vacancy.db, 'transaction', async (callback) => {
    transactionNumber += 1;
    return callback({ id: `session-${transactionNumber}` });
  });
  const previous = { value: null };
  context.mock.method(ImportBatch, 'findOne', () => ({ lean: async () => previous.value }));
  const createBatch = context.mock.method(ImportBatch, 'create', async () => ({}));
  const completeBatch = context.mock.method(ImportBatch, 'findOneAndUpdate', async (_filter, update) => ({
    source: 'board-x', batchId: 'batch-01', collectionType: 'incremental', referenceAt,
    status: update.$set.status, result: update.$set.result, failures: update.$set.failures,
  }));
  let vacancyIndex = 0;
  const findVacancy = context.mock.method(Vacancy, 'findOne', () => ({
    select: async () => vacancies[vacancyIndex++] || null,
  }));
  const createVacancy = context.mock.method(Vacancy, 'create', async ([data]) => [{ _id: vacancyId, ...data }]);
  const updateVacancy = context.mock.method(Vacancy, 'updateOne', async () => ({ modifiedCount: 1 }));
  const replaceVacancy = context.mock.method(Vacancy, 'findOneAndUpdate', async (_filter, update) => ({
    ...(vacancies[Math.max(0, vacancyIndex - 1)] || existing()), ...update.$set,
  }));
  const findMissing = context.mock.method(Vacancy, 'find', () => ({ select: async () => [] }));
  const createRevision = context.mock.method(VacancyImportRevision, 'create', async (data) => data);
  return { previous, createBatch, completeBatch, findVacancy, createVacancy, updateVacancy,
    replaceVacancy, findMissing, createRevision, transaction };
}

test('creates only the new vacancy and classifies identical known content as unchanged', async (context) => {
  const known = existing();
  const calls = setup(context, [null, known]);
  const result = await reconcileImportBatch(batch([
    { sourceId: 'new', sourceVersion: '1', content: content() },
    { sourceId: 'known', sourceVersion: '2', content: content() },
  ]));
  assert.deepEqual(result.result, { created: 1, unchanged: 1, updated: 0, closed: 0,
    reviewRequired: 0, failed: 0 });
  assert.equal(calls.createVacancy.mock.callCount(), 1);
  assert.equal(calls.updateVacancy.mock.callCount(), 1);
  assert.equal(calls.createRevision.mock.callCount(), 1);
  assert.equal(calls.createRevision.mock.calls[0].arguments[0][0].action, 'created');
  assert.equal(calls.createVacancy.mock.calls[0].arguments[1].session,
    calls.createRevision.mock.calls[0].arguments[1].session);
});

test('replaying a completed batch is idempotent and performs no vacancy write', async (context) => {
  const calls = setup(context);
  calls.previous.value = { source: 'board-x', batchId: 'batch-01', collectionType: 'incremental',
    referenceAt, status: 'completed', result: { created: 1 }, failures: [] };
  const result = await reconcileImportBatch(batch([]));
  assert.equal(result.replayed, true);
  assert.equal(calls.createBatch.mock.callCount(), 0);
  assert.equal(calls.findVacancy.mock.callCount(), 0);
});

test('audit timestamps and source version changes do not create a content revision', () => {
  const first = prepared();
  first.importImportance = { version: 2, importance: 'desirable',
    appliedAt: new Date('2026-09-20T00:00:00Z') };
  first.importMappingAudit.legacyAi = { at: new Date('2026-09-20T00:00:00Z'),
    sourceField: 'genAITecnologies', entries: [] };
  const second = structuredClone(first);
  second.importImportance.appliedAt = new Date('2026-09-24T00:00:00Z');
  second.importMappingAudit.legacyAi.at = new Date('2026-09-24T00:00:00Z');
  assert.equal(contentFingerprint(first), contentFingerprint(second));
});

test('updates relevant changes while preserving identity and records before and after audit', async (context) => {
  const known = existing('QA Antiga');
  const calls = setup(context, [known]);
  const result = await reconcileImportBatch(batch([
    { sourceId: 'known', sourceVersion: '3', content: content('QA Nova') },
  ]));
  assert.equal(result.result.updated, 1);
  const filter = calls.replaceVacancy.mock.calls[0].arguments[0];
  assert.deepEqual(filter, { _id: vacancyId, updatedAt: known.updatedAt });
  const revision = calls.createRevision.mock.calls[0].arguments[0][0];
  assert.equal(revision.action, 'updated');
  assert.ok(revision.changedFields.includes('title'));
  assert.equal(revision.before.title, 'QA Antiga');
  assert.equal(revision.after.title, 'QA Nova');
  assert.equal(revision.source, 'board-x');
  assert.equal(revision.batchId, 'batch-01');
});

test('incremental collection never infers removal for an absent known vacancy', async (context) => {
  const calls = setup(context);
  const result = await reconcileImportBatch(batch([]));
  assert.equal(result.result.closed, 0);
  assert.equal(calls.findMissing.mock.callCount(), 0);
  assert.equal(calls.replaceVacancy.mock.callCount(), 0);
});

test('trusted complete snapshot closes only old absent vacancies inside its safety window', async (context) => {
  const absent = existing('Ausente', { importSourceId: 'absent', importScope: 'qa',
    lastSeenImportAt: new Date('2026-09-01T00:00:00Z') });
  const calls = setup(context);
  calls.findMissing.mock.mockImplementation(() => ({ select: async () => [absent] }));
  calls.replaceVacancy.mock.mockImplementation(async (_filter, update) => ({ ...absent,
    status: update.$set.status, matchProfile: absent.matchProfile }));
  calls.completeBatch.mock.mockImplementation(async (_filter, update) => ({ source: 'board-x',
    batchId: 'batch-01', collectionType: 'snapshot', referenceAt, status: update.$set.status,
    result: update.$set.result, failures: update.$set.failures }));
  const result = await reconcileImportBatch(batch([], { collectionType: 'snapshot', snapshotPolicy: {
    enabled: true, complete: true, trusted: true, missingStatus: 'removed',
    absentBefore: '2026-09-20T00:00:00.000Z',
  } }));
  assert.equal(result.result.closed, 1);
  const query = calls.findMissing.mock.calls[0].arguments[0];
  assert.equal(query.importSource, 'board-x');
  assert.equal(query.importScope, 'qa');
  assert.deepEqual(query.lastSeenImportAt, { $lte: new Date('2026-09-20T00:00:00.000Z') });
  const revision = calls.createRevision.mock.calls[0].arguments[0][0];
  assert.equal(revision.action, 'closed');
  assert.deepEqual([revision.before.status, revision.after.status], ['active', 'removed']);
});

test('incomplete snapshot with an invalid item reports safe failure and closes nothing', async (context) => {
  const calls = setup(context);
  const result = await reconcileImportBatch(batch([{ title: 'sem id confiavel' }], {
    collectionType: 'snapshot', snapshotPolicy: { enabled: true, complete: true, trusted: true,
      missingStatus: 'removed', absentBefore: '2026-09-20T00:00:00.000Z' },
  }));
  assert.equal(result.status, 'completed_with_failures');
  assert.deepEqual(result.failures, [{ sourceId: null, itemIndex: 0, stage: 'identity',
    code: 'MISSING_STABLE_SOURCE_ID' }]);
  assert.deepEqual([result.result.reviewRequired, result.result.failed, result.result.closed], [1, 1, 0]);
  assert.equal(calls.findMissing.mock.callCount(), 0);
});

test('manual requirement decisions are preserved and technical change is flagged for review', async (context) => {
  const known = existing('QA Antiga', { requirementsHistory: [{ process: 'api' }],
    matchProfile: { ...prepared().matchProfile, requirements: [
      { field: 'type', id: 'remote', importance: 'required', eliminatory: false },
    ] } });
  known.importContentFingerprint = contentFingerprint(known);
  const calls = setup(context, [known]);
  const result = await reconcileImportBatch(batch([{ sourceId: 'known', content: {
    ...content('QA Nova'), matchProfile: { values: { type: 'remote', apiTesting: false } },
  } }]));
  assert.equal(result.result.reviewRequired, 1);
  const update = calls.replaceVacancy.mock.calls[0].arguments[1].$set;
  assert.deepEqual(update.matchProfile, known.matchProfile);
  assert.equal(update.importReconciliationReviewRequired, true);
  assert.equal(calls.createRevision.mock.calls[0].arguments[0][0].reviewRequired, true);
});

test('reports the item and transformation stage without persisting an invalid profile', async (context) => {
  const calls = setup(context);
  const result = await reconcileImportBatch(batch([{ sourceId: 'invalid-profile', content: {
    ...content(), matchProfile: { values: { unknownTechnicalField: 'value' } },
  } }]));
  assert.deepEqual(result.failures, [{ sourceId: 'invalid-profile', itemIndex: 0,
    stage: 'transformation', code: 'INVALID_ITEM' }]);
  assert.equal(calls.transaction.mock.callCount(), 0);
  assert.equal(calls.createVacancy.mock.callCount(), 0);
  assert.equal(calls.createRevision.mock.callCount(), 0);
});

test('treats vacancy and import revision as one atomic persistence operation', async (context) => {
  const calls = setup(context);
  calls.createRevision.mock.mockImplementation(async () => { throw new Error('audit unavailable'); });
  const result = await reconcileImportBatch(batch([{ sourceId: 'new', content: content() }]));
  assert.equal(calls.transaction.mock.callCount(), 1);
  assert.deepEqual(result.failures, [{ sourceId: 'new', itemIndex: 0,
    stage: 'persistence', code: 'ITEM_WRITE_FAILED' }]);
  assert.equal(result.result.created, 0);
});

test('batch and revision models enforce source-scoped uniqueness', () => {
  const batchIndex = ImportBatch.schema.indexes().find(([, options]) =>
    options.name === 'unique_import_batch_source');
  const revisionIndex = VacancyImportRevision.schema.indexes().find(([, options]) =>
    options.name === 'unique_import_revision_item');
  assert.deepEqual(batchIndex[0], { source: 1, batchId: 1 });
  assert.equal(batchIndex[1].unique, true);
  assert.deepEqual(revisionIndex[0], { source: 1, batchId: 1, sourceId: 1, action: 1 });
  assert.equal(revisionIndex[1].unique, true);
  assert.equal(ImportBatch.schema.path('failures.stage').options.required, true);
  assert.equal(ImportBatch.schema.path('failures.itemIndex').options.min, 0);
});
