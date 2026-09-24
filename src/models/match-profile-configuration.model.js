const mongoose = require('mongoose');
const { INITIAL_MATCH_WEIGHTS } = require('../config/match-profile');
const { DIMENSIONS } = require('../config/geography');

const optionSchema = new mongoose.Schema({
  id: { type: String, required: true, match: /^[a-z][a-z0-9_-]*$/ },
  label: { type: String, required: true, trim: true },
  aliases: { type: [String], default: [] },
}, { _id: false });

const fieldSchema = new mongoose.Schema({
  key: { type: String, required: true, enum: Object.keys(INITIAL_MATCH_WEIGHTS) },
  label: { type: String, trim: true, maxlength: 100, default: undefined },
  weight: { type: Number, required: true, min: 1, validate: Number.isInteger },
  options: { type: [optionSchema], default: [] },
}, { _id: false });

const configurationSchema = new mongoose.Schema({
  version: { type: Number, required: true, min: 1, unique: true },
  fields: { type: [fieldSchema], required: true },
  geographyWeights: { type: new mongoose.Schema(Object.fromEntries(DIMENSIONS.map((key) =>
    [key, { type: Number, required: true, min: 1, validate: Number.isInteger }])),
  { _id: false }), default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false },
}, { timestamps: { createdAt: true, updatedAt: false } });

configurationSchema.set('toJSON', {
  transform: (_document, result) => {
    delete result.__v;
    delete result.createdBy;
    return result;
  },
});

module.exports = mongoose.model('MatchProfileConfiguration', configurationSchema);
