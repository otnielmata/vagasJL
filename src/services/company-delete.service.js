const Company = require('../models/company.model');
const CompanyUser = require('../models/company-user.model');
const User = require('../models/user.model');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const TRANSACTION_OPTIONS = Object.freeze({
  readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
});

async function deleteRegistration(actor, companyId) {
  if (!['admin', 'company'].includes(actor?.role)) {
    throw new ApiError(403, 'Perfil sem permissao para excluir empresa');
  }
  if (typeof companyId !== 'string' || !OBJECT_ID.test(companyId)) {
    throw new ApiError(400, 'Identificador de empresa invalido');
  }

  try {
    await Company.db.transaction(async (session) => {
      const company = await Company.findOne({ _id: companyId, deletedAt: null }).session(session);
      if (!company) throw new ApiError(404, 'Empresa nao encontrada');

      if (actor.role === 'company') {
        const account = await User.findOne({
          _id: actor.id, role: 'company', status: 'active', emailVerifiedAt: { $type: 'date' },
        }).session(session);
        const membership = account && await CompanyUser.findOne({
          company: company._id, user: account._id, role: 'recruiter', status: 'active',
        }).select('+canDeleteCompany').session(session);
        if (!membership?.canDeleteCompany) {
          throw new ApiError(403, 'Exclusao exige permissao explicita para esta empresa');
        }
      }

      const deletedAt = new Date();
      company.status = 'inactive';
      company.deletedAt = deletedAt;
      company.deletedBy = actor.id;
      await company.save({ session });

      const result = await CompanyUser.updateMany(
        { company: company._id, status: 'active' },
        { $set: { status: 'inactive', revokedAt: deletedAt } },
        { session }
      );
      if (!result.acknowledged || result.modifiedCount !== result.matchedCount) {
        throw new Error('Falha ao revogar todos os vinculos da empresa');
      }
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (error.code === 20) {
      throw new ApiError(503, 'Exclusao indisponivel: configure MongoDB com suporte a transacoes');
    }
    throw error;
  }
}

module.exports = { deleteRegistration };
