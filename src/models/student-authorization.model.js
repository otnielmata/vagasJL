const mongoose = require('mongoose');

const studentAuthorizationSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  status: { type: String, enum: ['authorized', 'pending', 'denied'], default: 'pending', required: true },
  purchaseCodeHash: { type: String, match: /^[a-f0-9]{64}$/, select: false },
}, { timestamps: true, collection: 'authorized_students' });

module.exports = mongoose.model('StudentAuthorization', studentAuthorizationSchema);
