const Candidate = require('../models/candidate.model');
const engagementClient = require('./engagement-client.service');
const { CONTACT_DISPLAY_FIELDS, FORMATION_DISPLAY_FIELDS } =
  require('../config/candidate-display-permissions');
const ApiError = require('../errors/api.error');

const CONTACT_SET = new Set(CONTACT_DISPLAY_FIELDS);
const FORMATION_SET = new Set(FORMATION_DISPLAY_FIELDS);
const ENTERPRISE_BASIC_FIELDS = Object.freeze([
  'name', 'photoUrl', 'city', 'state', 'country', 'professionalSummary',
  'availability', 'availableForOpportunities',
]);

function normalizeCategory(value, allowed, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > allowed.size ||
      value.some((field) => typeof field !== 'string' || !allowed.has(field)) ||
      new Set(value).size !== value.length) {
    throw new ApiError(400, `Permissoes de ${label} invalidas`);
  }
  return [...value].sort();
}

function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((field) => !['contact', 'formation'].includes(field))) {
    throw new ApiError(400, 'Permissoes de exibicao invalidas');
  }
  return {
    contact: normalizeCategory(input.contact, CONTACT_SET, 'contato'),
    formation: normalizeCategory(input.formation, FORMATION_SET, 'formacao'),
  };
}

function sameFields(left = [], right = []) {
  return left.length === right.length && left.every((field, index) => field === right[index]);
}

function serialize(candidate) {
  const permissions = candidate.enterpriseDisplayPermissions || {};
  return {
    contact: [...(permissions.contact || [])].sort(),
    formation: [...(permissions.formation || [])].sort(),
    changedAt: permissions.changedAt || null,
  };
}

async function updateOwnDisplayPermissions(actor, input, now = new Date()) {
  if (actor?.role !== 'candidate') {
    throw new ApiError(403, 'Apenas candidatos podem controlar as proprias permissoes de exibicao');
  }
  const permissions = normalizeInput(input);
  const candidate = await Candidate.findOne({ user: actor.id, deletedAt: null })
    .select('_id user +enterpriseDisplayPermissions');
  if (!candidate) throw new ApiError(404, 'Cadastro de candidato atual nao encontrado');
  if (candidate.user.toString() !== String(actor.id).toLowerCase()) {
    throw new ApiError(403, 'Voce so pode alterar suas proprias permissoes de exibicao');
  }
  const current = serialize(candidate);
  if (current.changedAt && sameFields(current.contact, permissions.contact) &&
      sameFields(current.formation, permissions.formation)) return current;

  const updated = await Candidate.findOneAndUpdate(
    {
      _id: candidate._id,
      user: candidate.user,
      deletedAt: null,
      'enterpriseDisplayPermissions.changedAt': current.changedAt,
    },
    {
      $set: {
        'enterpriseDisplayPermissions.contact': permissions.contact,
        'enterpriseDisplayPermissions.formation': permissions.formation,
        'enterpriseDisplayPermissions.changedAt': now,
        'enterpriseDisplayPermissions.cacheInvalidatedAt': now,
      },
      $inc: { 'enterpriseDisplayPermissions.cacheVersion': 1 },
      $push: {
        enterpriseDisplayPermissionHistory: {
          ...permissions,
          actor: actor.id,
          changedAt: now,
        },
      },
    },
    { new: true, runValidators: true, projection: { enterpriseDisplayPermissions: 1 } }
  );
  if (!updated) throw new ApiError(409, 'O candidato foi alterado durante a configuracao de permissoes');
  return serialize(updated);
}

function known(value) {
  return value !== undefined && value !== null && value !== '' && value !== 'UNKNOWN';
}

function enterpriseBase(candidate) {
  const result = { _id: candidate._id };
  for (const field of ENTERPRISE_BASIC_FIELDS) {
    if (known(candidate[field])) result[field] = candidate[field];
  }
  return result;
}

async function enterpriseCandidateData(candidate, options = {}) {
  const result = enterpriseBase(candidate);
  const permissions = candidate.enterpriseDisplayPermissions || {};
  for (const field of permissions.contact || []) {
    if (CONTACT_SET.has(field) && known(candidate[field])) result[field] = candidate[field];
  }

  const formationPermissions = (permissions.formation || []).filter((field) => FORMATION_SET.has(field));
  if (!formationPermissions.length) return result;
  const fetchEngagement = options.fetchEngagement || engagementClient.fetchOfficialEngagement;
  const engagement = await fetchEngagement(candidate.email);
  if (engagement?.status !== 'available' || !engagement.data) return result;
  const formation = {};
  for (const field of formationPermissions) {
    if (known(engagement.data[field])) formation[field] = engagement.data[field];
  }
  if (Object.keys(formation).length) result.formation = formation;
  return result;
}

module.exports = {
  updateOwnDisplayPermissions,
  enterpriseCandidateData,
  normalizeInput,
  serialize,
};
