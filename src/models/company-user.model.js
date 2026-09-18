const mongoose = require('mongoose');

const companyUserSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['recruiter'], default: 'recruiter', required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  authorizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false },
}, { timestamps: true });

companyUserSchema.index({ company: 1 }, {
  unique: true,
  name: 'unique_active_recruiter_company',
  partialFilterExpression: { status: 'active' },
});
companyUserSchema.index({ user: 1 }, {
  unique: true,
  name: 'unique_active_recruiter_user',
  partialFilterExpression: { status: 'active' },
});

companyUserSchema.set('toJSON', {
  transform: (_document, result) => {
    delete result.__v;
    delete result.authorizedBy;
    return result;
  },
});

module.exports = mongoose.model('CompanyUser', companyUserSchema);
