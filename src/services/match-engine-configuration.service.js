const Configuration = require('../models/match-engine-configuration.model');
const ApiError = require('../errors/api.error');
const config = require('../config/env');
const { INITIAL_MATCH_WEIGHTS } = require('../config/match-profile');
const { validMultipliers } = require('../config/match-multipliers');

const VERSION = /^MATCH_V([1-9]\d*)$/;
const IMPORTANCE = new Set(['required', 'desirable', 'indifferent']);
const STATES = new Set(['draft', 'published']);
const RECALCULATION_POLICIES = new Set(['none', 'affected_matches']);
const WEIGHT_KEYS = Object.freeze(Object.keys(INITIAL_MATCH_WEIGHTS));
const REQUIRED_KEYS = Object.freeze([
  'defaultImportImportance', 'effectiveAt', 'minimumMatchPercentage', 'multipliers',
  'state', 'weights',
]);
const OPTIONAL_KEYS = Object.freeze(['eliminatoryPolicyEnabled',
  'minimumProfileCompletionPercentage', 'recalculationPolicy']);

function validPercentage(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

function normalizeWeights(weights) {
  if (!weights || typeof weights !== 'object' || Array.isArray(weights) ||
      Object.keys(weights).length !== WEIGHT_KEYS.length ||
      Object.keys(weights).some((key) => !WEIGHT_KEYS.includes(key))) {
    throw new ApiError(422, 'Pesos do Match incompletos ou invalidos');
  }
  const normalized = {};
  for (const key of WEIGHT_KEYS) {
    const value = weights[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000 ||
        Math.abs(value * 100 - Math.round(value * 100)) >= 1e-9) {
      throw new ApiError(422, 'Pesos do Match incompletos ou invalidos');
    }
    normalized[key] = value;
  }
  return normalized;
}

function normalizeInput(version, input) {
  const match = typeof version === 'string' && version.match(VERSION);
  if (!match) throw new ApiError(400, 'Versao do Motor de Match invalida');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(422, 'Configuracao consolidada do Match invalida');
  }
  const keys = Object.keys(input);
  if (REQUIRED_KEYS.some((key) => !keys.includes(key)) ||
      keys.some((key) => !REQUIRED_KEYS.includes(key) && !OPTIONAL_KEYS.includes(key)) ||
      !STATES.has(input.state) || !IMPORTANCE.has(input.defaultImportImportance) ||
      !validMultipliers(input.multipliers) || !validPercentage(input.minimumMatchPercentage) ||
      (input.minimumProfileCompletionPercentage !== undefined &&
        input.minimumProfileCompletionPercentage !== null &&
        !validPercentage(input.minimumProfileCompletionPercentage)) ||
      (input.eliminatoryPolicyEnabled !== undefined &&
        typeof input.eliminatoryPolicyEnabled !== 'boolean') ||
      (input.recalculationPolicy !== undefined &&
        !RECALCULATION_POLICIES.has(input.recalculationPolicy))) {
    throw new ApiError(422, 'Configuracao consolidada do Match invalida');
  }
  const effectiveAt = new Date(input.effectiveAt);
  if (Number.isNaN(effectiveAt.getTime())) {
    throw new ApiError(422, 'Vigencia da configuracao do Match invalida');
  }
  return {
    version,
    revision: Number(match[1]),
    state: input.state,
    weights: normalizeWeights(input.weights),
    multipliers: { required: input.multipliers.required,
      desirable: input.multipliers.desirable, indifferent: input.multipliers.indifferent },
    defaultImportImportance: input.defaultImportImportance,
    minimumMatchPercentage: input.minimumMatchPercentage,
    minimumProfileCompletionPercentage: input.minimumProfileCompletionPercentage ?? null,
    eliminatoryPolicyEnabled: input.eliminatoryPolicyEnabled ?? config.match.eliminatoryEnabled,
    effectiveAt,
    recalculationPolicy: input.recalculationPolicy || 'affected_matches',
  };
}

function plain(value) {
  return value && typeof value.toObject === 'function' ? value.toObject() : value;
}

function comparable(configuration) {
  const data = plain(configuration);
  return {
    version: data.version,
    revision: data.revision,
    weights: plain(data.weights),
    multipliers: plain(data.multipliers),
    defaultImportImportance: data.defaultImportImportance,
    minimumMatchPercentage: data.minimumMatchPercentage,
    minimumProfileCompletionPercentage: data.minimumProfileCompletionPercentage ?? null,
    eliminatoryPolicyEnabled: data.eliminatoryPolicyEnabled ?? config.match.eliminatoryEnabled,
    effectiveAt: new Date(data.effectiveAt).toISOString(),
    recalculationPolicy: data.recalculation?.policy || data.recalculationPolicy,
  };
}

function sameContent(existing, normalized) {
  return JSON.stringify(comparable(existing)) === JSON.stringify(comparable(normalized));
}

function publicationMetadata(normalized, actor, now) {
  const published = normalized.state === 'published';
  const scheduled = published && normalized.recalculationPolicy === 'affected_matches';
  return {
    publishedBy: published ? actor.id : null,
    publishedAt: published ? now : null,
    cacheVersion: normalized.revision,
    cacheInvalidatedAt: published ? now : null,
    recalculation: {
      policy: normalized.recalculationPolicy,
      status: !published ? 'not_scheduled' : scheduled ? 'scheduled' : 'not_required',
      scheduledFor: scheduled
        ? new Date(Math.max(now.getTime(), normalized.effectiveAt.getTime())) : null,
    },
  };
}

async function publishMatchEngineConfiguration(actor, version, input, now = new Date()) {
  if (actor?.role !== 'admin' || !/^[a-f\d]{24}$/i.test(actor.id || '')) {
    throw new ApiError(403, 'Apenas administradores podem configurar o Motor de Match');
  }
  const normalized = normalizeInput(version, input);
  await Configuration.init();
  const existing = await Configuration.findOne({ $or: [
    { version: normalized.version }, { revision: normalized.revision },
  ] });
  if (existing) {
    if (existing.version !== normalized.version || existing.revision !== normalized.revision ||
        !sameContent(existing, normalized)) {
      throw new ApiError(409, 'Versao do Motor de Match ja existe com outro conteudo');
    }
    if (existing.state === normalized.state || existing.state === 'published') return existing;
    const metadata = publicationMetadata(normalized, actor, now);
    const published = await Configuration.findOneAndUpdate({
      _id: existing._id, state: 'draft',
    }, { $set: { state: 'published', ...metadata } }, { new: true, runValidators: true });
    if (!published) throw new ApiError(409, 'Configuracao alterada concorrentemente; tente novamente');
    return published;
  }

  const metadata = publicationMetadata(normalized, actor, now);
  try {
    return await Configuration.create({ ...normalized, createdBy: actor.id, ...metadata });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'Versao do Motor de Match ja existe');
    }
    if (error.name === 'ValidationError' || error.name === 'CastError' ||
        error.name === 'StrictModeError') {
      throw new ApiError(422, 'Configuracao consolidada do Match invalida');
    }
    throw error;
  }
}

async function getEffectiveMatchEngineConfiguration(now = new Date()) {
  const configuration = await Configuration.findOne({
    state: 'published', effectiveAt: { $lte: now },
  }).sort({ effectiveAt: -1, revision: -1 });
  if (!configuration) return null;
  const normalized = normalizeInput(configuration.version, {
    state: configuration.state,
    weights: plain(configuration.weights),
    multipliers: plain(configuration.multipliers),
    defaultImportImportance: configuration.defaultImportImportance,
    minimumMatchPercentage: configuration.minimumMatchPercentage,
    minimumProfileCompletionPercentage: configuration.minimumProfileCompletionPercentage,
    eliminatoryPolicyEnabled: configuration.eliminatoryPolicyEnabled,
    effectiveAt: configuration.effectiveAt,
    recalculationPolicy: configuration.recalculation?.policy,
  });
  return { ...normalized, author: configuration.publishedBy || configuration.createdBy,
    publishedAt: configuration.publishedAt };
}

function applyEngineWeights(profileConfiguration, engineConfiguration) {
  if (!engineConfiguration) return profileConfiguration;
  const source = plain(profileConfiguration);
  if (!source || !Array.isArray(source.fields)) {
    throw new ApiError(503, 'Catalogo do Perfil de Match indisponivel');
  }
  return { ...source, fields: source.fields.map((field) => ({ ...plain(field),
    weight: engineConfiguration.weights[field.key] })) };
}

module.exports = { publishMatchEngineConfiguration, getEffectiveMatchEngineConfiguration,
  applyEngineWeights, normalizeInput, sameContent, WEIGHT_KEYS };
