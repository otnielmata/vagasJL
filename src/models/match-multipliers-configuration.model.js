const mongoose = require('mongoose');

const multipliersSchema = new mongoose.Schema({
  required: { type: Number, required: true, enum: [1] },
  desirable: { type: Number, required: true, min: 0, max: 1,
    validate: (value) => value > 0 && value < 1 },
  indifferent: { type: Number, required: true, enum: [0] },
}, { _id: false });

const schema = new mongoose.Schema({
  version: { type: Number, required: true, min: 1, unique: true },
  multipliers: { type: multipliersSchema, required: true },
  effectiveAt: { type: Date, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.set('toJSON', { transform: (_document, result) => {
  delete result.__v;
  return result;
} });

module.exports = mongoose.model('MatchMultipliersConfiguration', schema);
