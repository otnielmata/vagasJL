const mongoose = require('mongoose');
const { INITIAL_MATCH_WEIGHTS, BOOLEAN_MATCH_FIELDS } = require('../config/match-profile');

const keys = Object.keys(INITIAL_MATCH_WEIGHTS);
const valueFields = Object.fromEntries(keys.map((key) => [key, key === 'yearsOfExperience'
  ? { type: Number, min: 0, max: 100, default: undefined }
  : { type: [String], default: undefined }]));

const valuesSchema = new mongoose.Schema(valueFields, { _id: false, strict: 'throw' });
const legacyAiAuditSchema = new mongoose.Schema({
  at: { type: Date, required: true },
  sourceField: { type: String, required: true, enum: ['genAITecnologies'] },
  entries: { type: [{
    submitted: { type: String, required: true, maxlength: 100 },
    canonicalId: { type: String, default: null },
    status: { type: String, required: true, enum: ['mapped', 'pending'] },
  }], required: true },
}, { _id: false });

const profileSchema = new mongoose.Schema({
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false },
  configurationVersion: { type: Number, required: true, min: 1 },
  revision: { type: Number, required: true, min: 1, default: 1 },
  values: { type: valuesSchema, required: true, default: () => ({}) },
  legacyAiMigrationHistory: { type: [legacyAiAuditSchema], default: [], select: false },
  deletedAt: { type: Date, default: null, select: false },
}, { timestamps: true });

profileSchema.index(
  { candidate: 1 },
  { unique: true, name: 'unique_current_candidate_match_profile', partialFilterExpression: { deletedAt: null } }
);

profileSchema.set('toJSON', {
  transform: (_document, result) => {
    delete result.__v;
    delete result.user;
    delete result.deletedAt;
    delete result.legacyAiMigrationHistory;
    const values = result.values || {};
    result.pendingFields = keys.filter((key) => values[key] === undefined ||
      (Array.isArray(values[key]) && values[key].length === 0 && !BOOLEAN_MATCH_FIELDS.includes(key)));
    return result;
  },
});

module.exports = mongoose.model('CandidateMatchProfile', profileSchema);
