const mongoose = require('mongoose');

const failureSchema = new mongoose.Schema({
  sourceId: { type: String, default: null, maxlength: 200 },
  itemIndex: { type: Number, default: null, min: 0 },
  stage: { type: String, required: true,
    enum: ['identity', 'validation', 'transformation', 'status', 'persistence'] },
  code: { type: String, required: true, maxlength: 100 },
}, { _id: false });

const importBatchSchema = new mongoose.Schema({
  source: { type: String, required: true, maxlength: 100 },
  batchId: { type: String, required: true, maxlength: 200 },
  collectionType: { type: String, enum: ['snapshot', 'incremental'], required: true },
  referenceAt: { type: Date, required: true },
  status: { type: String, enum: ['processing', 'completed', 'completed_with_failures'], required: true },
  result: {
    created: { type: Number, default: 0, min: 0 },
    unchanged: { type: Number, default: 0, min: 0 },
    updated: { type: Number, default: 0, min: 0 },
    closed: { type: Number, default: 0, min: 0 },
    reviewRequired: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
  },
  failures: { type: [failureSchema], default: [] },
}, { timestamps: true });

importBatchSchema.index({ source: 1, batchId: 1 }, {
  unique: true, name: 'unique_import_batch_source',
});

module.exports = mongoose.model('ImportBatch', importBatchSchema);
