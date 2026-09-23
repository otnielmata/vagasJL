const { INITIAL_MATCH_WEIGHTS, BOOLEAN_MATCH_FIELDS, isUnknownSeniority,
  isUnidentifiedModality } = require('../config/match-profile');
const { validMultipliers } = require('../config/match-multipliers');
const { DIMENSIONS, normalizePlace, validGeographyWeights } = require('../config/geography');

const MATCH_SCORING_VERSION = 1;
const DERIVED_FIELDS = Object.freeze([
  'skillsRequiredCounter',
  'amountOfTestingRelatedKeywords',
  'amountOfGenAITools',
  'genAITecnologies',
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
        typeof field.weight !== 'number' || !Number.isFinite(field.weight) || field.weight < 0) {
      throw new TypeError('Configuracao de pesos tecnicos invalida');
    }
    weights.set(field.key, field.weight);
  }
  return weights;
}

function buildScoreResult(details, vacancy) {
  const earnedPoints = details.reduce((total, detail) => total + detail.earnedPoints, 0);
  const possiblePoints = details.reduce((total, detail) => total + detail.weight, 0);
  const groups = new Map();
  for (const detail of details) {
    const group = groups.get(detail.field) || { field: detail.field, earnedPoints: 0, possiblePoints: 0 };
    group.earnedPoints += detail.earnedPoints;
    group.possiblePoints += detail.weight;
    groups.set(detail.field, group);
  }
  const reason = vacancy?.reasonToBeRemoved || null;
  const notCalculable = possiblePoints === 0;
  return {
    percentage: notCalculable ? null : Number((earnedPoints / possiblePoints * 100).toFixed(2)),
    earnedPoints,
    possiblePoints,
    calculationStatus: notCalculable ? 'not_calculable' : 'calculable',
    details,
    groups: [...groups.values()].map((group) => ({ ...group,
      percentage: Number((group.earnedPoints / group.possiblePoints * 100).toFixed(2)) })),
    eligibility: { eligible: !reason, reason },
    ...(vacancy?.origin === 'IMPORTED'
      ? { technicalCompatibility: notCalculable ? 'not_calculable' : 'calculable' } : {}),
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
    if (weight === 0) continue;
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
    if (ignoreUnknown && value === true && BOOLEAN_MATCH_FIELDS.includes(field.key) && field.options?.length === 1) {
      ids.add(field.options[0].id);
      continue;
    }
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

function validExperience(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 &&
    Number.isInteger(value * 10);
}

function geographicDetails(restrictions, candidateLocation, configuration, multipliers) {
  if (!restrictions) return [];
  if (!validGeographyWeights(configuration.geographyWeights) || !validMultipliers(multipliers)) {
    throw new TypeError('Configuracao geografica invalida');
  }
  const weights = configuration.geographyWeights?.toObject?.() || configuration.geographyWeights;
  const declared = restrictions?.toObject?.() || restrictions;
  if (typeof declared !== 'object' || Array.isArray(declared) ||
      Object.keys(declared).some((key) => !DIMENSIONS.includes(key))) {
    throw new TypeError('Restricoes geograficas invalidas');
  }
  return DIMENSIONS.flatMap((key) => {
    const restriction = declared[key];
    if (restriction == null) return [];
    const value = normalizePlace(restriction.value);
    if (!value || !['required', 'desirable', 'indifferent'].includes(restriction.importance)) {
      throw new TypeError('Restricao geografica invalida');
    }
    if (restriction.importance === 'indifferent') return [];
    const weight = weights[key] * multipliers[restriction.importance];
    return [{ field: `geo.${key}`, weight,
      earnedPoints: normalizePlace(candidateLocation?.[key]) === value ? weight : 0 }];
  });
}

function calculateCompetencyMatch({ vacancyValues = {}, candidateValues = {}, configuration, vacancy = {},
  requirements, multipliers, eliminatoryPolicyEnabled = true, geographicRestrictions,
  candidateLocation }) {
  const weights = configuredWeights(configuration);
  if (!vacancyValues || typeof vacancyValues !== 'object' || Array.isArray(vacancyValues) ||
      !candidateValues || typeof candidateValues !== 'object' || Array.isArray(candidateValues)) {
    throw new TypeError('Perfis de competencias invalidos');
  }
  const fields = new Map(configuration.fields.map((field) => [field.key, field]));
  const rawType = Array.isArray(vacancyValues.type) ? vacancyValues.type : [vacancyValues.type];
  const vacancyType = canonicalValues(vacancy.origin === 'IMPORTED'
    ? rawType.filter((value) => !isUnidentifiedModality(value)) : vacancyValues.type, fields.get('type'));
  if (vacancyType.size > 1) throw new TypeError('Modalidade principal da vaga invalida');
  const details = [];
  if (requirements !== undefined) {
    if (!Array.isArray(requirements) || !validMultipliers(multipliers) ||
        typeof eliminatoryPolicyEnabled !== 'boolean') throw new TypeError('Importancia invalida');
    const seen = new Map();
    let unmetEliminatory = null;
    for (const requirement of requirements) {
      const { field, id, value, importance, eliminatory = false } = requirement;
      if (!weights.has(field) || !['required', 'desirable', 'indifferent'].includes(importance)) {
        throw new TypeError('Requisito invalido');
      }
      if (typeof eliminatory !== 'boolean' || (importance === 'indifferent' && eliminatory)) {
        throw new TypeError('Sinalizador eliminatorio invalido');
      }
      if (vacancy.origin === 'IMPORTED' && field === 'level' &&
          (isUnknownSeniority(id) ||
            (Array.isArray(vacancyValues.level) ? vacancyValues.level : [vacancyValues.level])
              .some(isUnknownSeniority))) continue;
      if (vacancy.origin === 'IMPORTED' && field === 'type' && !vacancyType.size) continue;
      const key = field === 'yearsOfExperience' ? field : `${field}:${id}`;
      if (seen.has(key)) {
        const previous = seen.get(key);
        if (previous.importance !== importance || previous.eliminatory !== eliminatory ||
            previous.value !== value) throw new TypeError('Requisito duplicado conflitante');
        continue;
      }
      seen.set(key, { importance, eliminatory, value });
      if (importance === 'indifferent') continue;
      if (field === 'type' && !vacancyType.has(id)) throw new TypeError('Modalidade principal da vaga invalida');
      const weight = weights.get(field) * multipliers[importance];
      let matched;
      let earnedPoints;
      if (field === 'yearsOfExperience') {
        if (!validExperience(value) || vacancyValues[field] !== value) {
          throw new TypeError('Experiencia invalida');
        }
        if (vacancy.origin === 'IMPORTED' && value === 0) continue;
        const candidateExperience = candidateValues[field];
        if (candidateExperience != null && !validExperience(candidateExperience)) {
          throw new TypeError('Experiencia do candidato invalida');
        }
        matched = candidateExperience != null && candidateExperience >= value;
        earnedPoints = candidateExperience == null ? 0 : weight *
          (value === 0 ? 1 : Math.min(candidateExperience / value, 1));
      } else {
        if (typeof id !== 'string' || !canonicalValues(vacancyValues[field], fields.get(field)).has(id)) {
          throw new TypeError('Competencia fora do perfil da vaga');
        }
        matched = canonicalValues(candidateValues[field], fields.get(field), true).has(id);
        earnedPoints = matched ? weight : 0;
      }
      if (eliminatory && eliminatoryPolicyEnabled && !matched && !unmetEliminatory) {
        unmetEliminatory = { code: 'ELIMINATORY_REQUIREMENT_UNMET', field,
          ...(field === 'yearsOfExperience' ? { value } : { id }) };
      }
      if (weight > 0) details.push({ field, id: field === 'yearsOfExperience' ? undefined : id,
        weight, earnedPoints });
    }
    const result = buildScoreResult([...details,
      ...geographicDetails(geographicRestrictions, candidateLocation, configuration, multipliers)], vacancy);
    if (unmetEliminatory) result.eligibility = { eligible: false, reason: unmetEliminatory };
    return result;
  }
  for (const key of TECHNICAL_FIELDS) {
    if (key === 'yearsOfExperience') continue;
    if (vacancy.origin === 'IMPORTED' && key === 'level' &&
        (Array.isArray(vacancyValues.level) ? vacancyValues.level : [vacancyValues.level])
          .some(isUnknownSeniority)) continue;
    const field = fields.get(key);
    const required = canonicalValues(vacancyValues[key], field);
    if (!required.size) continue;
    const offered = canonicalValues(candidateValues[key], field);
    const weight = weights.get(key);
    if (weight === 0) continue;
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
