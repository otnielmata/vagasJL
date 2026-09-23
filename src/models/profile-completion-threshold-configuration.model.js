const mongoose = require('mongoose');

function hasSupportedPrecision(value) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

const schema = new mongoose.Schema({
  version: { type: Number, required: true, min: 1, unique: true },
  minimumPercentage: { type: Number, required: true, min: 0, max: 100,
    validate: hasSupportedPrecision },
  effectiveAt: { type: Date, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.set('toJSON', { transform: (_document, result) => {
  delete result.__v;
  return result;
} });

module.exports = mongoose.model('ProfileCompletionThresholdConfiguration', schema);
