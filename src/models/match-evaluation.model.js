const mongoose = require('mongoose');

const matchEvaluationSchema = new mongoose.Schema({
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, immutable: true },
  vacancy: { type: mongoose.Schema.Types.ObjectId, ref: 'Vacancy', required: true, immutable: true },
  executionId: { type: String, required: true, maxlength: 200, immutable: true },
  cause: { type: String, enum: ['candidate_ranking', 'vacancy_ranking', 'match_detail', 'recalculation'],
    required: true, immutable: true },
  calculatedAt: { type: Date, required: true, immutable: true },
  algorithmVersion: { type: String, required: true, match: /^MATCH_V[1-9]\d*$/, immutable: true },
  configurationVersions: {
    engine: { type: String, default: null, match: /^MATCH_V[1-9]\d*$/, immutable: true },
    profileCatalog: { type: Number, required: true, min: 1, immutable: true },
    multipliers: { type: Number, required: true, min: 1, immutable: true },
    rankingThreshold: { type: Number, default: null, min: 1, immutable: true },
    completionThreshold: { type: Number, default: null, min: 1, immutable: true },
  },
  inputRevisions: {
    vacancyRequirements: { type: Number, required: true, min: 0, immutable: true },
    vacancyUpdatedAt: { type: Date, required: true, immutable: true },
    candidateProfile: { type: Number, default: null, min: 1, immutable: true },
    candidateProfileUpdatedAt: { type: Date, default: null, immutable: true },
  },
  calculationStatus: { type: String, enum: ['calculable', 'not_calculable'], required: true,
    immutable: true },
  percentage: { type: Number, default: null, min: 0, max: 100, immutable: true },
  earnedPoints: { type: Number, default: null, min: 0, immutable: true },
  possiblePoints: { type: Number, default: null, min: 0, immutable: true },
  eligibility: {
    eligible: { type: Boolean, default: null, immutable: true },
    reason: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  },
  privacyScope: { type: String, enum: ['internal_ids_only'], default: 'internal_ids_only',
    immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

matchEvaluationSchema.index({ candidate: 1, vacancy: 1, executionId: 1,
  'inputRevisions.vacancyRequirements': 1, 'inputRevisions.candidateProfile': 1,
  algorithmVersion: 1 }, { unique: true, name: 'unique_match_evaluation_execution' });
matchEvaluationSchema.index({ candidate: 1, vacancy: 1, calculatedAt: -1, _id: -1 },
  { name: 'latest_match_evaluation_pair' });

module.exports = mongoose.model('MatchEvaluation', matchEvaluationSchema);
