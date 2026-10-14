const Company = require('../models/company.model');
const CompanyUser = require('../models/company-user.model');
const User = require('../models/user.model');
const Vacancy = require('../models/vacancy.model');
const { normalizeVacancyInput, prepareVacancyContent } = require('./vacancy-content.service');
const { initialRequirementsAudit } = require('./vacancy-requirements.service');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const EDITABLE_STATUSES = new Set(['pending', 'active', 'paused', 'expired']);

function validateRecruiter(actor, companyId, vacancyId) {
  if (!['company', 'admin'].includes(actor?.role)) {
    throw new ApiError(403, 'Apenas recrutadores podem gerenciar vagas proprias');
  }
  if (typeof companyId !== 'string' || !OBJECT_ID.test(companyId)) {
    throw new ApiError(400, 'Identificador de empresa invalido');
  }
  if (vacancyId !== undefined && (typeof vacancyId !== 'string' || !OBJECT_ID.test(vacancyId))) {
    throw new ApiError(400, 'Identificador da vaga invalido');
  }
}

async function getRecruiterContext(actor, companyId) {
  const account = await User.findOne({
    _id: actor.id, role: actor.role, status: 'active',
  }).select('_id');
  const company = account && await Company.findOne({
    _id: companyId, status: 'active', deletedAt: null,
  }).select('_id');
  const membership = company && await CompanyUser.findOne({
    company: company._id, user: account._id, role: 'recruiter', status: 'active',
  }).select('_id');
  if (!membership) throw new ApiError(403, 'Vaga propria exige empresa ativa e vinculo autorizado');
  return { account, company };
}

async function registerCompanyVacancy(actor, companyId, input) {
  validateRecruiter(actor, companyId);
  const data = normalizeVacancyInput(input);
  const { account, company } = await getRecruiterContext(actor, companyId);

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
      ...initialRequirementsAudit(content, account._id),
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

async function getCompanyVacancy(actor, companyId, vacancyId) {
  validateRecruiter(actor, companyId, vacancyId);
  const { company } = await getRecruiterContext(actor, companyId);
  const vacancy = await Vacancy.findOne({ _id: vacancyId, company: company._id,
    origin: 'COMPANY', deletedAt: null }).select('+createdBy +deletedAt');
  if (!vacancy) throw new ApiError(404, 'Vaga da empresa nao encontrada');
  return vacancy;
}

async function updateCompanyVacancy(actor, companyId, vacancyId, input, now = new Date()) {
  validateRecruiter(actor, companyId, vacancyId);
  const data = normalizeVacancyInput(input);
  const { account, company } = await getRecruiterContext(actor, companyId);
  const vacancy = await Vacancy.findOne({ _id: vacancyId, company: company._id,
    origin: 'COMPANY', deletedAt: null }).select('+createdBy +deletedAt');
  if (!vacancy) throw new ApiError(404, 'Vaga da empresa nao encontrada');
  if (!EDITABLE_STATUSES.has(vacancy.status)) {
    throw new ApiError(409, 'Vaga encerrada nao pode ser editada');
  }
  const content = await prepareVacancyContent(input);
  const duplicate = await Vacancy.findOne({ _id: { $ne: vacancy._id }, company: company._id,
    origin: 'COMPANY', reference: data.reference, deletedAt: null }).select('_id');
  if (duplicate) throw new ApiError(409, 'Referencia da vaga ja cadastrada para esta empresa');

  const revision = (vacancy.requirementsRevision || 0) + 1;
  const statusChanged = vacancy.status !== 'pending';
  const operation = {
    $set: { ...content, status: 'pending', requirementsRevision: revision },
    $push: { requirementsHistory: { at: now, actor: account._id, process: 'api',
      reason: 'Edicao da vaga pelo recrutador', revision,
      requirements: content.matchProfile.requirements } },
  };
  if (statusChanged) {
    operation.$push.statusHistory = { from: vacancy.status, to: 'pending', at: now,
      actor: account._id, process: 'api', reason: 'Conteudo alterado; nova aprovacao necessaria' };
  }
  try {
    const updated = await Vacancy.findOneAndUpdate({ _id: vacancy._id, company: company._id,
      origin: 'COMPANY', status: vacancy.status, updatedAt: vacancy.updatedAt, deletedAt: null },
    operation, { new: true, runValidators: true });
    if (!updated) throw new ApiError(409, 'Vaga alterada simultaneamente; recarregue e tente novamente');
    return updated;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.code === 11000) throw new ApiError(409, 'Referencia da vaga ja cadastrada para esta empresa');
    if (error.name === 'ValidationError' || error.name === 'CastError' || error.name === 'StrictModeError') {
      throw new ApiError(400, 'Dados da vaga invalidos');
    }
    throw error;
  }
}

module.exports = { registerCompanyVacancy, getCompanyVacancy, updateCompanyVacancy };
