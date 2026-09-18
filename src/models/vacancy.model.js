const mongoose = require('mongoose');
const { INITIAL_MATCH_WEIGHTS } = require('../config/match-profile');

const matchFields = Object.fromEntries(Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => [key,
  key === 'yearsOfExperience'
    ? { type: Number, min: 0, max: 100, default: undefined }
    : { type: [String], default: undefined },
]));
const matchValuesSchema = new mongoose.Schema(matchFields, { _id: false, strict: 'throw' });
const matchProfileSchema = new mongoose.Schema({
  configurationVersion: { type: Number, required: true, min: 1 },
  values: { type: matchValuesSchema, required: true },
}, { _id: false });
const locationSchema = new mongoose.Schema({
  city: { type: String, required: true, trim: true, maxlength: 200 },
  state: { type: String, required: true, trim: true, maxlength: 200 },
  country: { type: String, required: true, trim: true, maxlength: 200 },
}, { _id: false });

const vacancySchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null,
    select: false, immutable: true },
  importSource: { type: String, trim: true, maxlength: 100, default: null, immutable: true },
  importSourceId: { type: String, trim: true, maxlength: 200, default: null, immutable: true },
  reference: { type: String, trim: true, lowercase: true, maxlength: 100, default: null },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 10000 },
  location: { type: locationSchema, default: null },
  matchProfile: { type: matchProfileSchema, required: true },
  origin: {
    type: String,
    enum: ['IMPORTED', 'COMPANY', 'ADMIN'],
    required: true,
    immutable: true,
    validate: {
      validator(origin) {
        if (origin === 'COMPANY') {
          return Boolean(this.company && this.createdBy && !this.importSource && !this.importSourceId);
        }
        if (origin === 'IMPORTED') {
          return Boolean(this.importSource && this.importSourceId && !this.company && !this.createdBy);
        }
        if (origin === 'ADMIN') {
          return Boolean(this.createdBy && !this.company && !this.importSource && !this.importSourceId);
        }
        return false;
      },
      message: 'Procedencia da vaga incompativel com sua origem',
    },
  },
  status: { type: String, enum: ['pending', 'active', 'paused', 'expired', 'removed', 'rejected'],
    default: 'pending', required: true },
  expiresAt: { type: Date, default: null },
  statusHistory: [{
    from: { type: String, required: true },
    to: { type: String, required: true },
    at: { type: Date, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    process: { type: String, enum: ['api', 'deadline'], required: true },
    reason: { type: String, required: true, maxlength: 500 },
  }],
  deletedAt: { type: Date, default: null, select: false },
}, { timestamps: true });

vacancySchema.index({ company: 1, reference: 1 }, {
  unique: true,
  name: 'unique_current_company_vacancy_reference',
  partialFilterExpression: { origin: 'COMPANY', deletedAt: null },
});
vacancySchema.index({ importSource: 1, importSourceId: 1 }, {
  unique: true,
  name: 'unique_imported_vacancy_source',
  partialFilterExpression: {
    origin: 'IMPORTED', importSource: { $type: 'string' }, importSourceId: { $type: 'string' },
  },
});

vacancySchema.set('toJSON', {
  transform: (_document, result) => {
    delete result.__v;
    delete result.createdBy;
    delete result.deletedAt;
    delete result.statusHistory;
    return result;
  },
});

module.exports = mongoose.model('Vacancy', vacancySchema);
