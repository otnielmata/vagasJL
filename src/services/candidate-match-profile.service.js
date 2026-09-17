const Candidate = require('../models/candidate.model');
const Configuration = require('../models/match-profile-configuration.model');
const MatchProfile = require('../models/candidate-match-profile.model');
const { CANDIDATE_STATUS } = require('../config/candidate');
const { INITIAL_MATCH_WEIGHTS, normalizeMatchAlias } = require('../config/match-profile');
const ApiError = require('../errors/api.error');

const KEYS = Object.keys(INITIAL_MATCH_WEIGHTS);

function invalid(message = 'Dados do Perfil de Match invalidos') {
  throw new ApiError(400, message);
}

function normalizeYears(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100 ||
      !Number.isInteger(value * 10)) invalid('Anos de experiencia devem ser um numero de 0 a 100 com uma casa decimal');
  return value;
}

function normalizeChoices(value, field) {
  if (!Array.isArray(value) && typeof value !== 'string') invalid();
  const submitted = Array.isArray(value) ? value : [value];
  if (submitted.length > 50) invalid();
  if (submitted.length === 0) return undefined;
  if (!field.options.length) invalid('Catalogo do campo ainda nao publicado');

  const canonical = new Map();
  for (const option of field.options) {
    for (const name of [option.id, option.label, ...option.aliases]) {
      canonical.set(normalizeMatchAlias(name), option.id);
    }
  }
  const selected = new Set();
  for (const choice of submitted) {
    if (typeof choice !== 'string' || !choice.trim() || choice.length > 100) invalid();
    const id = canonical.get(normalizeMatchAlias(choice));
    if (!id) invalid('Valor fora do catalogo publicado');
    selected.add(id);
  }
  return [...selected].sort();
}

function normalizeValues(input, configuration) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 1 || !Object.prototype.hasOwnProperty.call(input, 'values') ||
      !input.values || typeof input.values !== 'object' || Array.isArray(input.values)) invalid();
  const submitted = input.values;
  if (Object.keys(submitted).some((key) => !KEYS.includes(key))) invalid();

  const catalog = new Map(configuration.fields.map((field) => [field.key, field]));
  if (catalog.size !== KEYS.length || KEYS.some((key) => !catalog.has(key))) {
    throw new ApiError(503, 'Configuracao do Perfil de Match incompleta');
  }
  const values = {};
  for (const [key, value] of Object.entries(submitted)) {
    if (key === 'yearsOfExperience') {
      values[key] = normalizeYears(value);
    } else {
      const choices = normalizeChoices(value, catalog.get(key));
      if (choices !== undefined) values[key] = choices;
    }
  }
  return values;
}

async function registerMatchProfile(user, input) {
  if (user?.role !== 'candidate') throw new ApiError(403, 'Apenas candidatos podem cadastrar Perfil de Match');

  const candidate = await Candidate.findOne({ user: user.id, deletedAt: null }).select('_id status');
  if (!candidate) throw new ApiError(404, 'Cadastro de candidato atual nao encontrado');
  if (![CANDIDATE_STATUS.PENDING_VALIDATION, CANDIDATE_STATUS.INCOMPLETE_PROFILE,
    CANDIDATE_STATUS.ACTIVE].includes(candidate.status)) {
    throw new ApiError(409, 'Candidato inativo ou bloqueado nao pode cadastrar Perfil de Match');
  }

  await MatchProfile.init();
  if (await MatchProfile.findOne({ candidate: candidate._id, deletedAt: null })) {
    throw new ApiError(409, 'Perfil de Match ja cadastrado');
  }
  const configuration = await Configuration.findOne().sort({ version: -1 });
  if (!configuration) throw new ApiError(503, 'Configuracao do Perfil de Match nao publicada');
  const values = normalizeValues(input, configuration);

  try {
    return await MatchProfile.create({
      candidate: candidate._id,
      user: user.id,
      configurationVersion: configuration.version,
      values,
    });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'Perfil de Match ja cadastrado');
    throw error;
  }
}

module.exports = { registerMatchProfile };
