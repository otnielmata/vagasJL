const mongoose = require('mongoose');

const vacancyImportRevisionSchema = new mongoose.Schema({
  vacancy: { type: mongoose.Schema.Types.ObjectId, ref: 'Vacancy', required: true },
  source: { type: String, required: true, maxlength: 100 },
  sourceId: { type: String, required: true, maxlength: 200 },
  batchId: { type: String, required: true, maxlength: 200 },
  action: { type: String, enum: ['created', 'updated', 'closed'], required: true },
  referenceAt: { type: Date, required: true },
  sourceVersion: { type: String, default: null, maxlength: 200 },
  configurationVersion: { type: Number, required: true, min: 1 },
  changedFields: { type: [String], default: [] },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  contentFingerprint: { type: String, required: true },
  reviewRequired: { type: Boolean, default: false },
}, { timestamps: true });

vacancyImportRevisionSchema.index({ source: 1, batchId: 1, sourceId: 1, action: 1 }, {
  unique: true, name: 'unique_import_revision_item',
});

module.exports = mongoose.model('VacancyImportRevision', vacancyImportRevisionSchema);
