const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  version: { type: Number, required: true, min: 1, unique: true },
  importance: { type: String, required: true, enum: ['required', 'desirable', 'indifferent'] },
  effectiveAt: { type: Date, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.set('toJSON', { transform: (_document, result) => {
  delete result.__v;
  return result;
} });

module.exports = mongoose.model('ImportImportanceConfiguration', schema);
