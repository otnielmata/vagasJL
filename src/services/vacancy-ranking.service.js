const crypto = require('node:crypto');
const Candidate = require('../models/candidate.model');
const CandidateMatchProfile = require('../models/candidate-match-profile.model');
const Company = require('../models/company.model');
const Configuration = require('../models/match-profile-configuration.model');
const { getPublishedMultipliers } = require('./match-multipliers-configuration.service');
const Vacancy = require('../models/vacancy.model');
const { assessVacancyForMatch } = require('./vacancy-origin.service');
const { scorePair, compareRankingRows } = require('./match-ranking.service');
const { getPublishedRankingThreshold, meetsRankingThreshold } =
  require('./ranking-threshold-configuration.service');
const { recordMatchEvaluation } = require('./match-evaluation-audit.service');
const { completionFor } = require('./candidate-match-profile.service');
const { getPublishedProfileCompletionThreshold, meetsProfileCompletionThreshold } =
  require('./profile-completion-threshold-configuration.service');
const ApiError = require('../errors/api.error');
const { getEffectiveMatchEngineConfiguration, applyEngineWeights } =
  require('./match-engine-configuration.service');

function pagination(query = {}) {
  if (Object.keys(query).some((key) => !['page', 'limit'].includes(key))) {
    throw new ApiError(400, 'Parametros de paginacao invalidos');
  }
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) ||
      limit < 1 || limit > 50 || (query.page !== undefined && !/^[1-9]\d*$/.test(query.page)) ||
      (query.limit !== undefined && !/^[1-9]\d*$/.test(query.limit))) {
    throw new ApiError(400, 'Pagina deve ser positiva e limite entre 1 e 50');
  }
  return { page, limit };
}

async function rankVacancies(actor, query = {}, now = new Date(), auditContext = {}) {
  if (actor?.role !== 'candidate') throw new ApiError(403, 'Apenas candidatos podem consultar o ranking');
  const { page, limit } = pagination(query);
  const candidate = await Candidate.findOne({ user: actor.id, deletedAt: null })
    .select('_id city state country');
  if (!candidate) throw new ApiError(404, 'Cadastro de candidato nao encontrado');
  const profile = await CandidateMatchProfile.findOne({ candidate: candidate._id,
    deletedAt: null }).select('values configurationVersion revision updatedAt');
  if (!profile) throw new ApiError(409, 'Cadastre o Perfil de Match antes de consultar o ranking');
  const completionConfiguration = await Configuration.findOne({ version: profile.configurationVersion });
  if (!completionConfiguration) {
    throw new ApiError(503, 'Configuracao do Perfil de Match indisponivel para completude');
  }
  const completion = completionFor(profile, completionConfiguration);
  const engineConfiguration = await getEffectiveMatchEngineConfiguration(now);
  const completionThreshold = engineConfiguration
    ? engineConfiguration.minimumProfileCompletionPercentage === null ? null : {
      version: engineConfiguration.revision,
      minimumPercentage: engineConfiguration.minimumProfileCompletionPercentage,
      effectiveAt: engineConfiguration.effectiveAt,
    }
    : await getPublishedProfileCompletionThreshold();
  if (!meetsProfileCompletionThreshold(completion, completionThreshold)) {
    return { recommendationStatus: 'insufficient_profile_completeness',
      profileCompletion: { percentage: completion.percentage,
        answeredFields: completion.answeredFields,
        totalEligibleFields: completion.totalEligibleFields,
        pendingFields: completion.pendingFields },
      minimumProfileCompletionPercentage: completionThreshold.minimumPercentage,
      completionThresholdVersion: completionThreshold.version };
  }

  const vacancies = await Vacancy.find({ status: 'active', deletedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    origin: { $in: ['COMPANY', 'IMPORTED', 'ADMIN'] },
  }).select('+createdBy');
  const companyIds = [...new Set(vacancies.filter((vacancy) => vacancy.origin === 'COMPANY')
    .map((vacancy) => String(vacancy.company)).filter(Boolean))];
  const activeCompanies = companyIds.length ? await Company.find({ _id: { $in: companyIds },
    status: 'active', deletedAt: null }).select('_id') : [];
  const authorizedCompanies = new Set(activeCompanies.map((company) => String(company._id)));
  const eligible = vacancies.filter((vacancy) =>
    (vacancy.origin !== 'COMPANY' || authorizedCompanies.has(String(vacancy.company))) &&
    assessVacancyForMatch(vacancy, now).eligible &&
    vacancy.matchProfile.requirements?.some((item) => item.importance !== 'indifferent'));

  const versions = [...new Set(eligible.map((vacancy) => vacancy.matchProfile.configurationVersion))];
  const matchConfiguration = eligible.length && (engineConfiguration
    ? { version: engineConfiguration.revision, multipliers: engineConfiguration.multipliers }
    : await getPublishedMultipliers());
  const rankingThreshold = engineConfiguration
    ? { version: engineConfiguration.revision,
      minimumPercentage: engineConfiguration.minimumMatchPercentage }
    : await getPublishedRankingThreshold();
  const configurations = versions.length ? await Configuration.find({ version: { $in: versions } }) : [];
  const byVersion = new Map(configurations.map((configuration) => [configuration.version, configuration]));
  const candidateValues = typeof profile.values.toObject === 'function'
    ? profile.values.toObject() : profile.values;
  const executionId = auditContext.executionId || crypto.randomUUID();
  const ranked = (await Promise.all(eligible.map(async (vacancy) => {
    const configuration = byVersion.get(vacancy.matchProfile.configurationVersion);
    if (!configuration) throw new ApiError(503, 'Configuracao do Perfil de Match indisponivel');
    const scoringConfiguration = applyEngineWeights(configuration, engineConfiguration);
    const score = scorePair(vacancy, candidateValues, scoringConfiguration,
      matchConfiguration.multipliers, now, candidate);
    const audit = await recordMatchEvaluation({ candidate, vacancy, profile, score,
      cause: 'candidate_ranking', executionId, calculatedAt: auditContext.calculatedAt || now,
      algorithmVersion: engineConfiguration?.version,
      versions: { engine: engineConfiguration?.version,
        profileCatalog: vacancy.matchProfile.configurationVersion,
        multipliers: matchConfiguration.version,
        rankingThreshold: rankingThreshold?.version ?? null,
        completionThreshold: completionThreshold?.version ?? null } });
    const item = { vacancy: vacancy.toJSON(), percentage: score.percentage,
      earnedPoints: score.earnedPoints, possiblePoints: score.possiblePoints,
      matchedRequiredCount: score.matchedRequiredCount,
      configurationVersion: vacancy.matchProfile.configurationVersion,
      engineConfigurationVersion: engineConfiguration?.version ?? null,
      multipliersVersion: matchConfiguration.version, audit };
    return { item, percentage: score.percentage,
      matchedRequiredCount: score.matchedRequiredCount, updatedAt: vacancy.updatedAt,
      stableId: vacancy._id, eligible: meetsRankingThreshold(score, rankingThreshold) };
  }))).filter((row) => row.eligible);
  ranked.sort(compareRankingRows);
  const total = ranked.length;
  return { recommendationStatus: 'available',
    profileCompletion: { percentage: completion.percentage,
      answeredFields: completion.answeredFields,
      totalEligibleFields: completion.totalEligibleFields,
      pendingFields: completion.pendingFields },
    items: ranked.slice((page - 1) * limit, page * limit).map((row) => row.item),
    total, page, limit, minimumMatchPercentage: rankingThreshold?.minimumPercentage ?? null,
    rankingThresholdVersion: rankingThreshold?.version ?? null,
    minimumProfileCompletionPercentage: completionThreshold?.minimumPercentage ?? null,
    completionThresholdVersion: completionThreshold?.version ?? null,
    engineConfigurationVersion: engineConfiguration?.version ?? null,
    pages: Math.ceil(total / limit) };
}

module.exports = { rankVacancies, pagination };
