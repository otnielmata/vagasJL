const Candidate = require('../models/candidate.model');
const { CANDIDATE_STATUS, ELIGIBILITY_STATUS } = require('../config/candidate');
const engagementClient = require('./engagement-client.service');
const ApiError = require('../errors/api.error');

async function getOwnEngagement(actor, query = {}) {
  if (actor?.role !== 'candidate') throw new ApiError(403, 'Apenas candidatos podem consultar engajamento');
  if (Object.keys(query).length) throw new ApiError(400, 'A consulta nao aceita identificadores externos');
  const candidate = await Candidate.findOne({ user: actor.id, status: CANDIDATE_STATUS.ACTIVE,
    'eligibility.status': ELIGIBILITY_STATUS.APPROVED, deletedAt: null }).select('_id email');
  if (!candidate) throw new ApiError(403, 'Candidato ativo e validado obrigatorio');
  return engagementClient.fetchOfficialEngagement(candidate.email);
}

module.exports = { getOwnEngagement };
