const crypto = require('node:crypto');
const Candidate = require('../models/candidate.model');
const CandidateMatchProfile = require('../models/candidate-match-profile.model');
const Company = require('../models/company.model');
const Configuration = require('../models/match-profile-configuration.model');
const Vacancy = require('../models/vacancy.model');
const { CANDIDATE_STATUS, ELIGIBILITY_STATUS } = require('../config/candidate');
const { getPublishedMultipliers } = require('./match-multipliers-configuration.service');
const { assessVacancyForMatch } = require('./vacancy-origin.service');
const { ensureCompanyAuthorized } = require('./vacancy-status.service');
const { scorePair } = require('./match-ranking.service');
const { completionFor } = require('./candidate-match-profile.service');
const { enterpriseCandidateData } = require('./candidate-display-permissions.service');
const { criteriaFromScore, compareGaps } = require('./candidate-match-detail.service');
const { recordMatchEvaluation } = require('./match-evaluation-audit.service');
const { getEffectiveMatchEngineConfiguration, applyEngineWeights } =
  require('./match-engine-configuration.service');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const CANDIDATE_REPORT_FIELDS = [
  '_id', 'name', 'email', 'phone', 'photoUrl', 'city', 'state', 'country',
  'linkedinUrl', 'githubUrl', 'portfolioUrl', 'professionalSummary', 'availability',
  'availableForOpportunities', 'status', 'eligibility', '+enterpriseDisplayPermissions',
].join(' ');

function assertIdentifiers(vacancyId, candidateId) {
  if (typeof vacancyId !== 'string' || !OBJECT_ID.test(vacancyId)) {
    throw new ApiError(400, 'Identificador da vaga invalido');
  }
  if (typeof candidateId !== 'string' || !OBJECT_ID.test(candidateId)) {
    throw new ApiError(400, 'Identificador do candidato invalido');
  }
}

async function authorizeVacancy(actor, vacancy) {
  if (!['admin', 'company'].includes(actor?.role)) {
    throw new ApiError(403, 'Acesso negado ao relatorio do candidato');
  }
  if (vacancy.origin === 'COMPANY') {
    await ensureCompanyAuthorized(actor, vacancy);
    const company = await Company.findOne({ _id: vacancy.company, status: 'active', deletedAt: null })
      .select('_id');
    if (!company) throw new ApiError(404, 'Vaga indisponivel');
    return;
  }
  if (actor.role !== 'admin' || vacancy.origin !== 'ADMIN' ||
      String(vacancy.createdBy) !== actor.id) {
    throw new ApiError(403, 'Acesso negado a esta vaga');
  }
}

function technicalProfile(values, configuration) {
  return configuration.fields.flatMap((field) => {
    const selected = values[field.key];
    if (selected === undefined || selected === null ||
        Array.isArray(selected) && selected.length === 0) return [];
    if (field.key === 'yearsOfExperience') {
      return [{ field: field.key, label: field.label, value: selected, options: [] }];
    }
    const ids = Array.isArray(selected) ? selected : [selected];
    return [{ field: field.key, label: field.label, value: null,
      options: ids.map((id) => ({ id, label: field.options.find((option) => option.id === id)?.label || id })) }];
  });
}

async function getCompanyCandidateReport(actor, vacancyId, candidateId, now = new Date(),
  auditContext = {}) {
  assertIdentifiers(vacancyId, candidateId);
  const vacancy = await Vacancy.findById(vacancyId).select('+createdBy +deletedAt');
  if (!vacancy || vacancy.deletedAt) throw new ApiError(404, 'Vaga nao encontrada');
  await authorizeVacancy(actor, vacancy);
  if (!assessVacancyForMatch(vacancy, now).eligible ||
      !vacancy.matchProfile.requirements?.some((item) => item.importance !== 'indifferent')) {
    throw new ApiError(404, 'Vaga indisponivel para relatorio de Match');
  }

  const candidate = await Candidate.findOne({ _id: candidateId,
    status: CANDIDATE_STATUS.ACTIVE, availableForOpportunities: true,
    'eligibility.status': ELIGIBILITY_STATUS.APPROVED, deletedAt: null })
    .select(CANDIDATE_REPORT_FIELDS);
  if (!candidate) throw new ApiError(404, 'Candidato indisponivel');
  const profile = await CandidateMatchProfile.findOne({ candidate: candidate._id, deletedAt: null })
    .select('values configurationVersion revision updatedAt');
  if (!profile?.values) throw new ApiError(404, 'Perfil de Match do candidato indisponivel');

  const [vacancyConfiguration, profileConfiguration, engineConfiguration] = await Promise.all([
    Configuration.findOne({ version: vacancy.matchProfile.configurationVersion }),
    Configuration.findOne({ version: profile.configurationVersion }),
    getEffectiveMatchEngineConfiguration(now),
  ]);
  if (!vacancyConfiguration || !profileConfiguration) {
    throw new ApiError(503, 'Configuracao do Perfil de Match indisponivel');
  }
  const scoringConfiguration = applyEngineWeights(vacancyConfiguration, engineConfiguration);
  const multiplierConfiguration = engineConfiguration
    ? { version: engineConfiguration.revision, multipliers: engineConfiguration.multipliers }
    : await getPublishedMultipliers();
  const values = profile.values.toObject?.() || profile.values;
  const score = scorePair(vacancy, values, scoringConfiguration,
    multiplierConfiguration.multipliers, now, candidate, engineConfiguration || {});
  const criteria = criteriaFromScore(score, vacancy, scoringConfiguration, values, candidate);
  const completion = completionFor(profile, profileConfiguration);
  const audit = await recordMatchEvaluation({ candidate, vacancy, profile, score,
    cause: 'match_detail', executionId: auditContext.executionId || crypto.randomUUID(),
    calculatedAt: auditContext.calculatedAt || now,
    algorithmVersion: engineConfiguration?.version,
    versions: { engine: engineConfiguration?.version,
      profileCatalog: vacancy.matchProfile.configurationVersion,
      multipliers: multiplierConfiguration.version } });

  return {
    vacancy: { _id: vacancy._id, title: vacancy.title, reference: vacancy.reference },
    candidate: await enterpriseCandidateData(candidate),
    profile: {
      completionPercentage: completion.percentage,
      fields: technicalProfile(values, profileConfiguration),
      updatedAt: profile.updatedAt,
    },
    match: {
      percentage: score.percentage,
      earnedPoints: score.earnedPoints,
      possiblePoints: score.possiblePoints,
      matchedRequiredCount: score.matchedRequiredCount,
      eligibility: score.eligibility,
      metCriteria: criteria.filter((criterion) => criterion.status === 'met'),
      gaps: criteria.filter((criterion) => criterion.status === 'gap').sort(compareGaps),
      unknownCriteria: criteria.filter((criterion) => criterion.status === 'unknown'),
      audit,
    },
  };
}

module.exports = { getCompanyCandidateReport, technicalProfile, assertIdentifiers };
