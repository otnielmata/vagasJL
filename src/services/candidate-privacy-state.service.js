const Candidate = require('../models/candidate.model');
const availabilityService = require('./candidate-opportunity-availability.service');
const permissionsService = require('./candidate-display-permissions.service');
const publicProfileService = require('./candidate-public-profile.service');
const ApiError = require('../errors/api.error');

async function getOwnPrivacyState(actor) {
  if (actor?.role !== 'candidate') {
    throw new ApiError(403, 'Apenas candidatos podem consultar a propria privacidade');
  }
  const candidate = await Candidate.findOne({ user: actor.id, deletedAt: null })
    .select('_id user status eligibility availableForOpportunities opportunityAvailabilityChangedAt ' +
      '+enterpriseDisplayPermissions +publicProfile');
  if (!candidate) throw new ApiError(404, 'Cadastro de candidato atual nao encontrado');
  if (candidate.user.toString() !== String(actor.id).toLowerCase()) {
    throw new ApiError(403, 'Voce so pode consultar a propria privacidade');
  }
  return {
    availability: availabilityService.serialize(candidate),
    permissions: permissionsService.serialize(candidate),
    publicProfile: publicProfileService.publicProfileState(candidate),
  };
}

module.exports = { getOwnPrivacyState };
