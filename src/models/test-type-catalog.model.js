const mongoose = require('mongoose');

const typeSchema = new mongoose.Schema({
  id: { type: String, required: true, match: /^[a-z][a-z0-9-]*$/ },
  label: { type: String, required: true, trim: true },
  aliases: { type: [String], default: [] },
}, { _id: false });

const catalogSchema = new mongoose.Schema({
  version: { type: Number, required: true, min: 1, unique: true },
  types: { type: [typeSchema], required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false },
}, { collection: 'test_type_catalogs', timestamps: { createdAt: true, updatedAt: false } });

catalogSchema.set('toJSON', {
  transform: (_document, result) => {
    delete result.__v;
    delete result.createdBy;
    return result;
  },
});

module.exports = mongoose.model('TestTypeCatalog', catalogSchema);
