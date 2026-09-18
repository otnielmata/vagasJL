const User = require('../models/user.model');
const Vacancy = require('../models/vacancy.model');
const { prepareVacancyContent } = require('./vacancy-content.service');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;

function invalid() {
  throw new ApiError(400, 'Procedencia da vaga invalida');
}

async function registerImportedVacancy(provenance, input) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance) ||
      Object.keys(provenance).length !== 2 ||
      !Object.hasOwn(provenance, 'source') || !Object.hasOwn(provenance, 'sourceId') ||
      typeof provenance.source !== 'string' ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(provenance.source.trim().toLowerCase()) ||
      provenance.source.trim().length > 100 ||
      typeof provenance.sourceId !== 'string' || !provenance.sourceId.trim() ||
      provenance.sourceId.trim().length > 200) invalid();
  const importSource = provenance.source.trim().toLowerCase();
  const importSourceId = provenance.sourceId.trim();
  const content = await prepareVacancyContent(input);
  await Vacancy.init();
  if (await Vacancy.findOne({ origin: 'IMPORTED', importSource, importSourceId })) {
    throw new ApiError(409, 'Vaga importada ja registrada para esta fonte');
  }
  try {
    return await Vacancy.create({
      ...content, origin: 'IMPORTED', status: 'pending', importSource, importSourceId,
    });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'Vaga importada ja registrada para esta fonte');
    if (error.name === 'ValidationError' || error.name === 'CastError' || error.name === 'StrictModeError') {
      throw new ApiError(400, 'Dados da vaga invalidos');
    }
    throw error;
  }
}

async function registerAdminVacancy(actor, input) {
  if (actor?.role !== 'admin' || typeof actor.id !== 'string' || !OBJECT_ID.test(actor.id)) {
    throw new ApiError(403, 'Apenas administradores podem cadastrar vagas administrativas');
  }
  const account = await User.findOne({ _id: actor.id, role: 'admin', status: 'active' }).select('_id');
  if (!account) throw new ApiError(403, 'Conta administrativa inativa ou inexistente');
  const content = await prepareVacancyContent(input);
  try {
    return await Vacancy.create({ ...content, createdBy: account._id,
      origin: 'ADMIN', status: 'pending' });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError' || error.name === 'StrictModeError') {
      throw new ApiError(400, 'Dados da vaga invalidos');
    }
    throw error;
  }
}

function assessVacancyForMatch(vacancy) {
  const origin = vacancy?.origin;
  const identifiable = origin === 'COMPANY'
    ? Boolean(vacancy.company && vacancy.createdBy && !vacancy.importSource && !vacancy.importSourceId)
    : origin === 'IMPORTED'
      ? Boolean(vacancy.importSource && vacancy.importSourceId && !vacancy.company && !vacancy.createdBy)
      : origin === 'ADMIN'
        ? Boolean(vacancy.createdBy && !vacancy.company && !vacancy.importSource && !vacancy.importSourceId)
        : false;
  if (!identifiable) return { needsOriginReview: true, eligible: false, technicalProfile: null };
  const matchProfile = vacancy.matchProfile;
  if (!Number.isSafeInteger(matchProfile?.configurationVersion) ||
      matchProfile.configurationVersion < 1 || !matchProfile.values) {
    return { needsOriginReview: false, eligible: false, technicalProfile: null };
  }
  return {
    needsOriginReview: false,
    eligible: vacancy.status === 'active' && !vacancy.deletedAt,
    technicalProfile: {
      configurationVersion: matchProfile.configurationVersion,
      values: typeof matchProfile.values.toObject === 'function'
        ? matchProfile.values.toObject() : matchProfile.values,
    },
  };
}

module.exports = { registerImportedVacancy, registerAdminVacancy, assessVacancyForMatch };
