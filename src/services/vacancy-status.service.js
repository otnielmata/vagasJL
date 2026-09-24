const Company = require('../models/company.model');
const CompanyUser = require('../models/company-user.model');
const Configuration = require('../models/match-profile-configuration.model');
const User = require('../models/user.model');
const Vacancy = require('../models/vacancy.model');
const { INITIAL_MATCH_WEIGHTS } = require('../config/match-profile');
const { validGeographyWeights } = require('../config/geography');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const TRANSITIONS = {
  pending: ['active', 'rejected', 'removed'],
  active: ['paused', 'expired', 'removed'],
  paused: ['active', 'expired', 'removed'],
  expired: ['active', 'removed'],
  rejected: [],
  removed: [],
};

function validateRequest(id, input) {
  if (typeof id !== 'string' || !OBJECT_ID.test(id)) {
    throw new ApiError(400, 'Identificador da vaga invalido');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 2 || !Object.hasOwn(input, 'status') ||
      !Object.hasOwn(input, 'reason') || !Object.values(TRANSITIONS).flat().includes(input.status) ||
      typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 500) {
    throw new ApiError(400, 'Informe apenas status valido e motivo da transicao');
  }
  return { status: input.status, reason: input.reason.trim() };
}

async function ensureCompanyAuthorized(actor, vacancy) {
  if (vacancy.origin !== 'COMPANY' || !vacancy.company) {
    throw new ApiError(403, 'Acesso negado a esta vaga');
  }
  const account = await User.findOne({ _id: actor.id, role: 'company', status: 'active',
    emailVerifiedAt: { $type: 'date' } }).select('_id');
  const company = account && await Company.findOne({ _id: vacancy.company,
    status: 'active', deletedAt: null }).select('_id');
  const membership = company && await CompanyUser.findOne({ company: company._id,
    user: account._id, role: 'recruiter', status: 'active' }).select('_id');
  if (!membership) throw new ApiError(403, 'Empresa ou vinculo de recrutador nao autorizado');
}

async function ensurePublishable(vacancy, now) {
  const { validateRequirements } = require('./vacancy-requirements.service');
  const identifiable = vacancy.origin === 'COMPANY'
    ? Boolean(vacancy.company && vacancy.createdBy && !vacancy.importSource && !vacancy.importSourceId)
    : vacancy.origin === 'IMPORTED'
      ? Boolean(vacancy.importSource && vacancy.importSourceId && !vacancy.company && !vacancy.createdBy)
      : vacancy.origin === 'ADMIN'
        ? Boolean(vacancy.createdBy && !vacancy.company && !vacancy.importSource && !vacancy.importSourceId)
        : false;
  if (!identifiable) throw new ApiError(409, 'Origem da vaga sem procedencia verificavel');
  if (!vacancy.title?.trim() || !vacancy.description?.trim() ||
      (vacancy.expiresAt && new Date(vacancy.expiresAt) <= now)) {
    throw new ApiError(409, 'Vaga sem dados essenciais validos ou com prazo encerrado');
  }
  const profile = vacancy.matchProfile;
  const configuration = profile?.configurationVersion && await Configuration.findOne({
    version: profile.configurationVersion,
  });
  if (!configuration || !profile.values) {
    throw new ApiError(409, 'Perfil de Match sem configuracao valida');
  }
  if (vacancy.geographicRestrictions && !validGeographyWeights(configuration.geographyWeights)) {
    throw new ApiError(409, 'Restricoes geograficas sem pesos publicados');
  }
  const values = typeof profile.values.toObject === 'function'
    ? profile.values.toObject() : profile.values;
  const fields = new Map(configuration.fields.map((field) => [field.key, field]));
  const knownKeys = Object.keys(INITIAL_MATCH_WEIGHTS);
  if (fields.size !== knownKeys.length || knownKeys.some((key) => !fields.has(key)) ||
      (vacancy.origin === 'IMPORTED' ? !Object.keys(values).length
        : !Array.isArray(values.type) || !values.type.length) ||
      Object.keys(values).some((key) => !fields.has(key))) {
    throw new ApiError(409, 'Perfil de Match incompleto ou invalido');
  }
  for (const [key, selected] of Object.entries(values)) {
    if (key === 'yearsOfExperience') {
      if (typeof selected !== 'number' || !Number.isFinite(selected) || selected < 0 || selected > 100) {
        throw new ApiError(409, 'Perfil de Match invalido');
      }
    } else if (!Array.isArray(selected) || !selected.length ||
        selected.some((id) => !fields.get(key).options.some((option) => option.id === id))) {
      throw new ApiError(409, 'Perfil de Match fora do catalogo');
    }
  }
  try {
    validateRequirements(profile.requirements || [], values, configuration, true);
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 409) {
      throw new ApiError(409, 'Classificacao de requisitos incompleta ou invalida');
    }
    throw error;
  }
  if (vacancy.origin === 'COMPANY') {
    const company = await Company.findOne({ _id: vacancy.company, status: 'active',
      deletedAt: null }).select('_id');
    if (!company) throw new ApiError(409, 'Empresa da vaga inativa');
  }
}

async function updateStatus(actor, id, input, now = new Date()) {
  const { status, reason } = validateRequest(id, input);
  const vacancy = await Vacancy.findById(id).select('+createdBy +deletedAt');
  if (!vacancy || vacancy.deletedAt) throw new ApiError(404, 'Vaga nao encontrada');
  if (actor?.role === 'company') {
    if (vacancy.origin !== 'COMPANY') throw new ApiError(403, 'Acesso negado a esta vaga');
    await ensureCompanyAuthorized(actor, vacancy);
    if (!((vacancy.status === 'active' && status === 'paused') ||
      (vacancy.status === 'paused' && status === 'active') || status === 'removed')) {
      throw new ApiError(403, 'Transicao reservada a administracao');
    }
  } else if (actor?.role !== 'admin') {
    throw new ApiError(403, 'Acesso negado');
  }
  if (!TRANSITIONS[vacancy.status]?.includes(status)) {
    throw new ApiError(409, 'Transicao de status invalida');
  }
  if (status === 'expired' && (!vacancy.expiresAt || new Date(vacancy.expiresAt) > now)) {
    throw new ApiError(409, 'Prazo da vaga ainda nao encerrado');
  }
  if (status === 'active') await ensurePublishable(vacancy, now);
  const updated = await Vacancy.findOneAndUpdate({ _id: vacancy._id, status: vacancy.status,
    updatedAt: vacancy.updatedAt, deletedAt: null }, {
    $set: { status },
    $push: { statusHistory: { from: vacancy.status, to: status, at: now,
      actor: actor.id, process: 'api', reason } },
  }, { new: true, runValidators: true });
  if (!updated) throw new ApiError(409, 'Vaga alterada simultaneamente; tente novamente');
  return updated;
}

async function expireOverdueVacancies(now = new Date()) {
  const candidates = await Vacancy.find({ status: { $in: ['active', 'paused'] },
    expiresAt: { $lte: now }, deletedAt: null }).select('_id status expiresAt updatedAt');
  let expired = 0;
  for (const vacancy of candidates) {
    const updated = await Vacancy.findOneAndUpdate({ _id: vacancy._id, status: vacancy.status,
      expiresAt: vacancy.expiresAt, updatedAt: vacancy.updatedAt, deletedAt: null }, {
      $set: { status: 'expired' },
      $push: { statusHistory: { from: vacancy.status, to: 'expired', at: now,
        actor: null, process: 'deadline', reason: 'Prazo da vaga encerrado' } },
    }, { new: true, runValidators: true });
    if (updated) expired += 1;
  }
  return expired;
}

module.exports = { updateStatus, expireOverdueVacancies, ensureCompanyAuthorized,
  ensurePublishable, TRANSITIONS };
