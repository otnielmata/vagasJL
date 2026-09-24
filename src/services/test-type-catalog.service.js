const Catalog = require('../models/test-type-catalog.model');
const { INITIAL_TEST_TYPES } = require('../config/test-type-catalog');
const ApiError = require('../errors/api.error');

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function invalid() {
  throw new ApiError(400, 'Catalogo de tipos de teste invalido');
}

function normalizeName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) invalid();
  return value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ');
}

function lookup(types) {
  const names = new Map();
  for (const type of types) {
    for (const name of [type.id, type.label, ...(type.aliases || [])]) {
      const normalized = normalizeName(name);
      const previous = names.get(normalized);
      if (previous && previous !== type.id) throw new ApiError(409, 'Alias de tipo de teste em conflito');
      names.set(normalized, type.id);
    }
  }
  return names;
}

function normalizeTypes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 1 || !Array.isArray(input.types) ||
      input.types.length < INITIAL_TEST_TYPES.length || input.types.length > 500) invalid();
  const ids = new Set();
  const types = input.types.map((type) => {
    if (!type || typeof type !== 'object' || Array.isArray(type) ||
        Object.keys(type).some((key) => !['id', 'label', 'aliases'].includes(key)) ||
        !Object.hasOwn(type, 'id') || !Object.hasOwn(type, 'label') ||
        typeof type.id !== 'string' || !ID_PATTERN.test(type.id) || type.id.length > 100 ||
        ids.has(type.id) || typeof type.label !== 'string' ||
        !Array.isArray(type.aliases ?? []) || (type.aliases ?? []).length > 50) invalid();
    ids.add(type.id);
    const label = type.label?.trim();
    normalizeName(label);
    const aliases = [...new Set((type.aliases || []).map(normalizeName))]
      .filter((name) => name !== normalizeName(type.id) && name !== normalizeName(label)).sort();
    return { id: type.id, label, aliases };
  }).sort((first, second) => first.id.localeCompare(second.id));
  lookup(types);
  return types;
}

function assertInitialTypes(types) {
  if (types.length !== INITIAL_TEST_TYPES.length || INITIAL_TEST_TYPES.some((initial) =>
    !types.some((type) => type.id === initial.id && type.label === initial.label))) invalid();
}

function assertStableReferences(previous, next) {
  const nextIds = new Set(next.map((type) => type.id));
  if (previous.some((type) => !nextIds.has(type.id))) {
    throw new ApiError(409, 'Identificador canonico existente nao pode ser removido');
  }
  const currentNames = lookup(next);
  for (const type of previous) {
    for (const name of [type.id, type.label, ...type.aliases]) {
      const owner = currentNames.get(normalizeName(name));
      if (owner && owner !== type.id) throw new ApiError(409, 'Alias publicado nao pode mudar de conceito');
    }
  }
}

function sameTypes(left, right) {
  const comparable = (types) => types.map((type) => ({
    id: type.id, label: type.label, aliases: [...type.aliases].sort(),
  })).sort((first, second) => first.id.localeCompare(second.id));
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

async function publishTestTypeCatalog(user, input) {
  if (user?.role !== 'admin') throw new ApiError(403, 'Apenas administradores podem publicar tipos de teste');
  const types = normalizeTypes(input);
  await Catalog.init();
  const current = await Catalog.findOne().sort({ version: -1 });
  if (current) {
    assertStableReferences(current.types, types);
    if (sameTypes(current.types, types)) return current;
  } else {
    assertInitialTypes(types);
  }
  try {
    return await Catalog.create({ version: (current?.version || 0) + 1, types, createdBy: user.id });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const latest = await Catalog.findOne().sort({ version: -1 });
    if (latest && sameTypes(latest.types, types)) return latest;
    throw new ApiError(409, 'Catalogo alterado concorrentemente; tente novamente');
  }
}

function resolveTestType(value, catalog) {
  const id = lookup(catalog.types).get(normalizeName(value));
  if (!id) invalid();
  return id;
}

function reviewLegacyTestType(originalText, catalog) {
  const suggestedId = lookup(catalog.types).get(normalizeName(originalText)) || null;
  return { originalText, suggestedId, requiresReview: true };
}

module.exports = { publishTestTypeCatalog, resolveTestType, reviewLegacyTestType };
