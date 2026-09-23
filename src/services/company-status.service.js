const Company = require('../models/company.model');
const CompanyUser = require('../models/company-user.model');
const User = require('../models/user.model');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const STATUSES = Object.freeze(['pending', 'active', 'inactive', 'blocked']);
const TRANSITIONS = Object.freeze({
  pending: Object.freeze(['active', 'inactive', 'blocked']),
  active: Object.freeze(['inactive', 'blocked']),
  inactive: Object.freeze(['active', 'blocked']),
  blocked: Object.freeze(['active', 'inactive']),
});
const REQUIRED_COMPANY_FIELDS = Object.freeze([
  'legalName', 'responsibleName', 'email', 'city', 'state', 'country',
]);

function validateRequest(actor, companyId, input) {
  if (actor?.role !== 'admin') throw new ApiError(403, 'Apenas administradores podem alterar o status da empresa');
  if (typeof companyId !== 'string' || !OBJECT_ID.test(companyId)) {
    throw new ApiError(400, 'Identificador de empresa invalido');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== 'reason,status' || !STATUSES.includes(input.status) ||
      typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 500) {
    throw new ApiError(400, 'Informe apenas status empresarial valido e motivo');
  }
  return { status: input.status, reason: input.reason.trim() };
}

function companyIsComplete(company) {
  return REQUIRED_COMPANY_FIELDS.every((field) =>
    typeof company[field] === 'string' && Boolean(company[field].trim()));
}

async function ensureActivationReady(company) {
  if (!companyIsComplete(company)) {
    throw new ApiError(409, 'Empresa sem cadastro minimo completo');
  }
  const membership = await CompanyUser.findOne({
    company: company._id, role: 'recruiter', status: 'active',
  }).select('user').lean();
  const responsible = membership && await User.findOne({
    _id: membership.user, role: 'company', status: 'active', emailVerifiedAt: { $type: 'date' },
  }).select('_id').lean();
  if (!responsible) {
    throw new ApiError(409, 'Empresa exige responsavel ativo e verificado para ativacao');
  }
}

function result(company, previousStatus, changed, changedAt = null) {
  return {
    company: { _id: company._id, status: company.status },
    previousStatus,
    changed,
    changedAt,
  };
}

async function updateCompanyStatus(actor, companyId, input, now = new Date()) {
  const { status, reason } = validateRequest(actor, companyId, input);
  const company = await Company.findOne({ _id: companyId, deletedAt: null })
    .select('+statusHistory +authorizationVersion +authorizationInvalidatedAt');
  if (!company) throw new ApiError(404, 'Empresa nao encontrada');

  const previousStatus = company.status;
  if (previousStatus === status) return result(company, previousStatus, false);
  if (!TRANSITIONS[previousStatus]?.includes(status)) {
    throw new ApiError(409, 'Transicao de status empresarial nao permitida');
  }
  if (status === 'active') await ensureActivationReady(company);

  const set = { status, authorizationInvalidatedAt: now };
  if (status === 'active') {
    set.statusVerifiedAt = now;
    set.statusVerifiedBy = actor.id;
    set.statusVerificationReference = reason.slice(0, 200);
  }
  const updated = await Company.findOneAndUpdate({
    _id: company._id, status: previousStatus, updatedAt: company.updatedAt, deletedAt: null,
  }, {
    $set: set,
    $inc: { authorizationVersion: 1 },
    $push: { statusHistory: { from: previousStatus, to: status, actor: actor.id, changedAt: now, reason } },
  }, { new: true, runValidators: true });
  if (!updated) throw new ApiError(409, 'Empresa alterada simultaneamente; tente novamente');
  return result(updated, previousStatus, true, now);
}

module.exports = { updateCompanyStatus, validateRequest, companyIsComplete, STATUSES, TRANSITIONS };
