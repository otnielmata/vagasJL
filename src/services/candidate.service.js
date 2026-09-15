const User = require('../models/user.model');
const Candidate = require('../models/candidate.model');
const ApiError = require('../errors/api.error');
const studentValidation = require('./student-validation.service');
const {
  UNKNOWN,
  CANDIDATE_STATUS,
  ELIGIBILITY_STATUS,
  ELIGIBILITY_METHOD,
  ELIGIBILITY_SOURCE,
  PROFILE_FIELDS,
} = require('../config/candidate');

function isValidSource(source) {
  return typeof source === 'string' && source.trim().length > 0 && source.length <= 100;
}

function assertValidationResult(validation) {
  const validStatus = Object.values(ELIGIBILITY_STATUS).includes(validation?.status);
  const validMethod = Object.values(ELIGIBILITY_METHOD).includes(validation?.method);
  if (!validStatus || !validMethod || !isValidSource(validation?.source)) {
    throw new Error('Resultado de validacao de aluno desconhecido');
  }
}

function eligibilityData(validation, attemptedAt) {
  return {
    status: validation.status,
    method: validation.method,
    source: validation.source,
    lastAttemptAt: attemptedAt,
    approvedAt: validation.status === ELIGIBILITY_STATUS.APPROVED ? attemptedAt : null,
  };
}

async function persistPendingValidation(candidate, validation, attemptedAt) {
  const changes = { eligibility: eligibilityData(validation, attemptedAt) };
  if (validation.status === ELIGIBILITY_STATUS.APPROVED) {
    changes.status = CANDIDATE_STATUS.INCOMPLETE_PROFILE;
  }
  const updated = await Candidate.findOneAndUpdate(
    { _id: candidate._id, user: candidate.user, status: CANDIDATE_STATUS.PENDING_VALIDATION },
    { $set: changes },
    { new: true, runValidators: true }
  );
  if (!updated) throw new ApiError(409, 'O candidato foi alterado durante a validacao');
  return updated;
}

async function processPendingValidation(candidate, evidence = {}, validationEmail = candidate.email) {
  const attemptedAt = new Date();
  const validation = await studentValidation.validateStudentEligibility(validationEmail, evidence);
  assertValidationResult(validation);
  const updated = await persistPendingValidation(candidate, validation, attemptedAt);
  if (validation.status === ELIGIBILITY_STATUS.REJECTED) {
    throw new ApiError(422, 'Candidato nao elegivel na base autorizada de alunos');
  }
  return {
    candidate: updated,
    statusCode: validation.status === ELIGIBILITY_STATUS.PENDING ? 202 : 200,
  };
}

function hasCompleteApproval(candidate) {
  return Boolean(candidate.eligibility?.status === ELIGIBILITY_STATUS.APPROVED &&
    Object.values(ELIGIBILITY_METHOD).includes(candidate.eligibility.method) &&
    candidate.eligibility.method !== ELIGIBILITY_METHOD.UNKNOWN &&
    isValidSource(candidate.eligibility.source) &&
    candidate.eligibility.source !== ELIGIBILITY_SOURCE.PENDING &&
    candidate.eligibility.lastAttemptAt && candidate.eligibility.approvedAt);
}

async function ensureApprovedMetadata(candidate) {
  const shouldCompleteStatus = candidate.status === CANDIDATE_STATUS.PENDING_VALIDATION;
  if (!shouldCompleteStatus && hasCompleteApproval(candidate)) return candidate;

  const approvedAt = candidate.eligibility?.approvedAt || candidate.eligibility?.lastAttemptAt ||
    candidate.updatedAt || candidate.createdAt || new Date();
  const method = Object.values(ELIGIBILITY_METHOD).includes(candidate.eligibility?.method) &&
    candidate.eligibility.method !== ELIGIBILITY_METHOD.UNKNOWN
    ? candidate.eligibility.method
    : ELIGIBILITY_METHOD.LEGACY;
  const source = isValidSource(candidate.eligibility?.source) &&
    candidate.eligibility.source !== ELIGIBILITY_SOURCE.PENDING
    ? candidate.eligibility.source
    : ELIGIBILITY_SOURCE.LEGACY;
  const updated = await Candidate.findOneAndUpdate(
    { _id: candidate._id, user: candidate.user, status: candidate.status },
    {
      $set: {
        ...(shouldCompleteStatus ? { status: CANDIDATE_STATUS.INCOMPLETE_PROFILE } : {}),
        eligibility: {
          status: ELIGIBILITY_STATUS.APPROVED,
          method,
          source,
          lastAttemptAt: candidate.eligibility?.lastAttemptAt || approvedAt,
          approvedAt,
        },
      },
    },
    { new: true, runValidators: true }
  );
  if (!updated) throw new ApiError(409, 'O candidato foi alterado durante a validacao');
  return updated;
}

async function registerCandidate(userId, input) {
  const user = await User.findById(userId).select('email status');
  if (!user || user.status !== 'active') throw new ApiError(401, 'Usuario nao autenticado ou inativo');

  const email = input.email.trim().toLowerCase();
  if (email !== user.email) throw new ApiError(400, 'O email deve corresponder a conta autenticada');

  try {
    await Candidate.init();
    if (await Candidate.findOne({ $or: [{ user: user._id }, { email }] })) {
      throw new ApiError(409, 'Ja existe um candidato cadastrado para este usuario ou email');
    }

    const attemptedAt = new Date();
    const validation = await studentValidation.validateStudentEligibility(user.email, {
      purchaseCode: input.purchaseCode,
      trustedIdentifier: input.trustedIdentifier,
    });
    assertValidationResult(validation);
    if (validation.status === ELIGIBILITY_STATUS.REJECTED) {
      throw new ApiError(422, 'Usuario nao autorizado na base de alunos');
    }

    const profile = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, input[field] ?? UNKNOWN]));
    const candidate = new Candidate({
      user: user._id,
      name: input.name,
      email,
      ...profile,
      eligibility: eligibilityData(validation, attemptedAt),
    });
    if (validation.status === ELIGIBILITY_STATUS.APPROVED) {
      candidate.status = CANDIDATE_STATUS.INCOMPLETE_PROFILE;
    }
    return await candidate.save();
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'Ja existe um candidato cadastrado para este usuario ou email');
    }
    if (error.name === 'ValidationError') throw new ApiError(400, 'Dados de candidato invalidos');
    throw error;
  }
}

async function revalidatePendingCandidate(candidateId) {
  const candidate = await Candidate.findById(candidateId);
  if (!candidate) throw new ApiError(404, 'Candidato nao encontrado');
  if (candidate.status !== CANDIDATE_STATUS.PENDING_VALIDATION) {
    throw new ApiError(409, 'Somente candidatos pendentes podem ser revalidados');
  }
  return (await processPendingValidation(candidate)).candidate;
}

async function validateCandidateEligibility(candidateId, userId, evidence = {}) {
  const candidate = await Candidate.findById(candidateId);
  if (!candidate) throw new ApiError(404, 'Candidato nao encontrado');
  if (candidate.user.toString() !== userId.toLowerCase()) {
    throw new ApiError(403, 'O candidato pertence a outro usuario');
  }
  if ([CANDIDATE_STATUS.INACTIVE, CANDIDATE_STATUS.BLOCKED].includes(candidate.status)) {
    throw new ApiError(409, 'Candidato inativo ou bloqueado nao pode ser validado');
  }
  if ([CANDIDATE_STATUS.INCOMPLETE_PROFILE, CANDIDATE_STATUS.ACTIVE].includes(candidate.status) ||
      candidate.eligibility?.status === ELIGIBILITY_STATUS.APPROVED) {
    return { candidate: await ensureApprovedMetadata(candidate), statusCode: 200 };
  }
  if (candidate.status !== CANDIDATE_STATUS.PENDING_VALIDATION) {
    throw new ApiError(409, 'Status do candidato incompativel com a validacao');
  }
  const user = await User.findById(userId).select('email status role');
  if (!user || user.status !== 'active') throw new ApiError(401, 'Usuario nao autenticado ou inativo');
  if (user.role !== 'candidate') throw new ApiError(403, 'Apenas candidatos podem validar elegibilidade');
  const accountEmail = user.email.trim().toLowerCase();
  if (candidate.email !== accountEmail) {
    throw new ApiError(409, 'O email do candidato nao corresponde a conta autenticada');
  }
  return processPendingValidation(candidate, evidence, accountEmail);
}

module.exports = { registerCandidate, revalidatePendingCandidate, validateCandidateEligibility };
