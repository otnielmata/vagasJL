const Candidate = require('../models/candidate.model');
const CandidateMatchProfile = require('../models/candidate-match-profile.model');
const { CANDIDATE_STATUS, ELIGIBILITY_STATUS } = require('../config/candidate');
const ApiError = require('../errors/api.error');

function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      typeof input.availableForOpportunities !== 'boolean') {
    throw new ApiError(400, 'Configuracao de disponibilidade invalida');
  }
  return input.availableForOpportunities;
}

function serialize(candidate) {
  const availableForOpportunities = candidate.availableForOpportunities === true;
  return {
    availableForOpportunities,
    changedAt: candidate.opportunityAvailabilityChangedAt || null,
    candidateStatus: candidate.status,
    visibleToCompanies: candidate.status === CANDIDATE_STATUS.ACTIVE && availableForOpportunities,
  };
}

async function updateOwnOpportunityAvailability(actor, input, now = new Date()) {
  if (actor?.role !== 'candidate') {
    throw new ApiError(403, 'Apenas candidatos podem controlar a propria disponibilidade');
  }
  const availableForOpportunities = normalizeInput(input);
  const candidate = await Candidate.findOne({ user: actor.id, deletedAt: null })
    .select('_id user status eligibility availableForOpportunities opportunityAvailabilityChangedAt ' +
      '+opportunitySearchCacheVersion');
  if (!candidate) throw new ApiError(404, 'Cadastro de candidato atual nao encontrado');
  if (candidate.user.toString() !== String(actor.id).toLowerCase()) {
    throw new ApiError(403, 'Voce so pode alterar sua propria disponibilidade');
  }

  if (availableForOpportunities) {
    if (candidate.status !== CANDIDATE_STATUS.ACTIVE ||
        candidate.eligibility?.status !== ELIGIBILITY_STATUS.APPROVED) {
      throw new ApiError(409, 'Candidato ativo e validado obrigatorio para aparecer para empresas');
    }
    const profile = await CandidateMatchProfile.findOne({ candidate: candidate._id, deletedAt: null })
      .select('_id');
    if (!profile) throw new ApiError(409, 'Perfil de Match atual obrigatorio para aparecer para empresas');
  }

  if (candidate.availableForOpportunities === availableForOpportunities &&
      candidate.opportunityAvailabilityChangedAt) return serialize(candidate);

  const updated = await Candidate.findOneAndUpdate(
    {
      _id: candidate._id,
      user: candidate.user,
      status: candidate.status,
      deletedAt: null,
      opportunityAvailabilityChangedAt: candidate.opportunityAvailabilityChangedAt || null,
    },
    {
      $set: {
        availableForOpportunities,
        opportunityAvailabilityChangedAt: now,
        opportunitySearchCacheInvalidatedAt: now,
      },
      $inc: { opportunitySearchCacheVersion: 1 },
      $push: {
        opportunityAvailabilityHistory: {
          availableForOpportunities,
          actor: actor.id,
          changedAt: now,
        },
      },
    },
    { new: true, runValidators: true }
  );
  if (!updated) throw new ApiError(409, 'O candidato foi alterado durante a configuracao de disponibilidade');
  return serialize(updated);
}

module.exports = { updateOwnOpportunityAvailability, normalizeInput, serialize };
