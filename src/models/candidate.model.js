const mongoose = require('mongoose');
const {
  UNKNOWN,
  CANDIDATE_STATUS,
  ELIGIBILITY_STATUS,
  ELIGIBILITY_METHOD,
  ELIGIBILITY_SOURCE,
  PROFILE_FIELDS,
} = require('../config/candidate');
const { PUBLIC_PROFILE_FIELDS } = require('../config/candidate-public-profile');

const optionalProfile = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, {
  type: String,
  default: UNKNOWN,
  trim: true,
}]));

const eligibilitySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: Object.values(ELIGIBILITY_STATUS),
    default: ELIGIBILITY_STATUS.PENDING,
    required: true,
  },
  method: {
    type: String,
    enum: Object.values(ELIGIBILITY_METHOD),
    default: ELIGIBILITY_METHOD.UNKNOWN,
    required: true,
  },
  source: {
    type: String,
    default: ELIGIBILITY_SOURCE.PENDING,
    required: true,
    trim: true,
    maxlength: 100,
  },
  lastAttemptAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
}, { _id: false });

const eligibilityHistorySchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, match: /^\S+@\S+\.\S+$/ },
  status: { type: String, enum: Object.values(ELIGIBILITY_STATUS), required: true },
  method: { type: String, enum: Object.values(ELIGIBILITY_METHOD), required: true },
  source: { type: String, required: true, trim: true, maxlength: 100 },
  lastAttemptAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
  invalidatedAt: { type: Date, required: true },
}, { _id: false });

const publicProfileSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false, required: true },
  fields: [{ type: String, enum: PUBLIC_PROFILE_FIELDS }],
  consentedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  cacheVersion: { type: Number, default: 1, min: 1, required: true },
  cacheInvalidatedAt: { type: Date, default: null },
}, { _id: false });

const publicProfileConsentHistorySchema = new mongoose.Schema({
  action: { type: String, enum: ['opt_in', 'fields_updated', 'revoked', 'candidate_deleted'], required: true },
  fields: [{ type: String, enum: PUBLIC_PROFILE_FIELDS }],
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, required: true },
}, { _id: false });

const opportunityAvailabilityHistorySchema = new mongoose.Schema({
  availableForOpportunities: { type: Boolean, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, required: true },
}, { _id: false });

const candidateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  email: { type: String, required: true, trim: true, lowercase: true, match: /^\S+@\S+\.\S+$/ },
  ...optionalProfile,
  availability: {
    type: String,
    enum: ['available', 'unavailable', UNKNOWN],
    default: UNKNOWN,
  },
  availableForOpportunities: { type: Boolean, default: false, required: true },
  opportunityAvailabilityChangedAt: { type: Date, default: null },
  opportunitySearchCacheVersion: { type: Number, default: 1, min: 1, required: true, select: false },
  opportunitySearchCacheInvalidatedAt: { type: Date, default: null, select: false },
  opportunityAvailabilityHistory: {
    type: [opportunityAvailabilityHistorySchema],
    default: () => [],
    select: false,
  },
  status: {
    type: String,
    enum: Object.values(CANDIDATE_STATUS),
    default: CANDIDATE_STATUS.PENDING_VALIDATION,
    required: true,
  },
  eligibility: { type: eligibilitySchema, default: () => ({}) },
  eligibilityHistory: { type: [eligibilityHistorySchema], default: () => [], select: false },
  publicProfile: { type: publicProfileSchema, default: () => ({}), select: false },
  publicProfileConsentHistory: {
    type: [publicProfileConsentHistorySchema],
    default: () => [],
    select: false,
  },
  deletedAt: { type: Date, default: null, select: false },
}, { timestamps: true });

candidateSchema.index(
  { user: 1 },
  {
    unique: true,
    name: 'unique_current_candidate_user',
    partialFilterExpression: { deletedAt: null },
  }
);

candidateSchema.index(
  { email: 1 },
  {
    unique: true,
    name: 'unique_active_candidate_email',
    partialFilterExpression: { status: CANDIDATE_STATUS.ACTIVE },
  }
);

candidateSchema.virtual('visibleToCompanies').get(function visibleToCompanies() {
  return this.status === CANDIDATE_STATUS.ACTIVE && this.availableForOpportunities === true;
});

candidateSchema.statics.findVisibleToCompanies = function findVisibleToCompanies() {
  return this.find({
    status: CANDIDATE_STATUS.ACTIVE,
    availableForOpportunities: true,
    'eligibility.status': ELIGIBILITY_STATUS.APPROVED,
    deletedAt: null,
  });
};

candidateSchema.set('toJSON', {
  virtuals: true,
  transform: (_document, result) => {
    delete result.__v;
    delete result.id;
    delete result.eligibilityHistory;
    delete result.publicProfile;
    delete result.publicProfileConsentHistory;
    delete result.opportunityAvailabilityHistory;
    delete result.opportunitySearchCacheVersion;
    delete result.opportunitySearchCacheInvalidatedAt;
    delete result.deletedAt;
    if (result.eligibility) delete result.eligibility.source;
    return result;
  },
});

module.exports = mongoose.model('Candidate', candidateSchema);
