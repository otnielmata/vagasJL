const User = require('../models/user.model');
const Vacancy = require('../models/vacancy.model');
const ImportImportanceConfiguration = require('../models/import-importance-configuration.model');
const { prepareVacancyContent } = require('./vacancy-content.service');
const { initialRequirementsAudit } = require('./vacancy-requirements.service');
const { INITIAL_MATCH_WEIGHTS } = require('../config/match-profile');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;

function invalid() {
  throw new ApiError(400, 'Procedencia da vaga invalida');
}

async function registerImportedVacancy(provenance, input) {
  if (input?.matchProfile?.requirements !== undefined) invalid();
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
  const rawValues = input?.matchProfile?.values;
  const identified = [];
  const preparedValues = rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)
    ? Object.fromEntries(Object.entries(rawValues).map(([field, submitted]) => {
      if (!Object.hasOwn(INITIAL_MATCH_WEIGHTS, field)) return [field, submitted];
      const choices = Array.isArray(submitted) ? submitted : [submitted];
      const mapped = choices.map((choice) => {
        if (choice === true) invalid();
        if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return choice;
        const numeric = field === 'yearsOfExperience';
        const expected = numeric ? 'identified,value' : 'id,identified';
        if (Object.keys(choice).sort().join(',') !== expected || choice.identified !== true ||
            (numeric ? typeof choice.value !== 'number' : typeof choice.id !== 'string')) invalid();
        identified.push(numeric ? { field, value: choice.value } : { field, id: choice.id });
        return numeric ? choice.value : choice.id;
      });
      return [field, Array.isArray(submitted) ? mapped : mapped[0]];
    })) : rawValues;
  const rawFalseFields = rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)
    ? Object.entries(rawValues).filter(([field, value]) =>
      Object.hasOwn(INITIAL_MATCH_WEIGHTS, field) && value === false).map(([field]) => field)
    : [];
  const mappedInput = { ...input, matchProfile: { ...input?.matchProfile,
    values: preparedValues && typeof preparedValues === 'object' && !Array.isArray(preparedValues)
      ? Object.fromEntries(Object.entries(preparedValues)
        .filter(([field]) => !rawFalseFields.includes(field))) : preparedValues } };
  const content = await prepareVacancyContent(mappedInput, { allowUnidentified: true });
  let importImportance = null;
  if (identified.length) {
    const configuration = await ImportImportanceConfiguration.findOne().sort({ version: -1 });
    if (!configuration) throw new ApiError(409, 'Importancia padrao da importacao nao publicada');
    const seen = new Set();
    const requirements = identified.map((item) => {
      const selected = content.matchProfile.values[item.field];
      if (item.id !== undefined ? !Array.isArray(selected) || !selected.includes(item.id)
        : selected !== item.value) invalid();
      const key = item.id === undefined ? item.field : `${item.field}:${item.id}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { ...item, importance: configuration.importance, eliminatory: false };
    }).filter(Boolean);
    const appliedAt = new Date();
    content.matchProfile.requirements = requirements;
    importImportance = { version: configuration.version, importance: configuration.importance,
      appliedAt };
  }
  await Vacancy.init();
  if (await Vacancy.findOne({ origin: 'IMPORTED', importSource, importSourceId })) {
    throw new ApiError(409, 'Vaga importada ja registrada para esta fonte');
  }
  try {
    return await Vacancy.create({
      ...content, origin: 'IMPORTED', status: 'pending', importSource, importSourceId,
      importImportance,
      ...(importImportance ? { requirementsRevision: 1, requirementsHistory: [{
        at: importImportance.appliedAt, actor: null, process: 'import',
        reason: `Importancia padrao v${importImportance.version} aplicada na importacao`,
        revision: 1, requirements: content.matchProfile.requirements,
      }] } : {}),
      importMappingAudit: { rawFalseValues: rawFalseFields.map((field) => ({ field, value: false })) },
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
    return await Vacancy.create({ ...content, ...initialRequirementsAudit(content, account._id),
      createdBy: account._id,
      origin: 'ADMIN', status: 'pending' });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError' || error.name === 'StrictModeError') {
      throw new ApiError(400, 'Dados da vaga invalidos');
    }
    throw error;
  }
}

function assessVacancyForMatch(vacancy, now = new Date()) {
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
    eligible: vacancy.status === 'active' && !vacancy.deletedAt &&
      (!vacancy.expiresAt || new Date(vacancy.expiresAt) > now),
    technicalProfile: {
      configurationVersion: matchProfile.configurationVersion,
      values: typeof matchProfile.values.toObject === 'function'
        ? matchProfile.values.toObject() : matchProfile.values,
    },
  };
}

module.exports = { registerImportedVacancy, registerAdminVacancy, assessVacancyForMatch };
