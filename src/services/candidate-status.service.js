const Candidate = require('../models/candidate.model');
const CandidateMatchProfile = require('../models/candidate-match-profile.model');
const MatchProfileConfiguration = require('../models/match-profile-configuration.model');
const User = require('../models/user.model');
const ApiError = require('../errors/api.error');
const { CANDIDATE_STATUS, CANDIDATE_MINIMUM_PROFILE_FIELDS, ELIGIBILITY_STATUS,
  UNKNOWN } = require('../config/candidate');
const { completionFor } = require('./candidate-match-profile.service');
const { getPublishedProfileCompletionThreshold, meetsProfileCompletionThreshold } =
  require('./profile-completion-threshold-configuration.service');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const STATUSES = Object.freeze(Object.values(CANDIDATE_STATUS));
const TRANSITIONS = Object.freeze({
  [CANDIDATE_STATUS.PENDING_VALIDATION]: Object.freeze([
    CANDIDATE_STATUS.INACTIVE, CANDIDATE_STATUS.BLOCKED,
  ]),
  [CANDIDATE_STATUS.INCOMPLETE_PROFILE]: Object.freeze([
    CANDIDATE_STATUS.ACTIVE, CANDIDATE_STATUS.INACTIVE, CANDIDATE_STATUS.BLOCKED,
  ]),
  [CANDIDATE_STATUS.ACTIVE]: Object.freeze([
    CANDIDATE_STATUS.INACTIVE, CANDIDATE_STATUS.BLOCKED,
  ]),
  [CANDIDATE_STATUS.INACTIVE]: Object.freeze([
    CANDIDATE_STATUS.ACTIVE, CANDIDATE_STATUS.BLOCKED,
  ]),
  [CANDIDATE_STATUS.BLOCKED]: Object.freeze([
    CANDIDATE_STATUS.ACTIVE, CANDIDATE_STATUS.INACTIVE,
  ]),
});

function validateRequest(actor, candidateId, input) {
  if (actor?.role !== 'admin') {
    throw new ApiError(403, 'Apenas administradores podem alterar o status do candidato');
  }
  if (typeof candidateId !== 'string' || !OBJECT_ID.test(candidateId)) {
    throw new ApiError(400, 'Identificador de candidato invalido');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== 'reason,status' || !STATUSES.includes(input.status) ||
      typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 500) {
    throw new ApiError(400, 'Informe apenas status de candidato valido e motivo');
  }
  return { status: input.status, reason: input.reason.trim() };
}

function hasCompleteProfessionalProfile(candidate) {
  return CANDIDATE_MINIMUM_PROFILE_FIELDS.every((field) => {
    const value = candidate[field];
    return typeof value === 'string' && Boolean(value.trim()) && value !== UNKNOWN;
  });
}

async function ensureMatchProfileCompletion(candidate) {
  const threshold = await getPublishedProfileCompletionThreshold();
  if (!threshold) return;
  const profile = await CandidateMatchProfile.findOne({ candidate: candidate._id, deletedAt: null });
  if (!profile) throw new ApiError(409, 'Candidato sem Perfil de Match para ativacao');
  const configuration = await MatchProfileConfiguration.findOne({
    version: profile.configurationVersion,
  });
  if (!configuration) throw new ApiError(409, 'Configuracao do Perfil de Match indisponivel para ativacao');
  if (!meetsProfileCompletionThreshold(completionFor(profile, configuration), threshold)) {
    throw new ApiError(409, 'Candidato abaixo da completude minima de perfil para ativacao');
  }
}

async function ensureActivationReady(candidate) {
  if (candidate.eligibility?.status !== ELIGIBILITY_STATUS.APPROVED) {
    throw new ApiError(409, 'Candidato sem elegibilidade aprovada');
  }
  if (!hasCompleteProfessionalProfile(candidate)) {
    throw new ApiError(409, 'Candidato sem cadastro minimo completo');
  }
  const duplicate = await Candidate.findOne({
    _id: { $ne: candidate._id }, email: candidate.email,
    status: CANDIDATE_STATUS.ACTIVE, deletedAt: null,
  }).select('_id').lean();
  if (duplicate) throw new ApiError(409, 'Ja existe candidato ativo com este email');
  await ensureMatchProfileCompletion(candidate);
}

function result(candidate, previousStatus, changed, changedAt = null) {
  return {
    candidate: { _id: candidate._id, status: candidate.status },
    previousStatus,
    changed,
    changedAt,
  };
}

function statusUpdate(previousStatus, status, actor, reason, now) {
  const set = {
    status,
    opportunitySearchCacheInvalidatedAt: now,
  };
  const increment = { opportunitySearchCacheVersion: 1 };
  const push = { statusHistory: {
    from: previousStatus, to: status, actor: actor.id, changedAt: now, reason,
  } };
  if (status === CANDIDATE_STATUS.BLOCKED) {
    Object.assign(set, {
      availableForOpportunities: false,
      opportunityAvailabilityChangedAt: now,
      'publicProfile.enabled': false,
      'publicProfile.fields': [],
      'publicProfile.revokedAt': now,
      'publicProfile.cacheInvalidatedAt': now,
      'enterpriseDisplayPermissions.contact': [],
      'enterpriseDisplayPermissions.formation': [],
      'enterpriseDisplayPermissions.changedAt': now,
      'enterpriseDisplayPermissions.cacheInvalidatedAt': now,
    });
    Object.assign(increment, {
      'publicProfile.cacheVersion': 1,
      'enterpriseDisplayPermissions.cacheVersion': 1,
    });
    Object.assign(push, {
      publicProfileConsentHistory: {
        action: 'revoked', fields: [], actor: actor.id, changedAt: now,
      },
      opportunityAvailabilityHistory: {
        availableForOpportunities: false, actor: actor.id, changedAt: now,
      },
      enterpriseDisplayPermissionHistory: {
        contact: [], formation: [], actor: actor.id, changedAt: now,
      },
    });
  }
  return { $set: set, $inc: increment, $push: push };
}

async function persistStatus(candidate, status, actor, reason, now, session) {
  const update = statusUpdate(candidate.status, status, actor, reason, now);
  const options = { new: true, runValidators: true, ...(session ? { session } : {}) };
  const updated = await Candidate.findOneAndUpdate({
    _id: candidate._id, status: candidate.status, updatedAt: candidate.updatedAt, deletedAt: null,
  }, update, options);
  if (!updated) throw new ApiError(409, 'Candidato alterado simultaneamente; tente novamente');

  if (status === CANDIDATE_STATUS.BLOCKED) {
    const revoked = await User.updateOne({ _id: candidate.user, role: 'candidate' }, {
      $inc: { tokenVersion: 1 },
    }, session ? { session } : undefined);
    if (revoked.matchedCount !== 1) throw new ApiError(409, 'Conta do candidato indisponivel para bloqueio');
  }
  return updated;
}

async function updateCandidateStatus(actor, candidateId, input, now = new Date()) {
  const { status, reason } = validateRequest(actor, candidateId, input);
  const candidate = await Candidate.findOne({ _id: candidateId, deletedAt: null })
    .select('+statusHistory +publicProfile +publicProfileConsentHistory ' +
      '+opportunitySearchCacheVersion +opportunitySearchCacheInvalidatedAt ' +
      '+opportunityAvailabilityHistory +enterpriseDisplayPermissions ' +
      '+enterpriseDisplayPermissionHistory');
  if (!candidate) throw new ApiError(404, 'Candidato nao encontrado');

  const previousStatus = candidate.status;
  if (previousStatus === status) return result(candidate, previousStatus, false);
  if (!TRANSITIONS[previousStatus]?.includes(status)) {
    throw new ApiError(409, 'Transicao de status de candidato nao permitida');
  }
  if (status === CANDIDATE_STATUS.ACTIVE) await ensureActivationReady(candidate);

  let updated;
  if (status === CANDIDATE_STATUS.BLOCKED) {
    await Candidate.db.transaction(async (session) => {
      updated = await persistStatus(candidate, status, actor, reason, now, session);
    });
  } else {
    updated = await persistStatus(candidate, status, actor, reason, now);
  }
  return result(updated, previousStatus, true, now);
}

module.exports = { updateCandidateStatus, validateRequest, hasCompleteProfessionalProfile,
  ensureActivationReady, STATUSES, TRANSITIONS };
