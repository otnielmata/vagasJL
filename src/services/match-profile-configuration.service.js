const Configuration = require('../models/match-profile-configuration.model');
const ApiError = require('../errors/api.error');
const { INITIAL_MATCH_WEIGHTS, normalizeMatchAlias, isUnknownSeniority,
  isUnidentifiedModality } = require('../config/match-profile');
const { DIMENSIONS, validGeographyWeights } = require('../config/geography');

const KEYS = Object.keys(INITIAL_MATCH_WEIGHTS);
const OPTION_ID = /^[a-z][a-z0-9_-]*$/;

function invalid() {
  throw new ApiError(400, 'Configuracao de Perfil de Match invalida');
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return plainObject(value) && Object.keys(value).length === expected.length &&
    Object.keys(value).every((key) => expected.includes(key));
}

function normalizeAlias(value) {
  if (typeof value !== 'string') invalid();
  const normalized = normalizeMatchAlias(value);
  if (!normalized || normalized.length > 100) invalid();
  return normalized;
}

function normalizeOptions(options) {
  if (!Array.isArray(options) || options.length > 500) invalid();
  const ids = new Set();
  const aliases = new Map();
  return options.map((option) => {
    if (!exactKeys(option, ['id', 'label', 'aliases']) ||
        typeof option.id !== 'string' || !OPTION_ID.test(option.id) || option.id.length > 100 ||
        typeof option.label !== 'string' || !option.label.trim() || option.label.length > 100 ||
        !Array.isArray(option.aliases) || option.aliases.length > 50 || ids.has(option.id)) invalid();
    ids.add(option.id);
    const names = [option.id, option.label, ...option.aliases];
    const normalizedNames = new Set();
    for (const name of names) {
      const normalized = normalizeAlias(name);
      const previous = aliases.get(normalized);
      if (previous && previous !== option.id) {
        throw new ApiError(409, 'Alias de competencia em conflito');
      }
      aliases.set(normalized, option.id);
      normalizedNames.add(normalized);
    }
    return {
      id: option.id,
      label: option.label.trim(),
      aliases: [...normalizedNames].filter((name) =>
        name !== normalizeAlias(option.id) && name !== normalizeAlias(option.label)).sort(),
    };
  }).sort((first, second) => first.id.localeCompare(second.id));
}

function normalizeFields(input) {
  if ((!exactKeys(input, ['fields']) && !exactKeys(input, ['fields', 'geographyWeights'])) ||
      (Object.hasOwn(input, 'geographyWeights') && !validGeographyWeights(input.geographyWeights)) ||
      !plainObject(input.fields) ||
      Object.keys(input.fields).length !== KEYS.length ||
      Object.keys(input.fields).some((key) => !KEYS.includes(key))) invalid();

  return KEYS.map((key) => {
    const field = input.fields[key];
    if (!exactKeys(field, ['weight', 'options']) || !Number.isSafeInteger(field.weight) ||
        field.weight <= 0) invalid();
    const options = normalizeOptions(field.options);
    if (key === 'level' && options.some((option) =>
      [option.id, option.label, ...option.aliases].some(isUnknownSeniority))) invalid();
    if (key === 'type' && options.some((option) =>
      [option.id, option.label, ...option.aliases].some(isUnidentifiedModality))) invalid();
    return { key, weight: field.weight, options };
  });
}

function assertStableIds(previousFields, nextFields) {
  const nextByKey = new Map(nextFields.map((field) => [field.key, field]));
  for (const previousField of previousFields) {
    const nextOptions = nextByKey.get(previousField.key).options;
    const nextIds = new Set(nextOptions.map((option) => option.id));
    if (previousField.options.some((option) => !nextIds.has(option.id))) {
      throw new ApiError(409, 'Identificador canonico existente nao pode ser removido');
    }
    const nextAliases = new Map(nextOptions.flatMap((option) =>
      [option.id, option.label, ...option.aliases].map((name) => [normalizeAlias(name), option.id])));
    for (const option of previousField.options) {
      for (const name of [option.id, option.label, ...option.aliases]) {
        const owner = nextAliases.get(normalizeAlias(name));
        if (owner && owner !== option.id) {
          throw new ApiError(409, 'Alias publicado nao pode apontar para outro identificador');
        }
      }
    }
  }
}

function sameFields(left, right) {
  const normalized = (fields) => fields.map((field) => ({
    key: field.key,
    weight: field.weight,
    options: field.options.map((option) => ({
      id: option.id,
      label: option.label,
      aliases: [...option.aliases].sort(),
    })),
  }));
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

async function publishConfiguration(user, input) {
  if (user?.role !== 'admin') throw new ApiError(403, 'Apenas administradores podem configurar o Perfil de Match');
  const fields = normalizeFields(input);
  await Configuration.init();
  const current = await Configuration.findOne().sort({ version: -1 });
  const canonicalGeography = (weights) => weights ? Object.fromEntries(DIMENSIONS.map((key) =>
    [key, weights[key]])) : null;
  const geographyWeights = canonicalGeography(input.geographyWeights || current?.geographyWeights);
  const sameGeography = (configuration) => JSON.stringify(canonicalGeography(configuration?.geographyWeights)) ===
    JSON.stringify(geographyWeights);
  if (current) {
    assertStableIds(current.fields, fields);
    if (sameFields(current.fields, fields) && sameGeography(current)) return current;
  }

  try {
    return await Configuration.create({ version: (current?.version || 0) + 1, fields,
      geographyWeights, createdBy: user.id });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const latest = await Configuration.findOne().sort({ version: -1 });
    if (latest && sameFields(latest.fields, fields) && sameGeography(latest)) return latest;
    throw new ApiError(409, 'Configuracao alterada concorrentemente; tente novamente');
  }
}

module.exports = { publishConfiguration };
