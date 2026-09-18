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
  const nonCalculableImport = vacancy?.origin === 'IMPORTED' && possiblePoints === 0;
  return {
    percentage: nonCalculableImport ? null : possiblePoints
      ? Number((earnedPoints / possiblePoints * 100).toFixed(2)) : 0,
    earnedPoints,
    possiblePoints,
    details,
    eligibility: { eligible: !reason, reason },
    ...(vacancy?.origin === 'IMPORTED'
      ? { technicalCompatibility: nonCalculableImport ? 'not_calculable' : 'calculable' } : {}),
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

function canonicalValues(values, field, ignoreUnknown = false) {
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
    if (ignoreUnknown && (typeof value !== 'string' || !value.trim())) continue;
    const id = aliases.get(normalizeCompetency(value));
    if (!id) {
      if (ignoreUnknown) continue;
      throw new TypeError('Competencia fora do catalogo publicado');
    }
    ids.add(id);
  }
  return ids;
}

function calculateCompetencyMatch({ vacancyValues = {}, candidateValues = {}, configuration, vacancy = {},
  requirements, desirableFactor = 0.5, eliminatoryPolicyEnabled = true }) {
  const weights = configuredWeights(configuration);
  if (!vacancyValues || typeof vacancyValues !== 'object' || Array.isArray(vacancyValues) ||
      !candidateValues || typeof candidateValues !== 'object' || Array.isArray(candidateValues)) {
    throw new TypeError('Perfis de competencias invalidos');
  }
  const fields = new Map(configuration.fields.map((field) => [field.key, field]));
  const details = [];
  if (requirements !== undefined) {
    if (!Array.isArray(requirements) || !Number.isFinite(desirableFactor) ||
        desirableFactor <= 0 || desirableFactor >= 1 ||
        typeof eliminatoryPolicyEnabled !== 'boolean') throw new TypeError('Importancia invalida');
    const seen = new Set();
    let unmetEliminatory = null;
    for (const requirement of requirements) {
      const { field, id, value, importance, eliminatory = false } = requirement;
      if (!weights.has(field) || !['required', 'desirable', 'indifferent'].includes(importance)) {
        throw new TypeError('Requisito invalido');
      }
      if (typeof eliminatory !== 'boolean' || (importance === 'indifferent' && eliminatory)) {
        throw new TypeError('Sinalizador eliminatorio invalido');
      }
      const key = field === 'yearsOfExperience' ? field : `${field}:${id}`;
      if (seen.has(key)) throw new TypeError('Requisito duplicado');
      seen.add(key);
      if (importance === 'indifferent') continue;
      const weight = weights.get(field) * (importance === 'desirable' ? desirableFactor : 1);
      let matched;
      if (field === 'yearsOfExperience') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
            vacancyValues[field] !== value) throw new TypeError('Experiencia invalida');
        matched = typeof candidateValues[field] === 'number' && candidateValues[field] >= value;
      } else {
        if (typeof id !== 'string' || !canonicalValues(vacancyValues[field], fields.get(field)).has(id)) {
          throw new TypeError('Competencia fora do perfil da vaga');
        }
        matched = canonicalValues(candidateValues[field], fields.get(field), true).has(id);
      }
      if (eliminatory && eliminatoryPolicyEnabled && !matched && !unmetEliminatory) {
        unmetEliminatory = { code: 'ELIMINATORY_REQUIREMENT_UNMET', field,
          ...(field === 'yearsOfExperience' ? { value } : { id }) };
      }
      details.push({ field, id: field === 'yearsOfExperience' ? undefined : id,
        weight, earnedPoints: matched ? weight : 0 });
    }
    const result = buildScoreResult(details, vacancy);
    if (unmetEliminatory) result.eligibility = { eligible: false, reason: unmetEliminatory };
    return result;
  }
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
