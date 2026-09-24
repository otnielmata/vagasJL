const User = require('../models/user.model');
const Candidate = require('../models/candidate.model');
const Company = require('../models/company.model');
const CompanyUser = require('../models/company-user.model');
const ApiError = require('../errors/api.error');
const studentValidation = require('./student-validation.service');
const { enterpriseCandidateData } = require('./candidate-display-permissions.service');
const {
  UNKNOWN,
  CANDIDATE_STATUS,
  ELIGIBILITY_STATUS,
  ELIGIBILITY_METHOD,
  ELIGIBILITY_SOURCE,
  PROFILE_FIELDS,
  CANDIDATE_EDITABLE_FIELDS,
  CANDIDATE_MINIMUM_PROFILE_FIELDS,
} = require('../config/candidate');

const PUBLIC_CANDIDATE_FIELDS = Object.freeze([
  'name', 'photoUrl', 'email', 'phone', 'city', 'state', 'country', 'linkedinUrl',
  'githubUrl', 'portfolioUrl', 'professionalSummary', 'availability', 'availableForOpportunities',
]);
const PROFILE_FIELD_SET = new Set(PROFILE_FIELDS);
const CANDIDATE_READ_PROJECTION = Object.freeze({
  _id: 1,
  user: 1,
  status: 1,
  ...Object.fromEntries(PUBLIC_CANDIDATE_FIELDS.map((field) => [field, 1])),
  enterpriseDisplayPermissions: 1,
});
const EMAIL_UPDATE_TRANSACTION_OPTIONS = Object.freeze({
  readPreference: 'primary',
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
});
const DELETABLE_CANDIDATE_STATUSES = Object.freeze([
  CANDIDATE_STATUS.PENDING_VALIDATION,
  CANDIDATE_STATUS.INCOMPLETE_PROFILE,
  CANDIDATE_STATUS.ACTIVE,
]);

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

function normalizePublicProfileValue(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : UNKNOWN;
}

function publicCandidateData(candidate, includeStatus) {
  const result = { _id: candidate._id };
  for (const field of PUBLIC_CANDIDATE_FIELDS) {
    result[field] = field === 'availableForOpportunities'
      ? candidate[field] === true
      : PROFILE_FIELD_SET.has(field)
      ? normalizePublicProfileValue(candidate[field])
      : candidate[field];
  }
  if (includeStatus) result.status = candidate.status;
  return result;
}

function normalizeCandidateUpdates(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(400, 'Campos de alteracao invalidos');
  }
  const fields = Object.keys(input);
  if (!fields.length || fields.some((field) => !CANDIDATE_EDITABLE_FIELDS.includes(field))) {
    throw new ApiError(400, 'Campos de alteracao invalidos');
  }

  return Object.fromEntries(fields.map((field) => {
    const value = input[field];
    if (value === null && PROFILE_FIELD_SET.has(field)) return [field, UNKNOWN];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ApiError(400, 'Dados de candidato invalidos');
    }
    const normalized = value.trim();
    return [field, field === 'email' ? normalized.toLowerCase() : normalized];
  }));
}

function assertEditableCandidate(candidate, requesterId) {
  if (!candidate) throw new ApiError(404, 'Candidato nao encontrado');
  if (candidate.user.toString() !== String(requesterId).toLowerCase()) {
    throw new ApiError(403, 'Voce so pode alterar seu proprio cadastro de candidato');
  }
  if ([CANDIDATE_STATUS.INACTIVE, CANDIDATE_STATUS.BLOCKED].includes(candidate.status)) {
    throw new ApiError(409, 'Candidato inativo ou bloqueado nao pode ser alterado');
  }
}

function hasKnownValue(value) {
  return typeof value === 'string' && value.trim().length > 0 && value !== UNKNOWN;
}

function statusForCandidate(candidate) {
  if (candidate.eligibility?.status !== ELIGIBILITY_STATUS.APPROVED) {
    return CANDIDATE_STATUS.PENDING_VALIDATION;
  }
  return CANDIDATE_MINIMUM_PROFILE_FIELDS.every((field) => hasKnownValue(candidate[field]))
    ? CANDIDATE_STATUS.ACTIVE
    : CANDIDATE_STATUS.INCOMPLETE_PROFILE;
}

function pendingEligibility() {
  return {
    status: ELIGIBILITY_STATUS.PENDING,
    method: ELIGIBILITY_METHOD.UNKNOWN,
    source: ELIGIBILITY_SOURCE.PENDING,
    lastAttemptAt: null,
    approvedAt: null,
  };
}

function eligibilityAuditEntry(candidate, invalidatedAt) {
  return {
    email: candidate.email,
    status: candidate.eligibility?.status || ELIGIBILITY_STATUS.PENDING,
    method: candidate.eligibility?.method || ELIGIBILITY_METHOD.UNKNOWN,
    source: candidate.eligibility?.source || ELIGIBILITY_SOURCE.PENDING,
    lastAttemptAt: candidate.eligibility?.lastAttemptAt || null,
    approvedAt: candidate.eligibility?.approvedAt || null,
    invalidatedAt,
  };
}

function candidateUpdateError(error, emailChanged) {
  if (error.code === 11000) {
    throw new ApiError(409, 'Email ja utilizado por outra conta ou candidato ativo');
  }
  if (emailChanged && error.code === 20) {
    throw new ApiError(503, 'Alteracao de email indisponivel: configure MongoDB com suporte a transacoes');
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    throw new ApiError(400, 'Dados de candidato invalidos');
  }
  if (error.name === 'DocumentNotFoundError') throw new ApiError(404, 'Candidato nao encontrado');
  throw error;
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
  const user = await User.findById(userId).select('email status role');
  if (!user || user.status !== 'active') throw new ApiError(401, 'Usuario nao autenticado ou inativo');
  if (user.role !== 'candidate') throw new ApiError(403, 'Apenas usuarios candidatos podem criar um perfil');

  const email = input.email.trim().toLowerCase();
  if (email !== user.email) throw new ApiError(400, 'O email deve corresponder a conta autenticada');

  try {
    await Candidate.init();
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'Ja existe um candidato para este usuario ou um candidato ativo com este email');
    }
    throw error;
  }

  if (await Candidate.findOne({
    $or: [
      { user: user._id, deletedAt: null },
      { email, status: CANDIDATE_STATUS.ACTIVE },
    ],
  })) {
    throw new ApiError(409, 'Ja existe um candidato para este usuario ou um candidato ativo com este email');
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

  try {
    return await candidate.save();
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'Ja existe um candidato para este usuario ou um candidato ativo com este email');
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

async function getCandidateById(candidateId, requesterId, requesterRole) {
  if (!['candidate', 'company'].includes(requesterRole)) {
    throw new ApiError(403, 'Acesso negado para este perfil de usuario');
  }

  if (requesterRole === 'company') {
    const account = await User.findOne({
      _id: requesterId, role: 'company', status: 'active', emailVerifiedAt: { $type: 'date' },
    });
    const membership = account && await CompanyUser.findOne({ user: account._id, status: 'active' });
    const company = membership && await Company.findOne({
      _id: membership.company, status: 'active', deletedAt: null,
    });
    if (!company) {
      throw new ApiError(403, 'Acesso empresarial exige empresa ativa e vinculo de usuario autorizado');
    }
  }

  const filter = { _id: candidateId };
  if (requesterRole === 'company') {
    filter.status = CANDIDATE_STATUS.ACTIVE;
    filter.availableForOpportunities = true;
    filter['eligibility.status'] = ELIGIBILITY_STATUS.APPROVED;
  }

  const candidate = await Candidate.findOne(filter).select(CANDIDATE_READ_PROJECTION).lean();
  if (!candidate) throw new ApiError(404, 'Candidato nao encontrado');

  if (requesterRole === 'candidate' && candidate.user.toString() !== String(requesterId).toLowerCase()) {
    throw new ApiError(403, 'Voce so pode visualizar seu proprio cadastro de candidato');
  }

  return requesterRole === 'candidate'
    ? publicCandidateData(candidate, true)
    : enterpriseCandidateData(candidate);
}

async function updateCandidateFields(candidate, updates) {
  const current = typeof candidate.toObject === 'function' ? candidate.toObject() : candidate;
  const status = statusForCandidate({ ...current, ...updates });
  const filter = {
    _id: candidate._id,
    user: candidate.user,
    status: candidate.status,
  };
  if (candidate.updatedAt) filter.updatedAt = candidate.updatedAt;

  const updated = await Candidate.findOneAndUpdate(
    filter,
    { $set: { ...updates, status } },
    { new: true, runValidators: true }
  );
  if (!updated) throw new ApiError(409, 'O candidato foi alterado durante a atualizacao');
  return updated;
}

async function updateCandidateEmail(candidateId, requesterId, updates) {
  await User.init();
  await Candidate.init();

  let updatedCandidate;
  await Candidate.db.transaction(async (session) => {
    const candidate = await Candidate.findById(candidateId)
      .select('+eligibilityHistory')
      .session(session);
    assertEditableCandidate(candidate, requesterId);

    const user = await User.findById(requesterId).session(session);
    if (!user || user.status !== 'active') {
      throw new ApiError(401, 'Usuario nao autenticado ou inativo');
    }
    if (user.role !== 'candidate') {
      throw new ApiError(403, 'Apenas candidatos podem alterar um perfil de candidato');
    }

    const newEmail = updates.email;
    const conflictingUser = await User.findOne({
      email: newEmail,
      _id: { $ne: user._id },
    }).session(session);
    if (conflictingUser) throw new ApiError(409, 'Email ja utilizado por outra conta ou candidato ativo');

    const conflictingCandidate = await Candidate.findOne({
      email: newEmail,
      status: CANDIDATE_STATUS.ACTIVE,
      _id: { $ne: candidate._id },
    }).session(session);
    if (conflictingCandidate) {
      throw new ApiError(409, 'Email ja utilizado por outra conta ou candidato ativo');
    }

    const candidateEmailChanged = newEmail !== candidate.email;
    if (candidateEmailChanged) {
      if (!candidate.eligibilityHistory) candidate.eligibilityHistory = [];
      candidate.eligibilityHistory.push(eligibilityAuditEntry(candidate, new Date()));
    }

    for (const [field, value] of Object.entries(updates)) candidate[field] = value;

    if (candidateEmailChanged) {
      candidate.eligibility = pendingEligibility();
      candidate.status = CANDIDATE_STATUS.PENDING_VALIDATION;
    } else {
      candidate.status = statusForCandidate(candidate);
    }

    if (user.email !== newEmail) {
      user.email = newEmail;
      await user.save({ session });
    }
    updatedCandidate = await candidate.save({ session });
  }, EMAIL_UPDATE_TRANSACTION_OPTIONS);

  return updatedCandidate;
}

async function updateCandidate(candidateId, requesterId, requesterRole, input) {
  if (requesterRole !== 'candidate') {
    throw new ApiError(403, 'Apenas candidatos podem alterar um perfil de candidato');
  }

  const updates = normalizeCandidateUpdates(input);
  let emailChanged = false;
  try {
    const candidate = await Candidate.findById(candidateId);
    assertEditableCandidate(candidate, requesterId);
    emailChanged = Object.prototype.hasOwnProperty.call(updates, 'email') &&
      updates.email !== candidate.email;

    const updated = emailChanged
      ? await updateCandidateEmail(candidateId, requesterId, updates)
      : await updateCandidateFields(candidate, updates);
    return publicCandidateData(updated, true);
  } catch (error) {
    return candidateUpdateError(error, emailChanged);
  }
}

async function deleteCandidate(candidateId, requesterId, requesterRole) {
  if (requesterRole !== 'candidate') {
    throw new ApiError(403, 'Apenas candidatos podem excluir um perfil de candidato');
  }

  const candidate = await Candidate.findById(candidateId).select('user status +deletedAt');
  if (!candidate) throw new ApiError(404, 'Candidato nao encontrado');
  if (candidate.user.toString() !== String(requesterId).toLowerCase()) {
    throw new ApiError(403, 'Voce so pode excluir seu proprio cadastro de candidato');
  }
  if (candidate.status === CANDIDATE_STATUS.INACTIVE) {
    throw new ApiError(404, 'Candidato nao encontrado');
  }
  if (!DELETABLE_CANDIDATE_STATUSES.includes(candidate.status)) {
    throw new ApiError(409, 'Candidato bloqueado nao pode ser excluido');
  }

  const deletedAt = new Date();
  const deleted = await Candidate.findOneAndUpdate(
    {
      _id: candidate._id,
      user: candidate.user,
      status: { $in: DELETABLE_CANDIDATE_STATUSES },
      deletedAt: null,
    },
    {
      $set: {
        status: CANDIDATE_STATUS.INACTIVE,
        deletedAt,
        'publicProfile.enabled': false,
        'publicProfile.fields': [],
        'publicProfile.revokedAt': deletedAt,
        'publicProfile.cacheInvalidatedAt': deletedAt,
        availableForOpportunities: false,
        opportunityAvailabilityChangedAt: deletedAt,
        opportunitySearchCacheInvalidatedAt: deletedAt,
        'enterpriseDisplayPermissions.contact': [],
        'enterpriseDisplayPermissions.formation': [],
        'enterpriseDisplayPermissions.changedAt': deletedAt,
        'enterpriseDisplayPermissions.cacheInvalidatedAt': deletedAt,
      },
      $inc: {
        'publicProfile.cacheVersion': 1,
        opportunitySearchCacheVersion: 1,
        'enterpriseDisplayPermissions.cacheVersion': 1,
      },
      $push: {
        publicProfileConsentHistory: {
          action: 'candidate_deleted', fields: [], actor: requesterId, changedAt: deletedAt,
        },
        opportunityAvailabilityHistory: {
          availableForOpportunities: false, actor: requesterId, changedAt: deletedAt,
        },
        enterpriseDisplayPermissionHistory: {
          contact: [], formation: [], actor: requesterId, changedAt: deletedAt,
        },
      },
    },
    { new: true, runValidators: true }
  );
  if (!deleted) throw new ApiError(404, 'Candidato nao encontrado');
}

module.exports = {
  registerCandidate,
  revalidatePendingCandidate,
  validateCandidateEligibility,
  getCandidateById,
  updateCandidate,
  deleteCandidate,
};
