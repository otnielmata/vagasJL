const mongoose = require('mongoose');
const {
  UNKNOWN,
  CANDIDATE_STATUS,
  ELIGIBILITY_STATUS,
  ELIGIBILITY_METHOD,
  ELIGIBILITY_SOURCE,
  PROFILE_FIELDS,
} = require('../config/candidate');

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

const candidateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  email: { type: String, required: true, trim: true, lowercase: true, match: /^\S+@\S+\.\S+$/ },
  ...optionalProfile,
  availability: {
    type: String,
    enum: ['available', 'unavailable', UNKNOWN],
    default: UNKNOWN,
  },
  status: {
    type: String,
    enum: Object.values(CANDIDATE_STATUS),
    default: CANDIDATE_STATUS.PENDING_VALIDATION,
    required: true,
  },
  eligibility: { type: eligibilitySchema, default: () => ({}) },
}, { timestamps: true });

candidateSchema.index(
  { email: 1 },
  {
    unique: true,
    name: 'unique_active_candidate_email',
    partialFilterExpression: { status: CANDIDATE_STATUS.ACTIVE },
  }
);

candidateSchema.virtual('visibleToCompanies').get(function visibleToCompanies() {
  return this.status === CANDIDATE_STATUS.ACTIVE;
});

candidateSchema.statics.findVisibleToCompanies = function findVisibleToCompanies() {
  return this.find({ status: CANDIDATE_STATUS.ACTIVE });
};

candidateSchema.set('toJSON', {
  virtuals: true,
  transform: (_document, result) => {
    delete result.__v;
    delete result.id;
    if (result.eligibility) delete result.eligibility.source;
    return result;
  },
});

module.exports = mongoose.model('Candidate', candidateSchema);
