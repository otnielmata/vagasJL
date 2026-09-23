const crypto = require('node:crypto');
const Candidate = require('../models/candidate.model');
const CandidateMatchProfile = require('../models/candidate-match-profile.model');
const Company = require('../models/company.model');
const Configuration = require('../models/match-profile-configuration.model');
const Vacancy = require('../models/vacancy.model');
const { BOOLEAN_MATCH_FIELDS } = require('../config/match-profile');
const { normalizePlace } = require('../config/geography');
const { getPublishedMultipliers } = require('./match-multipliers-configuration.service');
const { getPublishedRankingThreshold, meetsRankingThreshold } =
  require('./ranking-threshold-configuration.service');
const { assessVacancyForMatch } = require('./vacancy-origin.service');
const { scorePair } = require('./match-ranking.service');
const { recordMatchEvaluation } = require('./match-evaluation-audit.service');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;

function plain(value) {
  return value?.toObject?.() || value || {};
}

function detailKey(field, id) {
  return `${field}:${id ?? ''}`;
}

function hasCandidateAnswer(detail, candidateValues, candidate) {
  if (detail.field.startsWith('geo.')) {
    return Boolean(normalizePlace(candidate[detail.field.slice(4)]));
  }
  if (detail.field === 'yearsOfExperience') return candidateValues[detail.field] != null;
  if (!Object.hasOwn(candidateValues, detail.field)) return false;
  const value = candidateValues[detail.field];
  return BOOLEAN_MATCH_FIELDS.includes(detail.field) || !Array.isArray(value) || value.length > 0;
}

function criteriaFromScore(score, vacancy, configuration, candidateValues, candidate) {
  const fields = new Map(configuration.fields.map((field) => [field.key, field]));
  const requirements = new Map((vacancy.matchProfile.requirements || []).map((requirement) =>
    [detailKey(requirement.field, requirement.field === 'yearsOfExperience' ? undefined : requirement.id),
      requirement]));
  const geographicRestrictions = plain(vacancy.geographicRestrictions);

  return score.details.map((detail) => {
    const geographicDimension = detail.field.startsWith('geo.') ? detail.field.slice(4) : null;
    const requirement = geographicDimension ? geographicRestrictions[geographicDimension]
      : requirements.get(detailKey(detail.field, detail.id));
    const field = fields.get(detail.field);
    const option = field?.options?.find((item) => item.id === detail.id);
    const answered = hasCandidateAnswer(detail, candidateValues, candidate);
    const fullyMet = answered && Math.abs(detail.earnedPoints - detail.weight) < Number.EPSILON;
    const status = !answered ? 'unknown' : fullyMet ? 'met' : 'gap';
    const id = geographicDimension
      ? normalizePlace(requirement.value)
      : detail.field === 'yearsOfExperience' ? detail.field : detail.id;
    const label = geographicDimension ? requirement.value : option?.label || field?.label || detail.field;
    return { field: detail.field, id, label, importance: requirement.importance, status,
      earnedPoints: answered ? detail.earnedPoints : null, possiblePoints: detail.weight,
      lostPoints: answered ? detail.weight - detail.earnedPoints : null };
  });
}

function compareGaps(left, right) {
  return right.lostPoints - left.lostPoints || left.field.localeCompare(right.field) ||
    String(left.id).localeCompare(String(right.id));
}

function classifyMatchResult(score, calculable, rankingThreshold) {
  if (!calculable) {
    return { state: 'not_calculable', label: 'Compatibilidade não calculável' };
  }
  if (!score.eligibility.eligible) {
    return { state: 'ineligible', label: 'Não atende critério eliminatório' };
  }
  if (rankingThreshold && !meetsRankingThreshold(score, rankingThreshold)) {
    return { state: 'below_threshold', label: 'Compatibilidade baixa' };
  }
  return { state: 'eligible', label: 'Compatível' };
}

async function getCandidateMatchDetail(actor, vacancyId, now = new Date(), auditContext = {}) {
  if (actor?.role !== 'candidate') throw new ApiError(403, 'Apenas candidatos podem consultar o Match');
  if (typeof vacancyId !== 'string' || !OBJECT_ID.test(vacancyId)) {
    throw new ApiError(400, 'Identificador da vaga invalido');
  }

  const candidate = await Candidate.findOne({ user: actor.id, deletedAt: null })
    .select('_id city state country');
  if (!candidate) throw new ApiError(404, 'Cadastro de candidato nao encontrado');
  const vacancy = await Vacancy.findById(vacancyId).select('+createdBy +deletedAt');
  const assessment = vacancy && assessVacancyForMatch(vacancy, now);
  if (!vacancy || !assessment?.eligible) throw new ApiError(404, 'Vaga nao encontrada ou indisponivel');
  if (vacancy.origin === 'COMPANY') {
    const company = await Company.findOne({ _id: vacancy.company, status: 'active', deletedAt: null })
      .select('_id');
    if (!company) throw new ApiError(404, 'Vaga nao encontrada ou indisponivel');
  }

  const configuration = await Configuration.findOne({ version: vacancy.matchProfile.configurationVersion });
  if (!configuration) throw new ApiError(503, 'Configuracao do Perfil de Match indisponivel');
  const matchConfiguration = await getPublishedMultipliers();
  const rankingThreshold = await getPublishedRankingThreshold();
  const profile = await CandidateMatchProfile.findOne({ candidate: candidate._id, deletedAt: null })
    .select('values configurationVersion revision updatedAt');
  const candidateValues = plain(profile?.values);
  const score = scorePair(vacancy, candidateValues, configuration,
    matchConfiguration.multipliers, now, candidate);
  const criteria = criteriaFromScore(score, vacancy, configuration, candidateValues, candidate);
  const calculable = score.calculationStatus === 'calculable' &&
    criteria.every((criterion) => criterion.status !== 'unknown');
  const eligibility = calculable ? score.eligibility : { eligible: null, reason: null };
  const classification = classifyMatchResult(score, calculable, rankingThreshold);
  const percentage = calculable ? score.percentage : null;
  const audit = await recordMatchEvaluation({ candidate, vacancy, profile, score,
    eligibility, cause: 'match_detail', executionId: auditContext.executionId || crypto.randomUUID(),
    calculatedAt: auditContext.calculatedAt || now,
    versions: { profileCatalog: vacancy.matchProfile.configurationVersion,
      multipliers: matchConfiguration.version,
      rankingThreshold: rankingThreshold?.version ?? null } });

  return {
    vacancy: { _id: vacancy._id, title: vacancy.title },
    indicator: { dimension: 'technical_match', label: 'Match tecnico',
      percentage, status: classification.state },
    audit,
    resultState: classification.state,
    resultLabel: classification.label,
    calculationStatus: calculable ? 'calculable' : 'not_calculable',
    percentage,
    earnedPoints: calculable ? score.earnedPoints : null,
    possiblePoints: calculable ? score.possiblePoints : null,
    configurationVersion: vacancy.matchProfile.configurationVersion,
    multipliersVersion: matchConfiguration.version,
    minimumMatchPercentage: rankingThreshold?.minimumPercentage ?? null,
    rankingThresholdVersion: rankingThreshold?.version ?? null,
    eligibility,
    metCriteria: criteria.filter((criterion) => criterion.status === 'met'),
    gaps: criteria.filter((criterion) => criterion.status === 'gap').sort(compareGaps),
    availableCriteria: criteria,
  };
}

module.exports = { getCandidateMatchDetail, compareGaps, classifyMatchResult };
