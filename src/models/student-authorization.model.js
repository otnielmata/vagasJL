const mongoose = require('mongoose');

const studentAuthorizationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^\S+@\S+\.\S+$/,
  },
  status: { type: String, enum: ['authorized', 'pending', 'denied'], default: 'pending', required: true },
  purchaseCodeHash: { type: String, match: /^[a-f0-9]{64}$/, select: false, unique: true, sparse: true },
  trustedIdentifierHash: { type: String, match: /^[a-f0-9]{64}$/, select: false, unique: true, sparse: true },
}, { timestamps: true, collection: 'authorized_students' });

module.exports = mongoose.model('StudentAuthorization', studentAuthorizationSchema);
