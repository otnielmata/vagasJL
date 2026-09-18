const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  legalName: { type: String, required: true, trim: true, maxlength: 200 },
  tradeName: { type: String, trim: true, maxlength: 200, default: null },
  website: { type: String, trim: true, maxlength: 2048, default: null },
  description: { type: String, trim: true, maxlength: 5000, default: null },
  city: { type: String, required: true, trim: true, maxlength: 200 },
  state: { type: String, required: true, trim: true, maxlength: 200 },
  country: { type: String, required: true, trim: true, maxlength: 200 },
  responsibleName: { type: String, required: true, trim: true, maxlength: 200 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  phone: { type: String, trim: true, maxlength: 40, default: null },
  linkedinUrl: { type: String, trim: true, maxlength: 2048, default: null },
  segment: { type: String, trim: true, maxlength: 200, default: null },
  status: { type: String, enum: ['pending', 'active', 'inactive', 'blocked'], default: 'pending', required: true },
  registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false },
  deletedAt: { type: Date, default: null, select: false },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, select: false },
  statusVerifiedAt: { type: Date, default: null, select: false },
  statusVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, select: false },
  statusVerificationReference: { type: String, default: null, maxlength: 200, select: false },
}, { timestamps: true });

companySchema.index({ email: 1 }, {
  unique: true,
  name: 'unique_current_company_email',
  partialFilterExpression: { deletedAt: null },
});

companySchema.set('toJSON', {
  transform: (_document, result) => {
    delete result.__v;
    delete result.registeredBy;
    delete result.deletedAt;
    delete result.deletedBy;
    delete result.statusVerifiedAt;
    delete result.statusVerifiedBy;
    delete result.statusVerificationReference;
    return result;
  },
});

module.exports = mongoose.model('Company', companySchema);
