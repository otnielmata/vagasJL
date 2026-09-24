const Configuration = require('../models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS, isUnknownSeniority,
  isUnidentifiedModality } = require('../config/match-profile');
const ApiError = require('../errors/api.error');
const { validateRequirements } = require('./vacancy-requirements.service');
const { DIMENSIONS, normalizePlace, validGeographyWeights } = require('../config/geography');
const { migrateLegacyAiValues, LEGACY_AI_FIELD } = require('./legacy-ai-migration.service');
const { normalizeCatalogAlias } = require('../config/master-catalog');
const { normalizeApplicationChannel } = require('../config/application-channel');

const FIELD_KEYS = Object.keys(INITIAL_MATCH_WEIGHTS);
const BODY_FIELDS = new Set(['reference', 'title', 'description', 'location',
  'geographicRestrictions', 'matchProfile', 'expiresAt', 'applicationChannel']);

function invalid(message = 'Dados da vaga invalidos') {
  throw new ApiError(400, message);
}

function text(value, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) invalid();
  return value.trim();
}

function normalizeLocation(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value) ||
      !Object.keys(value).length ||
      Object.keys(value).some((key) => !DIMENSIONS.includes(key))) invalid();
  return Object.fromEntries(Object.entries(value).map(([key, place]) => {
    if (!normalizePlace(place)) invalid('Localizacao invalida');
    return [key, text(place, 200)];
  }));
}

function normalizeRestrictions(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length ||
      Object.keys(value).some((key) => !DIMENSIONS.includes(key))) invalid('Restricoes geograficas invalidas');
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).sort().join(',') !== 'importance,value' || !normalizePlace(item.value) ||
        !['required', 'desirable', 'indifferent'].includes(item.importance)) {
      invalid('Restricao geografica invalida');
    }
    return [key, { value: normalizePlace(item.value), importance: item.importance }];
  }));
}

function normalizeVacancyInput(input, { allowUnidentified = false, allowLegacyAi = false,
  allowExpired = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length < 4 || Object.keys(input).some((key) => !BODY_FIELDS.has(key))) invalid();
  const reference = text(input.reference, 100).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(reference)) invalid();
  const title = text(input.title, 200);
  const description = text(input.description, 10000);
  const applicationChannel = input.applicationChannel === undefined || input.applicationChannel === null
    ? null : normalizeApplicationChannel(input.applicationChannel);
  const location = normalizeLocation(input.location);
  const geographicRestrictions = normalizeRestrictions(input.geographicRestrictions);
  let expiresAt = null;
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    if (typeof input.expiresAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.expiresAt)) invalid();
    expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || (!allowExpired && expiresAt <= new Date())) invalid();
  }
  const matchProfile = input.matchProfile;
  if (!matchProfile || typeof matchProfile !== 'object' || Array.isArray(matchProfile) ||
      Object.keys(matchProfile).some((key) => !['values', 'requirements'].includes(key)) ||
      !Object.hasOwn(matchProfile, 'values') ||
      !matchProfile.values || typeof matchProfile.values !== 'object' ||
      Array.isArray(matchProfile.values) ||
      (!allowUnidentified && (!Object.keys(matchProfile.values).length ||
        !Object.hasOwn(matchProfile.values, 'type'))) ||
      Object.keys(matchProfile.values).some((key) =>
        !FIELD_KEYS.includes(key) && !(allowLegacyAi && key === LEGACY_AI_FIELD))) invalid();
  return { reference, title, description, applicationChannel, location, geographicRestrictions,
    expiresAt, values: matchProfile.values, requirements: matchProfile.requirements };
}

function normalizeValues(input, configuration) {
  if (!Number.isSafeInteger(configuration.version) || configuration.version < 1 ||
      !Array.isArray(configuration.fields)) {
    throw new ApiError(503, 'Configuracao do Perfil de Match incompleta');
  }
  const fields = new Map(configuration.fields.map((field) => [field.key, field]));
  if (fields.size !== FIELD_KEYS.length || FIELD_KEYS.some((key) => !fields.has(key))) {
    throw new ApiError(503, 'Configuracao do Perfil de Match incompleta');
  }
  const values = {};
  for (const [key, submitted] of Object.entries(input)) {
    if (key === 'yearsOfExperience') {
      if (typeof submitted !== 'number' || !Number.isFinite(submitted) || submitted < 0 ||
          submitted > 100 || !Number.isInteger(submitted * 10)) invalid();
      values[key] = submitted;
      continue;
    }
    const choices = Array.isArray(submitted) ? submitted : [submitted];
    if (!choices.length || choices.length > 50 || !fields.get(key).options.length) invalid();
    if (key === 'type' && choices.length !== 1) invalid('Informe uma modalidade principal da vaga');
    const catalog = new Map();
    for (const option of fields.get(key).options) {
      for (const label of [option.id, option.label, ...option.aliases]) {
        catalog.set(normalizeCatalogAlias(label), option.id);
      }
    }
    const selected = new Set();
    for (const choice of choices) {
      if (typeof choice !== 'string' || !choice.trim() || choice.length > 100) invalid();
      if (key === 'level' && isUnknownSeniority(choice)) invalid('Senioridade desconhecida nao e opcao valida');
      if (key === 'type' && isUnidentifiedModality(choice)) invalid('Modalidade nao identificada');
      const canonicalId = catalog.get(normalizeCatalogAlias(choice));
      if (!canonicalId) invalid('Competencia fora do catalogo publicado');
      if (key === 'level' && isUnknownSeniority(canonicalId)) invalid('Senioridade desconhecida nao e opcao valida');
      if (key === 'type' && isUnidentifiedModality(canonicalId)) invalid('Modalidade nao identificada');
      selected.add(canonicalId);
    }
    values[key] = [...selected].sort();
  }
  return values;
}

async function prepareVacancyContent(input, options, publishedConfiguration = null) {
  const data = normalizeVacancyInput(input, options);
  const configuration = publishedConfiguration || await Configuration.findOne().sort({ version: -1 });
  if (!configuration) throw new ApiError(503, 'Configuracao do Perfil de Match nao publicada');
  const migration = options?.allowLegacyAi
    ? migrateLegacyAiValues(data.values, configuration) : { values: data.values, audit: null };
  const values = normalizeValues(migration.values, configuration);
  if (data.geographicRestrictions && !validGeographyWeights(configuration.geographyWeights)) {
    throw new ApiError(503, 'Pesos geograficos nao publicados');
  }
  return {
    reference: data.reference,
    title: data.title,
    description: data.description,
    applicationChannel: data.applicationChannel,
    location: data.location,
    geographicRestrictions: data.geographicRestrictions,
    ...(migration.audit ? { legacyAiMigrationAudit: migration.audit } : {}),
    expiresAt: data.expiresAt,
    matchProfile: {
      configurationVersion: configuration.version,
      values,
      requirements: validateRequirements(data.requirements || [], values, configuration),
    },
  };
}

module.exports = { normalizeVacancyInput, prepareVacancyContent };
