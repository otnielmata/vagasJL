const { createHash, timingSafeEqual } = require('node:crypto');
const config = require('../config/env');
const ApiError = require('../errors/api.error');
const StudentAuthorization = require('../models/student-authorization.model');
const {
  ELIGIBILITY_STATUS,
  ELIGIBILITY_METHOD,
  ELIGIBILITY_SOURCE,
} = require('../config/candidate');

function hashEvidence(value) {
  return createHash('sha256').update(value).digest('hex');
}

function matchesHash(value, expectedHash) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash || '')) return false;
  return timingSafeEqual(
    Buffer.from(hashEvidence(value), 'hex'),
    Buffer.from(expectedHash, 'hex')
  );
}

function normalizeEvidence(evidence) {
  if (typeof evidence === 'string') return { purchaseCode: evidence };
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return {};
  return evidence;
}

function requestedMethod(evidence) {
  const hasPurchaseCode = evidence.purchaseCode !== undefined;
  const hasTrustedIdentifier = evidence.trustedIdentifier !== undefined;
  if (hasPurchaseCode && hasTrustedIdentifier) return ELIGIBILITY_METHOD.MULTIPLE;
  if (hasPurchaseCode) return ELIGIBILITY_METHOD.PURCHASE_CODE;
  if (hasTrustedIdentifier) return ELIGIBILITY_METHOD.TRUSTED_IDENTIFIER;
  return ELIGIBILITY_METHOD.EMAIL;
}

function result(status, method, source) {
  return { status, method, source };
}

function mapSourceFailure(error) {
  if (error instanceof ApiError) return error;
  const unavailable = new ApiError(503, 'Fonte de validacao temporariamente indisponivel');
  unavailable.cause = error;
  return unavailable;
}

async function validatePendingSource({ method }) {
  return result(ELIGIBILITY_STATUS.PENDING, method, ELIGIBILITY_SOURCE.PENDING);
}

async function validateMongoSource({ email, evidence, method }) {
  let student;
  try {
    await StudentAuthorization.init();
    student = await StudentAuthorization.findOne({ email: email.trim().toLowerCase() })
      .select('+purchaseCodeHash +trustedIdentifierHash');
  } catch (error) {
    throw mapSourceFailure(error);
  }

  if (!student || student.status === 'denied' || !['authorized', 'pending'].includes(student.status)) {
    return result(ELIGIBILITY_STATUS.REJECTED, method, ELIGIBILITY_SOURCE.MONGODB);
  }
  if (student.status === 'authorized') {
    return result(ELIGIBILITY_STATUS.APPROVED, ELIGIBILITY_METHOD.EMAIL, ELIGIBILITY_SOURCE.MONGODB);
  }

  if (matchesHash(evidence.purchaseCode, student.purchaseCodeHash)) {
    return result(
      ELIGIBILITY_STATUS.APPROVED,
      ELIGIBILITY_METHOD.PURCHASE_CODE,
      ELIGIBILITY_SOURCE.MONGODB
    );
  }
  if (matchesHash(evidence.trustedIdentifier, student.trustedIdentifierHash)) {
    return result(
      ELIGIBILITY_STATUS.APPROVED,
      ELIGIBILITY_METHOD.TRUSTED_IDENTIFIER,
      ELIGIBILITY_SOURCE.MONGODB
    );
  }
  if (method === ELIGIBILITY_METHOD.EMAIL) {
    return result(ELIGIBILITY_STATUS.PENDING, method, ELIGIBILITY_SOURCE.MONGODB);
  }
  return result(ELIGIBILITY_STATUS.REJECTED, method, ELIGIBILITY_SOURCE.MONGODB);
}

const sourceAdapters = Object.freeze({
  [ELIGIBILITY_SOURCE.PENDING]: validatePendingSource,
  [ELIGIBILITY_SOURCE.MONGODB]: validateMongoSource,
});

async function validateStudentEligibility(email, submittedEvidence = {}) {
  const evidence = normalizeEvidence(submittedEvidence);
  const method = requestedMethod(evidence);
  const adapter = sourceAdapters[config.studentValidation.source];
  if (!adapter) throw new ApiError(503, 'Fonte de validacao temporariamente indisponivel');
  return adapter({ email, evidence, method });
}

async function validateStudent(email, evidence = {}) {
  const validation = await validateStudentEligibility(email, evidence);
  return validation.status === ELIGIBILITY_STATUS.APPROVED ? 'verified' : validation.status;
}

module.exports = { validateStudent, validateStudentEligibility };
