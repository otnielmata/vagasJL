const Vacancy = require('../models/vacancy.model');
const CompanyUser = require('../models/company-user.model');
const ApiError = require('../errors/api.error');

const PAGE_SIZE = 10;
const ORIGINS = new Set(['IMPORTED', 'COMPANY', 'ADMIN']);
const STATUSES = new Set(['pending', 'active', 'paused', 'expired', 'removed', 'rejected']);
const MATCH_FILTERS = Object.freeze(['type', 'level', 'role', 'specialization']);
const SKILL_FIELDS = Object.freeze([
  'testAutomationTechnologies', 'qaTools', 'programmingLanguages', 'genAITools',
]);
const ALLOWED_FILTERS = new Set([
  'page', 'q', 'origin', 'status', 'city', 'state', 'country', 'type', 'level', 'role',
  'specialization', 'skill',
]);

function text(value, name) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    throw new ApiError(400, `${name} invalido`);
  }
  return value.trim();
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseQuery(actor, query = {}) {
  if (!['candidate', 'company', 'admin', 'master'].includes(actor?.role)) {
    throw new ApiError(403, 'Papel sem permissao para listar vagas');
  }
  if (Object.keys(query).some((key) => !ALLOWED_FILTERS.has(key))) {
    throw new ApiError(400, 'Filtros de vagas invalidos');
  }
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isSafeInteger(page) || page < 1 ||
      query.page !== undefined && !/^[1-9]\d*$/.test(query.page)) {
    throw new ApiError(400, 'Pagina deve ser positiva');
  }
  const filters = {
    q: text(query.q, 'Busca'),
    origin: text(query.origin, 'Origem'),
    status: text(query.status, 'Status'),
    city: text(query.city, 'Cidade'),
    state: text(query.state, 'Estado'),
    country: text(query.country, 'Pais'),
    type: text(query.type, 'Modalidade'),
    level: text(query.level, 'Senioridade'),
    role: text(query.role, 'Funcao'),
    specialization: text(query.specialization, 'Especializacao'),
    skill: text(query.skill, 'Competencia'),
  };
  if (filters.origin && !ORIGINS.has(filters.origin)) throw new ApiError(400, 'Origem invalida');
  if (filters.status && !STATUSES.has(filters.status)) throw new ApiError(400, 'Status invalido');
  if (actor.role === 'candidate' && filters.status && filters.status !== 'active') {
    throw new ApiError(400, 'Candidatos podem consultar somente vagas ativas');
  }
  if (actor.role === 'company' && filters.origin && filters.origin !== 'COMPANY') {
    throw new ApiError(400, 'Empresas podem consultar somente suas proprias vagas');
  }
  return { page, filters };
}

function buildFilter(actor, filters, now) {
  const filter = { deletedAt: null };
  const clauses = [];
  if (actor.role === 'candidate') {
    filter.status = 'active';
    clauses.push({ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] });
  } else if (filters.status) {
    filter.status = filters.status;
  }
  if (filters.origin) filter.origin = filters.origin;
  for (const field of ['city', 'state', 'country']) {
    if (filters[field]) filter[`location.${field}`] = new RegExp(escaped(filters[field]), 'i');
  }
  for (const field of MATCH_FILTERS) {
    if (filters[field]) filter[`matchProfile.values.${field}`] = filters[field].toLowerCase();
  }
  if (filters.skill) {
    const skill = filters.skill.toLowerCase();
    clauses.push({ $or: [
      { 'matchProfile.requirements.id': skill },
      ...SKILL_FIELDS.map((field) => ({ [`matchProfile.values.${field}`]: skill })),
    ] });
  }
  if (filters.q) {
    const pattern = new RegExp(escaped(filters.q), 'i');
    const search = { $or: [
      { title: pattern }, { description: pattern }, { reference: pattern }, { sourceCompanyName: pattern },
      { 'location.city': pattern }, { 'location.state': pattern }, { 'location.country': pattern },
      { 'matchProfile.requirements.id': filters.q.toLowerCase() },
    ] };
    clauses.push(search);
  }
  if (clauses.length === 1 && actor.role !== 'candidate' && !filters.skill) filter.$or = clauses[0].$or;
  else if (clauses.length) filter.$and = clauses;
  return filter;
}

async function listVacancies(actor, query = {}, now = new Date()) {
  const { page, filters } = parseQuery(actor, query);
  const filter = buildFilter(actor, filters, now);
  if (actor.role === 'company') {
    const memberships = await CompanyUser.find({ user: actor.id, role: 'recruiter', status: 'active' })
      .select('company').lean();
    filter.origin = 'COMPANY';
    filter.company = { $in: memberships.map((membership) => membership.company) };
  }
  const projection = actor.role === 'candidate'
    ? '-applicationChannel -statusHistory -requirementsHistory'
    : '-statusHistory -requirementsHistory';
  const [items, total] = await Promise.all([
    Vacancy.find(filter).select(projection).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE).lean(),
    Vacancy.countDocuments(filter),
  ]);
  return { items, page, limit: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE), filters };
}

module.exports = { listVacancies, parseQuery, buildFilter, PAGE_SIZE };
