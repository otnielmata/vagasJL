const { assessVacancyForMatch } = require('./vacancy-origin.service');
const { calculateCompetencyMatch } = require('./match-scoring.service');
const config = require('../config/env');

function scorePair(vacancy, candidateValues, configuration, now) {
  const technicalProfile = assessVacancyForMatch(vacancy, now).technicalProfile;
  return calculateCompetencyMatch({ vacancyValues: technicalProfile.values,
    candidateValues, configuration, requirements: vacancy.matchProfile.requirements,
    desirableFactor: config.match.desirableFactor,
    eliminatoryPolicyEnabled: config.match.eliminatoryEnabled,
    vacancy: { origin: vacancy.origin } });
}

module.exports = { scorePair };
