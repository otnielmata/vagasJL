const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, immutable: true },
  vacancy: { type: mongoose.Schema.Types.ObjectId, ref: 'Vacancy', required: true, immutable: true },
  vacancyOrigin: { type: String, enum: ['IMPORTED', 'COMPANY', 'ADMIN'], required: true, immutable: true },
  state: { type: String, enum: ['redirect_ready'], default: 'redirect_ready', required: true,
    immutable: true },
  channelType: { type: String, enum: ['https_url', 'email'], required: true, immutable: true },
  channelReference: { type: String, required: true, maxlength: 255, immutable: true },
  channelFingerprint: { type: String, required: true, match: /^[a-f\d]{64}$/, immutable: true },
  privacyScope: { type: String, enum: ['minimal_referral_event'], default: 'minimal_referral_event',
    required: true, immutable: true },
  referredAt: { type: Date, required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ candidate: 1, vacancy: 1, channelFingerprint: 1 }, {
  unique: true,
  name: 'unique_candidate_vacancy_channel_referral',
});

module.exports = mongoose.model('ApplicationReferral', schema);
