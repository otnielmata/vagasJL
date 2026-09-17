const { INITIAL_MATCH_WEIGHTS } = require('../config/match-profile');

const TECHNICAL_FIELDS = Object.freeze(Object.keys(INITIAL_MATCH_WEIGHTS));
const DERIVED_FIELDS = Object.freeze([
  'skillsRequiredCounter',
  'amountOfTestingRelatedKeywords',
  'amountOfGenAITools',
  'hasGenAI',
  'isTestingRelated',
  'reasonToBeRemoved',
]);

function configuredWeights(configuration) {
  const fields = configuration?.fields;
  if (!Array.isArray(fields) || fields.length !== TECHNICAL_FIELDS.length) {
    throw new TypeError('Configuracao de pesos tecnicos incompleta');
  }
  const weights = new Map();
  for (const field of fields) {
    if (!TECHNICAL_FIELDS.includes(field.key) || weights.has(field.key) ||
        !Number.isSafeInteger(field.weight) || field.weight <= 0) {
      throw new TypeError('Configuracao de pesos tecnicos invalida');
    }
    weights.set(field.key, field.weight);
  }
  return weights;
}

function calculateMatchScore({ technicalResults = {}, configuration, vacancy = {} }) {
  if (!technicalResults || typeof technicalResults !== 'object' || Array.isArray(technicalResults)) {
    throw new TypeError('Resultados tecnicos invalidos');
  }
  const weights = configuredWeights(configuration);
  const details = [];
  let earnedPoints = 0;
  let possiblePoints = 0;
  for (const field of TECHNICAL_FIELDS) {
    const criterion = technicalResults[field];
    if (criterion == null || criterion.applicable !== true) continue;
    if (typeof criterion.matched !== 'boolean') throw new TypeError('Resultado tecnico invalido');
    const weight = weights.get(field);
    const earned = criterion.matched ? weight : 0;
    earnedPoints += earned;
    possiblePoints += weight;
    details.push({ field, weight, earnedPoints: earned });
  }
  const reason = vacancy?.reasonToBeRemoved || null;
  return {
    percentage: possiblePoints ? Number((earnedPoints / possiblePoints * 100).toFixed(2)) : 0,
    earnedPoints,
    possiblePoints,
    details,
    eligibility: { eligible: !reason, reason },
  };
}

module.exports = { calculateMatchScore, TECHNICAL_FIELDS, DERIVED_FIELDS };
