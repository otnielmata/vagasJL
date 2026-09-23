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
