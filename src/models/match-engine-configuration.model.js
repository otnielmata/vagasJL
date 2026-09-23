const mongoose = require('mongoose');
const { INITIAL_MATCH_WEIGHTS } = require('../config/match-profile');

const weightsSchema = new mongoose.Schema(Object.fromEntries(
  Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => [key, {
    type: Number, required: true, min: 0, max: 1000,
  }])
), { _id: false, strict: 'throw' });

const multipliersSchema = new mongoose.Schema({
  required: { type: Number, required: true, enum: [1] },
  desirable: { type: Number, required: true, min: 0, max: 1 },
  indifferent: { type: Number, required: true, enum: [0] },
}, { _id: false, strict: 'throw' });

const recalculationSchema = new mongoose.Schema({
  policy: { type: String, enum: ['none', 'affected_matches'], required: true },
  status: { type: String, enum: ['not_scheduled', 'not_required', 'scheduled'], required: true },
  scheduledFor: { type: Date, default: null },
}, { _id: false });

const schema = new mongoose.Schema({
  version: { type: String, required: true, unique: true, match: /^MATCH_V[1-9]\d*$/, immutable: true },
  revision: { type: Number, required: true, min: 1, unique: true, immutable: true },
  state: { type: String, enum: ['draft', 'published'], required: true },
  weights: { type: weightsSchema, required: true },
  multipliers: { type: multipliersSchema, required: true },
  defaultImportImportance: {
    type: String, enum: ['required', 'desirable', 'indifferent'], required: true,
  },
  minimumMatchPercentage: { type: Number, required: true, min: 0, max: 100 },
  minimumProfileCompletionPercentage: { type: Number, default: null, min: 0, max: 100 },
  effectiveAt: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, default: null },
  cacheVersion: { type: Number, required: true, min: 1 },
  cacheInvalidatedAt: { type: Date, default: null },
  recalculation: { type: recalculationSchema, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ state: 1, effectiveAt: -1, revision: -1 },
  { name: 'effective_published_match_configuration' });

schema.set('toJSON', { transform: (_document, result) => {
  delete result.__v;
  return result;
} });

module.exports = mongoose.model('MatchEngineConfiguration', schema);
