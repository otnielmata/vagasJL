const mongoose = require('mongoose');
const { CATEGORY_FIELDS } = require('../config/master-catalog');

const recalculationSchema = new mongoose.Schema({
  status: { type: String, enum: ['scheduled'], required: true },
  scheduledFor: { type: Date, required: true },
}, { _id: false });

const schema = new mongoose.Schema({
  category: { type: String, required: true, enum: Object.keys(CATEGORY_FIELDS), immutable: true },
  id: { type: String, required: true, match: /^[a-z][a-z0-9_]*$/, immutable: true },
  revision: { type: Number, required: true, min: 1, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  aliases: { type: [String], default: [] },
  normalizedAliases: { type: [String], required: true, select: false },
  active: { type: Boolean, required: true },
  state: { type: String, required: true, enum: ['published'], immutable: true },
  effectiveAt: { type: Date, required: true, immutable: true },
  reason: { type: String, required: true, maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false },
  profileConfigurationVersion: { type: Number, required: true, min: 1, immutable: true },
  cacheInvalidatedAt: { type: Date, required: true },
  recalculation: { type: recalculationSchema, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ category: 1, id: 1, revision: 1 }, {
  unique: true, name: 'unique_master_catalog_item_revision',
});
schema.index({ id: 1, revision: -1 }, { name: 'master_catalog_global_id_history' });
schema.index({ state: 1, effectiveAt: -1, category: 1, id: 1, revision: -1 },
  { name: 'published_master_catalog_versions' });

schema.set('toJSON', { transform: (_document, result) => {
  delete result.__v;
  delete result.createdBy;
  delete result.normalizedAliases;
  return result;
} });

module.exports = mongoose.model('MasterCatalogItem', schema);
