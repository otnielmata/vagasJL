const Vacancy = require('../models/vacancy.model');
const Configuration = require('../models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../config/match-profile');
const { ensureCompanyAuthorized } = require('./vacancy-status.service');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const IMPORTANCE = new Set(['required', 'desirable', 'indifferent']);

function validateRequirements(input, values, configuration, requireComplete = false) {
  if (!Array.isArray(input) || input.length > 200 || !configuration?.fields) {
    throw new ApiError(400, 'Requisitos invalidos');
  }
  const catalog = new Map(configuration.fields.map((field) => [field.key, field]));
  const canonicalValues = typeof values?.toObject === 'function' ? values.toObject() : values;
  const expected = new Set();
  for (const [field, selected] of Object.entries(canonicalValues || {})) {
    if (!Object.hasOwn(INITIAL_MATCH_WEIGHTS, field)) continue;
    if (field === 'yearsOfExperience') expected.add(field);
    else for (const id of selected) expected.add(`${field}:${id}`);
  }
  const seen = new Set();
  const requirements = input.map((item) => {
    if (typeof item?.toObject === 'function') item = item.toObject();
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !Object.hasOwn(INITIAL_MATCH_WEIGHTS, item.field) || !catalog.has(item.field) ||
        !IMPORTANCE.has(item.importance)) throw new ApiError(400, 'Classificacao invalida');
    const numeric = item.field === 'yearsOfExperience';
    if (Object.hasOwn(item, 'eliminatory') && typeof item.eliminatory !== 'boolean') {
      throw new ApiError(400, 'Sinalizador eliminatorio invalido');
    }
    if (item.eliminatory === true && item.importance === 'indifferent') {
      throw new ApiError(400, 'Requisito indiferente nao pode ser eliminatorio');
    }
    const keys = Object.keys(item).filter((key) => key !== 'eliminatory').sort().join(',');
    if (keys !== (numeric ? 'field,importance,value' : 'field,id,importance')) {
      throw new ApiError(400, 'Estrutura do requisito invalida');
    }
    const key = numeric ? item.field : `${item.field}:${item.id}`;
    if (!expected.has(key)) throw new ApiError(400, 'Requisito fora do perfil tecnico canonico');
    if (numeric ? item.value !== canonicalValues[item.field] :
      !catalog.get(item.field).options.some((option) => option.id === item.id)) {
      throw new ApiError(400, 'Valor fora do catalogo ou perfil da vaga');
    }
    if (seen.has(key)) throw new ApiError(409, 'Competencia duplicada');
    seen.add(key);
    const classification = numeric ? { field: item.field, value: item.value,
      importance: item.importance } : { field: item.field, id: item.id,
      importance: item.importance };
    if (item.eliminatory === true) classification.eliminatory = true;
    return classification;
  });
  if (requireComplete && (!requirements.length || expected.size !== seen.size ||
      !requirements.some((item) => item.importance !== 'indifferent'))) {
    throw new ApiError(409, 'Classificacao de requisitos incompleta');
  }
  return requirements;
}

function initialRequirementsAudit(content, actor) {
  const requirements = content.matchProfile.requirements;
  if (!requirements.length) return {};
  return { requirementsRevision: 1, requirementsHistory: [{
    at: new Date(), actor, process: 'api', reason: 'Classificacao inicial no cadastro',
    revision: 1, requirements,
  }] };
}

async function updateRequirements(actor, id, body, now = new Date()) {
  if (typeof id !== 'string' || !OBJECT_ID.test(id)) throw new ApiError(400, 'Identificador da vaga invalido');
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).sort().join(',') !== 'reason,requirements' ||
      typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 500) {
    throw new ApiError(400, 'Informe apenas requisitos e motivo');
  }
  const vacancy = await Vacancy.findById(id).select('+createdBy +deletedAt');
  if (!vacancy || vacancy.deletedAt) throw new ApiError(404, 'Vaga nao encontrada');
  if (actor?.role === 'company') {
    if (vacancy.origin !== 'COMPANY') throw new ApiError(403, 'Acesso negado a esta vaga');
    await ensureCompanyAuthorized(actor, vacancy);
  } else if (actor?.role !== 'admin') throw new ApiError(403, 'Acesso negado');
  if (['removed', 'rejected'].includes(vacancy.status)) throw new ApiError(409, 'Vaga encerrada');
  const configuration = await Configuration.findOne({ version: vacancy.matchProfile.configurationVersion });
  if (!configuration) throw new ApiError(503, 'Configuracao do Perfil de Match indisponivel');
  const requirements = validateRequirements(body.requirements, vacancy.matchProfile.values,
    configuration, vacancy.status === 'active');
  const revision = (vacancy.requirementsRevision || 0) + 1;
  const revisionFilter = vacancy.requirementsRevision === undefined
    ? { $in: [null, 0] } : vacancy.requirementsRevision;
  const updated = await Vacancy.findOneAndUpdate({ _id: vacancy._id, status: vacancy.status,
    updatedAt: vacancy.updatedAt, requirementsRevision: revisionFilter, deletedAt: null }, {
    $set: { 'matchProfile.requirements': requirements, requirementsRevision: revision },
    $push: { requirementsHistory: { at: now, actor: actor.id, process: 'api',
      reason: body.reason.trim(), revision, requirements } },
  }, { new: true, runValidators: true });
  if (!updated) throw new ApiError(409, 'Vaga alterada simultaneamente; tente novamente');
  return updated;
}

module.exports = { validateRequirements, initialRequirementsAudit, updateRequirements };
