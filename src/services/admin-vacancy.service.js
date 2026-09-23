const crypto = require('node:crypto');
const User = require('../models/user.model');
const Vacancy = require('../models/vacancy.model');
const { prepareVacancyContent } = require('./vacancy-content.service');
const { ensurePublishable, TRANSITIONS } = require('./vacancy-status.service');
const { getEffectiveMatchEngineConfiguration } =
  require('./match-engine-configuration.service');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const STATUSES = new Set(Object.keys(TRANSITIONS));
const REQUIRED_FIELDS = Object.freeze([
  'description', 'matchProfile', 'origin', 'reason', 'reference', 'status', 'title', 'version',
]);
const OPTIONAL_FIELDS = Object.freeze(['expiresAt', 'geographicRestrictions', 'location']);
const SNAPSHOT_FIELDS = Object.freeze([
  'origin', 'reference', 'title', 'description', 'location', 'geographicRestrictions',
  'matchProfile', 'expiresAt', 'status',
]);

function plain(value) {
  return value && typeof value.toObject === 'function'
    ? value.toObject({ depopulate: true, versionKey: false }) : value;
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function snapshot(vacancy) {
  const source = plain(vacancy);
  const data = Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field,
    source[field] === undefined ? null : plain(source[field])]));
  if (data.matchProfile?.requirements) {
    data.matchProfile.requirements = data.matchProfile.requirements.map((requirement) => ({
      ...plain(requirement), eliminatory: requirement.eliminatory === true,
    }));
  }
  return canonical(data);
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function validateRequest(actor, id, input) {
  if (actor?.role !== 'admin' || typeof actor.id !== 'string' || !OBJECT_ID.test(actor.id)) {
    throw new ApiError(403, 'Apenas administradores podem gerenciar vagas');
  }
  if (typeof id !== 'string' || !OBJECT_ID.test(id)) {
    throw new ApiError(400, 'Identificador da vaga invalido');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(422, 'Representacao administrativa da vaga invalida');
  }
  const keys = Object.keys(input);
  if (REQUIRED_FIELDS.some((key) => !keys.includes(key)) ||
      keys.some((key) => !REQUIRED_FIELDS.includes(key) && !OPTIONAL_FIELDS.includes(key)) ||
      !Number.isSafeInteger(input.version) || input.version < 1 ||
      !['ADMIN', 'COMPANY', 'IMPORTED'].includes(input.origin) || !STATUSES.has(input.status) ||
      typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 500) {
    throw new ApiError(422, 'Representacao administrativa da vaga invalida');
  }
  return { id: id.toLowerCase(), version: input.version, reason: input.reason.trim() };
}

function contentInput(input) {
  return Object.fromEntries([...['reference', 'title', 'description', 'matchProfile'],
    ...OPTIONAL_FIELDS].filter((key) => Object.hasOwn(input, key)).map((key) => [key, input[key]]));
}

function changedFields(before, after) {
  return SNAPSHOT_FIELDS.filter((field) =>
    JSON.stringify(canonical(before?.[field] ?? null)) !== JSON.stringify(canonical(after[field] ?? null)));
}

async function recalculationFor(fields, now) {
  const relevant = fields.some((field) => ['matchProfile', 'status', 'expiresAt',
    'geographicRestrictions'].includes(field));
  if (!relevant) {
    return { policy: 'none', status: 'not_required', scheduledFor: null, engineVersion: null };
  }
  const engine = await getEffectiveMatchEngineConfiguration(now);
  const policy = engine?.recalculationPolicy || 'affected_matches';
  const scheduled = policy === 'affected_matches';
  return { policy, status: scheduled ? 'scheduled' : 'not_required',
    scheduledFor: scheduled ? now : null, engineVersion: engine?.version || null };
}

function mapValidation(error) {
  if ([400, 409].includes(error.statusCode) || ['ValidationError', 'CastError', 'StrictModeError']
    .includes(error.name)) {
    throw new ApiError(422, 'Vaga nao atende aos criterios para cadastro ou revisao');
  }
  throw error;
}

async function prepare(input) {
  try {
    return await prepareVacancyContent(contentInput(input), {
      allowUnidentified: input.origin === 'IMPORTED',
      allowExpired: ['expired', 'removed', 'rejected'].includes(input.status),
    });
  } catch (error) {
    mapValidation(error);
  }
}

async function assertPublishable(vacancy, now) {
  try {
    await ensurePublishable(vacancy, now);
  } catch (error) {
    mapValidation(error);
  }
}

async function createVacancy(actor, request, input, prepared, now) {
  if (input.origin !== 'ADMIN') throw new ApiError(409, 'Nova vaga administrativa deve possuir origem ADMIN');
  if (request.version !== 1) throw new ApiError(409, 'Nova vaga administrativa deve iniciar na versao 1');
  if (input.status !== 'pending') throw new ApiError(422, 'Nova vaga administrativa deve iniciar em PENDING');
  const after = snapshot({ ...prepared, origin: 'ADMIN', status: 'pending' });
  const recalculation = await recalculationFor([], now);
  const requirements = prepared.matchProfile.requirements || [];
  const data = { _id: request.id, ...prepared, origin: 'ADMIN', status: 'pending', createdBy: actor.id,
    adminRevision: request.version, adminContentFingerprint: fingerprint(after), adminHistory: [{
      revision: request.version, at: now, actor: actor.id, reason: request.reason,
      before: null, after, changedFields: [...SNAPSHOT_FIELDS], recalculation,
    }], ...(requirements.length ? { requirementsRevision: 1, requirementsHistory: [{
      at: now, actor: actor.id, process: 'api', reason: 'Classificacao inicial na administracao',
      revision: 1, requirements,
    }] } : {}) };
  try {
    return { vacancy: await Vacancy.create(data), created: true, changed: true };
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'Vaga alterada simultaneamente; tente novamente');
    mapValidation(error);
  }
}

async function updateVacancy(actor, request, input, existing, prepared, now) {
  if (input.origin !== existing.origin) throw new ApiError(409, 'Origem da vaga e imutavel');
  if (['removed', 'rejected'].includes(existing.status)) throw new ApiError(409, 'Vaga encerrada');
  if (input.status !== existing.status && !TRANSITIONS[existing.status]?.includes(input.status)) {
    throw new ApiError(409, 'Transicao de status invalida');
  }
  if (input.status === 'expired' && (!prepared.expiresAt || new Date(prepared.expiresAt) > now)) {
    throw new ApiError(422, 'Vaga so pode expirar quando seu prazo estiver encerrado');
  }
  const before = snapshot(existing);
  const after = snapshot({ ...prepared, origin: existing.origin, status: input.status });
  const currentRevision = existing.adminRevision || 0;
  const sameRepresentation = fingerprint(before) === fingerprint(after);
  if (request.version === currentRevision && sameRepresentation) {
    return { vacancy: existing, created: false, changed: false };
  }
  if (request.version !== currentRevision + 1) {
    throw new ApiError(409, 'Versao administrativa desatualizada ou conflitante');
  }
  if (sameRepresentation) throw new ApiError(409, 'Nova versao exige alteracao efetiva da vaga');
  const fields = changedFields(before, after);
  const candidate = { ...plain(existing), ...prepared, origin: existing.origin, status: input.status };
  if (input.status === 'active') await assertPublishable(candidate, now);
  const recalculation = await recalculationFor(fields, now);
  const set = { ...prepared, status: input.status, adminRevision: request.version,
    adminContentFingerprint: fingerprint(after) };
  const push = { adminHistory: { revision: request.version, at: now, actor: actor.id,
    reason: request.reason, before, after, changedFields: fields, recalculation } };
  if (input.status !== existing.status) push.statusHistory = { from: existing.status,
    to: input.status, at: now, actor: actor.id, process: 'api', reason: request.reason };
  if (JSON.stringify(before.matchProfile?.requirements) !==
      JSON.stringify(after.matchProfile?.requirements)) {
    const revision = (existing.requirementsRevision || 0) + 1;
    set.requirementsRevision = revision;
    push.requirementsHistory = { at: now, actor: actor.id, process: 'api', reason: request.reason,
      revision, requirements: prepared.matchProfile.requirements };
  }
  try {
    const revisionFilter = currentRevision === 0 ? { $in: [null, 0] } : currentRevision;
    const vacancy = await Vacancy.findOneAndUpdate({ _id: existing._id,
      adminRevision: revisionFilter, updatedAt: existing.updatedAt, deletedAt: null },
    { $set: set, $push: push }, { new: true, runValidators: true });
    if (!vacancy) throw new ApiError(409, 'Vaga alterada simultaneamente; tente novamente');
    return { vacancy, created: false, changed: true };
  } catch (error) {
    if (error.statusCode === 409 || error.code === 11000) {
      throw new ApiError(409, error.message || 'Vaga alterada simultaneamente; tente novamente');
    }
    mapValidation(error);
  }
}

async function manageAdminVacancy(actor, id, input, now = new Date()) {
  const request = validateRequest(actor, id, input);
  const account = await User.findOne({ _id: actor.id, role: 'admin', status: 'active' }).select('_id');
  if (!account) throw new ApiError(403, 'Conta administrativa inativa ou inexistente');
  const existing = await Vacancy.findById(request.id)
    .select('+createdBy +deletedAt +adminContentFingerprint +adminHistory');
  if (existing?.deletedAt) throw new ApiError(404, 'Vaga nao encontrada');
  if (existing && input.origin !== existing.origin) throw new ApiError(409, 'Origem da vaga e imutavel');
  const prepared = await prepare(input);
  if (!existing) return createVacancy(actor, request, input, prepared, now);
  return updateVacancy(actor, request, input, existing, prepared, now);
}

module.exports = { manageAdminVacancy, validateRequest, snapshot, fingerprint };
