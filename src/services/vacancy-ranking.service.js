const Candidate = require('../models/candidate.model');
const CandidateMatchProfile = require('../models/candidate-match-profile.model');
const Company = require('../models/company.model');
const Configuration = require('../models/match-profile-configuration.model');
const Vacancy = require('../models/vacancy.model');
const { assessVacancyForMatch } = require('./vacancy-origin.service');
const { scorePair } = require('./match-ranking.service');
const ApiError = require('../errors/api.error');

function pagination(query = {}) {
  if (Object.keys(query).some((key) => !['page', 'limit'].includes(key))) {
    throw new ApiError(400, 'Parametros de paginacao invalidos');
  }
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) ||
      limit < 1 || limit > 50 || (query.page !== undefined && !/^[1-9]\d*$/.test(query.page)) ||
      (query.limit !== undefined && !/^[1-9]\d*$/.test(query.limit))) {
    throw new ApiError(400, 'Pagina deve ser positiva e limite entre 1 e 50');
  }
  return { page, limit };
}

async function rankVacancies(actor, query = {}, now = new Date()) {
  if (actor?.role !== 'candidate') throw new ApiError(403, 'Apenas candidatos podem consultar o ranking');
  const { page, limit } = pagination(query);
  const candidate = await Candidate.findOne({ user: actor.id, deletedAt: null }).select('_id');
  if (!candidate) throw new ApiError(404, 'Cadastro de candidato nao encontrado');
  const profile = await CandidateMatchProfile.findOne({ candidate: candidate._id,
    deletedAt: null }).select('values configurationVersion');
  if (!profile) throw new ApiError(409, 'Cadastre o Perfil de Match antes de consultar o ranking');

  const vacancies = await Vacancy.find({ status: 'active', deletedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    origin: { $in: ['COMPANY', 'IMPORTED', 'ADMIN'] },
  }).select('+createdBy');
  const companyIds = [...new Set(vacancies.filter((vacancy) => vacancy.origin === 'COMPANY')
    .map((vacancy) => String(vacancy.company)).filter(Boolean))];
  const activeCompanies = companyIds.length ? await Company.find({ _id: { $in: companyIds },
    status: 'active', deletedAt: null }).select('_id') : [];
  const authorizedCompanies = new Set(activeCompanies.map((company) => String(company._id)));
  const eligible = vacancies.filter((vacancy) =>
    (vacancy.origin !== 'COMPANY' || authorizedCompanies.has(String(vacancy.company))) &&
    assessVacancyForMatch(vacancy, now).eligible &&
    vacancy.matchProfile.requirements?.some((item) => item.importance !== 'indifferent'));

  const versions = [...new Set(eligible.map((vacancy) => vacancy.matchProfile.configurationVersion))];
  const configurations = versions.length ? await Configuration.find({ version: { $in: versions } }) : [];
  const byVersion = new Map(configurations.map((configuration) => [configuration.version, configuration]));
  const candidateValues = typeof profile.values.toObject === 'function'
    ? profile.values.toObject() : profile.values;
  const ranked = eligible.map((vacancy) => {
    const configuration = byVersion.get(vacancy.matchProfile.configurationVersion);
    if (!configuration) throw new ApiError(503, 'Configuracao do Perfil de Match indisponivel');
    const score = scorePair(vacancy, candidateValues, configuration, now);
    return { vacancy: vacancy.toJSON(), percentage: score.percentage,
      earnedPoints: score.earnedPoints, possiblePoints: score.possiblePoints,
      configurationVersion: vacancy.matchProfile.configurationVersion,
      eligible: score.eligibility.eligible && score.possiblePoints > 0 };
  }).filter((item) => item.eligible).map(({ eligible, ...item }) => item);
  ranked.sort((left, right) => right.percentage - left.percentage ||
    new Date(right.vacancy.createdAt) - new Date(left.vacancy.createdAt) ||
    String(left.vacancy._id).localeCompare(String(right.vacancy._id)));
  const total = ranked.length;
  return { items: ranked.slice((page - 1) * limit, page * limit), total, page, limit,
    pages: Math.ceil(total / limit) };
}

module.exports = { rankVacancies, pagination };
