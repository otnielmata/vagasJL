const crypto = require('node:crypto');
const MatchEvaluation = require('../models/match-evaluation.model');
const { MATCH_SCORING_VERSION } = require('./match-scoring.service');
const ApiError = require('../errors/api.error');

const MATCH_ALGORITHM_VERSION = `MATCH_V${MATCH_SCORING_VERSION}`;

function safeReason(reason) {
  if (!reason) return null;
  if (typeof reason !== 'object' || Array.isArray(reason) || typeof reason.code !== 'string') {
    return { code: 'MATCH_POLICY_RESTRICTION' };
  }
  return Object.fromEntries(['code', 'field', 'id', 'value']
    .filter((key) => ['string', 'number'].includes(typeof reason[key]))
    .map((key) => [key, reason[key]]));
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeExplanation(details) {
  if (details === undefined) details = [];
  if (!Array.isArray(details) || details.length > 500) return null;
  const criteria = [];
  for (const detail of details) {
    const field = detail?.field;
    const id = detail?.id ?? null;
    const possiblePoints = detail?.weight;
    const earnedPoints = detail?.earnedPoints;
    if (typeof field !== 'string' || !field.trim() || field.length > 100 ||
        id !== null && (typeof id !== 'string' || !id.trim() || id.length > 100) ||
        !Number.isFinite(possiblePoints) || possiblePoints < 0 ||
        !Number.isFinite(earnedPoints) || earnedPoints < 0 || earnedPoints > possiblePoints) return null;
    const status = possiblePoints > 0 && earnedPoints === possiblePoints
      ? 'met' : earnedPoints > 0 ? 'partial' : 'gap';
    criteria.push({ field: field.trim(), id: id?.trim() || null, status,
      earnedPoints, possiblePoints });
  }
  return { criteria,
    metCount: criteria.filter((criterion) => criterion.status === 'met').length,
    partialCount: criteria.filter((criterion) => criterion.status === 'partial').length,
    gapCount: criteria.filter((criterion) => criterion.status === 'gap').length };
}

function auditData(input) {
  const calculatedAt = validDate(input.calculatedAt);
  const vacancyUpdatedAt = validDate(input.vacancy?.updatedAt || input.calculatedAt);
  const profileUpdatedAt = input.profile ? validDate(input.profile.updatedAt || input.calculatedAt) : null;
  const executionId = input.executionId || crypto.randomUUID();
  const algorithmVersion = input.algorithmVersion || MATCH_ALGORITHM_VERSION;
  const candidate = input.candidate?._id || input.candidate;
  const vacancy = input.vacancy?._id || input.vacancy;
  const profileCatalog = input.versions?.profileCatalog;
  const engine = input.versions?.engine ?? null;
  const multipliers = input.versions?.multipliers;
  const rankingThreshold = input.versions?.rankingThreshold ?? null;
  const completionThreshold = input.versions?.completionThreshold ?? null;
  const vacancyRequirements = input.vacancy?.requirementsRevision ?? 0;
  const candidateProfile = input.profile ? input.profile.revision ?? 1 : null;
  const status = input.score?.calculationStatus;
  const calculable = status === 'calculable';
  const explanation = safeExplanation(input.score?.details);
  const validCalculatedScore = !calculable ||
    Number.isFinite(input.score.percentage) && input.score.percentage >= 0 && input.score.percentage <= 100 &&
    Number.isFinite(input.score.earnedPoints) && input.score.earnedPoints >= 0 &&
    Number.isFinite(input.score.possiblePoints) && input.score.possiblePoints > 0;
  if (!candidate || !vacancy || typeof executionId !== 'string' || !executionId.trim() ||
      executionId.length > 200 || !calculatedAt || !vacancyUpdatedAt ||
      !/^MATCH_V[1-9]\d*$/.test(algorithmVersion) ||
      (engine !== null && !/^MATCH_V[1-9]\d*$/.test(engine)) ||
      !['candidate_ranking', 'vacancy_ranking', 'match_detail', 'recalculation'].includes(input.cause) ||
      !Number.isSafeInteger(profileCatalog) || profileCatalog < 1 ||
      !Number.isSafeInteger(multipliers) || multipliers < 1 ||
      (rankingThreshold !== null && (!Number.isSafeInteger(rankingThreshold) || rankingThreshold < 1)) ||
      (completionThreshold !== null && (!Number.isSafeInteger(completionThreshold) || completionThreshold < 1)) ||
      !Number.isSafeInteger(vacancyRequirements) || vacancyRequirements < 0 ||
      (candidateProfile !== null && (!Number.isSafeInteger(candidateProfile) || candidateProfile < 1)) ||
      !['calculable', 'not_calculable'].includes(status) || !validCalculatedScore || !explanation) {
    throw new ApiError(503, 'Contexto de auditoria do Match invalido');
  }
  const eligibility = input.eligibility || input.score.eligibility || { eligible: null, reason: null };
  return { candidate, vacancy, executionId: executionId.trim(), cause: input.cause, calculatedAt,
    algorithmVersion, configurationVersions: { ...(engine ? { engine } : {}), profileCatalog,
      multipliers, rankingThreshold, completionThreshold },
    inputRevisions: { vacancyRequirements, vacancyUpdatedAt, candidateProfile,
      candidateProfileUpdatedAt: profileUpdatedAt }, calculationStatus: status,
    percentage: calculable ? input.score.percentage : null,
    earnedPoints: calculable ? input.score.earnedPoints : null,
    possiblePoints: calculable ? input.score.possiblePoints : null,
    explanation,
    eligibility: { eligible: eligibility.eligible ?? null, reason: safeReason(eligibility.reason) } };
}

async function recordMatchEvaluation(input) {
  const data = auditData(input);
  const key = { candidate: data.candidate, vacancy: data.vacancy, executionId: data.executionId,
    'inputRevisions.vacancyRequirements': data.inputRevisions.vacancyRequirements,
    'inputRevisions.candidateProfile': data.inputRevisions.candidateProfile,
    algorithmVersion: data.algorithmVersion };
  try {
    await MatchEvaluation.init();
    const evaluation = await MatchEvaluation.findOneAndUpdate(key, { $setOnInsert: data },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    if (!evaluation) throw new Error('missing evaluation');
    return { evaluationId: String(evaluation._id), executionId: data.executionId,
      algorithmVersion: data.algorithmVersion, calculatedAt: data.calculatedAt,
      configurationVersions: data.configurationVersions, inputRevisions: data.inputRevisions };
  } catch (error) {
    if (error.statusCode) throw error;
    throw new ApiError(503, 'Auditoria do Match indisponivel');
  }
}

async function getLatestMatchEvaluation(candidate, vacancy) {
  if (!candidate || !vacancy) throw new ApiError(400, 'Par de Match invalido');
  return MatchEvaluation.findOne({ candidate, vacancy }).sort({ calculatedAt: -1, _id: -1 });
}

module.exports = { recordMatchEvaluation, getLatestMatchEvaluation,
  auditData, safeReason, safeExplanation, MATCH_ALGORITHM_VERSION };
