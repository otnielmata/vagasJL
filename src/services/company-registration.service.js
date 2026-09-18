const Company = require('../models/company.model');
const CompanyUser = require('../models/company-user.model');
const User = require('../models/user.model');
const ApiError = require('../errors/api.error');
const { normalizeCompanyUpdates } = require('./company.service');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const TRANSACTION_OPTIONS = Object.freeze({
  readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
});

function parseInput(actor, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length ||
      Object.keys(input).some((key) => !['empresa', 'usuarioAtual', 'status', 'verificationReference'].includes(key))) {
    throw new ApiError(400, 'Campos de cadastro invalidos');
  }
  if (Object.hasOwn(input, 'status') && actor.role !== 'admin') {
    throw new ApiError(403, 'Somente operadores podem alterar o status da empresa');
  }
  if (Object.hasOwn(input, 'usuarioAtual') && actor.role !== 'company') {
    throw new ApiError(403, 'Somente o proprio recrutador pode alterar seus dados publicos');
  }
  const companyUpdates = Object.hasOwn(input, 'empresa') ? normalizeCompanyUpdates(input.empresa) : null;
  let userUpdates = null;
  if (Object.hasOwn(input, 'usuarioAtual')) {
    const user = input.usuarioAtual;
    if (!user || typeof user !== 'object' || Array.isArray(user) ||
        Object.keys(user).length !== 1 || !Object.hasOwn(user, 'name') ||
        typeof user.name !== 'string' || !user.name.trim() || user.name.trim().length > 200) {
      throw new ApiError(400, 'Dados publicos do usuario invalidos');
    }
    userUpdates = { name: user.name.trim() };
  }
  const status = input.status;
  if (status !== undefined && !['active', 'inactive', 'blocked'].includes(status)) {
    throw new ApiError(400, 'Status empresarial invalido');
  }
  const reference = input.verificationReference;
  if (status === 'active') {
    if (typeof reference !== 'string' || !reference.trim() || reference.trim().length > 200) {
      throw new ApiError(400, 'Referencia da verificacao empresarial obrigatoria');
    }
  } else if (reference !== undefined) {
    throw new ApiError(400, 'Referencia de verificacao so e aceita na ativacao');
  }
  if (!companyUpdates && !userUpdates && status === undefined) {
    throw new ApiError(400, 'Nenhuma alteracao informada');
  }
  return { companyUpdates, userUpdates, status, reference: reference?.trim() };
}

function assertTransition(previous, next) {
  const allowed = {
    pending: ['active'], active: ['inactive', 'blocked'],
    inactive: ['active'], blocked: ['active'],
  };
  if (!allowed[previous]?.includes(next)) {
    throw new ApiError(409, 'Transicao de status empresarial nao permitida');
  }
}

async function updateRegistration(actor, companyId, input) {
  if (!['admin', 'company'].includes(actor?.role)) {
    throw new ApiError(403, 'Perfil sem permissao para editar empresa');
  }
  if (typeof companyId !== 'string' || !OBJECT_ID.test(companyId)) {
    throw new ApiError(400, 'Identificador de empresa invalido');
  }
  const updates = parseInput(actor, input);
  if (updates.companyUpdates?.email) await Company.init();

  try {
    return await Company.db.transaction(async (session) => {
      const company = await Company.findOne({ _id: companyId, deletedAt: null }).session(session);
      if (!company) throw new ApiError(404, 'Empresa nao encontrada');

      let account;
      if (actor.role === 'company') {
        if (!['pending', 'active'].includes(company.status)) {
          throw new ApiError(403, 'Empresa inativa ou bloqueada');
        }
        account = await User.findOne({ _id: actor.id, role: 'company', status: 'active',
          emailVerifiedAt: { $type: 'date' } }).session(session);
        const membership = account && await CompanyUser.findOne({
          company: company._id, user: account._id, role: 'recruiter', status: 'active',
        }).session(session);
        if (!membership) throw new ApiError(403, 'Usuario sem vinculo autorizado com a empresa');
      }

      if (updates.companyUpdates?.email && updates.companyUpdates.email !== company.email) {
        const duplicate = await Company.findOne({
          email: updates.companyUpdates.email, deletedAt: null, _id: { $ne: company._id },
        }).session(session);
        if (duplicate) throw new ApiError(409, 'Email corporativo ja cadastrado');
      }

      if (updates.status !== undefined) {
        assertTransition(company.status, updates.status);
        company.status = updates.status;
        if (updates.status === 'active') {
          company.statusVerifiedAt = new Date();
          company.statusVerifiedBy = actor.id;
          company.statusVerificationReference = updates.reference;
        }
      }
      if (updates.companyUpdates) company.set(updates.companyUpdates);
      if (updates.companyUpdates || updates.status !== undefined) await company.save({ session });
      if (updates.userUpdates) {
        account.name = updates.userUpdates.name;
        await account.save({ session });
      }
      return {
        company: company.toJSON(),
        ...(updates.userUpdates ? { usuarioAtual: { _id: account._id, name: account.name, email: account.email } } : {}),
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'Email corporativo ja cadastrado');
    if (error.code === 20) {
      throw new ApiError(503, 'Edicao indisponivel: configure MongoDB com suporte a transacoes');
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      throw new ApiError(400, 'Dados de cadastro invalidos');
    }
    throw error;
  }
}

module.exports = { updateRegistration };
