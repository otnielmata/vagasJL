const { assessVacancyForMatch } = require('./vacancy-origin.service');
const { calculateCompetencyMatch } = require('./match-scoring.service');
const config = require('../config/env');

function countMatchedRequired(score, requirements = [], geographicRestrictions = {}) {
  const fullyMatched = new Set(score.details.filter((detail) => detail.weight > 0 &&
    Math.abs(detail.earnedPoints - detail.weight) < Number.EPSILON)
    .map((detail) => `${detail.field}:${detail.id ?? ''}`));
  const matched = new Set();
  for (const requirement of requirements) {
    if (requirement.importance !== 'required') continue;
    const key = `${requirement.field}:${requirement.field === 'yearsOfExperience' ? '' : requirement.id}`;
    if (fullyMatched.has(key)) matched.add(key);
  }
  const restrictions = geographicRestrictions?.toObject?.() || geographicRestrictions || {};
  for (const [dimension, restriction] of Object.entries(restrictions)) {
    const key = `geo.${dimension}:`;
    if (restriction?.importance === 'required' && fullyMatched.has(key)) matched.add(key);
  }
  return matched.size;
}

function compareRankingRows(left, right) {
  return right.percentage - left.percentage ||
    right.matchedRequiredCount - left.matchedRequiredCount ||
    new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0) ||
    String(left.stableId).localeCompare(String(right.stableId));
}

function scorePair(vacancy, candidateValues, configuration, multipliers, now, candidateLocation,
  rules = {}) {
  const technicalProfile = assessVacancyForMatch(vacancy, now).technicalProfile;
  const score = calculateCompetencyMatch({ vacancyValues: technicalProfile.values,
    candidateValues, configuration, requirements: vacancy.matchProfile.requirements,
    geographicRestrictions: vacancy.geographicRestrictions, candidateLocation,
    multipliers,
    eliminatoryPolicyEnabled: rules.eliminatoryPolicyEnabled ?? config.match.eliminatoryEnabled,
    vacancy: { origin: vacancy.origin } });
  return { ...score, matchedRequiredCount: countMatchedRequired(score,
    vacancy.matchProfile.requirements, vacancy.geographicRestrictions) };
}

module.exports = { scorePair, compareRankingRows };
