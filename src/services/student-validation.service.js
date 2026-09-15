const { createHash, timingSafeEqual } = require('node:crypto');
const config = require('../config/env');
const StudentAuthorization = require('../models/student-authorization.model');

async function validateStudent(email, purchaseCode) {
  if (config.studentValidation.source === 'pending') return 'pending';

  const student = await StudentAuthorization.findOne({ email: email.trim().toLowerCase() })
    .select('+purchaseCodeHash');
  if (!student || student.status === 'denied') return 'rejected';
  if (student.status === 'pending') return 'pending';
  if (student.status !== 'authorized') return 'rejected';

  if (purchaseCode !== undefined) {
    const expected = student.purchaseCodeHash;
    const actual = createHash('sha256').update(purchaseCode).digest('hex');
    if (!expected || expected.length !== actual.length ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return 'rejected';
  }
  return 'verified';
}

module.exports = { validateStudent };
