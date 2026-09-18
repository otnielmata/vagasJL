const Company = require('../models/company.model');
const CompanyUser = require('../models/company-user.model');
const User = require('../models/user.model');
const Vacancy = require('../models/vacancy.model');
const { normalizeVacancyInput, prepareVacancyContent } = require('./vacancy-content.service');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;

async function registerCompanyVacancy(actor, companyId, input) {
  if (actor?.role !== 'company') throw new ApiError(403, 'Apenas recrutadores podem cadastrar vagas proprias');
  if (typeof companyId !== 'string' || !OBJECT_ID.test(companyId)) {
    throw new ApiError(400, 'Identificador de empresa invalido');
  }
  const data = normalizeVacancyInput(input);
  const account = await User.findOne({
    _id: actor.id, role: 'company', status: 'active', emailVerifiedAt: { $type: 'date' },
  }).select('_id');
  const company = account && await Company.findOne({
    _id: companyId, status: 'active', deletedAt: null,
  }).select('_id');
  const membership = company && await CompanyUser.findOne({
    company: company._id, user: account._id, role: 'recruiter', status: 'active',
  }).select('_id');
  if (!membership) throw new ApiError(403, 'Vaga propria exige empresa ativa e vinculo autorizado');

  const content = await prepareVacancyContent(input);
  await Vacancy.init();
  if (await Vacancy.findOne({ company: company._id, origin: 'COMPANY',
    reference: data.reference, deletedAt: null })) {
    throw new ApiError(409, 'Referencia da vaga ja cadastrada para esta empresa');
  }
  try {
    return await Vacancy.create({
      company: company._id, createdBy: account._id,
      ...content,
      origin: 'COMPANY', status: 'pending',
    });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'Referencia da vaga ja cadastrada para esta empresa');
    if (error.name === 'ValidationError' || error.name === 'CastError' || error.name === 'StrictModeError') {
      throw new ApiError(400, 'Dados da vaga invalidos');
    }
    throw error;
  }
}

module.exports = { registerCompanyVacancy };
