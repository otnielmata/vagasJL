const Configuration = require('../models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS, normalizeMatchAlias } = require('../config/match-profile');
const ApiError = require('../errors/api.error');
const { validateRequirements } = require('./vacancy-requirements.service');

const FIELD_KEYS = Object.keys(INITIAL_MATCH_WEIGHTS);
const BODY_FIELDS = new Set(['reference', 'title', 'description', 'location', 'matchProfile', 'expiresAt']);

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
      Object.keys(value).length !== 3 ||
      Object.keys(value).some((key) => !['city', 'state', 'country'].includes(key))) invalid();
  return Object.fromEntries(['city', 'state', 'country'].map((key) => [key, text(value[key], 200)]));
}

function normalizeVacancyInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length < 4 || Object.keys(input).some((key) => !BODY_FIELDS.has(key))) invalid();
  const reference = text(input.reference, 100).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(reference)) invalid();
  const title = text(input.title, 200);
  const description = text(input.description, 10000);
  const location = normalizeLocation(input.location);
  let expiresAt = null;
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    if (typeof input.expiresAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.expiresAt)) invalid();
    expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) invalid();
  }
  const matchProfile = input.matchProfile;
  if (!matchProfile || typeof matchProfile !== 'object' || Array.isArray(matchProfile) ||
      Object.keys(matchProfile).some((key) => !['values', 'requirements'].includes(key)) ||
      !Object.hasOwn(matchProfile, 'values') ||
      !matchProfile.values || typeof matchProfile.values !== 'object' ||
      Array.isArray(matchProfile.values) || !Object.keys(matchProfile.values).length ||
      !Object.hasOwn(matchProfile.values, 'type') ||
      Object.keys(matchProfile.values).some((key) => !FIELD_KEYS.includes(key))) invalid();
  return { reference, title, description, location, expiresAt, values: matchProfile.values,
    requirements: matchProfile.requirements };
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
    const catalog = new Map();
    for (const option of fields.get(key).options) {
      for (const label of [option.id, option.label, ...option.aliases]) {
        catalog.set(normalizeMatchAlias(label), option.id);
      }
    }
    const selected = new Set();
    for (const choice of choices) {
      if (typeof choice !== 'string' || !choice.trim() || choice.length > 100) invalid();
      const canonicalId = catalog.get(normalizeMatchAlias(choice));
      if (!canonicalId) invalid('Competencia fora do catalogo publicado');
      selected.add(canonicalId);
    }
    values[key] = [...selected].sort();
  }
  return values;
}

async function prepareVacancyContent(input) {
  const data = normalizeVacancyInput(input);
  const configuration = await Configuration.findOne().sort({ version: -1 });
  if (!configuration) throw new ApiError(503, 'Configuracao do Perfil de Match nao publicada');
  const values = normalizeValues(data.values, configuration);
  return {
    reference: data.reference,
    title: data.title,
    description: data.description,
    location: data.location,
    expiresAt: data.expiresAt,
    matchProfile: {
      configurationVersion: configuration.version,
      values,
      requirements: validateRequirements(data.requirements || [], values, configuration),
    },
  };
}

module.exports = { normalizeVacancyInput, prepareVacancyContent };
