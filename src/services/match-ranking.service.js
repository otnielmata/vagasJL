const { assessVacancyForMatch } = require('./vacancy-origin.service');
const { calculateCompetencyMatch } = require('./match-scoring.service');
const config = require('../config/env');

function scorePair(vacancy, candidateValues, configuration, multipliers, now, candidateLocation) {
  const technicalProfile = assessVacancyForMatch(vacancy, now).technicalProfile;
  return calculateCompetencyMatch({ vacancyValues: technicalProfile.values,
    candidateValues, configuration, requirements: vacancy.matchProfile.requirements,
    geographicRestrictions: vacancy.geographicRestrictions, candidateLocation,
    multipliers,
    eliminatoryPolicyEnabled: config.match.eliminatoryEnabled,
    vacancy: { origin: vacancy.origin } });
}

module.exports = { scorePair };
