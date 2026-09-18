const Company = require('../models/company.model');
const CompanyUser = require('../models/company-user.model');
const User = require('../models/user.model');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const PUBLIC_COMPANY_FIELDS = Object.freeze([
  'legalName', 'tradeName', 'website', 'description', 'city', 'state', 'country',
  'responsibleName', 'email', 'phone', 'linkedinUrl', 'segment', 'status',
]);
const COMPANY_PROJECTION = Object.freeze({
  _id: 1,
  ...Object.fromEntries(PUBLIC_COMPANY_FIELDS.map((field) => [field, 1])),
});

async function getRegistration(actor, companyId) {
  if (!['admin', 'company'].includes(actor?.role)) {
    throw new ApiError(403, 'Perfil sem permissao para consultar empresa');
  }
  if (typeof companyId !== 'string' || !OBJECT_ID.test(companyId)) {
    throw new ApiError(400, 'Identificador de empresa invalido');
  }

  const company = await Company.findOne({ _id: companyId, deletedAt: null })
    .select(COMPANY_PROJECTION).lean();
  if (!company) throw new ApiError(404, 'Empresa nao encontrada');

  let memberships;
  if (actor.role === 'company') {
    const account = await User.findOne({ _id: actor.id, role: 'company', status: 'active' })
      .select({ _id: 1 }).lean();
    const membership = account && await CompanyUser.findOne({
      company: company._id, user: account._id, role: 'recruiter', status: 'active',
    }).select({ user: 1 }).lean();
    if (!membership) throw new ApiError(403, 'Usuario sem vinculo autorizado com a empresa');
    memberships = [membership];
  } else {
    memberships = await CompanyUser.find({ company: company._id, status: 'active' })
      .select({ user: 1 }).lean();
  }

  const users = memberships.length ? await User.find({
    _id: { $in: memberships.map((membership) => membership.user) },
  }).select({ _id: 1, name: 1, email: 1 }).lean() : [];
  return {
    company: {
      _id: company._id,
      ...Object.fromEntries(PUBLIC_COMPANY_FIELDS.map((field) => [field, company[field]])),
    },
    usuarios: users.map((user) => ({ _id: user._id, name: user.name, email: user.email })),
  };
}

module.exports = { getRegistration };
