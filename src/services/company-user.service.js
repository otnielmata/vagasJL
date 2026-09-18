const Company = require('../models/company.model');
const CompanyUser = require('../models/company-user.model');
const User = require('../models/user.model');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;

async function linkRecruiter(operator, companyId, input) {
  if (operator?.role !== 'admin') throw new ApiError(403, 'Apenas administradores podem vincular recrutadores');
  if (typeof companyId !== 'string' || !OBJECT_ID.test(companyId)) {
    throw new ApiError(400, 'Identificador de empresa invalido');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 1 || !Object.hasOwn(input, 'userId') ||
      typeof input.userId !== 'string' || !OBJECT_ID.test(input.userId)) {
    throw new ApiError(400, 'Informe apenas um identificador de usuario valido');
  }

  const company = await Company.findOne({ _id: companyId, deletedAt: null }).select('status');
  if (!company) throw new ApiError(404, 'Empresa nao encontrada');
  if (!['pending', 'active'].includes(company.status)) {
    throw new ApiError(409, 'Empresa inativa ou bloqueada nao pode receber recrutador');
  }

  const user = await User.findById(input.userId).select('+emailVerifiedAt name email role status');
  if (!user || user.role !== 'company' || user.status !== 'active' || !user.emailVerifiedAt) {
    throw new ApiError(403, 'Conta empresarial ativa e identidade verificada sao obrigatorias');
  }

  await CompanyUser.init();
  if (await CompanyUser.findOne({ status: 'active', $or: [{ company: company._id }, { user: user._id }] })) {
    throw new ApiError(409, 'Empresa ou usuario ja possui vinculo ativo');
  }
  try {
    const membership = await CompanyUser.create({
      company: company._id, user: user._id, role: 'recruiter', status: 'active', authorizedBy: operator.id,
    });
    return { membership, user: { _id: user._id, name: user.name, email: user.email } };
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'Empresa ou usuario ja possui vinculo ativo');
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      throw new ApiError(400, 'Dados do vinculo invalidos');
    }
    throw error;
  }
}

module.exports = { linkRecruiter };
