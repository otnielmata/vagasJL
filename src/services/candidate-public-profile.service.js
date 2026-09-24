const Candidate = require('../models/candidate.model');
const { CANDIDATE_STATUS } = require('../config/candidate');
const {
  CANDIDATE_PUBLIC_FIELDS,
  MATCH_PROFILE_PUBLIC_FIELDS,
  FORMATION_PUBLIC_FIELDS,
  PUBLIC_PROFILE_FIELDS,
} = require('../config/candidate-public-profile');
const ApiError = require('../errors/api.error');

const PUBLIC_FIELD_SET = new Set(PUBLIC_PROFILE_FIELDS);
const CANDIDATE_FIELD_SET = new Set(CANDIDATE_PUBLIC_FIELDS);
const MATCH_FIELD_SET = new Set(MATCH_PROFILE_PUBLIC_FIELDS);
const FORMATION_FIELD_SET = new Set(FORMATION_PUBLIC_FIELDS);

function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((field) => !['enabled', 'fields'].includes(field)) ||
      typeof input.enabled !== 'boolean') {
    throw new ApiError(400, 'Configuracao de perfil publico invalida');
  }
  const fields = input.fields ?? [];
  if (!Array.isArray(fields) || fields.some((field) => typeof field !== 'string') ||
      new Set(fields).size !== fields.length || fields.some((field) => !PUBLIC_FIELD_SET.has(field)) ||
      input.enabled && fields.length === 0 || !input.enabled && fields.length > 0) {
    throw new ApiError(400, 'Selecione campos publicos permitidos e sem duplicidade');
  }
  return { enabled: input.enabled, fields: [...fields].sort() };
}

function effectiveFields(fields, sourceAllowedFormationFields = FORMATION_PUBLIC_FIELDS) {
  const allowedFormation = new Set(sourceAllowedFormationFields);
  return fields.filter((field) => !FORMATION_FIELD_SET.has(field) || allowedFormation.has(field));
}

function publicProfileState(candidate, sourceAllowedFormationFields) {
  const state = candidate.publicProfile || {};
  const fields = state.enabled ? [...(state.fields || [])].sort() : [];
  return {
    enabled: state.enabled === true,
    fields,
    effectiveFields: state.enabled ? effectiveFields(fields, sourceAllowedFormationFields) : [],
    consentedAt: state.consentedAt || null,
    revokedAt: state.revokedAt || null,
    cacheVersion: state.cacheVersion || 1,
    cacheInvalidatedAt: state.cacheInvalidatedAt || null,
  };
}

async function updateOwnPublicProfile(actor, input, now = new Date()) {
  if (actor?.role !== 'candidate') {
    throw new ApiError(403, 'Apenas candidatos podem controlar o proprio perfil publico');
  }
  const normalized = normalizeInput(input);
  const candidate = await Candidate.findOne({ user: actor.id, deletedAt: null })
    .select('_id user status +publicProfile');
  if (!candidate) throw new ApiError(404, 'Cadastro de candidato atual nao encontrado');
  if (candidate.status !== CANDIDATE_STATUS.ACTIVE) {
    throw new ApiError(409, 'Somente candidato ativo pode publicar o perfil profissional');
  }

  const current = candidate.publicProfile || {};
  const action = normalized.enabled
    ? current.enabled ? 'fields_updated' : 'opt_in'
    : 'revoked';
  const changes = {
    'publicProfile.enabled': normalized.enabled,
    'publicProfile.fields': normalized.enabled ? normalized.fields : [],
    'publicProfile.consentedAt': normalized.enabled
      ? current.enabled && current.consentedAt || now
      : current.consentedAt || null,
    'publicProfile.revokedAt': normalized.enabled ? null : now,
    'publicProfile.cacheInvalidatedAt': now,
  };
  const updated = await Candidate.findOneAndUpdate(
    { _id: candidate._id, user: candidate.user, status: CANDIDATE_STATUS.ACTIVE, deletedAt: null },
    {
      $set: changes,
      $inc: { 'publicProfile.cacheVersion': 1 },
      $push: {
        publicProfileConsentHistory: {
          action,
          fields: normalized.enabled ? normalized.fields : [],
          actor: actor.id,
          changedAt: now,
        },
      },
    },
    { new: true, runValidators: true, projection: { publicProfile: 1 } }
  );
  if (!updated) throw new ApiError(409, 'O candidato foi alterado durante a configuracao de privacidade');
  return publicProfileState(updated);
}

function valueAt(source, field) {
  return field.split('.').reduce((value, key) => value?.[key], source);
}

function assignAt(target, field, value) {
  const keys = field.split('.');
  const leaf = keys.pop();
  const parent = keys.reduce((current, key) => {
    current[key] ||= {};
    return current[key];
  }, target);
  parent[leaf] = value;
}

function buildPublicProfileSnapshot({ candidate, matchProfile, formationData,
  sourceAllowedFormationFields = FORMATION_PUBLIC_FIELDS }) {
  if (!candidate || candidate.status !== CANDIDATE_STATUS.ACTIVE || candidate.deletedAt ||
      candidate.publicProfile?.enabled !== true) return null;
  const result = {};
  for (const field of effectiveFields(candidate.publicProfile.fields || [], sourceAllowedFormationFields)) {
    let value;
    if (CANDIDATE_FIELD_SET.has(field)) value = candidate[field];
    else if (MATCH_FIELD_SET.has(field)) value = valueAt(matchProfile?.values, field.slice('matchProfile.'.length));
    else if (FORMATION_FIELD_SET.has(field)) value = valueAt(formationData, field.slice('formation.'.length));
    if (value !== undefined && value !== null) assignAt(result, field, value);
  }
  return result;
}

module.exports = {
  updateOwnPublicProfile,
  buildPublicProfileSnapshot,
  effectiveFields,
  normalizeInput,
  publicProfileState,
};
