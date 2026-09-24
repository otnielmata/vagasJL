const crypto = require('node:crypto');
const Candidate = require('../models/candidate.model');
const CandidateMatchProfile = require('../models/candidate-match-profile.model');
const Company = require('../models/company.model');
const Configuration = require('../models/match-profile-configuration.model');
const { getPublishedMultipliers } = require('./match-multipliers-configuration.service');
const Vacancy = require('../models/vacancy.model');
const { CANDIDATE_STATUS } = require('../config/candidate');
const { assessVacancyForMatch } = require('./vacancy-origin.service');
const { ensureCompanyAuthorized } = require('./vacancy-status.service');
const { scorePair, compareRankingRows } = require('./match-ranking.service');
const { pagination } = require('./vacancy-ranking.service');
const { getPublishedRankingThreshold, meetsRankingThreshold } =
  require('./ranking-threshold-configuration.service');
const { recordMatchEvaluation } = require('./match-evaluation-audit.service');
const { getEffectiveMatchEngineConfiguration, applyEngineWeights } =
  require('./match-engine-configuration.service');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;

async function rankCandidates(actor, id, query = {}, now = new Date(), auditContext = {}) {
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
  const engineConfiguration = await getEffectiveMatchEngineConfiguration(now);
  const scoringConfiguration = applyEngineWeights(configuration, engineConfiguration);
  const matchConfiguration = engineConfiguration
    ? { version: engineConfiguration.revision, multipliers: engineConfiguration.multipliers }
    : await getPublishedMultipliers();
  const rankingThreshold = engineConfiguration
    ? { version: engineConfiguration.revision,
      minimumPercentage: engineConfiguration.minimumMatchPercentage }
    : await getPublishedRankingThreshold();

  const candidates = await Candidate.find({ status: CANDIDATE_STATUS.ACTIVE,
    availableForOpportunities: true, 'eligibility.status': 'approved',
    deletedAt: null }).select('_id name city state country');
  const profiles = candidates.length ? await CandidateMatchProfile.find({
    candidate: { $in: candidates.map((candidate) => candidate._id) }, deletedAt: null,
  }).select('candidate values configurationVersion revision updatedAt') : [];
  const byCandidate = new Map(profiles.map((profile) => [String(profile.candidate), profile]));
  const executionId = auditContext.executionId || crypto.randomUUID();
  const evaluated = await Promise.all(candidates.map(async (candidate) => {
    const profile = byCandidate.get(String(candidate._id));
    if (!profile?.values) return null;
    const candidateValues = typeof profile.values.toObject === 'function'
      ? profile.values.toObject() : profile.values;
    const score = scorePair(vacancy, candidateValues, scoringConfiguration,
      matchConfiguration.multipliers, now, candidate, engineConfiguration || {});
    const audit = await recordMatchEvaluation({ candidate, vacancy, profile, score,
      cause: 'vacancy_ranking', executionId, calculatedAt: auditContext.calculatedAt || now,
      algorithmVersion: engineConfiguration?.version,
      versions: { engine: engineConfiguration?.version,
        profileCatalog: vacancy.matchProfile.configurationVersion,
        multipliers: matchConfiguration.version,
        rankingThreshold: rankingThreshold?.version ?? null } });
    if (!meetsRankingThreshold(score, rankingThreshold)) return null;
    const item = { candidate: { _id: candidate._id, name: candidate.name },
      percentage: score.percentage, earnedPoints: score.earnedPoints,
      possiblePoints: score.possiblePoints, matchedRequiredCount: score.matchedRequiredCount,
      configurationVersion: vacancy.matchProfile.configurationVersion,
      engineConfigurationVersion: engineConfiguration?.version ?? null,
      multipliersVersion: matchConfiguration.version, audit };
    return { item, percentage: score.percentage,
      matchedRequiredCount: score.matchedRequiredCount, updatedAt: profile.updatedAt,
      stableId: candidate._id };
  }));
  const ranked = evaluated.filter(Boolean);
  ranked.sort(compareRankingRows);
  const total = ranked.length;
  return { items: ranked.slice((page - 1) * limit, page * limit).map((row) => row.item),
    total, page, limit, minimumMatchPercentage: rankingThreshold?.minimumPercentage ?? null,
    rankingThresholdVersion: rankingThreshold?.version ?? null,
    engineConfigurationVersion: engineConfiguration?.version ?? null,
    pages: Math.ceil(total / limit) };
}

module.exports = { rankCandidates };
