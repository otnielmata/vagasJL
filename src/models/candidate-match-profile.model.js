const mongoose = require('mongoose');
const { INITIAL_MATCH_WEIGHTS } = require('../config/match-profile');

const keys = Object.keys(INITIAL_MATCH_WEIGHTS);
const valueFields = Object.fromEntries(keys.map((key) => [key, key === 'yearsOfExperience'
  ? { type: Number, min: 0, max: 100, default: undefined }
  : { type: [String], default: undefined }]));

const valuesSchema = new mongoose.Schema(valueFields, { _id: false, strict: 'throw' });

const profileSchema = new mongoose.Schema({
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false },
  configurationVersion: { type: Number, required: true, min: 1 },
  revision: { type: Number, required: true, min: 1, default: 1 },
  values: { type: valuesSchema, required: true, default: () => ({}) },
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
    const values = result.values || {};
    result.pendingFields = keys.filter((key) => values[key] === undefined ||
      (Array.isArray(values[key]) && values[key].length === 0));
    return result;
  },
});

module.exports = mongoose.model('CandidateMatchProfile', profileSchema);
