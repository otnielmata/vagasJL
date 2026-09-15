const mongoose = require('mongoose');
const { UNKNOWN, CANDIDATE_STATUS, PROFILE_FIELDS } = require('../config/candidate');

const optionalProfile = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, {
  type: String,
  default: UNKNOWN,
  trim: true,
}]));

const candidateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, match: /^\S+@\S+\.\S+$/ },
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
}, { timestamps: true });

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
    return result;
  },
});

module.exports = mongoose.model('Candidate', candidateSchema);
