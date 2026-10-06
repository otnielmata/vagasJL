const Company = require('../models/company.model');
const CompanyUser = require('../models/company-user.model');
const User = require('../models/user.model');
const ApiError = require('../errors/api.error');

const PAGE_SIZE = 10;

function parseQuery(query = {}) {
  if (Object.keys(query).some((key) => !['page', 'q'].includes(key))) {
    throw new ApiError(400, 'Filtros de diretorio invalidos');
  }
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isSafeInteger(page) || page < 1 ||
      query.page !== undefined && !/^[1-9]\d*$/.test(query.page)) {
    throw new ApiError(400, 'Pagina deve ser positiva');
  }
  if (query.q !== undefined && (typeof query.q !== 'string' || !query.q.trim() ||
      query.q.trim().length > 100)) {
    throw new ApiError(400, 'Busca invalida');
  }
  return { page, q: query.q?.trim() };
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function paged(model, filter, projection, page) {
  const [items, total] = await Promise.all([
    model.find(filter).select(projection).sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    model.countDocuments(filter),
  ]);
  return { items, page, limit: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) };
}

async function listCompanies(actor, query = {}) {
  if (actor?.role !== 'master') throw new ApiError(403, 'Apenas o perfil master pode listar empresas');
  const { page, q } = parseQuery(query);
  const filter = { deletedAt: null };
  if (q) {
    const pattern = new RegExp(escaped(q), 'i');
    filter.$or = [{ legalName: pattern }, { tradeName: pattern }, { email: pattern }];
  }
  const result = await paged(Company, filter, {
    _id: 1, legalName: 1, tradeName: 1, email: 1, city: 1, state: 1, country: 1,
    responsibleName: 1, status: 1, createdAt: 1, updatedAt: 1,
  }, page);
  if (!result.items.length) return result;

  const linkedCompanyIds = await CompanyUser.distinct('company', {
    company: { $in: result.items.map((company) => company._id) },
    role: 'recruiter',
    status: 'active',
  });
  const linked = new Set(linkedCompanyIds.map(String));
  return {
    ...result,
    items: result.items.map((company) => ({
      ...company,
      hasRecruiter: linked.has(String(company._id)),
    })),
  };
}

async function listRecruiters(actor, query = {}) {
  if (actor?.role !== 'master') throw new ApiError(403, 'Apenas o perfil master pode listar recrutadores');
  const { page, q } = parseQuery(query);
  const filter = { role: 'admin' };
  if (q) {
    const pattern = new RegExp(escaped(q), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }
  return paged(User, filter, { _id: 1, name: 1, email: 1, role: 1, status: 1, createdAt: 1 }, page);
}

module.exports = { listCompanies, listRecruiters, parseQuery, PAGE_SIZE };
