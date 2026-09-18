const Candidate = require('../models/candidate.model');
const CandidateMatchProfile = require('../models/candidate-match-profile.model');
const Company = require('../models/company.model');
const Configuration = require('../models/match-profile-configuration.model');
const Vacancy = require('../models/vacancy.model');
const { CANDIDATE_STATUS } = require('../config/candidate');
const { assessVacancyForMatch } = require('./vacancy-origin.service');
const { ensureCompanyAuthorized } = require('./vacancy-status.service');
const { scorePair } = require('./match-ranking.service');
const { pagination } = require('./vacancy-ranking.service');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;

async function rankCandidates(actor, id, query = {}, now = new Date()) {
  if (!['admin', 'company'].includes(actor?.role)) throw new ApiError(403, 'Acesso negado ao ranking');
  if (typeof id !== 'string' || !OBJECT_ID.test(id)) throw new ApiError(400, 'Identificador da vaga invalido');
  const { page, limit } = pagination(query);
  const vacancy = await Vacancy.findById(id).select('+createdBy +deletedAt');
  if (!vacancy || vacancy.deletedAt) throw new ApiError(404, 'Vaga nao encontrada');
  if (actor.role === 'company') {
    if (vacancy.origin !== 'COMPANY') throw new ApiError(403, 'Acesso negado a esta vaga');
    await ensureCompanyAuthorized(actor, vacancy);
  }
  if (vacancy.origin === 'COMPANY') {
    const company = await Company.findOne({ _id: vacancy.company, status: 'active',
      deletedAt: null }).select('_id');
    if (!company) throw new ApiError(404, 'Vaga indisponivel');
  }
  if (!assessVacancyForMatch(vacancy, now).eligible ||
      !vacancy.matchProfile.requirements?.some((item) => item.importance !== 'indifferent')) {
    throw new ApiError(404, 'Vaga indisponivel para ranking');
  }
  const configuration = await Configuration.findOne({ version: vacancy.matchProfile.configurationVersion });
  if (!configuration) throw new ApiError(503, 'Configuracao do Perfil de Match indisponivel');

  const candidates = await Candidate.find({ status: CANDIDATE_STATUS.ACTIVE,
    deletedAt: null }).select('_id name');
  const profiles = candidates.length ? await CandidateMatchProfile.find({
    candidate: { $in: candidates.map((candidate) => candidate._id) }, deletedAt: null,
  }).select('candidate values configurationVersion') : [];
  const byCandidate = new Map(profiles.map((profile) => [String(profile.candidate), profile]));
  const ranked = candidates.flatMap((candidate) => {
    const profile = byCandidate.get(String(candidate._id));
    if (!profile?.values) return [];
    const candidateValues = typeof profile.values.toObject === 'function'
      ? profile.values.toObject() : profile.values;
    const score = scorePair(vacancy, candidateValues, configuration, now);
    if (!score.eligibility.eligible || score.possiblePoints === 0) return [];
    return [{ candidate: { _id: candidate._id, name: candidate.name }, percentage: score.percentage }];
  });
  ranked.sort((left, right) => right.percentage - left.percentage ||
    String(left.candidate._id).localeCompare(String(right.candidate._id)));
  const total = ranked.length;
  return { items: ranked.slice((page - 1) * limit, page * limit), total, page, limit,
    pages: Math.ceil(total / limit) };
}

module.exports = { rankCandidates };
