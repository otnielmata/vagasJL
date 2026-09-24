const User = require('../models/user.model');
const Vacancy = require('../models/vacancy.model');
const ImportImportanceConfiguration = require('../models/import-importance-configuration.model');
const { prepareVacancyContent } = require('./vacancy-content.service');
const { initialRequirementsAudit } = require('./vacancy-requirements.service');
const { INITIAL_MATCH_WEIGHTS, isUnknownSeniority, isUnidentifiedModality } = require('../config/match-profile');
const ApiError = require('../errors/api.error');
const { getEffectiveMatchEngineConfiguration } =
  require('./match-engine-configuration.service');
const { transformLegacyVacancyInput } = require('./legacy-vacancy-compatibility.service');

const OBJECT_ID = /^[a-f\d]{24}$/i;

function invalid() {
  throw new ApiError(400, 'Procedencia da vaga invalida');
}

async function prepareImportedVacancyData(provenance, input) {
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
  const transformation = await transformLegacyVacancyInput(input);
  input = transformation.content;
  const rawValues = input?.matchProfile?.values;
  const identified = [];
  let unknownLevel = false;
  const preparedValues = rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)
    ? Object.fromEntries(Object.entries(rawValues).map(([field, submitted]) => {
      if (!Object.hasOwn(INITIAL_MATCH_WEIGHTS, field)) return [field, submitted];
      const choices = Array.isArray(submitted) ? submitted : [submitted];
      const mapped = choices.map((choice) => {
        if (field === 'type' && isUnidentifiedModality(choice)) return undefined;
        if (field === 'level' && isUnknownSeniority(choice)) {
          unknownLevel = true;
          return undefined;
        }
        if (choice === true) invalid();
        if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return choice;
        const numeric = field === 'yearsOfExperience';
        const expected = numeric ? 'identified,value' : 'id,identified';
        if (Object.keys(choice).sort().join(',') !== expected || choice.identified !== true ||
            (numeric ? typeof choice.value !== 'number' : typeof choice.id !== 'string')) invalid();
        if (field === 'level' && isUnknownSeniority(choice.id)) {
          unknownLevel = true;
          return undefined;
        }
        if (field === 'type' && isUnidentifiedModality(choice.id)) return undefined;
        if (!numeric || choice.value !== 0) {
          identified.push(numeric ? { field, value: choice.value } : { field, id: choice.id });
        }
        return numeric ? choice.value : choice.id;
      });
      return [field, Array.isArray(submitted) ? mapped.filter((value) => value !== undefined) : mapped[0]];
    })) : rawValues;
  const rawFalseFields = rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)
    ? Object.entries(rawValues).filter(([field, value]) =>
      Object.hasOwn(INITIAL_MATCH_WEIGHTS, field) && value === false).map(([field]) => field)
    : [];
  const mappedInput = { ...input, ...(typeof input?.location === 'string' ? { location: null } : {}),
    matchProfile: { ...input?.matchProfile,
    values: preparedValues && typeof preparedValues === 'object' && !Array.isArray(preparedValues)
      ? Object.fromEntries(Object.entries(preparedValues)
        .filter(([field, value]) => !rawFalseFields.includes(field) &&
          !(field === 'yearsOfExperience' && value === 0) &&
          !(['level', 'type'].includes(field) &&
            (value === undefined || Array.isArray(value) && !value.length))))
      : preparedValues } };
  const preparedContent = await prepareVacancyContent(mappedInput,
    { allowUnidentified: true, allowLegacyAi: true }, transformation.configuration);
  const { legacyAiMigrationAudit, ...content } = preparedContent;
  for (const entry of legacyAiMigrationAudit?.entries || []) {
    if (entry.status === 'mapped') identified.push({ field: 'genAITools', id: entry.canonicalId });
  }
  let importImportance = null;
  if (identified.length) {
    const engineConfiguration = await getEffectiveMatchEngineConfiguration();
    const configuration = engineConfiguration ? {
      version: engineConfiguration.revision,
      engineVersion: engineConfiguration.version,
      importance: engineConfiguration.defaultImportImportance,
    } : await ImportImportanceConfiguration.findOne().sort({ version: -1 });
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
    importImportance = { version: configuration.version,
      engineVersion: configuration.engineVersion || null,
      importance: configuration.importance, appliedAt };
  }
  return {
    ...content, origin: 'IMPORTED', status: 'pending', importSource, importSourceId,
      importImportance,
      ...(importImportance ? { requirementsRevision: 1, requirementsHistory: [{
        at: importImportance.appliedAt, actor: null, process: 'import',
        reason: `Importancia padrao ${importImportance.engineVersion || `v${importImportance.version}`} ` +
          'aplicada na importacao',
        revision: 1, requirements: content.matchProfile.requirements,
      }] } : {}),
      importMappingAudit: { unknownLevel, legacyAi: legacyAiMigrationAudit,
        compatibility: transformation.audit,
        rawLocation: typeof input.location === 'string' ? input.location.slice(0, 2000) : null,
        rawFalseValues: rawFalseFields.map((field) => ({ field, value: false })) },
  };
}

async function registerImportedVacancy(provenance, input) {
  const data = await prepareImportedVacancyData(provenance, input);
  await Vacancy.init();
  if (await Vacancy.findOne({ origin: 'IMPORTED', importSource: data.importSource,
    importSourceId: data.importSourceId })) {
    throw new ApiError(409, 'Vaga importada ja registrada para esta fonte');
  }
  try {
    return await Vacancy.create(data);
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

module.exports = { registerImportedVacancy, prepareImportedVacancyData,
  registerAdminVacancy, assessVacancyForMatch };
