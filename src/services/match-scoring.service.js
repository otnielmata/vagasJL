const { INITIAL_MATCH_WEIGHTS } = require('../config/match-profile');

const MATCH_SCORING_VERSION = 1;
const DERIVED_FIELDS = Object.freeze([
  'skillsRequiredCounter',
  'amountOfTestingRelatedKeywords',
  'amountOfGenAITools',
  'hasGenAI',
  'isTestingRelated',
  'reasonToBeRemoved',
]);
const MATCH_V1_EXCLUDED_FIELDS = Object.freeze([...DERIVED_FIELDS, 'testingRelatedKeywords']);
const TECHNICAL_FIELDS = Object.freeze(Object.keys(INITIAL_MATCH_WEIGHTS)
  .filter((key) => !MATCH_V1_EXCLUDED_FIELDS.includes(key)));

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

function buildScoreResult(details, vacancy) {
  const earnedPoints = details.reduce((total, detail) => total + detail.earnedPoints, 0);
  const possiblePoints = details.reduce((total, detail) => total + detail.weight, 0);
  const reason = vacancy?.reasonToBeRemoved || null;
  return {
    percentage: possiblePoints ? Number((earnedPoints / possiblePoints * 100).toFixed(2)) : 0,
    earnedPoints,
    possiblePoints,
    details,
    eligibility: { eligible: !reason, reason },
  };
}

function calculateMatchScore({ technicalResults = {}, configuration, vacancy = {} }) {
  if (!technicalResults || typeof technicalResults !== 'object' || Array.isArray(technicalResults)) {
    throw new TypeError('Resultados tecnicos invalidos');
  }
  const weights = configuredWeights(configuration);
  const details = [];
  for (const field of TECHNICAL_FIELDS) {
    const criterion = technicalResults[field];
    if (criterion == null || criterion.applicable !== true) continue;
    if (typeof criterion.matched !== 'boolean') throw new TypeError('Resultado tecnico invalido');
    const weight = weights.get(field);
    const earned = criterion.matched ? weight : 0;
    details.push({ field, weight, earnedPoints: earned });
  }
  return buildScoreResult(details, vacancy);
}

function normalizeCompetency(value) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Competencia invalida');
  return value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ');
}

function canonicalValues(values, field) {
  if (values == null) return new Set();
  const submitted = Array.isArray(values) ? values : [values];
  const aliases = new Map();
  for (const option of field.options || []) {
    for (const name of [option.id, option.label, ...(option.aliases || [])]) {
      aliases.set(normalizeCompetency(name), option.id);
    }
  }
  const ids = new Set();
  for (const value of submitted) {
    const id = aliases.get(normalizeCompetency(value));
    if (!id) throw new TypeError('Competencia fora do catalogo publicado');
    ids.add(id);
  }
  return ids;
}

function calculateCompetencyMatch({ vacancyValues = {}, candidateValues = {}, configuration, vacancy = {} }) {
  const weights = configuredWeights(configuration);
  if (!vacancyValues || typeof vacancyValues !== 'object' || Array.isArray(vacancyValues) ||
      !candidateValues || typeof candidateValues !== 'object' || Array.isArray(candidateValues)) {
    throw new TypeError('Perfis de competencias invalidos');
  }
  const fields = new Map(configuration.fields.map((field) => [field.key, field]));
  const details = [];
  for (const key of TECHNICAL_FIELDS) {
    if (key === 'yearsOfExperience') continue;
    const field = fields.get(key);
    const required = canonicalValues(vacancyValues[key], field);
    if (!required.size) continue;
    const offered = canonicalValues(candidateValues[key], field);
    const weight = weights.get(key);
    for (const id of [...required].sort()) {
      details.push({ field: key, id, weight, earnedPoints: offered.has(id) ? weight : 0 });
    }
  }
  return buildScoreResult(details, vacancy);
}

module.exports = {
  calculateMatchScore,
  calculateCompetencyMatch,
  TECHNICAL_FIELDS,
  DERIVED_FIELDS,
  MATCH_V1_EXCLUDED_FIELDS,
  MATCH_SCORING_VERSION,
};
