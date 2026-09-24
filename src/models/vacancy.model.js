const mongoose = require('mongoose');
const { INITIAL_MATCH_WEIGHTS } = require('../config/match-profile');
const { DIMENSIONS } = require('../config/geography');

const matchFields = Object.fromEntries(Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => [key,
  key === 'yearsOfExperience'
    ? { type: Number, min: 0, max: 100, default: undefined }
    : { type: [String], default: undefined },
]));
const matchValuesSchema = new mongoose.Schema(matchFields, { _id: false, strict: 'throw' });
const requirementSchema = new mongoose.Schema({
  field: { type: String, enum: Object.keys(INITIAL_MATCH_WEIGHTS), required: true },
  id: { type: String, default: undefined },
  value: { type: Number, default: undefined },
  importance: { type: String, enum: ['required', 'desirable', 'indifferent'], required: true },
  eliminatory: { type: Boolean, default: false, required: true },
}, { _id: false });
const matchProfileSchema = new mongoose.Schema({
  configurationVersion: { type: Number, required: true, min: 1 },
  values: { type: matchValuesSchema, required: true },
  requirements: { type: [requirementSchema], default: [] },
}, { _id: false });
const locationSchema = new mongoose.Schema({
  city: { type: String, trim: true, maxlength: 200 },
  state: { type: String, trim: true, maxlength: 200 },
  country: { type: String, trim: true, maxlength: 200 },
}, { _id: false });
const geographicRestrictionSchema = new mongoose.Schema(Object.fromEntries(DIMENSIONS.map((key) =>
  [key, { type: new mongoose.Schema({
    value: { type: String, required: true, trim: true, maxlength: 200 },
    importance: { type: String, enum: ['required', 'desirable', 'indifferent'], required: true },
  }, { _id: false }), default: undefined }])), { _id: false });
const importMappingAuditSchema = new mongoose.Schema({
  unknownLevel: { type: Boolean, default: false },
  rawLocation: { type: String, default: null, maxlength: 2000 },
  compatibility: { type: new mongoose.Schema({
    version: { type: String, required: true, enum: ['LEGACY_V1'] },
    sourceFields: { type: [String], required: true,
      enum: ['testAutomationTecnologies', 'tecnologies', 'technologies', 'especialization'] },
    warnings: { type: [{
      code: { type: String, required: true, enum: ['DEPRECATED_FIELD'] },
      sourceField: { type: String, required: true,
        enum: ['testAutomationTecnologies', 'tecnologies', 'technologies', 'especialization'] },
      targetField: { type: String, required: true,
        enum: ['testAutomationTechnologies', 'qaTools', 'specialization'] },
    }], required: true },
  }, { _id: false }), default: null },
  legacyAi: { type: new mongoose.Schema({
    at: { type: Date, required: true },
    sourceField: { type: String, required: true, enum: ['genAITecnologies'] },
    entries: { type: [{
      submitted: { type: String, required: true, maxlength: 100 },
      canonicalId: { type: String, default: null },
      status: { type: String, required: true, enum: ['mapped', 'pending'] },
    }], required: true },
  }, { _id: false }), default: null },
  rawFalseValues: { type: [{
    field: { type: String, required: true, enum: Object.keys(INITIAL_MATCH_WEIGHTS) },
    value: { type: Boolean, required: true, enum: [false] },
  }], default: [] },
}, { _id: false });
const adminRecalculationSchema = new mongoose.Schema({
  policy: { type: String, enum: ['none', 'affected_matches'], required: true },
  status: { type: String, enum: ['not_required', 'scheduled'], required: true },
  scheduledFor: { type: Date, default: null },
  engineVersion: { type: String, default: null, match: /^MATCH_V[1-9]\d*$/ },
}, { _id: false });
const adminReviewSchema = new mongoose.Schema({
  revision: { type: Number, required: true, min: 1 },
  at: { type: Date, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true, maxlength: 500 },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, required: true },
  changedFields: { type: [String], required: true },
  recalculation: { type: adminRecalculationSchema, required: true },
}, { _id: false });
const normalizationCandidateSchema = new mongoose.Schema({
  field: { type: String, enum: Object.keys(INITIAL_MATCH_WEIGHTS), required: true },
  canonicalId: { type: String, required: true, maxlength: 100 },
}, { _id: false });
const normalizationSuggestionSchema = new mongoose.Schema({
  id: { type: String, required: true, match: /^[a-f\d]{24}$/ },
  field: { type: String, enum: Object.keys(INITIAL_MATCH_WEIGHTS), default: null },
  originalValue: { type: String, required: true, maxlength: 100 },
  canonicalId: { type: String, default: null, maxlength: 100 },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  origin: { type: String, required: true, enum: ['description'] },
  sourceStart: { type: Number, required: true, min: 0 },
  sourceEnd: { type: Number, required: true, min: 1 },
  extractorVersion: { type: String, required: true, enum: ['DESCRIPTION_EXTRACTOR_V1'] },
  catalogStatus: { type: String, required: true, enum: ['matched', 'pending'] },
  candidates: { type: [normalizationCandidateSchema], default: [] },
  state: { type: String, required: true, enum: ['suggested', 'accepted', 'rejected'] },
  importance: { type: String, enum: ['required', 'desirable', 'indifferent'], default: null },
  eliminatory: { type: Boolean, default: null },
}, { _id: false });
const normalizationDraftSchema = new mongoose.Schema({
  revision: { type: Number, required: true, min: 1 },
  descriptionFingerprint: { type: String, required: true, match: /^[a-f\d]{64}$/ },
  extractorVersion: { type: String, required: true, enum: ['DESCRIPTION_EXTRACTOR_V1'] },
  configurationVersion: { type: Number, required: true, min: 1 },
  status: { type: String, required: true, enum: ['draft', 'published'] },
  suggestions: { type: [normalizationSuggestionSchema], required: true },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, default: null },
  recalculation: { type: adminRecalculationSchema, default: null },
}, { _id: false });
const applicationChannelSchema = new mongoose.Schema({
  type: { type: String, enum: ['https_url', 'email'], required: true },
  value: { type: String, required: true, trim: true, maxlength: 2000 },
}, { _id: false });

const vacancySchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null,
    select: false, immutable: true },
  importSource: { type: String, trim: true, maxlength: 100, default: null, immutable: true },
  importSourceId: { type: String, trim: true, maxlength: 200, default: null, immutable: true },
  importMappingAudit: { type: importMappingAuditSchema, default: null, select: false },
  importImportance: { type: new mongoose.Schema({
    version: { type: Number, required: true, min: 1 },
    engineVersion: { type: String, default: null, match: /^MATCH_V[1-9]\d*$/ },
    importance: { type: String, required: true, enum: ['required', 'desirable', 'indifferent'] },
    appliedAt: { type: Date, required: true },
  }, { _id: false }), default: null },
  reference: { type: String, trim: true, lowercase: true, maxlength: 100, default: null },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 10000 },
  applicationChannel: { type: applicationChannelSchema, default: null },
  location: { type: locationSchema, default: null },
  geographicRestrictions: { type: geographicRestrictionSchema, default: null },
  matchProfile: { type: matchProfileSchema, required: true },
  origin: {
    type: String,
    enum: ['IMPORTED', 'COMPANY', 'ADMIN'],
    required: true,
    immutable: true,
    validate: {
      validator(origin) {
        if (origin === 'COMPANY') {
          return Boolean(this.company && this.createdBy && !this.importSource && !this.importSourceId);
        }
        if (origin === 'IMPORTED') {
          return Boolean(this.importSource && this.importSourceId && !this.company && !this.createdBy);
        }
        if (origin === 'ADMIN') {
          return Boolean(this.createdBy && !this.company && !this.importSource && !this.importSourceId);
        }
        return false;
      },
      message: 'Procedencia da vaga incompativel com sua origem',
    },
  },
  status: { type: String, enum: ['pending', 'active', 'paused', 'expired', 'removed', 'rejected'],
    default: 'pending', required: true },
  expiresAt: { type: Date, default: null },
  statusHistory: [{
    from: { type: String, required: true },
    to: { type: String, required: true },
    at: { type: Date, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    process: { type: String, enum: ['api', 'deadline', 'import'], required: true },
    reason: { type: String, required: true, maxlength: 500 },
  }],
  requirementsRevision: { type: Number, default: 0, min: 0 },
  requirementsHistory: [{
    at: { type: Date, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    process: { type: String, enum: ['api', 'import'], required: true },
    reason: { type: String, required: true, maxlength: 500 },
    revision: { type: Number, required: true },
    requirements: { type: [requirementSchema], required: true },
  }],
  normalizationRevision: { type: Number, default: 0, min: 0, select: false },
  normalizationDraft: { type: normalizationDraftSchema, default: null, select: false },
  normalizationHistory: { type: [normalizationDraftSchema], default: [], select: false },
  adminRevision: { type: Number, default: 0, min: 0 },
  adminContentFingerprint: { type: String, default: null, select: false },
  adminHistory: { type: [adminReviewSchema], default: [], select: false },
  importContentFingerprint: { type: String, default: null, select: false },
  importSourceVersion: { type: String, default: null, maxlength: 200, select: false },
  importScope: { type: String, default: null, maxlength: 200, select: false },
  lastSeenImportAt: { type: Date, default: null, select: false },
  lastSeenImportBatchId: { type: String, default: null, maxlength: 200, select: false },
  importReconciliationReviewRequired: { type: Boolean, default: false, select: false },
  deletedAt: { type: Date, default: null, select: false },
}, { timestamps: true });

vacancySchema.index({ company: 1, reference: 1 }, {
  unique: true,
  name: 'unique_current_company_vacancy_reference',
  partialFilterExpression: { origin: 'COMPANY', deletedAt: null },
});
vacancySchema.index({ importSource: 1, importSourceId: 1 }, {
  unique: true,
  name: 'unique_imported_vacancy_source',
  partialFilterExpression: {
    origin: 'IMPORTED', importSource: { $type: 'string' }, importSourceId: { $type: 'string' },
  },
});

vacancySchema.set('toJSON', {
  transform: (_document, result) => {
    delete result.__v;
    delete result.createdBy;
    delete result.deletedAt;
    delete result.importMappingAudit;
    delete result.statusHistory;
    delete result.requirementsHistory;
    delete result.normalizationRevision;
    delete result.normalizationDraft;
    delete result.normalizationHistory;
    delete result.adminContentFingerprint;
    delete result.adminHistory;
    delete result.importContentFingerprint;
    delete result.importSourceVersion;
    delete result.importScope;
    delete result.lastSeenImportAt;
    delete result.lastSeenImportBatchId;
    delete result.importReconciliationReviewRequired;
    return result;
  },
});

module.exports = mongoose.model('Vacancy', vacancySchema);
