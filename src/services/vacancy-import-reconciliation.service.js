const crypto = require('node:crypto');
const ImportBatch = require('../models/import-batch.model');
const Vacancy = require('../models/vacancy.model');
const VacancyImportRevision = require('../models/vacancy-import-revision.model');
const { prepareImportedVacancyData } = require('./vacancy-origin.service');
const ApiError = require('../errors/api.error');

const SOURCE_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const EDITABLE_FIELDS = ['reference', 'title', 'description', 'location', 'geographicRestrictions',
  'matchProfile', 'expiresAt', 'importMappingAudit', 'importImportance'];
const AUDIT_FIELDS = ['origin', 'status', ...EDITABLE_FIELDS];
const CLOSE_TRANSITIONS = Object.freeze({
  pending: ['removed'], active: ['expired', 'removed'], paused: ['expired', 'removed'],
  expired: ['removed'], rejected: [], removed: [],
});

function plain(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value?.toObject) return plain(value.toObject({ depopulate: true }));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
    .map(([key, item]) => [key, plain(item)]));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function relevantSnapshot(vacancy) {
  const source = plain(vacancy);
  return Object.fromEntries(EDITABLE_FIELDS.filter((field) => source[field] !== undefined)
    .map((field) => [field, source[field]]));
}

function auditSnapshot(vacancy) {
  const source = plain(vacancy);
  return Object.fromEntries(AUDIT_FIELDS.filter((field) => source[field] !== undefined)
    .map((field) => [field, source[field]]));
}

function comparableField(field, value) {
  const comparable = plain(value);
  if (field === 'importImportance' && comparable) {
    return { version: comparable.version, importance: comparable.importance };
  }
  if (field === 'importMappingAudit' && comparable?.legacyAi) {
    const normalized = { ...comparable, legacyAi: { ...comparable.legacyAi, at: undefined } };
    if (normalized.compatibility == null) delete normalized.compatibility;
    return normalized;
  }
  if (field === 'importMappingAudit' && comparable?.compatibility == null) {
    const normalized = { ...comparable };
    delete normalized.compatibility;
    return normalized;
  }
  return comparable;
}

function contentFingerprint(vacancy) {
  const snapshot = relevantSnapshot(vacancy);
  const comparable = Object.fromEntries(Object.entries(snapshot)
    .map(([field, value]) => [field, comparableField(field, value)]));
  return crypto.createHash('sha256').update(JSON.stringify(stable(comparable))).digest('hex');
}

function changedFields(before, after) {
  const left = relevantSnapshot(before);
  const right = relevantSnapshot(after);
  return EDITABLE_FIELDS.filter((field) =>
    JSON.stringify(stable(comparableField(field, left[field]))) !==
      JSON.stringify(stable(comparableField(field, right[field]))));
}

function normalizedText(value, maxLength, pattern) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) return null;
  const normalized = value.trim().toLowerCase();
  return !pattern || pattern.test(normalized) ? normalized : null;
}

function normalizeBatch(input) {
  const keys = ['batchId', 'collectionType', 'items', 'referenceAt', 'scope', 'snapshotPolicy', 'source'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !keys.includes(key))) {
    throw new ApiError(400, 'Lote de importacao invalido');
  }
  const source = normalizedText(input.source, 100, SOURCE_PATTERN);
  const batchId = normalizedText(input.batchId, 200);
  const scope = normalizedText(input.scope || 'default', 200);
  const referenceAt = new Date(input.referenceAt);
  if (!source || !batchId || !scope || !['snapshot', 'incremental'].includes(input.collectionType) ||
      Number.isNaN(referenceAt.getTime()) || !Array.isArray(input.items) || input.items.length > 1000) {
    throw new ApiError(400, 'Lote de importacao invalido');
  }
  let snapshotPolicy = null;
  if (input.snapshotPolicy !== undefined) {
    const policy = input.snapshotPolicy;
    if (input.collectionType !== 'snapshot' || !policy || typeof policy !== 'object' || Array.isArray(policy) ||
        Object.keys(policy).sort().join(',') !== 'absentBefore,complete,enabled,missingStatus,trusted' ||
        policy.enabled !== true || policy.complete !== true || policy.trusted !== true ||
        !['expired', 'removed'].includes(policy.missingStatus)) {
      throw new ApiError(400, 'Politica de snapshot invalida');
    }
    const absentBefore = new Date(policy.absentBefore);
    if (Number.isNaN(absentBefore.getTime()) || absentBefore > referenceAt) {
      throw new ApiError(400, 'Janela de seguranca do snapshot invalida');
    }
    snapshotPolicy = { ...policy, absentBefore };
  }
  return { source, batchId, scope, collectionType: input.collectionType,
    referenceAt, items: input.items, snapshotPolicy };
}

function itemIdentity(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  return typeof item.sourceId === 'string' && item.sourceId.trim() && item.sourceId.trim().length <= 200
    ? item.sourceId.trim() : null;
}

function sourceVersion(item) {
  return typeof item.sourceVersion === 'string' && item.sourceVersion.trim() &&
    item.sourceVersion.trim().length <= 200 ? item.sourceVersion.trim() : null;
}

function safeFailure(failures, sourceId, itemIndex, stage, code) {
  failures.push({ sourceId, itemIndex, stage, code });
}

function batchResponse(batch, replayed = false) {
  const value = plain(batch);
  return { source: value.source, batchId: value.batchId, collectionType: value.collectionType,
    referenceAt: value.referenceAt, status: value.status, result: value.result,
    failures: value.failures || [], replayed };
}

async function auditRevision({ vacancy, batch, sourceId, action, before, after, fields,
  fingerprint, version, reviewRequired = false, session }) {
  await VacancyImportRevision.create([{ vacancy: vacancy._id, source: batch.source, sourceId,
    batchId: batch.batchId, action, referenceAt: batch.referenceAt, sourceVersion: version,
    configurationVersion: after.matchProfile.configurationVersion, changedFields: fields,
    before, after, contentFingerprint: fingerprint, reviewRequired }], { session });
}

async function closeExisting(existing, item, batch, result, failures, itemIndex = null) {
  const target = item.closedStatus;
  if (!['expired', 'removed'].includes(target)) {
    safeFailure(failures, item.sourceId, itemIndex, 'status', 'INVALID_CLOSURE_STATUS');
    return;
  }
  if (existing.status === target) {
    result.unchanged += 1;
    return;
  }
  if (!CLOSE_TRANSITIONS[existing.status]?.includes(target)) {
    safeFailure(failures, item.sourceId, itemIndex, 'status', 'INVALID_STATUS_TRANSITION');
    return;
  }
  const before = auditSnapshot(existing);
  let updated;
  try {
    await Vacancy.db.transaction(async (session) => {
      updated = await Vacancy.findOneAndUpdate({ _id: existing._id, status: existing.status,
        updatedAt: existing.updatedAt }, { $set: { status: target, lastSeenImportAt: batch.referenceAt,
        lastSeenImportBatchId: batch.batchId, importSourceVersion: sourceVersion(item) },
      $push: { statusHistory: { from: existing.status, to: target, at: batch.referenceAt,
        actor: null, process: 'import', reason: 'Encerramento explicito informado pela fonte' } } },
      { new: true, session });
      if (!updated) return;
      const after = auditSnapshot(updated);
      await auditRevision({ vacancy: updated, batch, sourceId: item.sourceId, action: 'closed',
        before, after, fields: ['status'], fingerprint: existing.importContentFingerprint ||
          contentFingerprint(existing), version: sourceVersion(item), session });
    });
  } catch {
    safeFailure(failures, item.sourceId, itemIndex, 'persistence', 'ITEM_WRITE_FAILED');
    return;
  }
  if (!updated) {
    safeFailure(failures, item.sourceId, itemIndex, 'persistence', 'CONCURRENT_UPDATE');
    return;
  }
  result.closed += 1;
}

async function reconcileItem(item, batch, result, failures, itemIndex) {
  const sourceId = itemIdentity(item);
  if (!sourceId) {
    result.reviewRequired += 1;
    safeFailure(failures, null, itemIndex, 'identity', 'MISSING_STABLE_SOURCE_ID');
    return;
  }
  const existing = await Vacancy.findOne({ origin: 'IMPORTED', importSource: batch.source,
    importSourceId: sourceId }).select('+importMappingAudit +importContentFingerprint +importSourceVersion ' +
      '+importScope +lastSeenImportAt +lastSeenImportBatchId +importReconciliationReviewRequired ' +
      '+requirementsHistory +deletedAt');
  if (item.closedStatus !== undefined) {
    if (!existing) safeFailure(failures, sourceId, itemIndex, 'status', 'CLOSURE_TARGET_NOT_FOUND');
    else await closeExisting(existing, { ...item, sourceId }, batch, result, failures, itemIndex);
    return;
  }
  let prepared;
  try {
    prepared = await prepareImportedVacancyData({ source: batch.source, sourceId }, item.content);
  } catch (error) {
    safeFailure(failures, sourceId, itemIndex, 'transformation',
      error.statusCode ? 'INVALID_ITEM' : 'ITEM_PROCESSING_FAILED');
    return;
  }
  const fingerprint = contentFingerprint(prepared);
  const version = sourceVersion(item);
  if (!existing) {
    try {
      await Vacancy.db.transaction(async (session) => {
        const [created] = await Vacancy.create([{ ...prepared, importContentFingerprint: fingerprint,
          importSourceVersion: version, importScope: batch.scope, lastSeenImportAt: batch.referenceAt,
          lastSeenImportBatchId: batch.batchId }], { session });
        await auditRevision({ vacancy: created, batch, sourceId, action: 'created', before: null,
          after: auditSnapshot(created), fields: EDITABLE_FIELDS, fingerprint, version, session });
      });
      result.created += 1;
    } catch (error) {
      safeFailure(failures, sourceId, itemIndex, 'persistence',
        error.code === 11000 ? 'CONCURRENT_DUPLICATE' : 'ITEM_WRITE_FAILED');
    }
    return;
  }
  const currentFingerprint = existing.importContentFingerprint || contentFingerprint(existing);
  if (currentFingerprint === fingerprint) {
    await Vacancy.updateOne({ _id: existing._id }, { $set: { lastSeenImportAt: batch.referenceAt,
      lastSeenImportBatchId: batch.batchId, importSourceVersion: version, importScope: batch.scope,
      importContentFingerprint: fingerprint } });
    result.unchanged += 1;
    return;
  }
  const before = auditSnapshot(existing);
  const fields = changedFields(existing, prepared);
  const manualRequirements = (existing.requirementsHistory || []).some((entry) => entry.process === 'api');
  const technicalReview = manualRequirements && fields.includes('matchProfile');
  const actual = { ...prepared };
  if (technicalReview) {
    actual.matchProfile = plain(existing.matchProfile);
    actual.importImportance = plain(existing.importImportance);
  }
  const set = Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, actual[field]]));
  Object.assign(set, { importContentFingerprint: fingerprint, importSourceVersion: version,
    importScope: batch.scope, lastSeenImportAt: batch.referenceAt,
    lastSeenImportBatchId: batch.batchId, importReconciliationReviewRequired: technicalReview });
  let updated;
  try {
    await Vacancy.db.transaction(async (session) => {
      updated = await Vacancy.findOneAndUpdate({ _id: existing._id, updatedAt: existing.updatedAt },
        { $set: set }, { new: true, session });
      if (!updated) return;
      await auditRevision({ vacancy: updated, batch, sourceId, action: 'updated', before,
        after: auditSnapshot(updated), fields, fingerprint, version,
        reviewRequired: technicalReview, session });
    });
  } catch {
    safeFailure(failures, sourceId, itemIndex, 'persistence', 'ITEM_WRITE_FAILED');
    return;
  }
  if (!updated) {
    safeFailure(failures, sourceId, itemIndex, 'persistence', 'CONCURRENT_UPDATE');
    return;
  }
  result.updated += 1;
  if (technicalReview) result.reviewRequired += 1;
}

async function closeMissingSnapshotVacancies(batch, result, failures) {
  if (!batch.snapshotPolicy || failures.length) return;
  const candidates = await Vacancy.find({ origin: 'IMPORTED', importSource: batch.source,
    importScope: batch.scope, lastSeenImportBatchId: { $ne: batch.batchId },
    lastSeenImportAt: { $lte: batch.snapshotPolicy.absentBefore },
    status: { $in: Object.keys(CLOSE_TRANSITIONS).filter((status) =>
      CLOSE_TRANSITIONS[status].includes(batch.snapshotPolicy.missingStatus)) }, deletedAt: null })
    .select('+importContentFingerprint +lastSeenImportBatchId +lastSeenImportAt +importScope');
  for (const vacancy of candidates) {
    await closeExisting(vacancy, { sourceId: vacancy.importSourceId,
      closedStatus: batch.snapshotPolicy.missingStatus }, batch, result, failures);
  }
}

async function reconcileImportBatch(input) {
  const batch = normalizeBatch(input);
  await Promise.all([ImportBatch.init(), Vacancy.init(), VacancyImportRevision.init()]);
  const previous = await ImportBatch.findOne({ source: batch.source, batchId: batch.batchId }).lean();
  if (previous && previous.status !== 'processing') return batchResponse(previous, true);
  if (previous) throw new ApiError(409, 'Lote de importacao ja esta em processamento');
  try {
    await ImportBatch.create({ source: batch.source, batchId: batch.batchId,
      collectionType: batch.collectionType, referenceAt: batch.referenceAt, status: 'processing' });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'Lote de importacao ja esta em processamento');
    throw error;
  }
  const result = { created: 0, unchanged: 0, updated: 0, closed: 0, reviewRequired: 0, failed: 0 };
  const failures = [];
  const seen = new Set();
  for (const [itemIndex, item] of batch.items.entries()) {
    const sourceId = itemIdentity(item);
    if (sourceId && seen.has(sourceId)) {
      safeFailure(failures, sourceId, itemIndex, 'validation', 'DUPLICATE_ITEM_IN_BATCH');
      continue;
    }
    if (sourceId) seen.add(sourceId);
    await reconcileItem(item, batch, result, failures, itemIndex);
  }
  await closeMissingSnapshotVacancies(batch, result, failures);
  result.failed = failures.length;
  const status = failures.length ? 'completed_with_failures' : 'completed';
  const completed = await ImportBatch.findOneAndUpdate({ source: batch.source, batchId: batch.batchId,
    status: 'processing' }, { $set: { status, result, failures } }, { new: true, lean: true });
  if (!completed) throw new ApiError(409, 'Lote de importacao alterado concorrentemente');
  return batchResponse(completed);
}

module.exports = { reconcileImportBatch, normalizeBatch, contentFingerprint,
  changedFields, relevantSnapshot, auditSnapshot };
