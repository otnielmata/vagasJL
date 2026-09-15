const { createHash, timingSafeEqual } = require('node:crypto');
const config = require('../config/env');
const ApiError = require('../errors/api.error');
const StudentAuthorization = require('../models/student-authorization.model');

function hashEvidence(value) {
  return createHash('sha256').update(value).digest('hex');
}

function matchesHash(value, expectedHash) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash || '')) return false;
  const actualHash = hashEvidence(value);
  return timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(actualHash, 'hex'));
}

async function validateStudent(email, evidence = {}) {
  if (config.studentValidation.source === 'pending') return 'pending';

  if (typeof evidence === 'string') evidence = { purchaseCode: evidence };
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) evidence = {};
  let student;
  try {
    await StudentAuthorization.init();
    student = await StudentAuthorization.findOne({ email: email.trim().toLowerCase() })
      .select('+purchaseCodeHash +trustedIdentifierHash');
  } catch (error) {
    if (error.code === 11000) throw new ApiError(500, 'Base autorizada de alunos inconsistente');
    throw error;
  }
  if (!student || student.status === 'denied') return 'rejected';
  if (student.status === 'authorized') return 'verified';
  if (student.status !== 'pending') return 'rejected';

  const suppliedEvidence = [
    [evidence.purchaseCode, student.purchaseCodeHash],
    [evidence.trustedIdentifier, student.trustedIdentifierHash],
  ].filter(([value]) => value !== undefined);

  if (suppliedEvidence.length === 0) return 'pending';
  return suppliedEvidence.some(([value, expectedHash]) => matchesHash(value, expectedHash))
    ? 'verified'
    : 'rejected';
}

module.exports = { validateStudent };
